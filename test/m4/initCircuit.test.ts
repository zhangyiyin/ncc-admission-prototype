import { expect } from "chai";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: "inherit" });
}

describe("M4 InitComplianceState circuit", function () {
  this.timeout(300000);

  it("build_init_circuit_input.ts can generate fixtures", function () {
    run("npx", ["ts-node", "scripts/m4/build_init_circuit_input.ts"]);
    expect(existsSync("fixtures/m4/init_input_user_001.json")).to.equal(true);
    expect(existsSync("fixtures/m4/init_public_expected.json")).to.equal(true);
  });

  it("check_init_circuit.ts passes positive and negative circuit checks", function () {
    run("npx", ["ts-node", "scripts/m4/check_init_circuit.ts"]);
    const report = readFileSync("docs/M4_INIT_CIRCUIT_REPORT.md", "utf8");
    expect(report).to.include("- circom compile: pass");
    expect(report).to.include("- positive witness generation: pass");
    expect(report).to.include("- positive wtns check: pass");
    expect(report).to.include("- negative bad_registration_path: pass");
    expect(report).to.include("- negative inactive_status: pass");
    expect(report).to.include("- negative wrong_policy_root: pass");
    expect(report).to.include("- negative wrong_policy_scope_hash: pass");
    expect(report).to.include("- negative wrong_C_gen: pass");
    expect(report).to.include("- negative wrong_N_gen: pass");
  });
});
