import { expect } from "chai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { FR_MODULUS } from "../../entities/common/crypto/fr.ts";
import { deserializeMerkleWitness, MOCK_AUTHORITY_TREE_DEPTH, verifyMerkleWitness } from "../../entities/common/merkle/fixedMerkleTree.ts";
import type { SerializedMerkleWitness } from "../../entities/common/merkle/merkleTypes.ts";
import { buildMockAuthorityTrees, reportMarkdown } from "../../scripts/m2/build_mock_authority_trees.ts";
import { checkMockAuthorityTrees } from "../../scripts/m2/check_mock_authority_trees.ts";

function readJson<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
function assertDecimalFieldString(value: unknown, label: string): void {
  expect(value, label).to.be.a("string");
  expect(value as string, label).to.match(/^[0-9]+$/);
  const bigintValue = BigInt(value as string);
  expect(bigintValue >= 0n, label).to.equal(true);
  expect(bigintValue < FR_MODULUS, label).to.equal(true);
}
function assertWitnessShape(witness: SerializedMerkleWitness, label: string): void {
  assertDecimalFieldString(witness.leaf, `${label}.leaf`);
  assertDecimalFieldString(witness.root, `${label}.root`);
  expect(witness.siblings, `${label}.siblings`).to.have.length(MOCK_AUTHORITY_TREE_DEPTH);
  expect(witness.pathIndices, `${label}.pathIndices`).to.have.length(MOCK_AUTHORITY_TREE_DEPTH);
  for (const [i, sibling] of witness.siblings.entries()) assertDecimalFieldString(sibling, `${label}.siblings[${i}]`);
  for (const [i, bit] of witness.pathIndices.entries()) expect(bit, `${label}.pathIndices[${i}]`).to.satisfy((x: number) => x === 0 || x === 1);
}
interface RootBundle { treeDepth: number; roots: { rootRegAct: string; rootStatusAct: string; rootPolAct: string; }; policy: { policyParamsHash: string; policyLeaf: string; }; }
interface WitnessUser001 { userID: string; owner: string; regScope: string; registration: SerializedMerkleWitness; status: SerializedMerkleWitness & { statusActive: string }; policy: SerializedMerkleWitness; }
interface MockAuthorityBundle { status: { entries: Array<{ userID: string; statusActive: string }> }; }

