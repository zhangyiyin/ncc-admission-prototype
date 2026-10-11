import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

type ProofCall = {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  publicSignals: string[];
};

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  const abs = join(ROOT, path);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`wrote ${path}`);
}

function proofForSolidity(proofPath: string, publicPath: string): ProofCall {
  const proof = readJson<any>(proofPath);
  const publicSignals = readJson<string[]>(publicPath);
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
    publicSignals,
  };
}

function assertArrayEq(actual: string[], expected: string[], label: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: publicSignals mismatch\nactual=${a}\nexpected=${e}`);
  }
}

function main(): void {
  const initExpected = readJson<any>("fixtures/m4/init_public_expected.json");
  const update1Expected = readJson<any>("fixtures/m7/update_full_public_expected_step1.json");
  const update2Expected = readJson<any>("fixtures/m7/update_full_public_expected_step2.json");
  const stateTree = readJson<any>("fixtures/m3/state_tree_expected.json");
  const roots = readJson<any>("fixtures/m2/root_bundle.json");

  const initCall = {
    label: "init",
    proof: proofForSolidity(
      "run_artifacts/m8/proofs/init/proof.json",
      "run_artifacts/m8/proofs/init/public.json"
    ),
  };
  const updateStep1Call = {
    label: "update_step1",
    proof: proofForSolidity(
      "run_artifacts/m8/proofs/update_step1/proof.json",
      "run_artifacts/m8/proofs/update_step1/public.json"
    ),
  };
  const updateStep2Call = {
    label: "update_step2",
    proof: proofForSolidity(
      "run_artifacts/m8/proofs/update_step2/proof.json",
      "run_artifacts/m8/proofs/update_step2/public.json"
    ),
  };

  assertArrayEq(initCall.proof.publicSignals, initExpected.publicInputs, "init");
  assertArrayEq(updateStep1Call.proof.publicSignals, update1Expected.publicInputs, "update step1");
  assertArrayEq(updateStep2Call.proof.publicSignals, update2Expected.publicInputs, "update step2");

  const expectedAdmissionState = {
    activeRoots: roots.roots,
    treeDepth: stateTree.depth,
    stateRoots: {
      emptyRoot: stateTree.emptyRoot,
      afterInit: stateTree.appendResults[0].newRoot,
      afterUpdateStep1: stateTree.appendResults[1].newRoot,
      afterUpdateStep2: stateTree.appendResults[2].newRoot,
    },
    stateIndices: {
      init: String(stateTree.appendResults[0].index),
      updateStep1: String(stateTree.appendResults[1].index),
      updateStep2: String(stateTree.appendResults[2].index),
    },
    init: {
      N_gen: initExpected.named.N_gen,
      C_gen: initExpected.named.C_gen,
      policyScopeHash: initExpected.named.policyScopeHash,
    },
    records: {
      step1: {
        rtState: update1Expected.named.rtState,
        N_old: update1Expected.named.N_old,
        C_new: update1Expected.named.C_new,
        actionHash: update1Expected.named.actionHash,
        amountCom: update1Expected.named.amountCom,
        clauseCom: update1Expected.named.clauseCom,
        rho: update1Expected.named.rho,
      },
      step2: {
        rtState: update2Expected.named.rtState,
        N_old: update2Expected.named.N_old,
        C_new: update2Expected.named.C_new,
        actionHash: update2Expected.named.actionHash,
        amountCom: update2Expected.named.amountCom,
        clauseCom: update2Expected.named.clauseCom,
        rho: update2Expected.named.rho,
      },
    },
  };

  writeJson("fixtures/m9/init_call.json", initCall);
  writeJson("fixtures/m9/update_step1_call.json", updateStep1Call);
  writeJson("fixtures/m9/update_step2_call.json", updateStep2Call);
  writeJson("fixtures/m9/expected_admission_state.json", expectedAdmissionState);

  writeFileSync(join(ROOT, "docs/M9_ADMISSION_CONTRACT_REPORT.md"), `# M9 Admission Contract Report\n\n## Status\n\n- build_admission_calls: pass\n- check_admission_contract: pending\n- hardhat compile: pending\n- hardhat test m9: pending\n\n## Deployment\n\n- RootRegistry deployed: pending\n- ComplianceAdmission deployed: pending\n- Init verifier deployed: pending\n- Update verifier deployed: pending\n\n## Init\n\n- valid init accepted: pending\n- new root equals M3 root after C_gen: pending\n- N_gen marked used: pending\n- replay init rejected: pending\n\n## Update step1\n\n- valid update accepted: pending\n- new root equals M3 root after C_after_18000: pending\n- N_old marked used: pending\n- rho accepted: pending\n- record fields equal public inputs: pending\n\n## Update step2\n\n- valid update accepted: pending\n- new root equals M3 root after C_after_36000: pending\n- N_old marked used: pending\n- rho accepted: pending\n- record fields equal public inputs: pending\n\n## Negative tests\n\n- update before init rejected: pending\n- reused N_old rejected: pending\n- reused rho/replay rejected: pending\n- modified init public input rejected: pending\n- modified update public input rejected: pending\n- stale active roots rejected: pending\n- non-owner registry update rejected: pending\n- invalid field root rejected: pending\n\n## Architecture checks\n\n- Solidity does not recompute actionHash: pending\n- Solidity does not recompute amountCom: pending\n- Solidity does not recompute clauseCom: pending\n- Solidity does not recompute rho: pending\n- accepted records copied from proof publicSignals: pending\n\n## Known warnings\n\n- ComplianceAdmission constructor includes a poseidonT3 address because the existing IncrementalPoseidonTree library requires an external two-input Poseidon contract, matching M3.\n`, "utf8");
  console.log("build_admission_calls: pass");
}

main();
