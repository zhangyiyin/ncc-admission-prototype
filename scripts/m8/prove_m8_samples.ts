import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

type Sample = {
  label: string;
  input: string;
  wasm: string;
  zkey: string;
  vk: string;
  outDir: string;
};

const samples: Sample[] = [
  {
    label: "init",
    input: "fixtures/m4/init_input_user_001.json",
    wasm: "run_artifacts/m8/init/InitComplianceState_js/InitComplianceState.wasm",
    zkey: "run_artifacts/m8/init/InitComplianceState_final.zkey",
    vk: "run_artifacts/m8/init/verification_key.json",
    outDir: "run_artifacts/m8/proofs/init"
  },
  {
    label: "update step1",
    input: "fixtures/m7/update_full_input_step1.json",
    wasm: "run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm",
    zkey: "run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey",
    vk: "run_artifacts/m8/update/verification_key.json",
    outDir: "run_artifacts/m8/proofs/update_step1"
  },
  {
    label: "update step2",
    input: "fixtures/m7/update_full_input_step2.json",
    wasm: "run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm",
    zkey: "run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey",
    vk: "run_artifacts/m8/update/verification_key.json",
    outDir: "run_artifacts/m8/proofs/update_step2"
  }
];

function run(cmd: string, args: string[]): void {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
}

function requirePath(path: string): void {
  if (!existsSync(join(ROOT, path))) {
    throw new Error(`missing required path: ${path}`);
  }
}

function cleanDir(path: string): void {
  const abs = join(ROOT, path);
  rmSync(abs, { recursive: true, force: true });
  mkdirSync(abs, { recursive: true });
}

function prove(sample: Sample): void {
  requirePath(sample.input);
  requirePath(sample.wasm);
  requirePath(sample.zkey);
  requirePath(sample.vk);
  cleanDir(sample.outDir);

  const proof = join(sample.outDir, "proof.json");
  const pub = join(sample.outDir, "public.json");

  run("npx", [
    "snarkjs",
    "groth16",
    "fullprove",
    sample.input,
    sample.wasm,
    sample.zkey,
    proof,
    pub
  ]);

  run("npx", [
    "snarkjs",
    "groth16",
    "verify",
    sample.vk,
    pub,
    proof
  ]);

  console.log(`${sample.label} proof: pass`);
}

function markReport(): void {
  const path = join(ROOT, "docs/M8_VERIFIER_GENERATION_REPORT.md");
  if (!existsSync(path)) {
    return;
  }
  let s = readFileSync(path, "utf8");
  s = s.replace("- prove_m8_samples: pending", "- prove_m8_samples: pass");
  s = s.replace("- snarkjs verify: pending", "- snarkjs verify: pass");
  s = s.replace("- step1 snarkjs verify: pending", "- step1 snarkjs verify: pass");
  s = s.replace("- step2 snarkjs verify: pending", "- step2 snarkjs verify: pass");
  writeFileSync(path, s, "utf8");
}

function main(): void {
  for (const sample of samples) {
    prove(sample);
  }

  markReport();
  console.log("\nprove_m8_samples: pass");
}

main();
