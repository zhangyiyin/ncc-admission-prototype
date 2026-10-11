import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BUILD_DIR = "build/m4";
const CIRCUIT = "circuits/init_compliance_state/InitComplianceState.circom";
const R1CS = `${BUILD_DIR}/InitComplianceState.r1cs`;
const WITNESS_JS_DIR = `${BUILD_DIR}/InitComplianceState_js`;
const WASM = `${WITNESS_JS_DIR}/InitComplianceState.wasm`;
const WITNESS_JS = `${WITNESS_JS_DIR}/generate_witness.js`;
const POSITIVE_INPUT = "fixtures/m4/init_input_user_001.json";
const POSITIVE_WTNS = `${BUILD_DIR}/init_user_001.wtns`;

const NEGATIVE_CASES = [
  "bad_registration_path",
  "inactive_status",
  "wrong_policy_root",
  "wrong_policy_scope_hash",
  "wrong_C_gen",
  "wrong_N_gen",
] as const;

type StepResult = "pass" | "fail";

function run(cmd: string, args: string[], opts: { stdio?: "inherit" | "pipe" } = {}): void {
  execFileSync(cmd, args, { stdio: opts.stdio ?? "pipe" });
}

function runOk(cmd: string, args: string[]): boolean {
  try {
    run(cmd, args);
    return true;
  } catch {
    return false;
  }
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

function checkPublicFixtureConsistency(): void {
  const input = readJson(POSITIVE_INPUT);
  const expected = readJson("fixtures/m4/init_public_expected.json");
  const order = [
    input.rootRegAct,
    input.rootStatusAct,
    input.rootPolAct,
    input.N_gen,
    input.C_gen,
    input.policyScopeHash,
  ];
  if (JSON.stringify(order) !== JSON.stringify(expected.publicInputs)) {
    throw new Error("public input ordering fixture mismatch");
  }
  for (const [k, v] of Object.entries(expected.named)) {
    if (input[k] !== v) {
      throw new Error(`named public input mismatch for ${k}`);
    }
  }
}

function checkPositive(): void {
  run("node", [WITNESS_JS, WASM, POSITIVE_INPUT, POSITIVE_WTNS]);
  run("npx", ["snarkjs", "wtns", "check", R1CS, POSITIVE_WTNS]);
}

function negativeFails(name: string): boolean {
  const inputPath = `fixtures/m4/init_negative_cases/${name}.json`;
  const wtnsPath = `${BUILD_DIR}/${name}.wtns`;
  const witnessGenerated = runOk("node", [WITNESS_JS, WASM, inputPath, wtnsPath]);
  if (!witnessGenerated) {
    return true;
  }
  const wtnsCheckOk = runOk("npx", ["snarkjs", "wtns", "check", R1CS, wtnsPath]);
  return !wtnsCheckOk;
}

function updateReport(results: Record<string, StepResult>, negative: Record<string, StepResult>): void {
  const expected = readJson("fixtures/m4/init_public_expected.json");
  const named = expected.named;
  const warnings = [
    "Node may print [DEP0180] fs.Stats constructor is deprecated; this is non-blocking.",
    "A local build/m4/InitComplianceState_js/package.json marks circom-generated witness code as CommonJS because the repository package is ESM.",
    "No Groth16 proving key or Solidity verifier is generated in M4.",
  ];

  const report = `# M4 Init Circuit Report\n\n## Status\n\n- build_init_circuit_input: ${results.build}\n- circom compile: ${results.compile}\n- positive witness generation: ${results.positiveWitness}\n- positive wtns check: ${results.positiveWtns}\n\n## Negative cases\n\n- negative bad_registration_path: ${negative.bad_registration_path}\n- negative inactive_status: ${negative.inactive_status}\n- negative wrong_policy_root: ${negative.wrong_policy_root}\n- negative wrong_policy_scope_hash: ${negative.wrong_policy_scope_hash}\n- negative wrong_C_gen: ${negative.wrong_C_gen}\n- negative wrong_N_gen: ${negative.wrong_N_gen}\n\n## Public input ordering\n\n\`\`\`text\n[\n  rootRegAct,\n  rootStatusAct,\n  rootPolAct,\n  N_gen,\n  C_gen,\n  policyScopeHash\n]\n\`\`\`\n\n## Public input values\n\n- rootRegAct: ${named.rootRegAct}\n- rootStatusAct: ${named.rootStatusAct}\n- rootPolAct: ${named.rootPolAct}\n- N_gen: ${named.N_gen}\n- C_gen: ${named.C_gen}\n- policyScopeHash: ${named.policyScopeHash}\n\n## Fixture consistency\n\n- C_gen matches M3 first state leaf: ${expected.consistency.cGenMatchesM3FirstStateLeaf ? "yes" : "no"}\n- rootRegAct matches M2: ${expected.consistency.rootRegActMatchesM2 ? "yes" : "no"}\n- rootStatusAct matches M2: ${expected.consistency.rootStatusActMatchesM2 ? "yes" : "no"}\n- rootPolAct matches M2: ${expected.consistency.rootPolActMatchesM2 ? "yes" : "no"}\n\n## Known warnings\n\n${warnings.map((w) => `- ${w}`).join("\n")}\n`;
  writeFileSync("docs/M4_INIT_CIRCUIT_REPORT.md", report);
}

async function main(): Promise<void> {
  if (!existsSync(POSITIVE_INPUT) || !existsSync("fixtures/m4/init_public_expected.json")) {
    throw new Error("M4 fixtures not found. Run npx ts-node scripts/m4/build_init_circuit_input.ts first.");
  }
  mkdirSync(BUILD_DIR, { recursive: true });

  checkPublicFixtureConsistency();

  const results: Record<string, StepResult> = {
    build: "pass",
    compile: "fail",
    positiveWitness: "fail",
    positiveWtns: "fail",
  };
  const negative: Record<string, StepResult> = Object.fromEntries(NEGATIVE_CASES.map((n) => [n, "fail"])) as Record<string, StepResult>;

  run("circom", [CIRCUIT, "--r1cs", "--wasm", "--sym", "-o", BUILD_DIR], { stdio: "inherit" });
  // The repository package is ESM (package.json has "type": "module"), while
  // circom-generated witness code is CommonJS and uses require(). Put a local
  // package.json next to generate_witness.js so Node treats only this generated
  // witness directory as CommonJS.
  writeFileSync(`${WITNESS_JS_DIR}/package.json`, `{"type":"commonjs"}
`);
  results.compile = "pass";

  try {
    run("node", [WITNESS_JS, WASM, POSITIVE_INPUT, POSITIVE_WTNS]);
    results.positiveWitness = "pass";
    run("npx", ["snarkjs", "wtns", "check", R1CS, POSITIVE_WTNS]);
    results.positiveWtns = "pass";
  } catch (err) {
    updateReport(results, negative);
    throw err;
  }

  for (const name of NEGATIVE_CASES) {
    negative[name] = negativeFails(name) ? "pass" : "fail";
  }

  updateReport(results, negative);

  const failedNegative = Object.entries(negative).filter(([, v]) => v !== "pass");
  if (failedNegative.length > 0) {
    throw new Error(`negative cases did not fail as expected: ${failedNegative.map(([k]) => k).join(", ")}`);
  }

  console.log("check_init_circuit: pass");
  console.log("positive witness: pass");
  console.log("positive wtns check: pass");
  for (const name of NEGATIVE_CASES) {
    console.log(`negative ${name}: pass`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
