import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FR_MODULUS, frToDecimal, parseFr } from "../../entities/common/crypto/fr.ts";
import { CLAUSE } from "../../entities/common/crypto/tags.ts";
import {
  hashAction,
  hashActionContext,
  hashAmount,
  hashClause,
  hashMockSofEvidence,
  hashRho,
} from "../../entities/common/crypto/hashObjects.ts";

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: any): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mutateDecimal(x: string): string {
  return ((BigInt(x) + 1n) % FR_MODULUS).toString(10);
}

function addressToDecimal(addr: string): string {
  if (addr.startsWith("0x") || addr.startsWith("0X")) {
    return BigInt(addr).toString(10);
  }
  return parseFr(addr).toString(10);
}

async function makeM7CompatibleClauseCom(args: {
  scopeHash: string;
  actionHash: string;
  clauseType: string;
  nonce: string;
  clauseStatus: bigint;
  evidenceSalt: string;
  rClause: string;
}): Promise<{ clauseCom: string; evidenceDigest: string; clauseStatus: string; rClause: string; evidenceSalt: string }> {
  const evidenceDigest = frToDecimal(
    await hashMockSofEvidence(parseFr(args.scopeHash), parseFr(args.nonce), parseFr(args.evidenceSalt)),
  );
  const clauseCom = frToDecimal(
    await hashClause(
      parseFr(args.actionHash),
      parseFr(args.clauseType),
      args.clauseStatus,
      parseFr(evidenceDigest),
      parseFr(args.rClause),
    ),
  );
  return {
    clauseCom,
    evidenceDigest,
    clauseStatus: args.clauseStatus.toString(10),
    rClause: args.rClause,
    evidenceSalt: args.evidenceSalt,
  };
}

async function makeActionBoundInput(args: {
  base: any;
  scope: any;
  rootBundle: any;
  nonce: string;
  clauseStatus: bigint;
  evidenceSalt: string;
  rClause: string;
}): Promise<{ input: any; clauseDebug: any }> {
  const category = args.scope.category;
  const chainID = args.scope.chainID;
  const contractAddr = addressToDecimal(args.scope.contractAddr);
  const receiverDigest = args.scope.receiverDigest;
  const scopeHash = args.rootBundle.scope.scopeHash;

  const input = structuredClone(args.base);
  input.nonce = args.nonce;
  input.category = category;
  input.chainID = chainID;
  input.contractAddr = contractAddr;
  input.receiverDigest = receiverDigest;

  input.amountCom = frToDecimal(
    await hashAmount(parseFr(input.amount), parseFr(input.rAmt), parseFr(scopeHash), parseFr(input.nonce)),
  );

  const actionContextHash = frToDecimal(
    await hashActionContext(
      parseFr(input.category),
      parseFr(input.chainID),
      parseFr(input.contractAddr),
      parseFr(input.nonce),
      parseFr(input.receiverDigest),
    ),
  );

  input.actionHash = frToDecimal(
    await hashAction(parseFr(scopeHash), parseFr(input.amountCom), parseFr(actionContextHash)),
  );

  const clause = await makeM7CompatibleClauseCom({
    scopeHash,
    actionHash: input.actionHash,
    clauseType: input.clauseType,
    nonce: input.nonce,
    clauseStatus: args.clauseStatus,
    evidenceSalt: args.evidenceSalt,
    rClause: args.rClause,
  });
  input.clauseCom = clause.clauseCom;

  input.rho = frToDecimal(
    await hashRho(parseFr(input.actionHash), parseFr(input.clauseCom), parseFr(input.N_old), parseFr(input.C_new)),
  );

  return {
    input,
    clauseDebug: {
      actionContextHash,
      evidenceDigest: clause.evidenceDigest,
      clauseStatus: clause.clauseStatus,
      evidenceSalt: clause.evidenceSalt,
      rClause: clause.rClause,
      note: "M6 fixture computes M7-compatible clauseCom, but M6 circuit does not validate the clauseCom formula.",
    },
  };
}

function expectedPublic(input: any, consistency: any): any {
  return {
    publicInputs: [
      input.rootRegAct,
      input.rootStatusAct,
      input.rootPolAct,
      input.rtState,
      input.N_old,
      input.C_new,
      input.actionHash,
      input.amountCom,
      input.clauseCom,
      input.rho,
    ],
    named: {
      rootRegAct: input.rootRegAct,
      rootStatusAct: input.rootStatusAct,
      rootPolAct: input.rootPolAct,
      rtState: input.rtState,
      N_old: input.N_old,
      C_new: input.C_new,
      actionHash: input.actionHash,
      amountCom: input.amountCom,
      clauseCom: input.clauseCom,
      rho: input.rho,
    },
    consistency,
  };
}

