import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

function requirePath(path: string): void {
  if (!existsSync(join(ROOT, path))) {
    throw new Error(`missing required path: ${path}`);
  }
}

function assertArrayEq(actual: string[], expected: string[], label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: mismatch\nactual=${a}\nexpected=${e}`);
  }
}

function assertNoForbiddenRecompute(): void {
  const path = "contracts/admission/ComplianceAdmission.sol";
  const s = readFileSync(join(ROOT, path), "utf8");

  const forbidden = [
    "TAG_ACTION",
    "TAG_AMOUNT",
    "TAG_CLAUSE",
    "TAG_RHO",
    "hashAction",
    "HashAction",
    "hashAmount",
    "HashAmount",
    "hashClause",
    "HashClause",
    "hashRho",
    "HashRho",
    "actionContextHash",
    "HashMerkleNode",
    "hashMerkleNode",
    "Poseidon(",
    "poseidon("
  ];

  for (const needle of forbidden) {
    if (s.includes(needle)) {
      throw new Error(`${path}: forbidden recomputation marker found: ${needle}`);
    }
  }

  const requiredCopies = [
    "actionHash: publicSignals[UPD_ACTION_HASH]",
    "amountCom: publicSignals[UPD_AMOUNT_COM]",
    "clauseCom: publicSignals[UPD_CLAUSE_COM]",
    "rho: rho"
  ];

  for (const needle of requiredCopies) {
    if (!s.includes(needle)) {
      throw new Error(`${path}: expected proof-public-signal copy marker missing: ${needle}`);
    }
  }
}

function writeReportChecked(): void {
  const path = join(ROOT, "docs/M9_ADMISSION_CONTRACT_REPORT.md");
  let s = readFileSync(path, "utf8");
  s = s.replace("- check_admission_contract: pending", "- check_admission_contract: pass");
  s = s.replace("- Solidity does not recompute actionHash: pending", "- Solidity does not recompute actionHash: yes");
  s = s.replace("- Solidity does not recompute amountCom: pending", "- Solidity does not recompute amountCom: yes");
  s = s.replace("- Solidity does not recompute clauseCom: pending", "- Solidity does not recompute clauseCom: yes");
  s = s.replace("- Solidity does not recompute rho: pending", "- Solidity does not recompute rho: yes");
  s = s.replace("- accepted records copied from proof publicSignals: pending", "- accepted records copied from proof publicSignals: yes");
  writeFileSync(path, s, "utf8");
}

function main(): void {
  const required = [
    "contracts/interfaces/IInitComplianceStateVerifier.sol",
    "contracts/interfaces/IUpdateComplianceStateVerifier.sol",
    "contracts/interfaces/IRootRegistry.sol",
    "contracts/admission/RootRegistry.sol",
    "contracts/admission/ComplianceAdmission.sol",
    "fixtures/m9/init_call.json",
    "fixtures/m9/update_step1_call.json",
    "fixtures/m9/update_step2_call.json",
    "fixtures/m9/expected_admission_state.json",
    "run_artifacts/m8/proofs/init/public.json",
    "run_artifacts/m8/proofs/update_step1/public.json",
    "run_artifacts/m8/proofs/update_step2/public.json",
  ];
  for (const path of required) requirePath(path);

  const initCall = readJson<any>("fixtures/m9/init_call.json");
  const update1Call = readJson<any>("fixtures/m9/update_step1_call.json");
  const update2Call = readJson<any>("fixtures/m9/update_step2_call.json");
  const initPublic = readJson<string[]>("run_artifacts/m8/proofs/init/public.json");
  const update1Public = readJson<string[]>("run_artifacts/m8/proofs/update_step1/public.json");
  const update2Public = readJson<string[]>("run_artifacts/m8/proofs/update_step2/public.json");
  const stateTree = readJson<any>("fixtures/m3/state_tree_expected.json");
  const expectedAdmission = readJson<any>("fixtures/m9/expected_admission_state.json");

  if (initCall.proof.publicSignals.length !== 6) throw new Error("init public input length must be 6");
  if (update1Call.proof.publicSignals.length !== 10) throw new Error("update step1 public input length must be 10");
  if (update2Call.proof.publicSignals.length !== 10) throw new Error("update step2 public input length must be 10");

  assertArrayEq(initCall.proof.publicSignals, initPublic, "init call vs M8 public");
  assertArrayEq(update1Call.proof.publicSignals, update1Public, "update step1 call vs M8 public");
  assertArrayEq(update2Call.proof.publicSignals, update2Public, "update step2 call vs M8 public");

  if (expectedAdmission.stateRoots.emptyRoot !== stateTree.emptyRoot) throw new Error("empty root mismatch");
  if (expectedAdmission.stateRoots.afterInit !== stateTree.appendResults[0].newRoot) throw new Error("after init root mismatch");
  if (expectedAdmission.stateRoots.afterUpdateStep1 !== stateTree.appendResults[1].newRoot) throw new Error("after update step1 root mismatch");
  if (expectedAdmission.stateRoots.afterUpdateStep2 !== stateTree.appendResults[2].newRoot) throw new Error("after update step2 root mismatch");

  assertNoForbiddenRecompute();
  writeReportChecked();
  console.log("check_admission_contract: pass");
}

main();
