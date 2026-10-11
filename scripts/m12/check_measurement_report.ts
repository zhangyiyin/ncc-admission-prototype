import fs from "fs";
import { spawnSync } from "child_process";

function readJson(path: string): any {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function assertOk(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function exists(path: string): boolean {
  return fs.existsSync(path);
}

function replaceLine(path: string, from: string, to: string) {
  if (!fs.existsSync(path)) return;
  const oldText = fs.readFileSync(path, "utf8");
  const newText = oldText.replace(from, to);
  if (newText !== oldText) fs.writeFileSync(path, newText, "utf8");
}

function asNumber(v: any): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return Number.NaN;
}

function assertNoForbiddenDirtyStatus() {
  const forbiddenPrefixes = [
    "circuits/",
    "contracts/admission/",
    "contracts/verifiers/",
    "contracts/anchoring/",
    "entities/common/crypto/",
  ];

  const statusText = spawnSync("git", ["status", "--short"], { encoding: "utf8" }).stdout;
  const status = statusText.split(/\\r?\\n/).filter(Boolean);

  for (const line of status) {
    const filePath = line.slice(3);
    for (const prefix of forbiddenPrefixes) {
      assertOk(!filePath.startsWith(prefix), `forbidden modified protocol-critical path for M12/A8: ${line}`);
    }
  }
}

function main() {
  const required = [
    "fixtures/m12/circuit_metrics.json",
    "fixtures/m12/proof_timing.json",
    "fixtures/m12/contract_gas.json",
    "fixtures/m12/gateway_timing.json",
    "fixtures/m12/evaluation_summary.json",
    "fixtures/m12/evaluation_tables.md",
    "docs/M12_MEASUREMENT_SPEC.md",
    "docs/M12_MEASUREMENT_REPORT.md",
  ];

  for (const path of required) assertOk(exists(path), `missing required M12 output: ${path}`);

  const proofTiming = readJson("fixtures/m12/proof_timing.json");
  const contractGas = readJson("fixtures/m12/contract_gas.json");
  const gatewayTiming = readJson("fixtures/m12/gateway_timing.json");
  const summary = readJson("fixtures/m12/evaluation_summary.json");
  const tables = fs.readFileSync("fixtures/m12/evaluation_tables.md", "utf8");

  assertOk(asNumber(summary.circuitMetrics?.initTotalConstraints) === 19803,
    `expected init total constraints 19803, got ${summary.circuitMetrics?.initTotalConstraints}`);
  assertOk(asNumber(summary.circuitMetrics?.updateTotalConstraints) === 31777,
    `expected update total constraints 31777, got ${summary.circuitMetrics?.updateTotalConstraints}`);
  assertOk(asNumber(summary.circuitMetrics?.initPublicInputs) === 6,
    `expected init public inputs 6, got ${summary.circuitMetrics?.initPublicInputs}`);
  assertOk(asNumber(summary.circuitMetrics?.updatePublicInputs) === 10,
    `expected update public inputs 10, got ${summary.circuitMetrics?.updatePublicInputs}`);
  assertOk(asNumber(summary.circuitMetrics?.updateTotalConstraints) > asNumber(summary.circuitMetrics?.initTotalConstraints),
    "expected update total constraints > init total constraints");

  const proofs = proofTiming.proofs ?? proofTiming;
  assertOk(!!proofs.init, "missing init proof timing");
  assertOk(!!(proofs.update_step1 ?? proofs.updateStep1), "missing update step1 proof timing");
  assertOk(!!(proofs.update_step2 ?? proofs.updateStep2), "missing update step2 proof timing");

  assertOk(!!contractGas.transactions?.initializeState, "missing initializeState gas");
  assertOk(!!contractGas.transactions?.updateStateStep1, "missing updateState step1 gas");
  assertOk(!!contractGas.transactions?.updateStateStep2, "missing updateState step2 gas");
  assertOk(!!contractGas.verifierEstimates?.init, "missing init verifyProof gas estimate");
  assertOk(!!contractGas.verifierEstimates?.updateStep1, "missing update step1 verifyProof gas estimate");
  assertOk(!!contractGas.verifierEstimates?.updateStep2, "missing update step2 verifyProof gas estimate");

  assertOk(!!gatewayTiming.step1, "missing gateway timing step1");
  assertOk(!!gatewayTiming.step2, "missing gateway timing step2");
  assertOk(gatewayTiming.step1.accepted === true, "expected gateway step1 accepted true");
  assertOk(gatewayTiming.step2.accepted === true, "expected gateway step2 accepted true");
  const negativeCaseCount = asNumber(gatewayTiming.negative?.caseCount);
  assertOk(negativeCaseCount === 8 || negativeCaseCount === 11,
    `expected 8 baseline or 11 A8 negative gateway cases, got ${gatewayTiming.negative?.caseCount}`);

  for (const token of ["Init", "Step1", "Step2", "Step3"]) {
    assertOk(tables.includes(token), `evaluation table missing ${token}`);
  }

  assertOk(summary.status === "pass", "expected evaluation summary status pass");
  assertOk(summary.fullDemo?.step3RejectionLayer === "circuit", "expected M11 step3 rejection layer circuit");

  assertNoForbiddenDirtyStatus();

  replaceLine("docs/M12_MEASUREMENT_REPORT.md", "- check_measurement_report: pending", "- check_measurement_report: pass");

  console.log("check_measurement_report: pass");
}

main();
