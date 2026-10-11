import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function requirePath(path: string, label = path): void {
  if (!existsSync(path)) {
    throw new Error(`${label} does not exist: ${path}`);
  }
}

function assertPublicSignalsEqual(actualPath: string, expectedPath: string, label: string): void {
  const actual = readJson<string[]>(actualPath);
  const expectedJson = readJson<any>(expectedPath);
  const expected = expectedJson.publicInputs;

  if (!Array.isArray(actual)) {
    throw new Error(`${label}: actual public.json is not an array`);
  }
  if (!Array.isArray(expected)) {
    throw new Error(`${label}: expected fixture has no publicInputs array`);
  }

  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: public input ordering/value mismatch\nactual=${a}\nexpected=${e}`);
  }
}


const ROOT = process.cwd();

function run(cmd: string, args: string[]): void {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

function capture(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    return "";
  }
}

function r1csConstraints(path: string): string {
  const out = capture("npx", ["snarkjs", "r1cs", "info", path]);
  return out.match(/# of Constraints:\s*(\d+)/)?.[1] ?? "unknown";
}

function checkVerifierContract(path: string, contractName: string): void {
  requirePath(path);
  const sol = readFileSync(path, "utf8");
  if (!sol.includes(`contract ${contractName}`)) {
    throw new Error(`${path}: missing contract ${contractName}`);
  }
  if (sol.includes("contract Groth16Verifier")) {
    throw new Error(`${path}: unpatched Groth16Verifier contract name remains`);
  }
}

function verify(label: string, vk: string, pub: string, proof: string): void {
  requirePath(vk);
  requirePath(pub);
  requirePath(proof);
  run("npx", ["snarkjs", "groth16", "verify", vk, pub, proof]);
  console.log(`${label}: snarkjs verify pass`);
}

function writeReport(): void {
  const initConstraints = r1csConstraints("run_artifacts/m8/init/InitComplianceState.r1cs");
  const updateConstraints = r1csConstraints("run_artifacts/m8/update/UpdateComplianceStateFull.r1cs");

  const report = `# M8 Verifier Generation Report

## Status

- setup_groth16_verifiers: pass
- prove_m8_samples: pass
- check_m8_verifiers: pass
- hardhat compile: pending
- hardhat test m8: pending

## Trusted setup

- statement: This is a local prototype trusted setup, not a production ceremony.
- ptau power: 18
- ptau file: run_artifacts/m8/ptau/pot18_final.ptau

## Init circuit

- circuit: circuits/init_compliance_state/InitComplianceState.circom
- constraints: ${initConstraints}
- public inputs count: 6
- r1cs: run_artifacts/m8/init/InitComplianceState.r1cs
- wasm: run_artifacts/m8/init/InitComplianceState_js/InitComplianceState.wasm
- zkey: run_artifacts/m8/init/InitComplianceState_final.zkey
- verification key: run_artifacts/m8/init/verification_key.json
- Solidity verifier: contracts/verifiers/InitComplianceStateVerifier.sol
- snarkjs verify: pass
- Solidity verify: pending

## Update circuit

- circuit: circuits/update_compliance_state/UpdateComplianceStateFull.circom
- constraints: ${updateConstraints}
- public inputs count: 10
- r1cs: run_artifacts/m8/update/UpdateComplianceStateFull.r1cs
- wasm: run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm
- zkey: run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey
- verification key: run_artifacts/m8/update/verification_key.json
- Solidity verifier: contracts/verifiers/UpdateComplianceStateVerifier.sol
- step1 snarkjs verify: pass
- step2 snarkjs verify: pass
- step1 Solidity verify: pending
- step2 Solidity verify: pending

## Public input ordering

- init public.json equals expected: yes
- update step1 public.json equals expected: yes
- update step2 public.json equals expected: yes

## Negative verifier tests

- init modified public input rejected: pending
- update modified public input rejected: pending

## Known warnings

- Node may print [DEP0180] fs.Stats constructor is deprecated; this is non-blocking.
- snarkjs verifier contracts are generated locally for prototype use.
- No RootRegistry, ComplianceAdmission, nullifier set, gateway, state-tree admission append, gas benchmark, or public testnet deployment is implemented in M8.
`;

  writeFileSync(join(ROOT, "docs/M8_VERIFIER_GENERATION_REPORT.md"), report, "utf8");
}

function main(): void {
  assertPublicSignalsEqual(
    "run_artifacts/m8/proofs/init/public.json",
    "fixtures/m4/init_public_expected.json",
    "init"
  );
  assertPublicSignalsEqual(
    "run_artifacts/m8/proofs/update_step1/public.json",
    "fixtures/m7/update_full_public_expected_step1.json",
    "update step1"
  );
  assertPublicSignalsEqual(
    "run_artifacts/m8/proofs/update_step2/public.json",
    "fixtures/m7/update_full_public_expected_step2.json",
    "update step2"
  );

  checkVerifierContract("contracts/verifiers/InitComplianceStateVerifier.sol", "InitComplianceStateVerifier");
  checkVerifierContract("contracts/verifiers/UpdateComplianceStateVerifier.sol", "UpdateComplianceStateVerifier");

  requirePath("run_artifacts/m8/init/verification_key.json");
  requirePath("run_artifacts/m8/update/verification_key.json");
  requirePath("run_artifacts/m8/proofs/init/proof.json");
  requirePath("run_artifacts/m8/proofs/update_step1/proof.json");
  requirePath("run_artifacts/m8/proofs/update_step2/proof.json");

  verify(
    "init",
    "run_artifacts/m8/init/verification_key.json",
    "run_artifacts/m8/proofs/init/public.json",
    "run_artifacts/m8/proofs/init/proof.json"
  );
  verify(
    "update step1",
    "run_artifacts/m8/update/verification_key.json",
    "run_artifacts/m8/proofs/update_step1/public.json",
    "run_artifacts/m8/proofs/update_step1/proof.json"
  );
  verify(
    "update step2",
    "run_artifacts/m8/update/verification_key.json",
    "run_artifacts/m8/proofs/update_step2/public.json",
    "run_artifacts/m8/proofs/update_step2/proof.json"
  );

  writeReport();
  console.log("\ncheck_m8_verifiers: pass");
}

main();
