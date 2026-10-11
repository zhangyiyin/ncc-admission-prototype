
import { expect } from "chai";
import fs from "fs";
import { spawnSync } from "child_process";

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

describe("M12 measurement report", function () {
  it("has generated measurement outputs and tables", function () {
    const required = [
      "fixtures/m12/circuit_metrics.json",
      "fixtures/m12/proof_timing.json",
      "fixtures/m12/contract_gas.json",
      "fixtures/m12/gateway_timing.json",
      "fixtures/m12/evaluation_summary.json",
      "fixtures/m12/evaluation_tables.md",
      "docs/M12_MEASUREMENT_SPEC.md",
      "docs/M12_MEASUREMENT_REPORT.md",
    ];
    for (const p of required) {
      expect(fs.existsSync(p), p).to.equal(true);
    }
  });

  it("records expected circuit and demo properties", function () {
    const circuit = readJson("fixtures/m12/circuit_metrics.json");
    const summary = readJson("fixtures/m12/evaluation_summary.json");

    expect(circuit.circuits.InitComplianceState.metrics.totalConstraints).to.be.greaterThan(0);
    expect(circuit.circuits.UpdateComplianceStateFull.metrics.totalConstraints).to.be.greaterThan(
      circuit.circuits.InitComplianceState.metrics.totalConstraints,
    );
    expect(summary.fullDemo.step3Rejected).to.equal(true);
    expect(summary.fullDemo.step3RejectionLayer).to.equal("circuit");
  });

  it("passes the measurement report checker", function () {
    const r = spawnSync("npx", ["ts-node", "scripts/m12/check_measurement_report.ts"], {
      encoding: "utf8",
      shell: false,
    });
    expect(`${r.stdout}\n${r.stderr}`).to.contain("check_measurement_report: pass");
    expect(r.status).to.equal(0);
  });
});
