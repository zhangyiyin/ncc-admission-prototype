import { expect } from "chai";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

describe("A8 action-context negative tests and txCount assertion", function () {
  this.timeout(120000);

  it("passes the A8 checker and writes the A8 report", function () {
    const r = spawnSync("npx", ["ts-node", "scripts/a8/check_action_context_negative_and_txcount.ts"], {
      encoding: "utf8",
      shell: false,
    });

    expect(`${r.stdout}\n${r.stderr}`).to.contain("check_action_context_negative_and_txcount: pass");
    expect(r.status).to.equal(0);
    expect(fs.existsSync("docs/A8_ACTION_CONTEXT_NEGATIVE_AND_TXCOUNT_REPORT.md")).to.equal(true);
    expect(fs.existsSync("fixtures/a8/action_context_negative_and_txcount_summary.json")).to.equal(true);
  });
});
