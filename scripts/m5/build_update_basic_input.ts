import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FR_MODULUS, frToDecimal, parseFr } from "../../entities/common/crypto/fr.ts";
import {
  hashAmount,
  hashOwner,
  hashState,
  hashStateCore,
  hashStateNullifier,
} from "../../entities/common/crypto/hashObjects.ts";
import { OffchainStateTree } from "../../entities/public_admission/state_tree/offchainStateTree.ts";

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: any): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function mutateDecimal(x: string): string {
  return ((BigInt(x) + 1n) % FR_MODULUS).toString(10);
}

function user001(users: any): any {
  const found = users.users.find((u: any) => u.userID === "user_001");
  if (!found) {
    throw new Error("user_001 not found in fixtures/users/demo_users_private.json");
  }
  return found;
}

function toStringArray(xs: Array<string | number>): string[] {
  return xs.map((x) => x.toString());
}

function serializeWitness(w: any): any {
  return {
    leaf: frToDecimal(w.leaf),
    index: w.index,
    siblings: w.siblings.map(frToDecimal),
    pathIndices: w.pathIndices.map((x: number) => x.toString()),
    root: frToDecimal(w.root),
  };
}

function stateByLabel(stateExpected: any, label: string): any {
  const found = stateExpected.appendResults.find((x: any) => x.label === label);
  if (!found) {
    throw new Error(`State append result not found: ${label}`);
  }
  return found;
}

async function computeStateCommitment(owner: bigint, scopeHash: bigint, opening: any): Promise<string> {
  const core = await hashStateCore(
    parseFr(opening.usedAmount),
    parseFr(opening.txCount),
    parseFr(opening.riskLevel),
    parseFr(opening.flags),
  );
  return frToDecimal(await hashState(owner, scopeHash, core, parseFr(opening.r)));
}

async function makeStepInput(args: {
  scope: any;
  user: any;
  rootBundle: any;
  witness: any;
  stateWitness: any;
  oldOpening: any;
  newOpening: any;
  rtState: string;
  cOld: string;
  cNew: string;
  amount: string;
  rAmt: string;
  nonce: string;
}): Promise<any> {
  const scopeHash = args.rootBundle.scope.scopeHash;
  const nOld = frToDecimal(
    await hashStateNullifier(parseFr(args.user.sk_u), parseFr(args.cOld), parseFr(scopeHash)),
  );
  const amountCom = frToDecimal(
    await hashAmount(parseFr(args.amount), parseFr(args.rAmt), parseFr(scopeHash), parseFr(args.nonce)),
  );

  return {
    rootRegAct: args.rootBundle.roots.rootRegAct,
    rootStatusAct: args.rootBundle.roots.rootStatusAct,
    rootPolAct: args.rootBundle.roots.rootPolAct,
    rtState: args.rtState,
    N_old: nOld,
    C_new: args.cNew,
    amountCom,

    sk_u: args.user.sk_u,

    e: args.scope.e,
    policyID: args.scope.policyID,
    gatewayID: args.scope.gatewayID,
    policyVersion: args.scope.policyVersion,

    regScope: scopeHash,
    regSalt: args.user.regSalt,
    statusActive: args.user.statusActive,
    statusSalt: args.user.statusSalt,

    limit: args.rootBundle.policy.limit,
    threshold: args.rootBundle.policy.threshold,
    clauseType: args.rootBundle.policy.clauseType,

    amount: args.amount,
    rAmt: args.rAmt,
    nonce: args.nonce,

    usedAmountOld: args.oldOpening.usedAmount,
    txCountOld: args.oldOpening.txCount,
    riskLevelOld: args.oldOpening.riskLevel,
    flagsOld: args.oldOpening.flags,
    rOld: args.oldOpening.r,

    usedAmountNew: args.newOpening.usedAmount,
    txCountNew: args.newOpening.txCount,
    riskLevelNew: args.newOpening.riskLevel,
    flagsNew: args.newOpening.flags,
    rNew: args.newOpening.r,

    regSiblings: args.witness.registration.siblings,
    regPathIndices: toStringArray(args.witness.registration.pathIndices),

    statusSiblings: args.witness.status.siblings,
    statusPathIndices: toStringArray(args.witness.status.pathIndices),

    policySiblings: args.witness.policy.siblings,
    policyPathIndices: toStringArray(args.witness.policy.pathIndices),

    stateSiblings: args.stateWitness.siblings,
    statePathIndices: toStringArray(args.stateWitness.pathIndices),
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
      input.amountCom,
    ],
    named: {
      rootRegAct: input.rootRegAct,
      rootStatusAct: input.rootStatusAct,
      rootPolAct: input.rootPolAct,
      rtState: input.rtState,
      N_old: input.N_old,
      C_new: input.C_new,
      amountCom: input.amountCom,
    },
    consistency,
  };
}

