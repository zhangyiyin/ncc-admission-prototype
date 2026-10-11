import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

describe("M5 UpdateComplianceStateBasic circuit", function () {
  this.timeout(300000);

  it("build_update_basic_input.ts can generate fixtures", function () {
    run("npx", ["ts-node", "scripts/m5/build_update_basic_input.ts"]);
    expect(existsSync("fixtures/m5/update_basic_input_step1.json")).to.equal(true);
    expect(existsSync("fixtures/m5/update_basic_public_expected_step1.json")).to.equal(true);
    expect(existsSync("fixtures/m5/update_basic_input_step2.json")).to.equal(true);
    expect(existsSync("fixtures/m5/update_basic_public_expected_step2.json")).to.equal(true);
    expect(existsSync("fixtures/m5/update_basic_negative_cases/exceeds_limit.json")).to.equal(true);
  });

  it("check_update_basic_circuit.ts passes positive and negative circuit checks", function () {
    run("npx", ["ts-node", "scripts/m5/check_update_basic_circuit.ts"]);
    const report = readFileSync("docs/M5_UPDATE_BASIC_CIRCUIT_REPORT.md", "utf8");
    expect(report).to.include("- circom compile: pass");
    expect(report).to.include("- step1 witness generation: pass");
    expect(report).to.include("- step1 wtns check: pass");
    expect(report).to.include("- step2 witness generation: pass");
    expect(report).to.include("- step2 wtns check: pass");
  });

  it("reports all required negative cases as pass", function () {
    const report = readFileSync("docs/M5_UPDATE_BASIC_CIRCUIT_REPORT.md", "utf8");
    expect(report).to.include("- negative bad_state_path: pass");
    expect(report).to.include("- negative wrong_rtState: pass");
    expect(report).to.include("- negative wrong_N_old: pass");
    expect(report).to.include("- negative wrong_C_new: pass");
    expect(report).to.include("- negative wrong_amountCom: pass");
    expect(report).to.include("- negative wrong_policy_root: pass");
    expect(report).to.include("- negative inactive_status: pass");
    expect(report).to.include("- negative exceeds_limit: pass");
    expect(report).to.include("- C_after_18000 matches M3 appendResults[1].leaf: yes");
    expect(report).to.include("- C_after_36000 matches M3 appendResults[2].leaf: yes");
  });
});
