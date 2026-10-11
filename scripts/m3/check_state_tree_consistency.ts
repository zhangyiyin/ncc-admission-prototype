import { readFileSync, writeFileSync } from "node:fs";
import { parseFr, frToDecimal } from "../../entities/common/crypto/fr.ts";
import { hashOwner, hashScope, hashStateCore, hashState } from "../../entities/common/crypto/hashObjects.ts";
import { OffchainStateTree } from "../../entities/public_admission/state_tree/offchainStateTree.ts";
import type { StateLeafInput, StateWitness } from "../../entities/public_admission/state_tree/stateTreeTypes.ts";

const STATE_TREE_DEPTH = 8;

type ScopeFixture = { e: string; policyID: string; gatewayID: string };
type UserFixture = { users: Array<{ userID: string; sk_u: string }> };
type StateTreeInputs = { depth: number; userID: string; leaves: StateLeafInput[] };
type Expected = {
  depth: number;
  emptyRoot: string;
  appendResults: Array<{ label: string; index: number; leaf: string; oldRoot: string; newRoot: string }>;
  knownRoots: string[];
};
type WitnessBundle = {
  depth: number;
  witnesses: Array<{ label: string; witness: { leaf: string; index: number; siblings: string[]; pathIndices: number[]; root: string } }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} mismatch. actual=${String(actual)} expected=${String(expected)}`);
  }
}

function witnessFromJson(raw: WitnessBundle["witnesses"][number]["witness"]): StateWitness {
  return {
    leaf: parseFr(raw.leaf),
    index: raw.index,
    siblings: raw.siblings.map(parseFr),
    pathIndices: raw.pathIndices,
    root: parseFr(raw.root),
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
  const scope = readJson<ScopeFixture>("fixtures/scopes/demo_scope.json");
  const users = readJson<UserFixture>("fixtures/users/demo_users_private.json");
  const inputs = readJson<StateTreeInputs>("fixtures/m3/state_tree_inputs.json");
  const expected = readJson<Expected>("fixtures/m3/state_tree_expected.json");
  const witnessBundle = readJson<WitnessBundle>("fixtures/m3/state_witnesses.json");

  assertEqual(inputs.depth, STATE_TREE_DEPTH, "inputs.depth");
  assertEqual(expected.depth, STATE_TREE_DEPTH, "expected.depth");
  assertEqual(witnessBundle.depth, STATE_TREE_DEPTH, "witness depth");

  const user = users.users.find((u) => u.userID === inputs.userID);
  if (!user) {
    throw new Error(`User not found in demo user fixture: ${inputs.userID}`);
  }

  const tree = await OffchainStateTree.create(inputs.depth);
  assertEqual(frToDecimal(tree.root()), expected.emptyRoot, "empty root");

  const skU = parseFr(user.sk_u);
  for (let i = 0; i < inputs.leaves.length; i += 1) {
    const leaf = await computeStateCommitment(scope, skU, inputs.leaves[i]);
    const append = await tree.append(leaf);
    const exp = expected.appendResults[i];
    assertEqual(inputs.leaves[i].label, exp.label, `label ${i}`);
    assertEqual(append.index, exp.index, `index ${exp.label}`);
    assertEqual(frToDecimal(append.leaf), exp.leaf, `leaf ${exp.label}`);
    assertEqual(frToDecimal(append.oldRoot), exp.oldRoot, `oldRoot ${exp.label}`);
    assertEqual(frToDecimal(append.newRoot), exp.newRoot, `newRoot ${exp.label}`);
  }

  assertEqual(JSON.stringify(tree.knownRoots().map(frToDecimal)), JSON.stringify(expected.knownRoots), "knownRoots");

  const witnessStatus: string[] = [];
  for (const item of witnessBundle.witnesses) {
    const witness = witnessFromJson(item.witness);
    const ok = await OffchainStateTree.verifyWitnessAtDepth(witnessBundle.depth, witness);
    if (!ok) {
      throw new Error(`Witness failed: ${item.label}`);
    }
    witnessStatus.push(`- witness ${item.label}: pass`);

    const tamperedLeaf = { ...witness, leaf: (witness.leaf + 1n) };
    if (await OffchainStateTree.verifyWitnessAtDepth(witnessBundle.depth, tamperedLeaf)) {
      throw new Error(`Tampered leaf unexpectedly verified: ${item.label}`);
    }

    const tamperedPath = { ...witness, pathIndices: [...witness.pathIndices] };
    tamperedPath.pathIndices[0] = tamperedPath.pathIndices[0] === 0 ? 1 : 0;
    if (await OffchainStateTree.verifyWitnessAtDepth(witnessBundle.depth, tamperedPath)) {
      throw new Error(`Tampered path unexpectedly verified: ${item.label}`);
    }

    const tamperedRoot = { ...witness, root: (witness.root + 1n) };
    if (await OffchainStateTree.verifyWitnessAtDepth(witnessBundle.depth, tamperedRoot)) {
      throw new Error(`Tampered root unexpectedly verified: ${item.label}`);
    }
  }

  const report = `# M3 State Tree Report\n\n` +
    `## Status\n\n` +
    `- build_state_tree_fixture: pass\n` +
    `- check_state_tree_consistency: pass\n` +
    `- hardhat compile: pending\n` +
    `- hardhat test m3: pending\n\n` +
    `## Roots\n\n` +
    `- emptyRoot: ${expected.emptyRoot}\n` +
    `- root after C_gen: ${expected.appendResults[0].newRoot}\n` +
    `- root after C_after_18000: ${expected.appendResults[1].newRoot}\n` +
    `- root after C_after_36000: ${expected.appendResults[2].newRoot}\n\n` +
    `## Root History\n\n` +
    `- knownRoots count: ${expected.knownRoots.length}\n\n` +
    `## Witnesses\n\n` +
    `${witnessStatus.join("\n")}\n` +
    `- tampered leaf/path/root negative tests: pass\n\n` +
    `## Known Warnings\n\n` +
    `- Node or Hardhat may print local deprecation warnings. They are not M3 correctness errors.\n` +
    `- M3 fixture openings are private/debug inputs only. Public state-tree artifacts contain commitments and roots, not state openings.\n`;

  writeFileSync("docs/M3_STATE_TREE_REPORT.md", report);

  console.log("check_state_tree_consistency: pass");
  console.log(`knownRoots count: ${expected.knownRoots.length}`);
  console.log("witnesses: pass");
  console.log("tampered witness negative tests: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
