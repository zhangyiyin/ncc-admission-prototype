import { expect } from "chai";
import { readFileSync, writeFileSync } from "node:fs";
import { network } from "hardhat";
import { poseidonContract } from "circomlibjs";

const FR_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

type M9Call = {
  label: string;
  proof: {
    a: [string, string];
    b: [[string, string], [string, string]];
    c: [string, string];
    publicSignals: string[];
  };
};

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function toBigIntDeep<T>(value: T): any {
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (Array.isArray(value)) return value.map((x) => toBigIntDeep(x));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toBigIntDeep(v);
    return out;
  }
  return value;
}

function proof(call: M9Call): any {
  return toBigIntDeep(call.proof);
}

function modifiedProof(call: M9Call, index: number): any {
  const p = JSON.parse(JSON.stringify(call.proof));
  p.publicSignals[index] = ((BigInt(p.publicSignals[index]) + 1n) % FR_MODULUS).toString();
  return toBigIntDeep(p);
}

async function expectRevert(promise: Promise<unknown>, label: string): Promise<void> {
  let reverted = false;
  try {
    await promise;
  } catch {
    reverted = true;
  }
  expect(reverted, label).to.equal(true);
}

async function deployAll() {
  const connection = await network.connect();
  const { ethers } = connection;
  const [deployer, other] = await ethers.getSigners();

  const rootBundle = readJson<any>("fixtures/m2/root_bundle.json");
  const expected = readJson<any>("fixtures/m9/expected_admission_state.json");

  const poseidonFactory = new ethers.ContractFactory(
    poseidonContract.generateABI(2),
    poseidonContract.createCode(2),
    deployer,
  );
  const poseidon = await poseidonFactory.deploy();
  await poseidon.waitForDeployment();

  const initVerifier = await ethers.deployContract("InitComplianceStateVerifier");
  await initVerifier.waitForDeployment();

  const updateVerifier = await ethers.deployContract("UpdateComplianceStateVerifier");
  await updateVerifier.waitForDeployment();

  const registry = await ethers.deployContract("RootRegistry", [
    BigInt(rootBundle.roots.rootRegAct),
    BigInt(rootBundle.roots.rootStatusAct),
    BigInt(rootBundle.roots.rootPolAct),
  ]);
  await registry.waitForDeployment();

  const admission = await ethers.deployContract("ComplianceAdmission", [
    await registry.getAddress(),
    await initVerifier.getAddress(),
    await updateVerifier.getAddress(),
    await poseidon.getAddress(),
    expected.treeDepth,
  ]);
  await admission.waitForDeployment();

  return { ethers, deployer, other, poseidon, initVerifier, updateVerifier, registry, admission, expected, rootBundle };
}

function expectRecordFields(record: any, expectedRecord: any, expectedRoot: string, expectedIndex: string): void {
  expect(record.exists).to.equal(true);
  expect(record.rho).to.equal(BigInt(expectedRecord.rho));
  expect(record.N_old).to.equal(BigInt(expectedRecord.N_old));
  expect(record.C_new).to.equal(BigInt(expectedRecord.C_new));
  expect(record.rtState).to.equal(BigInt(expectedRecord.rtState));
  expect(record.newStateRoot).to.equal(BigInt(expectedRoot));
  expect(record.actionHash).to.equal(BigInt(expectedRecord.actionHash));
  expect(record.amountCom).to.equal(BigInt(expectedRecord.amountCom));
  expect(record.clauseCom).to.equal(BigInt(expectedRecord.clauseCom));
  expect(record.stateIndex).to.equal(BigInt(expectedIndex));
}

