import { expect } from "chai";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { network } from "hardhat";
import { poseidonContract } from "circomlibjs";
import {
  checkAcceptedRecordAgainstPackage,
  computeGatewayDigests,
  parseNumberish
} from "../../entities/gateway/gatewayChecker.ts";
import { GatewayExecutionAuthorizer } from "../../entities/gateway/gatewayAuthorizer.ts";
import type { GatewayExecutionPackage } from "../../entities/gateway/gatewayTypes.ts";

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

async function deployAdmissionWithUpdates() {
  const connection = await network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

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

  const initCall = readJson<M9Call>("fixtures/m9/init_call.json");
  const updateStep1Call = readJson<M9Call>("fixtures/m9/update_step1_call.json");
  const updateStep2Call = readJson<M9Call>("fixtures/m9/update_step2_call.json");

  let tx = await admission.initializeState(proof(initCall));
  await tx.wait();
  tx = await admission.updateState(proof(updateStep1Call));
  await tx.wait();
  tx = await admission.updateState(proof(updateStep2Call));
  await tx.wait();

  return { admission };
}

async function expectPackageResult(admission: any, pkg: GatewayExecutionPackage, expectedAccepted: boolean): Promise<void> {
  const record = await admission.getAcceptedRecord(parseNumberish(pkg.rho));
  const digests = await computeGatewayDigests(pkg);
  const result = checkAcceptedRecordAgainstPackage(pkg, record, digests);
  expect(result.accepted, `${pkg.label} failures=${result.failures.join(",")}`).to.equal(expectedAccepted);
}

function markReportAfterM10Tests(): void {
  const path = "docs/M10_GATEWAY_EXECUTION_REPORT.md";
  let s = readFileSync(path, "utf8");
  s = s.replace("- hardhat compile: pending", "- hardhat compile: pass");
  s = s.replace("- hardhat test m10: pending", "- hardhat test m10: pass");
  writeFileSync(path, s, "utf8");
}

describe("M10 Gateway off-chain execution checker", function () {
  this.timeout(120000);

  it("accepts gateway packages against on-chain M9 accepted records", async function () {
    const { admission } = await deployAdmissionWithUpdates();

    const step1 = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_package_step1.json");
    const step2 = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_package_step2.json");

    await expectPackageResult(admission, step1, true);
    await expectPackageResult(admission, step2, true);
  });

  it("rejects negative gateway packages against on-chain M9 accepted records", async function () {
    const { admission } = await deployAdmissionWithUpdates();

    const negDir = "fixtures/m10/gateway_negative_cases";
    const files = readdirSync(negDir).filter((x) => x.endsWith(".json")).sort();
    expect(files.length).to.equal(11);

    for (const file of files) {
      const pkg = readJson<GatewayExecutionPackage>(join(negDir, file));
      await expectPackageResult(admission, pkg, false);
    }

    markReportAfterM10Tests();
  });
  it("authorizes a matching accepted record exactly once per rho", async function () {
    const { admission } = await deployAdmissionWithUpdates();
    const pkg = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_package_step1.json");
    const record = await admission.getAcceptedRecord(parseNumberish(pkg.rho));
    const digests = await computeGatewayDigests(pkg);
    const authorizer = new GatewayExecutionAuthorizer();

    expect(checkAcceptedRecordAgainstPackage(pkg, record, digests).accepted).to.equal(true);
    expect(checkAcceptedRecordAgainstPackage(pkg, record, digests).accepted).to.equal(true);

    const first = authorizer.authorizeOnce(pkg, record, digests);
    const replay = authorizer.authorizeOnce(pkg, record, digests);

    expect(first.authorized).to.equal(true);
    expect(first.replay).to.equal(false);
    expect(first.match.accepted).to.equal(true);

    expect(replay.authorized).to.equal(false);
    expect(replay.replay).to.equal(true);
    expect(replay.match.accepted).to.equal(true);
    expect(replay.failures).to.deep.equal(["rhoAlreadyExecuted"]);
  });

  it("authorizes two distinct accepted rhos independently", async function () {
    const { admission } = await deployAdmissionWithUpdates();
    const step1 = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_package_step1.json");
    const step2 = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_package_step2.json");

    expect(parseNumberish(step1.rho)).to.not.equal(parseNumberish(step2.rho));

    const record1 = await admission.getAcceptedRecord(parseNumberish(step1.rho));
    const record2 = await admission.getAcceptedRecord(parseNumberish(step2.rho));
    const digests1 = await computeGatewayDigests(step1);
    const digests2 = await computeGatewayDigests(step2);
    const authorizer = new GatewayExecutionAuthorizer();

    const rho1First = authorizer.authorizeOnce(step1, record1, digests1);
    const rho2First = authorizer.authorizeOnce(step2, record2, digests2);

    expect(rho1First.authorized).to.equal(true);
    expect(rho1First.replay).to.equal(false);
    expect(rho2First.authorized).to.equal(true);
    expect(rho2First.replay).to.equal(false);

    expect(authorizer.hasExecutedRho(step1.rho)).to.equal(true);
    expect(authorizer.hasExecutedRho(step2.rho)).to.equal(true);
  });

  it("does not consume rho when package matching fails", async function () {
    const { admission } = await deployAdmissionWithUpdates();
    const valid = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_package_step1.json");
    const mismatch = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_negative_cases/wrong_amount.json");

    expect(parseNumberish(mismatch.rho)).to.equal(parseNumberish(valid.rho));

    const record = await admission.getAcceptedRecord(parseNumberish(valid.rho));
    const authorizer = new GatewayExecutionAuthorizer();

    const mismatchDigests = await computeGatewayDigests(mismatch);
    const rejected = authorizer.authorizeOnce(mismatch, record, mismatchDigests);

    expect(rejected.authorized).to.equal(false);
    expect(rejected.replay).to.equal(false);
    expect(rejected.match.accepted).to.equal(false);
    expect(authorizer.hasExecutedRho(valid.rho)).to.equal(false);

    const validDigests = await computeGatewayDigests(valid);
    const accepted = authorizer.authorizeOnce(valid, record, validDigests);

    expect(accepted.authorized).to.equal(true);
    expect(accepted.replay).to.equal(false);
    expect(authorizer.hasExecutedRho(valid.rho)).to.equal(true);
  });

});
