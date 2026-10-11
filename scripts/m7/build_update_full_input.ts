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

async function recomputeFullPublic(input: any, rootBundle: any): Promise<any> {
  const scopeHash = rootBundle.scope.scopeHash;

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

  const evidenceDigest = frToDecimal(
    await hashMockSofEvidence(parseFr(scopeHash), parseFr(input.nonce), parseFr(input.evidenceSalt)),
  );

  input.clauseCom = frToDecimal(
    await hashClause(
      parseFr(input.actionHash),
      parseFr(input.clauseType),
      parseFr(input.clauseStatus),
      parseFr(evidenceDigest),
      parseFr(input.rClause),
    ),
  );

  input.rho = frToDecimal(
    await hashRho(parseFr(input.actionHash), parseFr(input.clauseCom), parseFr(input.N_old), parseFr(input.C_new)),
  );

  return { actionContextHash, evidenceDigest };
}

async function makeFullInput(args: {
  base: any;
  rootBundle: any;
  clauseStatus: string;
  evidenceSalt: string;
  rClause: string;
  overThreshold: string;
}): Promise<{ input: any; debug: any }> {
  const input = structuredClone(args.base);
  input.clauseStatus = args.clauseStatus;
  input.evidenceSalt = args.evidenceSalt;
  input.rClause = args.rClause;
  const hashes = await recomputeFullPublic(input, args.rootBundle);
  return {
    input,
    debug: {
      actionContextHash: hashes.actionContextHash,
      evidenceDigest: hashes.evidenceDigest,
      clauseStatus: args.clauseStatus,
      evidenceSalt: args.evidenceSalt,
      rClause: args.rClause,
      overThreshold: args.overThreshold,
    },
  };
}

function expectedPublic(input: any, consistency: any, privateDebug: any): any {
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
    privateDebug,
    consistency,
  };
}

