import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";

import {
  FR_MODULUS,
  frToDecimal,
  parseFr,
} from "../../entities/common/crypto/fr.ts";

import {
  hashAction,
  hashActionContext,
  hashAmount,
  hashClause,
  hashMockSofEvidence,
  hashOwner,
  hashRho,
  hashScope,
  hashState,
  hashStateCore,
  hashStateNullifier,
} from "../../entities/common/crypto/hashObjects.ts";

import { CLAUSE } from "../../entities/common/crypto/tags.ts";
import { OffchainStateTree } from "../../entities/public_admission/state_tree/offchainStateTree.ts";
import { buildMockPolicyTree } from "../../entities/policy_authority/mockPolicyTree.ts";

const BUILD_DIR = "build/m7";
const R1CS = `${BUILD_DIR}/UpdateComplianceStateFull.r1cs`;
const WITNESS_JS_DIR = `${BUILD_DIR}/UpdateComplianceStateFull_js`;
const WASM = `${WITNESS_JS_DIR}/UpdateComplianceStateFull.wasm`;
const WITNESS_JS = `${WITNESS_JS_DIR}/generate_witness.js`;

const BASE_INPUT = "fixtures/m7/update_full_input_step1.json";
const CASE_DIR = "fixtures/ojcs/range_cases";
const SUMMARY_PATH = "fixtures/ojcs/range_soundness_cases.json";
const REPORT_PATH = "docs/OJCS_RANGE_SOUNDNESS_AUDIT.md";

const MAX64 = (1n << 64n) - 1n;
const TWO64 = 1n << 64n;
const MAX32 = (1n << 32n) - 1n;

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runOk(cmd: string, args: string[]): {
  ok: boolean;
  detail: string;
} {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, detail: String(out ?? "").trim() };
  } catch (err: any) {
    const stderr = String(err?.stderr ?? "").trim();
    const stdout = String(err?.stdout ?? "").trim();
    return {
      ok: false,
      detail: (stderr || stdout || String(err?.message ?? err)).slice(0, 1200),
    };
  }
}

async function applySyntheticPolicy(
  input: any,
  limit: string,
  threshold: string,
): Promise<void> {
  const result = await buildMockPolicyTree(
    [
      {
        policyName: "ojcs_range_policy",
        e: input.e,
        policyID: input.policyID,
        gatewayID: input.gatewayID,
        policyVersion: input.policyVersion,
        limit,
        threshold,
        clauseType: input.clauseType,
      },
    ],
    8,
  );

  const entry = result.entries[0];

  input.limit = limit;
  input.threshold = threshold;
  input.rootPolAct = frToDecimal(result.rootPolAct);
  input.policySiblings = entry.witness.siblings.map((x) => frToDecimal(x));
  input.policyPathIndices = entry.witness.pathIndices.map((x) => x.toString());
}

async function rebuildStateAndPublic(input: any): Promise<void> {
  const sk = parseFr(input.sk_u);
  const owner = await hashOwner(sk);
  const scopeHash = await hashScope(
    parseFr(input.e),
    parseFr(input.policyID),
    parseFr(input.gatewayID),
  );

  if (frToDecimal(scopeHash) !== String(input.regScope)) {
    throw new Error("scopeHash/regScope mismatch in base fixture");
  }

  const oldCore = await hashStateCore(
    parseFr(input.usedAmountOld),
    parseFr(input.txCountOld),
    parseFr(input.riskLevelOld),
    parseFr(input.flagsOld),
  );

  const cOld = await hashState(
    owner,
    scopeHash,
    oldCore,
    parseFr(input.rOld),
  );

  const stateTree = await OffchainStateTree.create(8);
  await stateTree.append(cOld);
  const stateWitness = await stateTree.getWitness(0);

  input.rtState = frToDecimal(stateWitness.root);
  input.stateSiblings = stateWitness.siblings.map((x) => frToDecimal(x));
  input.statePathIndices = stateWitness.pathIndices.map((x) => x.toString());

  input.N_old = frToDecimal(
    await hashStateNullifier(sk, cOld, scopeHash),
  );

  const newCore = await hashStateCore(
    parseFr(input.usedAmountNew),
    parseFr(input.txCountNew),
    parseFr(input.riskLevelNew),
    parseFr(input.flagsNew),
  );

  input.C_new = frToDecimal(
    await hashState(
      owner,
      scopeHash,
      newCore,
      parseFr(input.rNew),
    ),
  );

  input.amountCom = frToDecimal(
    await hashAmount(
      parseFr(input.amount),
      parseFr(input.rAmt),
      scopeHash,
      parseFr(input.nonce),
    ),
  );

  const actionContextHash = await hashActionContext(
    parseFr(input.category),
    parseFr(input.chainID),
    parseFr(input.contractAddr),
    parseFr(input.nonce),
    parseFr(input.receiverDigest),
  );

  input.actionHash = frToDecimal(
    await hashAction(
      scopeHash,
      parseFr(input.amountCom),
      actionContextHash,
    ),
  );

  const evidenceDigest = await hashMockSofEvidence(
    scopeHash,
    parseFr(input.nonce),
    parseFr(input.evidenceSalt),
  );

  input.clauseCom = frToDecimal(
    await hashClause(
      parseFr(input.actionHash),
      parseFr(input.clauseType),
      parseFr(input.clauseStatus),
      evidenceDigest,
      parseFr(input.rClause),
    ),
  );

  input.rho = frToDecimal(
    await hashRho(
      parseFr(input.actionHash),
      parseFr(input.clauseCom),
      parseFr(input.N_old),
      parseFr(input.C_new),
    ),
  );
}

