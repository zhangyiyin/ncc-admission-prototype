import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BUILD_DIR = "build/m5";
const CIRCUIT = "circuits/update_compliance_state/UpdateComplianceStateBasic.circom";
const R1CS = `${BUILD_DIR}/UpdateComplianceStateBasic.r1cs`;
const WITNESS_JS_DIR = `${BUILD_DIR}/UpdateComplianceStateBasic_js`;
const WASM = `${WITNESS_JS_DIR}/UpdateComplianceStateBasic.wasm`;
const WITNESS_JS = `${WITNESS_JS_DIR}/generate_witness.js`;

const STEP1_INPUT = "fixtures/m5/update_basic_input_step1.json";
const STEP1_EXPECTED = "fixtures/m5/update_basic_public_expected_step1.json";
const STEP1_WTNS = `${BUILD_DIR}/update_basic_step1.wtns`;

const STEP2_INPUT = "fixtures/m5/update_basic_input_step2.json";
const STEP2_EXPECTED = "fixtures/m5/update_basic_public_expected_step2.json";
const STEP2_WTNS = `${BUILD_DIR}/update_basic_step2.wtns`;

const NEGATIVE_CASES = [
  "bad_state_path",
  "wrong_rtState",
  "wrong_N_old",
  "wrong_C_new",
  "wrong_amountCom",
  "wrong_policy_root",
  "inactive_status",
  "exceeds_limit",
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

function checkPublicFixtureConsistency(inputPath: string, expectedPath: string): void {
  const input = readJson(inputPath);
  const expected = readJson(expectedPath);
  const order = [
    input.rootRegAct,
    input.rootStatusAct,
    input.rootPolAct,
    input.rtState,
    input.N_old,
    input.C_new,
    input.amountCom,
  ];
  if (JSON.stringify(order) !== JSON.stringify(expected.publicInputs)) {
    throw new Error(`public input ordering fixture mismatch for ${inputPath}`);
  }
  for (const [k, v] of Object.entries(expected.named)) {
    if (input[k] !== v) {
      throw new Error(`named public input mismatch for ${k} in ${inputPath}`);
    }
  }
}

function negativeFails(name: string): boolean {
  const inputPath = `fixtures/m5/update_basic_negative_cases/${name}.json`;
  const wtnsPath = `${BUILD_DIR}/${name}.wtns`;
  const witnessGenerated = runOk("node", [WITNESS_JS, WASM, inputPath, wtnsPath]);
  if (!witnessGenerated) {
    return true;
  }
  const wtnsCheckOk = runOk("npx", ["snarkjs", "wtns", "check", R1CS, wtnsPath]);
  return !wtnsCheckOk;
}

function updateReport(results: Record<string, StepResult>, negative: Record<string, StepResult>): void {
  const step1Expected = readJson(STEP1_EXPECTED);
  const step2Expected = readJson(STEP2_EXPECTED);
  const step1 = step1Expected.named;
  const step2 = step2Expected.named;
  const consistency = step1Expected.consistency;

  const warnings = [
    "Node may print [DEP0180] fs.Stats constructor is deprecated; this is non-blocking.",
    "A local build/m5/UpdateComplianceStateBasic_js/package.json marks circom-generated witness code as CommonJS because the repository package is ESM.",
    "No Groth16 proving key or Solidity verifier is generated in M5.",
    "M5-basic intentionally does not enforce threshold clauses. The 18,000 -> 36,000 update must pass in M5.",
  ];

  const report = `# M5 Update Basic Circuit Report

## Status

- build_update_basic_input: ${results.build}
- circom compile: ${results.compile}
- step1 witness generation: ${results.step1Witness}
- step1 wtns check: ${results.step1Wtns}
- step2 witness generation: ${results.step2Witness}
- step2 wtns check: ${results.step2Wtns}

## Public input ordering

\`\`\`text
[
  rootRegAct,
  rootStatusAct,
  rootPolAct,
  rtState,
  N_old,
  C_new,
  amountCom
]
\`\`\`

## Step values

step1:
  rtState: ${step1.rtState}
  N_old: ${step1.N_old}
  C_new: ${step1.C_new}
  amountCom: ${step1.amountCom}

step2:
  rtState: ${step2.rtState}
  N_old: ${step2.N_old}
  C_new: ${step2.C_new}
  amountCom: ${step2.amountCom}

## Negative cases

- negative bad_state_path: ${negative.bad_state_path}
- negative wrong_rtState: ${negative.wrong_rtState}
- negative wrong_N_old: ${negative.wrong_N_old}
- negative wrong_C_new: ${negative.wrong_C_new}
- negative wrong_amountCom: ${negative.wrong_amountCom}
- negative wrong_policy_root: ${negative.wrong_policy_root}
- negative inactive_status: ${negative.inactive_status}
- negative exceeds_limit: ${negative.exceeds_limit}

## M3 consistency

- C_after_18000 matches M3 appendResults[1].leaf: ${consistency.step1CNewMatchesM3AppendResults1Leaf ? "yes" : "no"}
- C_after_36000 matches M3 appendResults[2].leaf: ${consistency.step2CNewMatchesM3AppendResults2Leaf ? "yes" : "no"}

## Known warnings

${warnings.map((w) => `- ${w}`).join("\n")}
`;
  writeFileSync("docs/M5_UPDATE_BASIC_CIRCUIT_REPORT.md", report);
}

async function main(): Promise<void> {
  for (const path of [STEP1_INPUT, STEP1_EXPECTED, STEP2_INPUT, STEP2_EXPECTED]) {
    if (!existsSync(path)) {
      throw new Error(`M5 fixture not found: ${path}. Run npx ts-node scripts/m5/build_update_basic_input.ts first.`);
    }
  }

  mkdirSync(BUILD_DIR, { recursive: true });

  checkPublicFixtureConsistency(STEP1_INPUT, STEP1_EXPECTED);
  checkPublicFixtureConsistency(STEP2_INPUT, STEP2_EXPECTED);

  const results: Record<string, StepResult> = {
    build: "pass",
    compile: "fail",
    step1Witness: "fail",
    step1Wtns: "fail",
    step2Witness: "fail",
    step2Wtns: "fail",
  };
  const negative: Record<string, StepResult> = Object.fromEntries(NEGATIVE_CASES.map((n) => [n, "fail"])) as Record<string, StepResult>;

  run("circom", [CIRCUIT, "--r1cs", "--wasm", "--sym", "-o", BUILD_DIR], { stdio: "inherit" });
  writeFileSync(`${WITNESS_JS_DIR}/package.json`, `{"type":"commonjs"}
`);
  results.compile = "pass";

  try {
    run("node", [WITNESS_JS, WASM, STEP1_INPUT, STEP1_WTNS]);
    results.step1Witness = "pass";
    run("npx", ["snarkjs", "wtns", "check", R1CS, STEP1_WTNS]);
    results.step1Wtns = "pass";

    run("node", [WITNESS_JS, WASM, STEP2_INPUT, STEP2_WTNS]);
    results.step2Witness = "pass";
    run("npx", ["snarkjs", "wtns", "check", R1CS, STEP2_WTNS]);
    results.step2Wtns = "pass";
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

  console.log("check_update_basic_circuit: pass");
  console.log("step1 witness: pass");
  console.log("step1 wtns check: pass");
  console.log("step2 witness: pass");
  console.log("step2 wtns check: pass");
  for (const name of NEGATIVE_CASES) {
    console.log(`negative ${name}: pass`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