async function main(): Promise<void> {
  mkdirSync("fixtures/m6/update_action_negative_cases", { recursive: true });
  mkdirSync("docs", { recursive: true });

  const scope = readJson("fixtures/scopes/demo_scope.json");
  const rootBundle = readJson("fixtures/m2/root_bundle.json");
  const stateExpected = readJson("fixtures/m3/state_tree_expected.json");

  const step1Base = readJson("fixtures/m5/update_basic_input_step1.json");
  const step2Base = readJson("fixtures/m5/update_basic_input_step2.json");
  const overLimitBase = readJson("fixtures/m5/update_basic_negative_cases/exceeds_limit.json");

  const step1 = await makeActionBoundInput({
    base: step1Base,
    scope,
    rootBundle,
    nonce: "111",
    clauseStatus: CLAUSE.CLAUSE_DUMMY,
    evidenceSalt: "830001",
    rClause: "820001",
  });

  const step2 = await makeActionBoundInput({
    base: step2Base,
    scope,
    rootBundle,
    nonce: "222",
    clauseStatus: CLAUSE.CLAUSE_SATISFIED,
    evidenceSalt: "830002",
    rClause: "820002",
  });

  const consistency = {
    step1CNewMatchesM3AppendResults1Leaf: step1.input.C_new === stateExpected.appendResults[1].leaf,
    step2CNewMatchesM3AppendResults2Leaf: step2.input.C_new === stateExpected.appendResults[2].leaf,
    rootRegActMatchesM2: step1.input.rootRegAct === rootBundle.roots.rootRegAct,
    rootStatusActMatchesM2: step1.input.rootStatusAct === rootBundle.roots.rootStatusAct,
    rootPolActMatchesM2: step1.input.rootPolAct === rootBundle.roots.rootPolAct,
    m6ClauseComFormulaValidatedByCircuit: false,
  };

  writeJson("fixtures/m6/update_action_input_step1.json", step1.input);
  writeJson("fixtures/m6/update_action_public_expected_step1.json", expectedPublic(step1.input, consistency));

  writeJson("fixtures/m6/update_action_input_step2.json", step2.input);
  writeJson("fixtures/m6/update_action_public_expected_step2.json", expectedPublic(step2.input, consistency));

  writeJson("fixtures/m6/update_action_clause_debug.json", {
    step1: step1.clauseDebug,
    step2: step2.clauseDebug,
    note: "These values document M7-compatible fixture construction. They are not circuit inputs in M6.",
  });

  const cases: Record<string, any> = {};

  cases.wrong_actionHash = structuredClone(step1.input);
  cases.wrong_actionHash.actionHash = mutateDecimal(cases.wrong_actionHash.actionHash);

  cases.wrong_rho = structuredClone(step1.input);
  cases.wrong_rho.rho = mutateDecimal(cases.wrong_rho.rho);

  cases.wrong_clauseCom = structuredClone(step1.input);
  cases.wrong_clauseCom.clauseCom = mutateDecimal(cases.wrong_clauseCom.clauseCom);

  cases.wrong_receiverDigest = structuredClone(step1.input);
  cases.wrong_receiverDigest.receiverDigest = mutateDecimal(cases.wrong_receiverDigest.receiverDigest);

  cases.wrong_contractAddr = structuredClone(step1.input);
  cases.wrong_contractAddr.contractAddr = mutateDecimal(cases.wrong_contractAddr.contractAddr);

  cases.wrong_chainID = structuredClone(step1.input);
  cases.wrong_chainID.chainID = mutateDecimal(cases.wrong_chainID.chainID);

  cases.wrong_nonce = structuredClone(step1.input);
  cases.wrong_nonce.nonce = mutateDecimal(cases.wrong_nonce.nonce);

  cases.amount_action_mismatch = structuredClone(step1.input);
  cases.amount_action_mismatch.rAmt = mutateDecimal(cases.amount_action_mismatch.rAmt);

  cases.bad_state_path = structuredClone(step1.input);
  cases.bad_state_path.stateSiblings[0] = mutateDecimal(cases.bad_state_path.stateSiblings[0]);

  const overLimit = await makeActionBoundInput({
    base: overLimitBase,
    scope,
    rootBundle,
    nonce: "333",
    clauseStatus: CLAUSE.CLAUSE_SATISFIED,
    evidenceSalt: "830003",
    rClause: "820003",
  });
  cases.exceeds_limit = overLimit.input;

  for (const [name, value] of Object.entries(cases)) {
    writeJson(`fixtures/m6/update_action_negative_cases/${name}.json`, value);
  }

  writeFileSync("docs/M6_UPDATE_ACTION_CIRCUIT_REPORT.md", `# M6 Update Action Circuit Report

## Status

- build_update_action_input: pass
- circom compile: pending
- step1 witness generation: pending
- step1 wtns check: pending
- step2 witness generation: pending
- step2 wtns check: pending

## Public input ordering

\`\`\`text
[
  rootRegAct,
  rootStatusAct,
  rootPolAct,
  rtState,
  N_old,
  C_new,
  actionHash,
  amountCom,
  clauseCom,
  rho
]
\`\`\`

## Step values

step1:
  rtState: ${step1.input.rtState}
  N_old: ${step1.input.N_old}
  C_new: ${step1.input.C_new}
  amountCom: ${step1.input.amountCom}
  actionHash: ${step1.input.actionHash}
  clauseCom: ${step1.input.clauseCom}
  rho: ${step1.input.rho}

step2:
  rtState: ${step2.input.rtState}
  N_old: ${step2.input.N_old}
  C_new: ${step2.input.C_new}
  amountCom: ${step2.input.amountCom}
  actionHash: ${step2.input.actionHash}
  clauseCom: ${step2.input.clauseCom}
  rho: ${step2.input.rho}

## Negative cases

- negative wrong_actionHash: pending
- negative wrong_rho: pending
- negative wrong_clauseCom: pending
- negative wrong_receiverDigest: pending
- negative wrong_contractAddr: pending
- negative wrong_chainID: pending
- negative wrong_nonce: pending
- negative amount_action_mismatch: pending
- negative bad_state_path: pending
- negative exceeds_limit: pending

## Fixture consistency

- C_after_18000 matches M3 appendResults[1].leaf: ${consistency.step1CNewMatchesM3AppendResults1Leaf ? "yes" : "no"}
- C_after_36000 matches M3 appendResults[2].leaf: ${consistency.step2CNewMatchesM3AppendResults2Leaf ? "yes" : "no"}
- rootRegAct matches M2: ${consistency.rootRegActMatchesM2 ? "yes" : "no"}
- rootStatusAct matches M2: ${consistency.rootStatusActMatchesM2 ? "yes" : "no"}
- rootPolAct matches M2: ${consistency.rootPolActMatchesM2 ? "yes" : "no"}

## Known limitation

- clauseCom formula is not validated until M7.
- M6 fixture computes M7-compatible clauseCom values, but M6 circuit only checks that rho binds clauseCom.
`);

  console.log("build_update_action_input: pass");
  console.log(`step1 rtState: ${step1.input.rtState}`);
  console.log(`step1 N_old: ${step1.input.N_old}`);
  console.log(`step1 C_new: ${step1.input.C_new}`);
  console.log(`step1 amountCom: ${step1.input.amountCom}`);
  console.log(`step1 actionHash: ${step1.input.actionHash}`);
  console.log(`step1 clauseCom: ${step1.input.clauseCom}`);
  console.log(`step1 rho: ${step1.input.rho}`);
  console.log(`step2 rtState: ${step2.input.rtState}`);
  console.log(`step2 N_old: ${step2.input.N_old}`);
  console.log(`step2 C_new: ${step2.input.C_new}`);
  console.log(`step2 amountCom: ${step2.input.amountCom}`);
  console.log(`step2 actionHash: ${step2.input.actionHash}`);
  console.log(`step2 clauseCom: ${step2.input.clauseCom}`);
  console.log(`step2 rho: ${step2.input.rho}`);
  console.log(`C_after_18000 matches M3 appendResults[1].leaf: ${consistency.step1CNewMatchesM3AppendResults1Leaf ? "yes" : "no"}`);
  console.log(`C_after_36000 matches M3 appendResults[2].leaf: ${consistency.step2CNewMatchesM3AppendResults2Leaf ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