const cases: any[] = [
  {
    name: "zero_boundary",
    oldUsed: "0",
    amount: "0",
    newUsed: "0",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    expectedAccepted: true,
    meaning: "zero amount is not semantically prohibited by the current circuit",
  },

  {
    name: "threshold_minus_1",
    oldUsed: "0",
    amount: "29999",
    newUsed: "29999",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    expectedAccepted: true,
    meaning: "usedAmountNew < threshold; threshold clause is not crossed",
  },

  {
    name: "threshold_equal",
    oldUsed: "0",
    amount: "30000",
    newUsed: "30000",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    expectedAccepted: true,
    meaning: "usedAmountNew = threshold; strict threshold is not crossed",
  },

  {
    name: "threshold_plus_1",
    oldUsed: "0",
    amount: "30001",
    newUsed: "30001",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_SATISFIED.toString(),
    expectedAccepted: true,
    meaning: "usedAmountNew = threshold + 1; clause must be satisfied",
  },

  {
    name: "limit_minus_1",
    oldUsed: "0",
    amount: "49999",
    newUsed: "49999",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_SATISFIED.toString(),
    expectedAccepted: true,
    meaning: "usedAmountNew = limit - 1",
  },

  {
    name: "limit_equal",
    oldUsed: "0",
    amount: "50000",
    newUsed: "50000",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_SATISFIED.toString(),
    expectedAccepted: true,
    meaning: "usedAmountNew = limit; <= limit remains valid",
  },

  {
    name: "limit_plus_1",
    oldUsed: "0",
    amount: "50001",
    newUsed: "50001",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_SATISFIED.toString(),
    expectedAccepted: false,
    meaning: "usedAmountNew = limit + 1; ordinary path must reject",
  },

  {
    name: "max_u64_legal",
    oldUsed: "0",
    amount: MAX64.toString(),
    newUsed: MAX64.toString(),
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    policy: {
      limit: MAX64.toString(),
      threshold: MAX64.toString(),
    },
    expectedAccepted: true,
    meaning: "2^64-1 is the maximum legal 64-bit value",
  },

  {
    name: "out_of_range_limit_2pow64",
    oldUsed: "0",
    amount: "0",
    newUsed: "0",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    policy: {
      limit: TWO64.toString(),
      threshold: MAX64.toString(),
    },
    expectedAccepted: false,
    meaning: "limit = 2^64 is a valid BN254 field element but outside the 64-bit policy range",
  },

  {
    name: "out_of_range_threshold_2pow64",
    oldUsed: "0",
    amount: "0",
    newUsed: "0",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    policy: {
      limit: MAX64.toString(),
      threshold: TWO64.toString(),
    },
    expectedAccepted: false,
    meaning: "threshold = 2^64 is a valid BN254 field element but outside the 64-bit policy range",
  },

  {
    name: "amount_2pow64",
    oldUsed: "0",
    amount: TWO64.toString(),
    newUsed: TWO64.toString(),
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_SATISFIED.toString(),
    policy: {
      limit: MAX64.toString(),
      threshold: MAX64.toString(),
    },
    expectedAccepted: false,
    meaning: "amount and usedAmountNew at 2^64 must not enter the 64-bit integer domain",
  },

  {
    name: "u64_addition_overflow_candidate",
    oldUsed: MAX64.toString(),
    amount: "1",
    newUsed: "0",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    policy: {
      limit: MAX64.toString(),
      threshold: MAX64.toString(),
    },
    expectedAccepted: false,
    meaning: "2^64-1 + 1 must not wrap to zero under ordinary integer semantics",
  },

  {
    name: "bn254_field_wrap_candidate",
    oldUsed: (FR_MODULUS - 1n).toString(),
    amount: "1",
    newUsed: "0",
    oldTx: "0",
    newTx: "1",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    policy: {
      limit: MAX64.toString(),
      threshold: MAX64.toString(),
    },
    expectedAccepted: false,
    meaning: "p-1 + 1 = 0 in Fr, but p-1 must be rejected by the 64-bit usedAmountOld range constraint",
  },

  {
    name: "txcount_max_legal",
    oldUsed: "0",
    amount: "0",
    newUsed: "0",
    oldTx: (MAX32 - 1n).toString(),
    newTx: MAX32.toString(),
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    expectedAccepted: true,
    meaning: "2^32-1 is the maximum legal txCount value",
  },

  {
    name: "txcount_overflow_candidate",
    oldUsed: "0",
    amount: "0",
    newUsed: "0",
    oldTx: MAX32.toString(),
    newTx: "0",
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(),
    expectedAccepted: false,
    meaning: "2^32-1 + 1 must not wrap txCount to zero",
  },
];