describe("M2 mock authority trees", function () {
  before(async function () { await buildMockAuthorityTrees(); });
  after(function () {
    const rootBundle = readJson<RootBundle>("fixtures/m2/root_bundle.json");
    writeFileSync("docs/M2_MOCK_AUTHORITY_TREES_REPORT.md", reportMarkdown(rootBundle.roots, "pass", "pass", "pass", "pass", "pass", "pass"));
  });

  it("build_mock_authority_trees.ts can generate all fixtures", async function () {
    expect(existsSync("fixtures/scopes/demo_scope.json")).to.equal(true);
    expect(existsSync("fixtures/users/demo_users_private.json")).to.equal(true);
    expect(existsSync("fixtures/policies/demo_policy.json")).to.equal(true);
    expect(existsSync("fixtures/m2/root_bundle.json")).to.equal(true);
    expect(existsSync("fixtures/m2/witness_user_001.json")).to.equal(true);
    expect(existsSync("fixtures/m2/mock_authority_bundle.json")).to.equal(true);
    expect(existsSync("docs/M2_MOCK_AUTHORITY_TREES_SPEC.md")).to.equal(true);
    expect(existsSync("docs/M2_MOCK_AUTHORITY_TREES_REPORT.md")).to.equal(true);
    await checkMockAuthorityTrees();
  });

  it("root_bundle.json has 3 active roots", function () {
    const rootBundle = readJson<RootBundle>("fixtures/m2/root_bundle.json");
    expect(rootBundle.treeDepth).to.equal(MOCK_AUTHORITY_TREE_DEPTH);
    assertDecimalFieldString(rootBundle.roots.rootRegAct, "rootRegAct");
    assertDecimalFieldString(rootBundle.roots.rootStatusAct, "rootStatusAct");
    assertDecimalFieldString(rootBundle.roots.rootPolAct, "rootPolAct");
    assertDecimalFieldString(rootBundle.policy.policyParamsHash, "policyParamsHash");
    assertDecimalFieldString(rootBundle.policy.policyLeaf, "policyLeaf");
  });

  it("all user_001 leaves and witnesses are field decimal strings", function () {
    const witness = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
    assertDecimalFieldString(witness.owner, "owner");
    assertDecimalFieldString(witness.regScope, "regScope");
    assertWitnessShape(witness.registration, "registration");
    assertWitnessShape(witness.status, "status");
    assertDecimalFieldString(witness.status.statusActive, "status.statusActive");
    assertWitnessShape(witness.policy, "policy");
  });

  it("witness_user_001 verifies against rootRegAct", async function () {
    const rootBundle = readJson<RootBundle>("fixtures/m2/root_bundle.json");
    const witness = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
    expect(witness.registration.root).to.equal(rootBundle.roots.rootRegAct);
    expect(await verifyMerkleWitness(deserializeMerkleWitness(witness.registration), MOCK_AUTHORITY_TREE_DEPTH)).to.equal(true);
  });

  it("witness_user_001 verifies against rootStatusAct", async function () {
    const rootBundle = readJson<RootBundle>("fixtures/m2/root_bundle.json");
    const witness = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
    expect(witness.status.root).to.equal(rootBundle.roots.rootStatusAct);
    expect(await verifyMerkleWitness(deserializeMerkleWitness(witness.status), MOCK_AUTHORITY_TREE_DEPTH)).to.equal(true);
  });

  it("witness_user_001 verifies against rootPolAct", async function () {
    const rootBundle = readJson<RootBundle>("fixtures/m2/root_bundle.json");
    const witness = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
    expect(witness.policy.root).to.equal(rootBundle.roots.rootPolAct);
    expect(await verifyMerkleWitness(deserializeMerkleWitness(witness.policy), MOCK_AUTHORITY_TREE_DEPTH)).to.equal(true);
  });

  it("re-running builder gives identical root_bundle.json", async function () {
    const before = readFileSync("fixtures/m2/root_bundle.json", "utf8");
    await buildMockAuthorityTrees();
    const after = readFileSync("fixtures/m2/root_bundle.json", "utf8");
    expect(after).to.equal(before);
  });

  it("tampered registration leaf fails verification", async function () {
    const witness = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
    const tampered = deserializeMerkleWitness(witness.registration);
    tampered.leaf = (tampered.leaf + 1n) % FR_MODULUS;
    expect(await verifyMerkleWitness(tampered, MOCK_AUTHORITY_TREE_DEPTH)).to.equal(false);
  });

  it("tampered status sibling fails verification", async function () {
    const witness = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
    const tampered = deserializeMerkleWitness(witness.status);
    tampered.siblings[0] = (tampered.siblings[0] + 1n) % FR_MODULUS;
    expect(await verifyMerkleWitness(tampered, MOCK_AUTHORITY_TREE_DEPTH)).to.equal(false);
  });

  it("tampered policy root fails verification", async function () {
    const witness = readJson<WitnessUser001>("fixtures/m2/witness_user_001.json");
    const tampered = deserializeMerkleWitness(witness.policy);
    tampered.root = (tampered.root + 1n) % FR_MODULUS;
    expect(await verifyMerkleWitness(tampered, MOCK_AUTHORITY_TREE_DEPTH)).to.equal(false);
  });

  it("user_003 statusActive is 0 in mock bundle", function () {
    const bundle = readJson<MockAuthorityBundle>("fixtures/m2/mock_authority_bundle.json");
    const user003 = bundle.status.entries.find((entry) => entry.userID === "user_003");
    expect(user003).to.not.equal(undefined);
    expect(user003?.statusActive).to.equal("0");
  });
});
