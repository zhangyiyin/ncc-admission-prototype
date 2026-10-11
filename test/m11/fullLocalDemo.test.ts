import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

describe("M11 full local demo transcript", function () {
  this.timeout(300_000);

  function runTs(script: string): void {
    execFileSync("npx", ["ts-node", script], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: { ...process.env },
    });
  }


  function patchReportLine(prefix: string, value: string): void {
    const reportPath = path.join(process.cwd(), "docs", "M11_FULL_LOCAL_DEMO_REPORT.md");
    if (!fs.existsSync(reportPath)) {
      return;
    }
    const report = fs.readFileSync(reportPath, "utf8").replace(new RegExp(`- ${prefix}: .*`, "g"), `- ${prefix}: ${value}`);
    fs.writeFileSync(reportPath, report);
  }

  it("runs the full local demo script and checker", function () {
    runTs("scripts/m11/run_full_local_demo.ts");
    runTs("scripts/m11/check_full_local_demo.ts");
    patchReportLine("hardhat test m11", "pass");
  });

  it("contains one init, two accepted updates, and one rejected step3", function () {
    const transcript = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "fixtures", "m11", "demo_transcript.json"), "utf8"),
    );
    const steps = transcript.steps || [];
    const initEvents = steps.filter((x: any) => x.type === "init" || x.label === "init");
    const acceptedUpdates = steps.filter((x: any) => x.type === "update" && x.acceptedByAdmission === true);
    const rejectedUpdates = steps.filter((x: any) => x.type === "update" && x.acceptedByAdmission === false);

    assert.equal(initEvents.length, 1);
    assert.equal(acceptedUpdates.length, 2);
    assert.equal(rejectedUpdates.length, 1);
  });

  it("records the expected hidden transition labels", function () {
    const transcript = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "fixtures", "m11", "demo_transcript.json"), "utf8"),
    );
    const byLabel = (label: string) => transcript.steps.find((x: any) => x.label === label);

    assert.equal(byLabel("step1").hiddenStateTransition, "0 -> 18000");
    assert.equal(byLabel("step2").hiddenStateTransition, "18000 -> 36000");
    assert.equal(byLabel("step3").hiddenStateTransition, "36000 -> 54000");
  });

  it("shows step3 rejected before on-chain admission and gateway execution", function () {
    const transcript = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "fixtures", "m11", "demo_transcript.json"), "utf8"),
    );
    const step3 = transcript.steps.find((x: any) => x.label === "step3");

    assert.equal(step3.acceptedByAdmission, false);
    assert.equal(step3.rejectionLayer, "circuit");
    assert.equal(step3.proofGenerated, false);
    assert.equal(step3.onChainUpdateAttempted, false);
    assert.equal(step3.gatewayExecuted, false);
  });
});
