import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { addressToFr } from "../../entities/common/crypto/encoding.ts";
import { frToDecimal, parseFr } from "../../entities/common/crypto/fr.ts";
import { hashPolicyScope, hashScope } from "../../entities/common/crypto/hashObjects.ts";
import { MOCK_AUTHORITY_TREE_DEPTH, serializeMerkleWitness } from "../../entities/common/merkle/fixedMerkleTree.ts";
import { buildMockPolicyTree } from "../../entities/policy_authority/mockPolicyTree.ts";
import type { DemoPolicy } from "../../entities/policy_authority/mockPolicyTree.ts";
import { buildMockRegistrationTree } from "../../entities/registration_authority/mockRegistrationTree.ts";
import type { DemoUserPrivate } from "../../entities/registration_authority/mockRegistrationTree.ts";
import { buildMockStatusTree } from "../../entities/status_authority/mockStatusTree.ts";

interface DemoScopeRaw { e: string; policyID: string; gatewayID: string; policyVersion: string; category: string; chainID: string; contractAddr: string; receiverDigest: string; }
interface DemoUsersRaw { users: DemoUserPrivate[]; }
interface DemoPoliciesRaw { policies: DemoPolicy[]; }

function writeJson(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
function dec(x: bigint): string { return frToDecimal(x); }

function ensureInputFixtures(): void {
  mkdirSync("fixtures/scopes", { recursive: true });
  mkdirSync("fixtures/users", { recursive: true });
  mkdirSync("fixtures/policies", { recursive: true });
  writeJson("fixtures/scopes/demo_scope.json", {
    e: "20260701", policyID: "1", gatewayID: "7", policyVersion: "1", category: "1", chainID: "31337",
    contractAddr: "0x1234567890123456789012345678901234567890", receiverDigest: "555555",
  });
  writeJson("fixtures/users/demo_users_private.json", { users: [
    { userID: "user_001", sk_u: "123456789", regSalt: "900001", statusSalt: "900002", statusActive: "1" },
    { userID: "user_002", sk_u: "223456789", regSalt: "900101", statusSalt: "900102", statusActive: "1" },
    { userID: "user_003", sk_u: "323456789", regSalt: "900201", statusSalt: "900202", statusActive: "0" },
  ] });
  writeJson("fixtures/policies/demo_policy.json", { policies: [
    { policyName: "daily_limit_policy", e: "20260701", policyID: "1", gatewayID: "7", policyVersion: "1", limit: "50000", threshold: "30000", clauseType: "1" },
    { policyName: "decoy_policy", e: "20260701", policyID: "2", gatewayID: "7", policyVersion: "1", limit: "70000", threshold: "40000", clauseType: "1" },
  ] });
}

function writeSchemasAndSpec(): void {
  mkdirSync("schemas", { recursive: true });
  mkdirSync("docs", { recursive: true });
  writeFileSync("schemas/merkle_witness.schema.md", `# Merkle Witness Schema\n\nM2 witnesses contain \`leaf\`, \`index\`, \`siblings\`, \`pathIndices\`, and \`root\`. For M2, \`siblings.length = pathIndices.length = 8\`. All leaves, siblings, and roots are decimal BN254 field strings.\n`);
  writeFileSync("schemas/root_bundle.schema.md", `# Root Bundle Schema\n\n\`fixtures/m2/root_bundle.json\` contains \`treeDepth\`, demo scope hashes, active authority roots, and demo policy metadata. All roots and hashes are decimal BN254 field strings.\n`);
  writeFileSync("schemas/mock_authority_bundle.schema.md", `# Mock Authority Bundle Schema\n\n\`fixtures/m2/mock_authority_bundle.json\` is a debug/private fixture bundle. It may include owner values, leaves, indices, and witnesses. These are not public calldata or event fields in subsequent protocol stages.\n`);
  writeFileSync("docs/M2_MOCK_AUTHORITY_TREES_SPEC.md", `# M2 Mock Authority Trees Specification\n\n## Scope\n\nM2 implements deterministic mock registration, status, and policy authority trees. It produces active authority roots and membership witnesses for later circuits. M2 does not implement the hidden compliance state tree, InitComplianceState, UpdateComplianceState, RootRegistry, ComplianceAdmission, gateway execution, or Groth16 proof generation.\n\n## Tree depth\n\n\`MOCK_AUTHORITY_TREE_DEPTH = 8\`.\n\n## Node hash\n\nM2 reuses the M1-R2 Merkle node hash:\n\n\`\`\`text\nnode = Poseidon(left, right)\n\`\`\`\n\nThe implementation calls \`hashMerkleNode(left, right)\` from \`entities/common/crypto/hashObjects.ts\`.\n\n## Zero schedule\n\n\`\`\`text\nzero[0] = 0\nzero[i+1] = Poseidon(zero[i], zero[i])\n\`\`\`\n\n## Leaf index convention\n\n\`user_001\`, \`user_002\`, and \`user_003\` use indices 0, 1, and 2 in the registration and status trees. \`daily_limit_policy\` and \`decoy_policy\` use indices 0 and 1 in the policy tree.\n\n## Witness format\n\nEach witness contains \`leaf\`, \`index\`, \`siblings\`, \`pathIndices\`, and \`root\`. \`pathIndices[i] = 0\` means the current node is the left child. \`pathIndices[i] = 1\` means the current node is the right child.\n\n## Scope hashes\n\n\`\`\`text\nscopeHash = Poseidon(TAG_SCOPE, e, policyID, gatewayID)\npolicyScopeHash = Poseidon(TAG_POLICY_SCOPE, e, policyID, gatewayID, policyVersion)\n\`\`\`\n\n## Registration leaf formula\n\nM2 freezes \`regScope = scopeHash\`.\n\n\`\`\`text\nregLeaf = Poseidon(TAG_REG, owner, regScope, regSalt)\n\`\`\`\n\n## Status leaf formula\n\n\`\`\`text\nstatusLeaf = Poseidon(TAG_STATUS, owner, statusActive, e, statusSalt)\n\`\`\`\n\n## Policy leaf formula\n\n\`\`\`text\npolicyParamsHash = Poseidon(TAG_POLICY_PARAMS, limit, threshold, clauseType)\npolicyScopeHash = Poseidon(TAG_POLICY_SCOPE, e, policyID, gatewayID, policyVersion)\npolicyLeaf = Poseidon(TAG_POLICY_LEAF, policyScopeHash, policyParamsHash)\n\`\`\`\n\n## Boundary\n\nM2 does not change M1-R2 tags or hash ordering. M2 does not implement an on-chain state tree, hidden compliance state tree, Init/Update circuits, RootRegistry, ComplianceAdmission, gateway execution, or Groth16 proof generation.\n`);
}

export async function buildMockAuthorityTrees(): Promise<void> {
  mkdirSync("fixtures/m2", { recursive: true });
  ensureInputFixtures();
  writeSchemasAndSpec();
  const scope = readJson<DemoScopeRaw>("fixtures/scopes/demo_scope.json");
  const users = readJson<DemoUsersRaw>("fixtures/users/demo_users_private.json");
  const policies = readJson<DemoPoliciesRaw>("fixtures/policies/demo_policy.json");
  addressToFr(scope.contractAddr); parseFr(scope.category); parseFr(scope.chainID); parseFr(scope.receiverDigest);
  const e = parseFr(scope.e);
  const policyID = parseFr(scope.policyID);
  const gatewayID = parseFr(scope.gatewayID);
  const policyVersion = parseFr(scope.policyVersion);
  const scopeHash = await hashScope(e, policyID, gatewayID);
  const policyScopeHash = await hashPolicyScope(e, policyID, gatewayID, policyVersion);
  const registration = await buildMockRegistrationTree(users.users, scopeHash, MOCK_AUTHORITY_TREE_DEPTH);
  const status = await buildMockStatusTree(users.users, e, MOCK_AUTHORITY_TREE_DEPTH);
  const policy = await buildMockPolicyTree(policies.policies, MOCK_AUTHORITY_TREE_DEPTH);
  const regEntry = registration.entries.find((entry) => entry.userID === "user_001");
  const statusEntry = status.entries.find((entry) => entry.userID === "user_001");
  const demoPolicy = policy.entries.find((entry) => entry.policyName === "daily_limit_policy");
  if (!regEntry || !statusEntry || !demoPolicy) throw new Error("Missing demo user or demo policy entry");

  const rootBundle = {
    treeDepth: MOCK_AUTHORITY_TREE_DEPTH,
    scope: { e: scope.e, policyID: scope.policyID, gatewayID: scope.gatewayID, policyVersion: scope.policyVersion, scopeHash: dec(scopeHash), policyScopeHash: dec(policyScopeHash) },
    roots: { rootRegAct: dec(registration.rootRegAct), rootStatusAct: dec(status.rootStatusAct), rootPolAct: dec(policy.rootPolAct) },
    policy: { limit: dec(demoPolicy.limit), threshold: dec(demoPolicy.threshold), clauseType: dec(demoPolicy.clauseType), policyParamsHash: dec(demoPolicy.policyParamsHash), policyLeaf: dec(demoPolicy.leaf), policyIndex: demoPolicy.index },
  };
  const witnessUser001 = {
    userID: "user_001",
    owner: dec(regEntry.owner),
    regScope: dec(regEntry.regScope),
    registration: serializeMerkleWitness(regEntry.witness),
    status: { ...serializeMerkleWitness(statusEntry.witness), statusActive: dec(statusEntry.statusActive) },
    policy: serializeMerkleWitness(demoPolicy.witness),
  };
  const mockAuthorityBundle = {
    debugPrivate: true,
    warning: "Contains local private/debug witness material. Do not treat this file as public calldata or event data.",
    treeDepth: MOCK_AUTHORITY_TREE_DEPTH,
    scope: { ...scope, scopeHash: dec(scopeHash), policyScopeHash: dec(policyScopeHash), regScope: dec(scopeHash) },
    roots: rootBundle.roots,
    registration: { root: dec(registration.rootRegAct), entries: registration.entries.map((entry) => ({ userID: entry.userID, owner: dec(entry.owner), regScope: dec(entry.regScope), regSalt: dec(entry.regSalt), leaf: dec(entry.leaf), index: entry.index, witness: serializeMerkleWitness(entry.witness) })) },
    status: { root: dec(status.rootStatusAct), entries: status.entries.map((entry) => ({ userID: entry.userID, owner: dec(entry.owner), statusActive: dec(entry.statusActive), e: dec(entry.e), statusSalt: dec(entry.statusSalt), leaf: dec(entry.leaf), index: entry.index, witness: serializeMerkleWitness(entry.witness) })) },
    policy: { root: dec(policy.rootPolAct), entries: policy.entries.map((entry) => ({ policyName: entry.policyName, e: dec(entry.e), policyID: dec(entry.policyID), gatewayID: dec(entry.gatewayID), policyVersion: dec(entry.policyVersion), limit: dec(entry.limit), threshold: dec(entry.threshold), clauseType: dec(entry.clauseType), policyScopeHash: dec(entry.policyScopeHash), policyParamsHash: dec(entry.policyParamsHash), leaf: dec(entry.leaf), index: entry.index, witness: serializeMerkleWitness(entry.witness) })) },
  };
  writeJson("fixtures/m2/root_bundle.json", rootBundle);
  writeJson("fixtures/m2/witness_user_001.json", witnessUser001);
  writeJson("fixtures/m2/mock_authority_bundle.json", mockAuthorityBundle);
  writeFileSync("docs/M2_MOCK_AUTHORITY_TREES_REPORT.md", reportMarkdown(rootBundle.roots, "pass", "pending", "pending", "pending", "pending", "pending"));
  console.log("M2 mock authority fixtures generated.");
  console.log(`rootRegAct: ${rootBundle.roots.rootRegAct}`);
  console.log(`rootStatusAct: ${rootBundle.roots.rootStatusAct}`);
  console.log(`rootPolAct: ${rootBundle.roots.rootPolAct}`);
}

export function reportMarkdown(roots: { rootRegAct: string; rootStatusAct: string; rootPolAct: string }, build: string, check: string, test: string, reg: string, status: string, policy: string): string {
  return `# M2 Mock Authority Trees Report\n\n## Status\n\n- build_mock_authority_trees: ${build}\n- check_mock_authority_trees: ${check}\n- hardhat test m2: ${test}\n\n## Tree parameters\n\n- tree depth: ${MOCK_AUTHORITY_TREE_DEPTH}\n- node hash: M1-R2 Poseidon2 Merkle node hash, \`hashMerkleNode(left, right)\`\n- zero schedule: \`zero[0] = 0\`, \`zero[i+1] = Poseidon(zero[i], zero[i])\`\n- leaf index convention: deterministic fixed indices\n\n## Roots\n\n- rootRegAct: ${roots.rootRegAct}\n- rootStatusAct: ${roots.rootStatusAct}\n- rootPolAct: ${roots.rootPolAct}\n\n## Witness status\n\n- user_001 registration witness: ${reg}\n- user_001 status witness: ${status}\n- demo policy witness: ${policy}\n- tampered negative tests: covered by hardhat test m2\n\n## Known warnings\n\n- M2 mock_authority_bundle.json contains local private/debug witness material and must not be treated as public calldata or event data.\n`;
}

async function main(): Promise<void> { await buildMockAuthorityTrees(); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