async function main(): Promise<void> {
  mkdirSync("fixtures/m5/update_basic_negative_cases", { recursive: true });
  mkdirSync("docs", { recursive: true });

  const scope = readJson("fixtures/scopes/demo_scope.json");
  const users = readJson("fixtures/users/demo_users_private.json");
  const user = user001(users);
  const rootBundle = readJson("fixtures/m2/root_bundle.json");
  const witness = readJson("fixtures/m2/witness_user_001.json");
  const stateExpected = readJson("fixtures/m3/state_tree_expected.json");

  const depth = Number(stateExpected.depth);
  if (depth !== 8) {
    throw new Error(`M5-basic expects state tree depth 8 for local fixtures, got ${depth}`);
  }

  const cGen = stateByLabel(stateExpected, "C_gen");
  const cAfter18000 = stateByLabel(stateExpected, "C_after_18000");
  const cAfter36000 = stateByLabel(stateExpected, "C_after_36000");

  const owner = await hashOwner(parseFr(user.sk_u));
  const scopeHash = parseFr(rootBundle.scope.scopeHash);

  if (frToDecimal(owner) !== witness.owner) {
    throw new Error("owner derived from sk_u does not match witness_user_001.owner");
  }

  for (const st of [cGen, cAfter18000, cAfter36000]) {
    const recomputed = await computeStateCommitment(owner, scopeHash, st.privateDebugOpening);
    if (recomputed !== st.leaf) {
      throw new Error(`state commitment mismatch for ${st.label}: ${recomputed} != ${st.leaf}`);
    }
  }

  const treeStep1 = await OffchainStateTree.create(depth);
  await treeStep1.append(parseFr(cGen.leaf));
  const witnessCGen = serializeWitness(await treeStep1.getWitness(0));

  const treeStep2 = await OffchainStateTree.create(depth);
  await treeStep2.append(parseFr(cGen.leaf));
  await treeStep2.append(parseFr(cAfter18000.leaf));
  const witnessCAfter18000 = serializeWitness(await treeStep2.getWitness(1));

  const treeStep3 = await OffchainStateTree.create(depth);
  await treeStep3.append(parseFr(cGen.leaf));
  await treeStep3.append(parseFr(cAfter18000.leaf));
  await treeStep3.append(parseFr(cAfter36000.leaf));
  const witnessCAfter36000 = serializeWitness(await treeStep3.getWitness(2));

  const step1Input = await makeStepInput({
    scope,
    user,
    rootBundle,
    witness,
    stateWitness: witnessCGen,
    oldOpening: cGen.privateDebugOpening,
    newOpening: cAfter18000.privateDebugOpening,
    rtState: cGen.newRoot,
    cOld: cGen.leaf,
    cNew: cAfter18000.leaf,
    amount: "18000",
    rAmt: "810001",
    nonce: "700001",
  });

  const step2Input = await makeStepInput({
    scope,
    user,
    rootBundle,
    witness,
    stateWitness: witnessCAfter18000,
    oldOpening: cAfter18000.privateDebugOpening,
    newOpening: cAfter36000.privateDebugOpening,
    rtState: cAfter18000.newRoot,
    cOld: cAfter18000.leaf,
    cNew: cAfter36000.leaf,
    amount: "18000",
    rAmt: "810002",
    nonce: "700002",
  });

  const consistency = {
    step1CNewMatchesM3AppendResults1Leaf: step1Input.C_new === stateExpected.appendResults[1].leaf,
    step2CNewMatchesM3AppendResults2Leaf: step2Input.C_new === stateExpected.appendResults[2].leaf,
    rootRegActMatchesM2: step1Input.rootRegAct === rootBundle.roots.rootRegAct,
    rootStatusActMatchesM2: step1Input.rootStatusAct === rootBundle.roots.rootStatusAct,
    rootPolActMatchesM2: step1Input.rootPolAct === rootBundle.roots.rootPolAct,
  };

  writeJson("fixtures/m5/update_basic_state_witnesses.json", {
    depth,
    witnesses: [
      { label: "step1_old_C_gen_at_root_after_C_gen", witness: witnessCGen },
      { label: "step2_old_C_after_18000_at_root_after_C_after_18000", witness: witnessCAfter18000 },
      { label: "exceeds_limit_old_C_after_36000_at_root_after_C_after_36000", witness: witnessCAfter36000 },
    ],
  });

  writeJson("fixtures/m5/update_basic_input_step1.json", step1Input);
  writeJson("fixtures/m5/update_basic_public_expected_step1.json", expectedPublic(step1Input, consistency));

  writeJson("fixtures/m5/update_basic_input_step2.json", step2Input);
  writeJson("fixtures/m5/update_basic_public_expected_step2.json", expectedPublic(step2Input, consistency));

  const cases: Record<string, any> = {};

  cases.bad_state_path = structuredClone(step1Input);
  cases.bad_state_path.stateSiblings[0] = mutateDecimal(cases.bad_state_path.stateSiblings[0]);

  cases.wrong_rtState = structuredClone(step1Input);
  cases.wrong_rtState.rtState = mutateDecimal(cases.wrong_rtState.rtState);

  cases.wrong_N_old = structuredClone(step1Input);
  cases.wrong_N_old.N_old = mutateDecimal(cases.wrong_N_old.N_old);

  cases.wrong_C_new = structuredClone(step1Input);
  cases.wrong_C_new.C_new = mutateDecimal(cases.wrong_C_new.C_new);

  cases.wrong_amountCom = structuredClone(step1Input);
  cases.wrong_amountCom.amountCom = mutateDecimal(cases.wrong_amountCom.amountCom);

  cases.wrong_policy_root = structuredClone(step1Input);
  cases.wrong_policy_root.rootPolAct = mutateDecimal(cases.wrong_policy_root.rootPolAct);

  cases.inactive_status = structuredClone(step1Input);
  cases.inactive_status.statusActive = "0";

  const overLimitOpening = {
    usedAmount: "54000",
    txCount: "3",
    riskLevel: "0",
    flags: "0",
    r: "800004",
  };
  const overLimitCNew = await computeStateCommitment(owner, scopeHash, overLimitOpening);

  cases.exceeds_limit = await makeStepInput({
    scope,
    user,
    rootBundle,
    witness,
    stateWitness: witnessCAfter36000,
    oldOpening: cAfter36000.privateDebugOpening,
    newOpening: overLimitOpening,
    rtState: cAfter36000.newRoot,
    cOld: cAfter36000.leaf,
    cNew: overLimitCNew,
    amount: "18000",
    rAmt: "810003",
    nonce: "700003",
  });

  for (const [name, value] of Object.entries(cases)) {
    writeJson(`fixtures/m5/update_basic_negative_cases/${name}.json`, value);
  }

  writeFileSync("docs/M5_UPDATE_BASIC_CIRCUIT_REPORT.md", `# M5 Update Basic Circuit Report

## Status

- build_update_basic_input: pass
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
  amountCom
]
\`\`\`

## Step values

step1:
  rtState: ${step1Input.rtState}
  N_old: ${step1Input.N_old}
  C_new: ${step1Input.C_new}
  amountCom: ${step1Input.amountCom}

step2:
  rtState: ${step2Input.rtState}
  N_old: ${step2Input.N_old}
  C_new: ${step2Input.C_new}
  amountCom: ${step2Input.amountCom}

## Negative cases

- negative bad_state_path: pending
- negative wrong_rtState: pending
- negative wrong_N_old: pending
- negative wrong_C_new: pending
- negative wrong_amountCom: pending
- negative wrong_policy_root: pending
- negative inactive_status: pending
- negative exceeds_limit: pending

## M3 consistency

- C_after_18000 matches M3 appendResults[1].leaf: ${consistency.step1CNewMatchesM3AppendResults1Leaf ? "yes" : "no"}
- C_after_36000 matches M3 appendResults[2].leaf: ${consistency.step2CNewMatchesM3AppendResults2Leaf ? "yes" : "no"}

## Known warnings

- None at fixture build stage.
`);

  console.log("build_update_basic_input: pass");
  console.log(`step1 rtState: ${step1Input.rtState}`);
  console.log(`step1 N_old: ${step1Input.N_old}`);
  console.log(`step1 C_new: ${step1Input.C_new}`);
  console.log(`step1 amountCom: ${step1Input.amountCom}`);
  console.log(`step2 rtState: ${step2Input.rtState}`);
  console.log(`step2 N_old: ${step2Input.N_old}`);
  console.log(`step2 C_new: ${step2Input.C_new}`);
  console.log(`step2 amountCom: ${step2Input.amountCom}`);
  console.log(`C_after_18000 matches M3 appendResults[1].leaf: ${consistency.step1CNewMatchesM3AppendResults1Leaf ? "yes" : "no"}`);
  console.log(`C_after_36000 matches M3 appendResults[2].leaf: ${consistency.step2CNewMatchesM3AppendResults2Leaf ? "yes" : "no"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