async function main(): Promise<void> {
  for (const required of [BASE_INPUT, R1CS, WASM, WITNESS_JS]) {
    if (!existsSync(required)) {
      throw new Error(`Required baseline artifact missing: ${required}`);
    }
  }

  mkdirSync(CASE_DIR, { recursive: true });
  mkdirSync(BUILD_DIR, { recursive: true });
  mkdirSync("docs", { recursive: true });

  const base = readJson(BASE_INPUT);
  const results: any[] = [];

  for (const def of cases) {
    const input = structuredClone(base);

    input.usedAmountOld = def.oldUsed;
    input.amount = def.amount;
    input.usedAmountNew = def.newUsed;
    input.txCountOld = def.oldTx;
    input.txCountNew = def.newTx;
    input.clauseStatus = def.clauseStatus;

    if (def.policy) {
      await applySyntheticPolicy(
        input,
        def.policy.limit,
        def.policy.threshold,
      );
    }

    await rebuildStateAndPublic(input);

    const inputPath = `${CASE_DIR}/${def.name}.json`;
    const wtnsPath = `${BUILD_DIR}/ojcs_${def.name}.wtns`;

    writeJson(inputPath, input);
    rmSync(wtnsPath, { force: true });

    const witnessResult = runOk(
      "node",
      [WITNESS_JS, WASM, inputPath, wtnsPath],
    );

    let wtnsCheck: { ok: boolean; detail: string } | null = null;
    if (witnessResult.ok) {
      wtnsCheck = runOk(
        "npx",
        ["snarkjs", "wtns", "check", R1CS, wtnsPath],
      );
    }

    const actualAccepted =
      witnessResult.ok && Boolean(wtnsCheck?.ok);

    const matched =
      actualAccepted === def.expectedAccepted;

    const result = {
      name: def.name,
      meaning: def.meaning,
      expectedAccepted: def.expectedAccepted,
      actualAccepted,
      matched,
      witnessGeneration: witnessResult.ok ? "pass" : "rejected",
      witnessCheck:
        !witnessResult.ok
          ? "not-run"
          : wtnsCheck?.ok
            ? "pass"
            : "fail",
      values: {
        usedAmountOld: def.oldUsed,
        amount: def.amount,
        usedAmountNew: def.newUsed,
        txCountOld: def.oldTx,
        txCountNew: def.newTx,
        limit: input.limit,
        threshold: input.threshold,
        clauseStatus: def.clauseStatus,
      },
    };

    results.push(result);

    console.log(
      `${matched ? "PASS" : "FAIL"}  ${def.name}: expected=${def.expectedAccepted ? "accept" : "reject"}, actual=${actualAccepted ? "accept" : "reject"}`,
    );
  }

  const circomlibPackage = readJson("node_modules/circomlib/package.json");

  const summary = {
    generatedAt: new Date().toISOString(),
    circuit: "circuits/update_compliance_state/UpdateComplianceStateFull.circom",
    artifact: R1CS,
    circomlibVersion: circomlibPackage.version,
    bn254ScalarFieldModulus: FR_MODULUS.toString(),
    ranges: {
      amount: "0..2^64-1",
      usedAmountOld: "0..2^64-1",
      usedAmountNew: "0..2^64-1",
      limit: "0..2^64-1",
      threshold: "0..2^64-1",
      txCountOld: "0..2^32-1",
      txCountNew: "0..2^32-1",
    },
    comparatorWidths: {
      limit: "LessEqThan(64)",
      threshold: "LessThan(64)",
    },
    cases: results,
    allMatched: results.every((r) => r.matched),
  };

  writeJson(SUMMARY_PATH, summary);

  const table = results
    .map(
      (r) =>
        `| ${r.name} | ${r.expectedAccepted ? "accept" : "reject"} | ${r.actualAccepted ? "accept" : "reject"} | ${r.matched ? "pass" : "FAIL"} |`,
    )
    .join("\n");

  const report = `# OJ-CS Range Soundness Audit

## Scope

This audit checks the final \`UpdateComplianceStateFull\` circuit used by the NCC prototype. It is a local circuit-correctness audit. It does not change the protocol or the main split-withdrawal demo.

## Static range audit

| Field | Intended range | Constraint | Arithmetic | Comparator | Assessment |
|---|---:|---|---|---|---|
| amount | 0..2^64-1 | Num2Bits(64) | usedAmountOld + amount | no | safe |
| usedAmountOld | 0..2^64-1 | Num2Bits(64) | usedAmountOld + amount | no | safe |
| usedAmountNew | 0..2^64-1 | Num2Bits(64) | addition result | LessEqThan(64), LessThan(64) | safe |
| limit | 0..2^64-1 | Num2Bits(64) | no | LessEqThan(64) | safe |
| threshold | 0..2^64-1 | Num2Bits(64) | no | LessThan(64) | safe |
| txCountOld | 0..2^32-1 | Num2Bits(32) | txCountOld + 1 | no | safe |
| txCountNew | 0..2^32-1 | Num2Bits(32) | increment result | no | safe |

The installed circomlib version is ${circomlibPackage.version}. The final circuit uses \`LessEqThan(64)\` for the limit check and \`LessThan(64)\` for the strict threshold check.

## Field-wrap reasoning

The BN254 scalar-field modulus is:

\`${FR_MODULUS.toString()}\`.

For legal 64-bit inputs,

\`usedAmountOld + amount <= 2^65 - 2\`,

which is far below the BN254 scalar-field modulus. Therefore the legal integer addition cannot wrap modulo the field. In addition, \`usedAmountNew\` is independently constrained to 64 bits.

The adversarial \`p-1 + 1 = 0 mod p\` case is included below. It must be rejected because \`p-1\` is outside the 64-bit range for \`usedAmountOld\`.

For \`txCount\`, both old and new values are independently constrained to 32 bits. The transition \`2^32-1 -> 0\` therefore cannot be used as an integer wraparound.

## Boundary semantics

The implemented threshold rule is strict:

\`usedAmountNew > threshold\`.

Thus equality does not cross the threshold.

The implemented ordinary-path limit rule is:

\`usedAmountNew <= limit\`.

Thus equality with the limit remains valid.

Zero amount is not prohibited by the current circuit; it is tested as a boundary case rather than classified as a negative case.

## Executable boundary results

| Case | Expected | Actual | Result |
|---|---|---|---|
${table}

## Conclusion

All static and executable checks are consistent with the intended non-negative integer semantics if \`allMatched = true\` in \`${SUMMARY_PATH}\`.

No circuit change is required when all cases match. No verifier or proving-key regeneration is required for this audit-only outcome.
`;

  writeFileSync(REPORT_PATH, report);

  if (!summary.allMatched) {
    console.error("range soundness audit: FAIL");
    process.exit(1);
  }

  console.log("");
  console.log("range soundness audit: PASS");
  console.log(`summary: ${SUMMARY_PATH}`);
  console.log(`report: ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
