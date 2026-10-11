import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function readJson<T = any>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function patchReportStatus(): void {
  const reportPath = path.join(ROOT, "docs", "M11_FULL_LOCAL_DEMO_REPORT.md");
  if (!fs.existsSync(reportPath)) {
    return;
  }
  let report = fs.readFileSync(reportPath, "utf8");
  report = report.replace(/- check_full_local_demo: .*/g, "- check_full_local_demo: pass");
  fs.writeFileSync(reportPath, report);
}

function hasOwn(obj: any, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function walkKeys(value: any, visitor: (key: string, path: string) => void, currentPath = "$", parentKey = ""): void {
  if (Array.isArray(value)) {
    value.forEach((x, i) => walkKeys(x, visitor, `${currentPath}[${i}]`, parentKey));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      visitor(key, `${currentPath}.${key}`);
      walkKeys(child, visitor, `${currentPath}.${key}`, key);
    }
  }
}

const transcriptPath = path.join(ROOT, "fixtures", "m11", "demo_transcript.json");
assert(fs.existsSync(transcriptPath), "fixtures/m11/demo_transcript.json does not exist");
assert(fs.existsSync(path.join(ROOT, "fixtures", "m11", "demo_summary.json")), "fixtures/m11/demo_summary.json does not exist");
assert(fs.existsSync(path.join(ROOT, "fixtures", "m11", "step3_reject_report.json")), "fixtures/m11/step3_reject_report.json does not exist");

const transcript = readJson("fixtures/m11/demo_transcript.json");
const summary = readJson("fixtures/m11/demo_summary.json");
const expected = readJson("fixtures/m9/expected_admission_state.json");

const steps: any[] = transcript.steps || [];
const byLabel = (label: string) => steps.find((x) => x.label === label);

const init = byLabel("init");
const step1 = byLabel("step1");
const step2 = byLabel("step2");
const step3 = byLabel("step3");

assert(init && init.accepted === true, "init accepted must be true");
assert(step1 && step1.acceptedByAdmission === true, "step1 acceptedByAdmission must be true");
assert(step1.acceptedByGateway === true, "step1 acceptedByGateway must be true");
assert(step2 && step2.acceptedByAdmission === true, "step2 acceptedByAdmission must be true");
assert(step2.acceptedByGateway === true, "step2 acceptedByGateway must be true");
assert(step3 && step3.acceptedByAdmission === false, "step3 acceptedByAdmission must be false");
assert(step3.acceptedByGateway === false, "step3 acceptedByGateway must be false");
assert(step3.rejectionLayer === "circuit", "step3 rejectionLayer must be circuit");
assert(step3.privateDemoFacts?.usedAmountNew === "54000", "step3 usedAmountNew must be 54000");
assert(step3.privateDemoFacts?.limit === "50000", "step3 limit must be 50000");
assert(step3.proofGenerated === false, "step3 proofGenerated must be false");
assert(step3.onChainUpdateAttempted === false, "step3 onChainUpdateAttempted must be false");
assert(step3.gatewayExecuted === false, "step3 gatewayExecuted must be false");

assert(init.newStateRoot === expected.stateRoots.afterInit, "init root must equal M3/M9 expected after C_gen");
assert(step1.publicRecord?.newStateRoot === expected.stateRoots.afterUpdateStep1, "step1 root must equal expected after C_after_18000");
assert(step2.publicRecord?.newStateRoot === expected.stateRoots.afterUpdateStep2, "step2 root must equal expected after C_after_36000");
assert(summary.stateRoots?.finalAcceptedStateRoot === expected.stateRoots.afterUpdateStep2, "final accepted state root must equal M3 root after C_after_36000");

const allowedPublicRecordFields = new Set([
  "rho",
  "N_old",
  "C_new",
  "rtState",
  "newStateRoot",
  "stateIndex",
  "actionHash",
  "amountCom",
  "clauseCom",
]);

for (const s of [step1, step2]) {
  assert(s.publicRecord && typeof s.publicRecord === "object", `${s.label} publicRecord missing`);
  for (const key of Object.keys(s.publicRecord)) {
    assert(allowedPublicRecordFields.has(key), `${s.label}.publicRecord contains forbidden or unexpected field: ${key}`);
  }
}

const forbiddenExactKeys = new Set([
  "sk_u",
  "sku",
  "owner",
  "owner_u",
  "regLeaf",
  "statusLeaf",
  "C_old",
  "rAmt",
  "rNew",
  "rOld",
  "rGen",
  "rClause",
  "regSiblings",
  "statusSiblings",
  "policySiblings",
  "stateSiblings",
  "regPathIndices",
  "statusPathIndices",
  "policyPathIndices",
  "statePathIndices",
  "MerklePath",
  "merklePath",
  "path_state",
  "linkableID",
  "nym",
  "userLevelAggregationTag",
]);

walkKeys(transcript, (key, keyPath) => {
  if (forbiddenExactKeys.has(key)) {
    throw new Error(`transcript exposes forbidden private witness or link handle key: ${keyPath}`);
  }
  const lower = key.toLowerCase();
  assert(!lower.includes("sibling"), `transcript exposes Merkle sibling-like key: ${keyPath}`);
  assert(!lower.includes("pathindices"), `transcript exposes Merkle path indices key: ${keyPath}`);
  assert(!lower.includes("merk"), `transcript exposes Merkle-like key: ${keyPath}`);
});

assert(step1.hiddenStateTransition === "0 -> 18000", "step1 transition label mismatch");
assert(step2.hiddenStateTransition === "18000 -> 36000", "step2 transition label mismatch");
assert(step3.hiddenStateTransition === "36000 -> 54000", "step3 transition label mismatch");

const initEvents = steps.filter((x) => x.type === "init" || x.label === "init");
const acceptedUpdates = steps.filter((x) => x.type === "update" && x.acceptedByAdmission === true);
const rejectedUpdates = steps.filter((x) => x.type === "update" && x.acceptedByAdmission === false);

assert(initEvents.length === 1, "transcript must contain exactly one init event");
assert(acceptedUpdates.length === 2, "transcript must contain exactly two accepted update events");
assert(rejectedUpdates.length === 1, "transcript must contain exactly one rejected update event");

assert(transcript.privacyBoundary?.publicChainDoesNotExpose?.includes("amount"), "privacy boundary must say amount is not public");
assert(transcript.privacyBoundary?.publicChainDoesNotExpose?.includes("usedAmount"), "privacy boundary must say usedAmount is not public");
assert(transcript.privacyBoundary?.publicChainDoesNotExpose?.includes("clauseStatus"), "privacy boundary must say clauseStatus is not public");
assert(transcript.privacyBoundary?.publicChainDoesNotExpose?.includes("user-level link tag"), "privacy boundary must say user-level link tag is not public");

patchReportStatus();
console.log("check_full_local_demo: pass");
