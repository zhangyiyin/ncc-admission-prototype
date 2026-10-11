import { expect } from "chai";
import { readFileSync } from "node:fs";

describe("OJ-CS range soundness audit", function () {
  it("matches every expected boundary outcome", function () {
    const summary = JSON.parse(
      readFileSync("fixtures/ojcs/range_soundness_cases.json", "utf8"),
    );

    expect(summary.allMatched).to.equal(true);

    for (const c of summary.cases) {
      expect(
        c.actualAccepted,
        `unexpected result for ${c.name}`,
      ).to.equal(c.expectedAccepted);

      expect(c.matched).to.equal(true);
    }
  });
});