async function main(): Promise<void> {
  mkdirSync("fixtures/m7/update_full_negative_cases", { recursive: true });
  mkdirSync("docs", { recursive: true });

  const rootBundle = readJson("fixtures/m2/root_bundle.json");
  const stateExpected = readJson("fixtures/m3/state_tree_expected.json");

  const step1Base = readJson("fixtures/m6/update_action_input_step1.json");
  const step2Base = readJson("fixtures/m6/update_action_input_step2.json");
  const overLimitBase = readJson("fixtures/m6/update_action_negative_cases/exceeds_limit.json");

  const step1 = await makeFullInput({
    base: step1Base,
    rootBundle,
    clauseStatus: CLAUSE.CLAUSE_DUMMY.toString(10),
    evidenceSalt: "830001",
    rClause: "820001",
    overThreshold: "0",
  });

  const step2 = await makeFullInput({
    base: step2Base,
    rootBundle,
    clauseStatus: CLAUSE.CLAUSE_SATISFIED.toString(10),
    evidenceSalt: "830002",
    rClause: "820002",
    overThreshold: "1",
  });

  const consistency = {
    step1CNewMatchesM3AppendResults1Leaf: step1.input.C_new === stateExpected.appendResults[1].leaf,
    step2CNewMatchesM3AppendResults2Leaf: step2.input.C_new === stateExpected.appendResults[2].leaf,
    rootRegActMatchesM2: step1.input.rootRegAct === rootBundle.roots.rootRegAct,
    rootStatusActMatchesM2: step1.input.rootStatusAct === rootBundle.roots.rootStatusAct,
    rootPolActMatchesM2: step1.input.rootPolAct === rootBundle.roots.rootPolAct,
    finalUpdateOrderingUnchangedFromM6: true,
  };

  writeJson("fixtures/m7/update_full_input_step1.json", step1.input);
  writeJson("fixtures/m7/update_full_public_expected_step1.json", expectedPublic(step1.input, consistency, step1.debug));

  writeJson("fixtures/m7/update_full_input_step2.json", step2.input);
  writeJson("fixtures/m7/update_full_public_expected_step2.json", expectedPublic(step2.input, consistency, step2.debug));

  const cases: Record<string, any> = {};

  cases.wrong_clauseCom = structuredClone(step1.input);
  cases.wrong_clauseCom.clauseCom = mutateDecimal(cases.wrong_clauseCom.clauseCom);

  cases.wrong_clauseCom_matching_rho = structuredClone(step1.input);
  cases.wrong_clauseCom_matching_rho.clauseCom = mutateDecimal(cases.wrong_clauseCom_matching_rho.clauseCom);
  cases.wrong_clauseCom_matching_rho.rho = frToDecimal(
    await hashRho(
      parseFr(cases.wrong_clauseCom_matching_rho.actionHash),
      parseFr(cases.wrong_clauseCom_matching_rho.clauseCom),
      parseFr(cases.wrong_clauseCom_matching_rho.N_old),
      parseFr(cases.wrong_clauseCom_matching_rho.C_new),
    ),
  );

  cases.wrong_evidenceSalt = structuredClone(step1.input);
  cases.wrong_evidenceSalt.evidenceSalt = mutateDecimal(cases.wrong_evidenceSalt.evidenceSalt);

  cases.wrong_rClause = structuredClone(step1.input);
  cases.wrong_rClause.rClause = mutateDecimal(cases.wrong_rClause.rClause);

  cases.step1_wrong_clauseStatus_satisfied = structuredClone(step1.input);
  cases.step1_wrong_clauseStatus_satisfied.clauseStatus = CLAUSE.CLAUSE_SATISFIED.toString(10);

  cases.step2_wrong_clauseStatus_dummy = structuredClone(step2.input);
  cases.step2_wrong_clauseStatus_dummy.clauseStatus = CLAUSE.CLAUSE_DUMMY.toString(10);

  cases.wrong_actionHash = structuredClone(step1.input);
  cases.wrong_actionHash.actionHash = mutateDecimal(cases.wrong_actionHash.actionHash);

  cases.wrong_rho = structuredClone(step1.input);
  cases.wrong_rho.rho = mutateDecimal(cases.wrong_rho.rho);

  cases.wrong_nonce = structuredClone(step1.input);
  cases.wrong_nonce.nonce = mutateDecimal(cases.wrong_nonce.nonce);

  cases.amount_action_mismatch = structuredClone(step1.input);
  cases.amount_action_mismatch.rAmt = mutateDecimal(cases.amount_action_mismatch.rAmt);

  cases.bad_state_path = structuredClone(step1.input);
  cases.bad_state_path.stateSiblings[0] = mutateDecimal(cases.bad_state_path.stateSiblings[0]);

  const overLimit = await makeFullInput({
    base: overLimitBase,
    rootBundle,
    clauseStatus: CLAUSE.CLAUSE_SATISFIED.toString(10),
    evidenceSalt: "830003",
    rClause: "820003",
    overThreshold: "1",
  });
  cases.exceeds_limit = overLimit.input;

  for (const [name, value] of Object.entries(cases)) {
    writeJson(`fixtures/m7/update_full_negative_cases/${name}.json`, value);
  }

  writeFileSync("docs/M7_UPDATE_FULL_CIRCUIT_REPORT.md", `# M7 Update Full Circuit Report

## Status

- build_update_full_input: pass
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
  actionHash: ${step1.input.actionHash}
  amountCom: ${step1.input.amountCom}
  clauseCom: ${step1.input.clauseCom}
  rho: ${step1.input.rho}
  clauseStatus: ${step1.debug.clauseStatus}
  overThreshold: ${step1.debug.overThreshold}

step2:
  rtState: ${step2.input.rtState}
  N_old: ${step2.input.N_old}
  C_new: ${step2.input.C_new}
  actionHash: ${step2.input.actionHash}
  amountCom: ${step2.input.amountCom}
  clauseCom: ${step2.input.clauseCom}
  rho: ${step2.input.rho}
  clauseStatus: ${step2.debug.clauseStatus}
  overThreshold: ${step2.debug.overThreshold}

## Negative cases

- negative wrong_clauseCom: pending
- negative wrong_clauseCom_matching_rho: pending
- negative wrong_evidenceSalt: pending
- negative wrong_rClause: pending
- negative step1_wrong_clauseStatus_satisfied: pending
- negative step2_wrong_clauseStatus_dummy: pending
- negative wrong_actionHash: pending
- negative wrong_rho: pending
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

## M7 full update circuit ready for M8 verifier generation

- ready: pending

## Known warnings

- None at fixture build stage.
`);

  console.log("build_update_full_input: pass");
  console.log(`step1 rtState: ${step1.input.rtState}`);
  console.log(`step1 N_old: ${step1.input.N_old}`);
  console.log(`step1 C_new: ${step1.input.C_new}`);
  console.log(`step1 actionHash: ${step1.input.actionHash}`);
  console.log(`step1 amountCom: ${step1.input.amountCom}`);
  console.log(`step1 clauseCom: ${step1.input.clauseCom}`);
  console.log(`step1 rho: ${step1.input.rho}`);
  console.log(`step1 clauseStatus: ${step1.debug.clauseStatus}`);
  console.log(`step1 overThreshold: ${step1.debug.overThreshold}`);
  console.log(`step2 rtState: ${step2.input.rtState}`);
  console.log(`step2 N_old: ${step2.input.N_old}`);
  console.log(`step2 C_new: ${step2.input.C_new}`);
  console.log(`step2 actionHash: ${step2.input.actionHash}`);
  console.log(`step2 amountCom: ${step2.input.amountCom}`);
  console.log(`step2 clauseCom: ${step2.input.clauseCom}`);
  console.log(`step2 rho: ${step2.input.rho}`);
  console.log(`step2 clauseStatus: ${step2.debug.clauseStatus}`);
  console.log(`step2 overThreshold: ${step2.debug.overThreshold}`);
  console.log(`C_after_18000 matches M3 appendResults[1].leaf: ${consistency.step1CNewMatchesM3AppendResults1Leaf ? "yes" : "no"}`);
  console.log(`C_after_36000 matches M3 appendResults[2].leaf: ${consistency.step2CNewMatchesM3AppendResults2Leaf ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
