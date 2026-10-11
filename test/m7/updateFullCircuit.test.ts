import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

describe("M7 UpdateComplianceStateFull circuit", function () {
  this.timeout(300000);

  it("build_update_full_input.ts can generate fixtures", function () {
    run("npx", ["ts-node", "scripts/m7/build_update_full_input.ts"]);
    expect(existsSync("fixtures/m7/update_full_input_step1.json")).to.equal(true);
    expect(existsSync("fixtures/m7/update_full_public_expected_step1.json")).to.equal(true);
    expect(existsSync("fixtures/m7/update_full_input_step2.json")).to.equal(true);
    expect(existsSync("fixtures/m7/update_full_public_expected_step2.json")).to.equal(true);
    expect(existsSync("fixtures/m7/update_full_negative_cases/wrong_clauseCom_matching_rho.json")).to.equal(true);
    expect(existsSync("fixtures/m7/update_full_negative_cases/exceeds_limit.json")).to.equal(true);
  });

  it("check_update_full_circuit.ts passes positive and negative circuit checks", function () {
    run("npx", ["ts-node", "scripts/m7/check_update_full_circuit.ts"]);
    const report = readFileSync("docs/M7_UPDATE_FULL_CIRCUIT_REPORT.md", "utf8");
    expect(report).to.include("- circom compile: pass");
    expect(report).to.include("- step1 witness generation: pass");
    expect(report).to.include("- step1 wtns check: pass");
    expect(report).to.include("- step2 witness generation: pass");
    expect(report).to.include("- step2 wtns check: pass");
  });

  it("reports all required negative cases and M8 readiness", function () {
    const report = readFileSync("docs/M7_UPDATE_FULL_CIRCUIT_REPORT.md", "utf8");
    expect(report).to.include("- negative wrong_clauseCom: pass");
    expect(report).to.include("- negative wrong_clauseCom_matching_rho: pass");
    expect(report).to.include("- negative wrong_evidenceSalt: pass");
    expect(report).to.include("- negative wrong_rClause: pass");
    expect(report).to.include("- negative step1_wrong_clauseStatus_satisfied: pass");
    expect(report).to.include("- negative step2_wrong_clauseStatus_dummy: pass");
    expect(report).to.include("- negative wrong_actionHash: pass");
    expect(report).to.include("- negative wrong_rho: pass");
    expect(report).to.include("- negative wrong_nonce: pass");
    expect(report).to.include("- negative amount_action_mismatch: pass");
    expect(report).to.include("- negative bad_state_path: pass");
    expect(report).to.include("- negative exceeds_limit: pass");
    expect(report).to.include("- C_after_18000 matches M3 appendResults[1].leaf: yes");
    expect(report).to.include("- C_after_36000 matches M3 appendResults[2].leaf: yes");
    expect(report).to.include("- final update ordering unchanged from M6: yes");
    expect(report).to.include("- ready: yes");
  });
});