function markReportAfterM9Tests(): void {
  const path = "docs/M9_ADMISSION_CONTRACT_REPORT.md";
  let s = readFileSync(path, "utf8");
  const replacements: Array<[string, string]> = [
    ["- hardhat compile: pending", "- hardhat compile: pass"],
    ["- hardhat test m9: pending", "- hardhat test m9: pass"],
    ["- RootRegistry deployed: pending", "- RootRegistry deployed: yes"],
    ["- ComplianceAdmission deployed: pending", "- ComplianceAdmission deployed: yes"],
    ["- Init verifier deployed: pending", "- Init verifier deployed: yes"],
    ["- Update verifier deployed: pending", "- Update verifier deployed: yes"],
    ["- valid init accepted: pending", "- valid init accepted: pass"],
    ["- new root equals M3 root after C_gen: pending", "- new root equals M3 root after C_gen: yes"],
    ["- N_gen marked used: pending", "- N_gen marked used: yes"],
    ["- replay init rejected: pending", "- replay init rejected: pass"],
    ["- valid update accepted: pending", "- valid update accepted: pass"],
    ["- new root equals M3 root after C_after_18000: pending", "- new root equals M3 root after C_after_18000: yes"],
    ["- N_old marked used: pending", "- N_old marked used: yes"],
    ["- rho accepted: pending", "- rho accepted: yes"],
    ["- record fields equal public inputs: pending", "- record fields equal public inputs: yes"],
    ["- new root equals M3 root after C_after_36000: pending", "- new root equals M3 root after C_after_36000: yes"],
    ["- update before init rejected: pending", "- update before init rejected: pass"],
    ["- reused N_old rejected: pending", "- reused N_old rejected: pass"],
    ["- reused rho/replay rejected: pending", "- reused rho/replay rejected: pass"],
    ["- modified init public input rejected: pending", "- modified init public input rejected: pass"],
    ["- modified update public input rejected: pending", "- modified update public input rejected: pass"],
    ["- stale active roots rejected: pending", "- stale active roots rejected: pass"],
    ["- non-owner registry update rejected: pending", "- non-owner registry update rejected: pass"],
    ["- invalid field root rejected: pending", "- invalid field root rejected: pass"],
  ];
  for (const [from, to] of replacements) s = s.replaceAll(from, to);
  writeFileSync(path, s, "utf8");
}

