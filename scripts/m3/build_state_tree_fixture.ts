import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseFr, frToDecimal } from "../../entities/common/crypto/fr.ts";
import { hashOwner, hashScope, hashStateCore, hashState } from "../../entities/common/crypto/hashObjects.ts";
import { OffchainStateTree } from "../../entities/public_admission/state_tree/offchainStateTree.ts";
import type { StateLeafInput } from "../../entities/public_admission/state_tree/stateTreeTypes.ts";

const STATE_TREE_DEPTH = 8;

type ScopeFixture = {
  e: string;
  policyID: string;
  gatewayID: string;
};

type UserFixture = {
  users: Array<{
    userID: string;
    sk_u: string;
  }>;
};

type StateTreeInputs = {
  depth: number;
  userID: string;
  leaves: StateLeafInput[];
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function bigintWitnessToJson(w: { leaf: bigint; index: number; siblings: bigint[]; pathIndices: number[]; root: bigint }) {
  return {
    leaf: frToDecimal(w.leaf),
    index: w.index,
    siblings: w.siblings.map(frToDecimal),
    pathIndices: w.pathIndices,
    root: frToDecimal(w.root),
  };
}

async function computeStateCommitment(scope: ScopeFixture, skU: bigint, leafInput: StateLeafInput): Promise<bigint> {
  const owner = await hashOwner(skU);
  const scopeHash = await hashScope(parseFr(scope.e), parseFr(scope.policyID), parseFr(scope.gatewayID));
  const stateCoreHash = await hashStateCore(
    parseFr(leafInput.usedAmount),
    parseFr(leafInput.txCount),
    parseFr(leafInput.riskLevel),
    parseFr(leafInput.flags),
  );
  return hashState(owner, scopeHash, stateCoreHash, parseFr(leafInput.r));
}

async function main(): Promise<void> {
  mkdirSync("fixtures/m3", { recursive: true });
  mkdirSync("docs", { recursive: true });

  const scope = readJson<ScopeFixture>("fixtures/scopes/demo_scope.json");
  const users = readJson<UserFixture>("fixtures/users/demo_users_private.json");
  const inputs = readJson<StateTreeInputs>("fixtures/m3/state_tree_inputs.json");

  if (inputs.depth !== STATE_TREE_DEPTH) {
    throw new Error(`Expected state tree depth ${STATE_TREE_DEPTH}, got ${inputs.depth}`);
  }

  const user = users.users.find((u) => u.userID === inputs.userID);
  if (!user) {
    throw new Error(`User not found in demo user fixture: ${inputs.userID}`);
  }
  const skU = parseFr(user.sk_u);

  const tree = await OffchainStateTree.create(inputs.depth);
  const appendResults = [];

  for (const leafInput of inputs.leaves) {
    const leaf = await computeStateCommitment(scope, skU, leafInput);
    const append = await tree.append(leaf);
    appendResults.push({
      label: leafInput.label,
      index: append.index,
      leaf: frToDecimal(append.leaf),
      oldRoot: frToDecimal(append.oldRoot),
      newRoot: frToDecimal(append.newRoot),
      privateDebugOpening: {
        usedAmount: leafInput.usedAmount,
        txCount: leafInput.txCount,
        riskLevel: leafInput.riskLevel,
        flags: leafInput.flags,
        r: leafInput.r,
      },
    });
  }

  const expected = {
    depth: inputs.depth,
    emptyRoot: frToDecimal(tree.knownRoots()[0]),
    zeroSchedule: tree.zeroSchedule().map(frToDecimal),
    appendResults,
    knownRoots: tree.knownRoots().map(frToDecimal),
    privacyNote: "privateDebugOpening values are local private/debug fixture inputs, not public chain records.",
  };

  const witnesses = [];
  for (const result of appendResults) {
    const witness = await tree.getWitness(result.index);
    witnesses.push({
      label: result.label,
      witness: bigintWitnessToJson(witness),
    });
  }

  const witnessBundle = {
    depth: inputs.depth,
    finalRoot: frToDecimal(tree.root()),
    witnesses,
    privacyNote: "State witnesses are prover-side private inputs for future circuits. They are not public calldata or public events.",
  };

  writeFileSync("fixtures/m3/state_tree_expected.json", `${JSON.stringify(expected, null, 2)}\n`);
  writeFileSync("fixtures/m3/state_witnesses.json", `${JSON.stringify(witnessBundle, null, 2)}\n`);

  const report = `# M3 State Tree Report\n\n` +
    `## Status\n\n` +
    `- build_state_tree_fixture: pass\n` +
    `- check_state_tree_consistency: pending\n` +
    `- hardhat compile: pending\n` +
    `- hardhat test m3: pending\n\n` +
    `## Roots\n\n` +
    `- emptyRoot: ${expected.emptyRoot}\n` +
    `- root after C_gen: ${appendResults[0].newRoot}\n` +
    `- root after C_after_18000: ${appendResults[1].newRoot}\n` +
    `- root after C_after_36000: ${appendResults[2].newRoot}\n\n` +
    `## Witnesses\n\n` +
    `- witness C_gen: pending\n` +
    `- witness C_after_18000: pending\n` +
    `- witness C_after_36000: pending\n\n` +
    `## Known Warnings\n\n` +
    `- M3 fixture openings are private/debug inputs only. Public state-tree artifacts contain commitments and roots, not state openings.\n`;

  writeFileSync("docs/M3_STATE_TREE_REPORT.md", report);

  console.log("build_state_tree_fixture: pass");
  console.log(`emptyRoot: ${expected.emptyRoot}`);
  for (const r of appendResults) {
    console.log(`${r.label}: index=${r.index} leaf=${r.leaf} newRoot=${r.newRoot}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
