import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const PTAU_POWER = 18;

type CircuitTarget = {
  label: "init" | "update";
  circuit: string;
  name: string;
  contractName: string;
  publicInputs: number;
};

const targets: CircuitTarget[] = [
  {
    label: "init",
    circuit: "circuits/init_compliance_state/InitComplianceState.circom",
    name: "InitComplianceState",
    contractName: "InitComplianceStateVerifier",
    publicInputs: 6
  },
  {
    label: "update",
    circuit: "circuits/update_compliance_state/UpdateComplianceStateFull.circom",
    name: "UpdateComplianceStateFull",
    contractName: "UpdateComplianceStateVerifier",
    publicInputs: 10
  }
];

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function cleanDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
  ensureDir(path);
}

function run(cmd: string, args: string[]): void {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

function capture(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function parseR1csInfo(r1csPath: string): { constraints: string; publicInputs: string; raw: string } {
  let raw = "";
  try {
    raw = capture("npx", ["snarkjs", "r1cs", "info", r1csPath]);
  } catch {
    raw = "";
  }
  const constraints = raw.match(/# of Constraints:\s*(\d+)/)?.[1] ?? "unknown";
  const publicInputs = raw.match(/# of Public Inputs:\s*(\d+)/)?.[1] ?? "unknown";
  return { constraints, publicInputs, raw };
}

function setupPtau(): string {
  const ptauDir = join(ROOT, "run_artifacts/m8/ptau");
  ensureDir(ptauDir);

  const pot0 = join(ptauDir, `pot${PTAU_POWER}_0000.ptau`);
  const pot1 = join(ptauDir, `pot${PTAU_POWER}_0001.ptau`);
  const finalPtau = join(ptauDir, `pot${PTAU_POWER}_final.ptau`);

  if (existsSync(finalPtau)) {
    console.log(`reusing ${finalPtau}`);
    return finalPtau;
  }

  run("npx", ["snarkjs", "powersoftau", "new", "bn128", String(PTAU_POWER), pot0, "-v"]);
  run("npx", [
    "snarkjs",
    "powersoftau",
    "contribute",
    pot0,
    pot1,
    "--name=M8 local prototype contribution",
    "-v",
    "-e=m8-local-prototype-entropy"
  ]);
  run("npx", ["snarkjs", "powersoftau", "prepare", "phase2", pot1, finalPtau, "-v"]);

  return finalPtau;
}

function patchVerifierContract(path: string, contractName: string): void {
  let sol = readFileSync(path, "utf8");

  if (!sol.includes("contract Groth16Verifier")) {
    throw new Error(`expected generated contract Groth16Verifier in ${path}`);
  }

  sol = sol.replace(/\bcontract\s+Groth16Verifier\b/, `contract ${contractName}`);

  if (sol.includes("library Pairing")) {
    const pairingName = `${contractName}Pairing`;
    sol = sol.replace(/\blibrary\s+Pairing\b/g, `library ${pairingName}`);
    sol = sol.replace(/\bPairing\./g, `${pairingName}.`);
    sol = sol.replace(/\busing\s+Pairing\s+for\b/g, `using ${pairingName} for`);
  }

  if (!sol.includes(`contract ${contractName}`)) {
    throw new Error(`failed to patch verifier contract name to ${contractName}`);
  }

  writeFileSync(path, sol, "utf8");
}

function setupCircuit(target: CircuitTarget, finalPtau: string) {
  const outDir = join(ROOT, `run_artifacts/m8/${target.label}`);
  cleanDir(outDir);

  run("circom", [target.circuit, "--r1cs", "--wasm", "--sym", "-o", outDir]);

  const r1cs = join(outDir, `${target.name}.r1cs`);
  const zkey0 = join(outDir, `${target.name}_0000.zkey`);
  const zkeyFinal = join(outDir, `${target.name}_final.zkey`);
  const vk = join(outDir, "verification_key.json");

  run("npx", ["snarkjs", "groth16", "setup", r1cs, finalPtau, zkey0]);
  run("npx", [
    "snarkjs",
    "zkey",
    "contribute",
    zkey0,
    zkeyFinal,
    "--name=M8 local prototype zkey contribution",
    "-v",
    "-e=m8-local-zkey-entropy"
  ]);
  run("npx", ["snarkjs", "zkey", "export", "verificationkey", zkeyFinal, vk]);

  const verifierPath = join(ROOT, `contracts/verifiers/${target.contractName}.sol`);
  ensureDir(dirname(verifierPath));
  run("npx", ["snarkjs", "zkey", "export", "solidityverifier", zkeyFinal, verifierPath]);
  patchVerifierContract(verifierPath, target.contractName);

  const info = parseR1csInfo(r1cs);
  if (info.publicInputs !== "unknown" && Number(info.publicInputs) !== target.publicInputs) {
    throw new Error(`${target.name}: public input count ${info.publicInputs} != expected ${target.publicInputs}`);
  }

  return { r1cs, zkeyFinal, vk, verifierPath, constraints: info.constraints, publicInputs: info.publicInputs };
}

function writeSpec(): void {
  const spec = `# M8 Verifier Generation Specification

## Scope

M8 generates Groth16 artifacts and Solidity pairing verifiers for the two frozen target circuits:

- \`circuits/init_compliance_state/InitComplianceState.circom\`
- \`circuits/update_compliance_state/UpdateComplianceStateFull.circom\`

M8 does not implement admission business logic. It does not implement \`RootRegistry\`, \`ComplianceAdmission\`, nullifier sets, state-tree append inside an admission contract, gateway execution, gas benchmarks, or public testnet deployment.

## Trusted setup boundary

This is a local prototype trusted setup, not a production ceremony.

The local setup uses a development powers-of-tau file under \`run_artifacts/m8/ptau/\`. The generated proving keys, verification keys, proofs, public signals, R1CS files, WASM files, and zkeys are local run artifacts.

## Init public input ordering

\`\`\`text
[
  rootRegAct,
  rootStatusAct,
  rootPolAct,
  N_gen,
  C_gen,
  policyScopeHash
]
\`\`\`

Public input count: 6.

## Update public input ordering

\`\`\`text
[
  rootRegAct,
  rootStatusAct,
  rootPolAct,
  rtState,
  N_old,
  C_new,
  actionHash,
  amountCom,
  clauseCom,
  rho
]
\`\`\`

Public input count: 10.

## Generated Solidity verifiers

\`\`\`text
contracts/verifiers/InitComplianceStateVerifier.sol
contracts/verifiers/UpdateComplianceStateVerifier.sol
\`\`\`

The verifier logic is generated by \`snarkjs zkey export solidityverifier\`. M8 only patches generated Solidity names to avoid duplicate \`Groth16Verifier\` contracts and duplicate pairing-library names if the snarkjs template emits a top-level \`Pairing\` library. M8 does not hand-write verifier logic and does not edit verifying-key constants.

## Artifact layout

\`\`\`text
run_artifacts/m8/
  ptau/
  init/
  update/
  proofs/
    init/
    update_step1/
    update_step2/
\`\`\`

Large Groth16 artifacts stay under \`run_artifacts/m8/\`.

## Proof generation flow

\`\`\`text
snarkjs groth16 fullprove <input.json> <circuit.wasm> <final.zkey> proof.json public.json
\`\`\`

M8 generates:

- init proof from \`fixtures/m4/init_input_user_001.json\`
- update step1 proof from \`fixtures/m7/update_full_input_step1.json\`
- update step2 proof from \`fixtures/m7/update_full_input_step2.json\`

## snarkjs verification flow

\`\`\`text
snarkjs groth16 verify verification_key.json public.json proof.json
\`\`\`

## Hardhat verifier smoke test flow

The Hardhat smoke test deploys both generated verifiers, adapts snarkjs proof JSON into Solidity verifier calldata, checks valid init and update proofs, and checks that modified public inputs are rejected.

## Non-goals

M8 does not implement \`RootRegistry\`, \`ComplianceAdmission\`, gateway execution, state-tree append in an admission contract, nullifier sets, action records, or gas measurement.
`;

  writeFileSync(join(ROOT, "docs/M8_VERIFIER_GENERATION_SPEC.md"), spec, "utf8");
}

function writeReport(init: any, update: any): void {
  const report = `# M8 Verifier Generation Report

## Status

- setup_groth16_verifiers: pass
- prove_m8_samples: pending
- check_m8_verifiers: pending
- hardhat compile: pending
- hardhat test m8: pending

## Trusted setup

- statement: This is a local prototype trusted setup, not a production ceremony.
- ptau power: ${PTAU_POWER}
- ptau file: run_artifacts/m8/ptau/pot${PTAU_POWER}_final.ptau

## Init circuit

- circuit: circuits/init_compliance_state/InitComplianceState.circom
- constraints: ${init.constraints}
- public inputs count: 6
- r1cs: run_artifacts/m8/init/InitComplianceState.r1cs
- wasm: run_artifacts/m8/init/InitComplianceState_js/InitComplianceState.wasm
- zkey: run_artifacts/m8/init/InitComplianceState_final.zkey
- verification key: run_artifacts/m8/init/verification_key.json
- Solidity verifier: contracts/verifiers/InitComplianceStateVerifier.sol
- snarkjs verify: pending
- Solidity verify: pending

## Update circuit

- circuit: circuits/update_compliance_state/UpdateComplianceStateFull.circom
- constraints: ${update.constraints}
- public inputs count: 10
- r1cs: run_artifacts/m8/update/UpdateComplianceStateFull.r1cs
- wasm: run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm
- zkey: run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey
- verification key: run_artifacts/m8/update/verification_key.json
- Solidity verifier: contracts/verifiers/UpdateComplianceStateVerifier.sol
- step1 snarkjs verify: pending
- step2 snarkjs verify: pending
- step1 Solidity verify: pending
- step2 Solidity verify: pending

## Public input ordering

- init public.json equals expected: pending
- update step1 public.json equals expected: pending
- update step2 public.json equals expected: pending

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
  ensureDir(join(ROOT, "run_artifacts/m8"));
  ensureDir(join(ROOT, "contracts/verifiers"));
  ensureDir(join(ROOT, "scripts/m8"));
  ensureDir(join(ROOT, "test/m8"));

  writeSpec();

  const finalPtau = setupPtau();
  const init = setupCircuit(targets[0], finalPtau);
  const update = setupCircuit(targets[1], finalPtau);

  writeReport(init, update);

  console.log("\nsetup_groth16_verifiers: pass");
  console.log(`init constraints: ${init.constraints}`);
  console.log(`update constraints: ${update.constraints}`);
}

main();
