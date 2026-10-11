import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

describe("M6 UpdateComplianceStateAction circuit", function () {
  this.timeout(300000);

  it("build_update_action_input.ts can generate fixtures", function () {
    run("npx", ["ts-node", "scripts/m6/build_update_action_input.ts"]);
    expect(existsSync("fixtures/m6/update_action_input_step1.json")).to.equal(true);
    expect(existsSync("fixtures/m6/update_action_public_expected_step1.json")).to.equal(true);
    expect(existsSync("fixtures/m6/update_action_input_step2.json")).to.equal(true);
    expect(existsSync("fixtures/m6/update_action_public_expected_step2.json")).to.equal(true);
    expect(existsSync("fixtures/m6/update_action_negative_cases/exceeds_limit.json")).to.equal(true);
  });

  it("check_update_action_circuit.ts passes positive and negative circuit checks", function () {
    run("npx", ["ts-node", "scripts/m6/check_update_action_circuit.ts"]);
    const report = readFileSync("docs/M6_UPDATE_ACTION_CIRCUIT_REPORT.md", "utf8");
    expect(report).to.include("- circom compile: pass");
    expect(report).to.include("- step1 witness generation: pass");
    expect(report).to.include("- step1 wtns check: pass");
    expect(report).to.include("- step2 witness generation: pass");
    expect(report).to.include("- step2 wtns check: pass");
  });

  it("reports all required negative cases and M6 limitation", function () {
    const report = readFileSync("docs/M6_UPDATE_ACTION_CIRCUIT_REPORT.md", "utf8");
    expect(report).to.include("- negative wrong_actionHash: pass");
    expect(report).to.include("- negative wrong_rho: pass");
    expect(report).to.include("- negative wrong_clauseCom: pass");
    expect(report).to.include("- negative wrong_receiverDigest: pass");
    expect(report).to.include("- negative wrong_contractAddr: pass");
    expect(report).to.include("- negative wrong_chainID: pass");
    expect(report).to.include("- negative wrong_nonce: pass");
    expect(report).to.include("- negative amount_action_mismatch: pass");
    expect(report).to.include("- negative bad_state_path: pass");
    expect(report).to.include("- negative exceeds_limit: pass");
    expect(report).to.include("- C_after_18000 matches M3 appendResults[1].leaf: yes");
    expect(report).to.include("- C_after_36000 matches M3 appendResults[2].leaf: yes");
    expect(report).to.include("clauseCom formula is not validated until M7");
  });
});
