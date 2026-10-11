import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { deserializeMerkleWitness, MOCK_AUTHORITY_TREE_DEPTH, verifyMerkleWitness } from "../../entities/common/merkle/fixedMerkleTree.ts";
import type { SerializedMerkleWitness } from "../../entities/common/merkle/merkleTypes.ts";
import { reportMarkdown } from "./build_mock_authority_trees.ts";

function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
interface RootBundle { roots: { rootRegAct: string; rootStatusAct: string; rootPolAct: string; }; }
interface WitnessUser001 { registration: SerializedMerkleWitness; status: SerializedMerkleWitness & { statusActive: string }; policy: SerializedMerkleWitness; }
interface BundleEntry { witness: SerializedMerkleWitness; }
interface MockAuthorityBundle { registration: { entries: BundleEntry[] }; status: { entries: (BundleEntry & { statusActive: string; userID: string })[] }; policy: { entries: BundleEntry[] }; }

async function mustVerify(label: string, witness: SerializedMerkleWitness, expectedRoot?: string): Promise<void> {
  if (expectedRoot !== undefined && witness.root !== expectedRoot) {
    throw new Error(`${label}: witness root ${witness.root} does not match expected root ${expectedRoot}`);
  }
  const ok = await verifyMerkleWitness(deserializeMerkleWitness(witness), MOCK_AUTHORITY_TREE_DEPTH);
  if (!ok) throw new Error(`${label}: witness verification failed`);
}

export async function checkMockAuthorityTrees(): Promise<void> {
  const rootBundle = readJson<RootBundle>("fixtures/m2/root_bundle.json");
  const witnessUser001 = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
  const mockBundle = readJson<MockAuthorityBundle>("fixtures/m2/mock_authority_bundle.json");
  await mustVerify("user_001 registration", witnessUser001.registration, rootBundle.roots.rootRegAct);
  await mustVerify("user_001 status", witnessUser001.status, rootBundle.roots.rootStatusAct);
  await mustVerify("demo policy", witnessUser001.policy, rootBundle.roots.rootPolAct);
  for (const [i, entry] of mockBundle.registration.entries.entries()) await mustVerify(`registration entry ${i}`, entry.witness, rootBundle.roots.rootRegAct);
  for (const [i, entry] of mockBundle.status.entries.entries()) await mustVerify(`status entry ${i}`, entry.witness, rootBundle.roots.rootStatusAct);
  for (const [i, entry] of mockBundle.policy.entries.entries()) await mustVerify(`policy entry ${i}`, entry.witness, rootBundle.roots.rootPolAct);
  const user003 = mockBundle.status.entries.find((entry) => entry.userID === "user_003");
  if (!user003 || user003.statusActive !== "0") throw new Error("user_003 statusActive is not 0 in mock authority bundle");
  writeFileSync("docs/M2_MOCK_AUTHORITY_TREES_REPORT.md", reportMarkdown(rootBundle.roots, "pass", "pass", "pending", "pass", "pass", "pass"));
  console.log("M2 mock authority tree check passed.");
  console.log(`rootRegAct: ${rootBundle.roots.rootRegAct}`);
  console.log(`rootStatusAct: ${rootBundle.roots.rootStatusAct}`);
  console.log(`rootPolAct: ${rootBundle.roots.rootPolAct}`);
}

async function main(): Promise<void> { await checkMockAuthorityTrees(); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