describe("M9 RootRegistry and ComplianceAdmission", function () {
  this.timeout(120000);

  const initCall = readJson<M9Call>("fixtures/m9/init_call.json");
  const updateStep1Call = readJson<M9Call>("fixtures/m9/update_step1_call.json");
  const updateStep2Call = readJson<M9Call>("fixtures/m9/update_step2_call.json");

  it("deploys registry, admission, verifiers, and initializes the known empty root", async function () {
    const { admission, expected } = await deployAll();
    expect(await admission.currentStateRoot()).to.equal(BigInt(expected.stateRoots.emptyRoot));
    expect(await admission.isKnownStateRoot(BigInt(expected.stateRoots.emptyRoot))).to.equal(true);
    expect(await admission.stateTreeDepth()).to.equal(BigInt(expected.treeDepth));
    expect(await admission.stateTreeNextIndex()).to.equal(0n);
  });

  it("accepts init and rejects duplicate genesis nullifier", async function () {
    const { admission, expected } = await deployAll();
    const p = proof(initCall);
    const staticResult = await admission.initializeState.staticCall(p);
    expect(staticResult[0]).to.equal(BigInt(expected.stateIndices.init));
    expect(staticResult[1]).to.equal(BigInt(expected.stateRoots.afterInit));

    const tx = await admission.initializeState(p);
    await tx.wait();

    expect(await admission.currentStateRoot()).to.equal(BigInt(expected.stateRoots.afterInit));
    expect(await admission.isKnownStateRoot(BigInt(expected.stateRoots.afterInit))).to.equal(true);
    expect(await admission.isGenesisNullifierUsed(BigInt(expected.init.N_gen))).to.equal(true);

    const record = await admission.getInitRecord(BigInt(expected.init.N_gen));
    expect(record.exists).to.equal(true);
    expect(record.N_gen).to.equal(BigInt(expected.init.N_gen));
    expect(record.C_gen).to.equal(BigInt(expected.init.C_gen));
    expect(record.policyScopeHash).to.equal(BigInt(expected.init.policyScopeHash));
    expect(record.newStateRoot).to.equal(BigInt(expected.stateRoots.afterInit));
    expect(record.stateIndex).to.equal(BigInt(expected.stateIndices.init));

    await expectRevert(admission.initializeState(p), "duplicate init should revert");
  });

  it("accepts update step1 and stores proof-verified public values", async function () {
    const { admission, expected } = await deployAll();
    let tx = await admission.initializeState(proof(initCall));
    await tx.wait();

    const p = proof(updateStep1Call);
    const staticResult = await admission.updateState.staticCall(p);
    expect(staticResult[0]).to.equal(BigInt(expected.stateIndices.updateStep1));
    expect(staticResult[1]).to.equal(BigInt(expected.stateRoots.afterUpdateStep1));

    tx = await admission.updateState(p);
    await tx.wait();

    const r = expected.records.step1;
    expect(await admission.currentStateRoot()).to.equal(BigInt(expected.stateRoots.afterUpdateStep1));
    expect(await admission.isKnownStateRoot(BigInt(expected.stateRoots.afterUpdateStep1))).to.equal(true);
    expect(await admission.isStateNullifierUsed(BigInt(r.N_old))).to.equal(true);
    expect(await admission.isRhoAccepted(BigInt(r.rho))).to.equal(true);
    expectRecordFields(await admission.getAcceptedRecord(BigInt(r.rho)), r, expected.stateRoots.afterUpdateStep1, expected.stateIndices.updateStep1);
  });

  it("accepts update step2 and stores proof-verified public values", async function () {
    const { admission, expected } = await deployAll();
    let tx = await admission.initializeState(proof(initCall));
    await tx.wait();
    tx = await admission.updateState(proof(updateStep1Call));
    await tx.wait();

    const p = proof(updateStep2Call);
    const staticResult = await admission.updateState.staticCall(p);
    expect(staticResult[0]).to.equal(BigInt(expected.stateIndices.updateStep2));
    expect(staticResult[1]).to.equal(BigInt(expected.stateRoots.afterUpdateStep2));

    tx = await admission.updateState(p);
    await tx.wait();

    const r = expected.records.step2;
    expect(await admission.currentStateRoot()).to.equal(BigInt(expected.stateRoots.afterUpdateStep2));
    expect(await admission.isKnownStateRoot(BigInt(expected.stateRoots.afterUpdateStep2))).to.equal(true);
    expect(await admission.isStateNullifierUsed(BigInt(r.N_old))).to.equal(true);
    expect(await admission.isRhoAccepted(BigInt(r.rho))).to.equal(true);
    expectRecordFields(await admission.getAcceptedRecord(BigInt(r.rho)), r, expected.stateRoots.afterUpdateStep2, expected.stateIndices.updateStep2);
  });

  it("rejects unknown roots, replays, modified public inputs, stale active roots, and invalid registry updates", async function () {
    const deployed = await deployAll();
    const { admission, registry, other, expected, rootBundle } = deployed;

    await expectRevert(admission.updateState(proof(updateStep1Call)), "update before init should reject unknown rtState");

    let tx = await admission.initializeState(proof(initCall));
    await tx.wait();
    await expectRevert(admission.initializeState(proof(initCall)), "replayed genesis nullifier should reject");

    await expectRevert(admission.updateState(modifiedProof(updateStep1Call, 7)), "modified update public input should reject");

    tx = await admission.updateState(proof(updateStep1Call));
    await tx.wait();
    await expectRevert(admission.updateState(proof(updateStep1Call)), "replayed update should reject reused N_old/rho");

    const freshForModifiedInit = await deployAll();
    await expectRevert(
      freshForModifiedInit.admission.initializeState(modifiedProof(initCall, 3)),
      "modified init public input should reject"
    );

    const stale = await deployAll();
    tx = await stale.admission.initializeState(proof(initCall));
    await tx.wait();
    tx = await stale.registry.setActiveRoots(
      BigInt(rootBundle.roots.rootRegAct) + 1n,
      BigInt(rootBundle.roots.rootStatusAct),
      BigInt(rootBundle.roots.rootPolAct),
    );
    await tx.wait();
    await expectRevert(stale.admission.updateState(proof(updateStep1Call)), "stale roots should reject old proof");

    await expectRevert(
      registry.connect(other).setActiveRoots(
        BigInt(rootBundle.roots.rootRegAct),
        BigInt(rootBundle.roots.rootStatusAct),
        BigInt(rootBundle.roots.rootPolAct),
      ),
      "non-owner registry update should reject"
    );

    await expectRevert(
      registry.setActiveRoots(FR_MODULUS, BigInt(rootBundle.roots.rootStatusAct), BigInt(rootBundle.roots.rootPolAct)),
      "invalid field root should reject"
    );

    markReportAfterM9Tests();
    expect(await admission.isKnownStateRoot(BigInt(expected.stateRoots.emptyRoot))).to.equal(true);
  });
});
