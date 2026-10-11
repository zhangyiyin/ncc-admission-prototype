import assert from "node:assert/strict";
import fs from "node:fs";
import {
  computeAcceptedActionRoot,
  computeBatchDigest,
  computeNullifierDigest,
  computeStateCommitmentDigest,
  summaryToContractInput,
} from "../../scripts/anchoring/batch_digest.ts";

const EMPTY_ROOT = "21551820661461729022865262380882070649935529853313286572328683688269863701601";
const STEP2_FINAL_ROOT = "9004445721392407617765566758736899121143153381771154831081323089196260973334";

const FORBIDDEN_KEYS = new Set([
  "amount",
  "plainAmount",
  "withdrawAmount",
  "rAmt",
  "r_amt",
  "owner",
  "owner_u",
  "sk_u",
  "secretKey",
  "C_old",
  "oldStateCommitment",
  "usedAmountOld",
  "usedAmountNew",
  "usedAmount",
  "merklePath",
  "path_state",
  "regPath",
  "statusPath",
  "policyPath",
  "linkableID",
  "linkableId",
  "nym",
  "userTag",
  "userLevelTag",
  "aggregationTag",
]);

const MARKDOWN_SCAN_FILES = [
  "fixtures/anchoring/anchor_cost_table.md",
  "docs/ANCHORING_COST_ESTIMATE.md",
  "docs/BATCH_SUMMARY_SCHEMA.md",
  "docs/DEPLOYMENT_VARIANT_L2_BATCH_ANCHORING.md",
];

function readJson(path: string): any {
  assert.equal(fs.existsSync(path), true, `${path} should exist`);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function assertNoForbiddenJsonKeys(value: unknown, label: string): void {
  for (const key of collectKeys(value)) {
    assert.equal(FORBIDDEN_KEYS.has(key), false, `${label} contains forbidden public key: ${key}`);
  }
}

function assertNoForbiddenMarkdownFields(path: string): void {
  const text = fs.readFileSync(path, "utf8");
  for (const key of FORBIDDEN_KEYS) {
    const jsonKeyPattern = new RegExp(`["']${key}["']\\s*:`);
    const tableFieldPattern = new RegExp(`\\|\\s*${key}\\s*\\|`);
    assert.equal(jsonKeyPattern.test(text), false, `${path} exposes ${key} as a JSON-style field`);
    assert.equal(tableFieldPattern.test(text), false, `${path} exposes ${key} as a table field`);
  }
}

function to6(value: number): string {
  return value.toFixed(6);
}

function assertCostEstimateFormula(cost: any): void {
  const ethUsd = Number(cost.inputs.ethUsd);
  const usdCny = Number(cost.inputs.usdCny);
  const l1Gwei = Number(cost.inputs.l1Gwei);
  const l2Low = Number(cost.inputs.l2UpdateUsdLow);
  const l2High = Number(cost.inputs.l2UpdateUsdHigh);

  const step1Gas = Number(cost.sourceGas.l1UpdateStep1Gas);
  const step2Gas = Number(cost.sourceGas.l1UpdateStep2Gas);
  const avgGas = Math.round((step1Gas + step2Gas) / 2);
  const anchorGas = Number(cost.sourceGas.l1AnchorGas);

  assert.equal(cost.sourceGas.l1UpdateAverageGas, String(avgGas));
  const l1Usd = avgGas * l1Gwei * 1e-9 * ethUsd;
  assert.equal(cost.costs.l1PerUpdateAdmission.usd, to6(l1Usd));
  assert.equal(cost.costs.l1PerUpdateAdmission.cny, to6(l1Usd * usdCny));

  assert.equal(cost.costs.l2PerUpdateAdmission.lowUsd, to6(l2Low));
  assert.equal(cost.costs.l2PerUpdateAdmission.highUsd, to6(l2High));
  assert.equal(cost.costs.l2PerUpdateAdmission.lowCny, to6(l2Low * usdCny));
  assert.equal(cost.costs.l2PerUpdateAdmission.highCny, to6(l2High * usdCny));

  const anchorUsd = anchorGas * l1Gwei * 1e-9 * ethUsd;
  for (const row of cost.costs.l2PlusL1Anchoring) {
    const n = Number(row.batchSize);
    const anchorPerUpdate = anchorUsd / n;
    const lowUsd = l2Low + anchorPerUpdate;
    const highUsd = l2High + anchorPerUpdate;
    assert.equal(row.anchorUsdPerUpdate, to6(anchorPerUpdate), `anchor per update N=${n}`);
    assert.equal(row.lowUsd, to6(lowUsd), `low USD N=${n}`);
    assert.equal(row.highUsd, to6(highUsd), `high USD N=${n}`);
    assert.equal(row.lowCny, to6(lowUsd * usdCny), `low CNY N=${n}`);
    assert.equal(row.highCny, to6(highUsd * usdCny), `high CNY N=${n}`);
  }
}

describe("L2-A6 batch summary and anchoring outputs", function () {
  it("loads required A4 and A5 public fixtures", function () {
    readJson("fixtures/anchoring/demo_batch_summary.json");
    readJson("fixtures/anchoring/demo_anchor_receipt.json");
    readJson("fixtures/anchoring/anchor_cost_estimate.json");
  });

  it("checks summary identity, count, ordering, and state roots", function () {
    const summary = readJson("fixtures/anchoring/demo_batch_summary.json");
    assert.equal(summary.schemaVersion, "ncc-l2-anchor-batch-summary/v1");
    assert.equal(summary.digestAlgorithm, "poseidon-bn254-field-v1");
    assert.equal(summary.fieldEncoding, "decimal-string-bn254");
    assert.equal(summary.count, "3");
    assert.equal(summary.records.length, 3);
    assert.deepEqual(summary.records.map((record: any) => record.type), ["init", "update", "update"]);
    assert.deepEqual(summary.records.map((record: any) => record.recordIndex), ["0", "1", "2"]);
    assert.equal(JSON.stringify(summary.records).includes("step3"), false, "rejected step3 should be absent");
    assert.equal(summary.fromStateRoot, EMPTY_ROOT);
    assert.equal(summary.toStateRoot, STEP2_FINAL_ROOT);
  });

  it("recomputes summary digests and converts ISO timestamps to Unix seconds", async function () {
    const summary = readJson("fixtures/anchoring/demo_batch_summary.json");
    assert.equal(await computeAcceptedActionRoot(summary.records), summary.acceptedActionRoot);
    assert.equal(await computeNullifierDigest(summary.records), summary.nullifierDigest);
    assert.equal(await computeStateCommitmentDigest(summary.records), summary.stateCommitmentDigest);
    assert.equal(await computeBatchDigest(summary), summary.batchDigest);

    const input = summaryToContractInput(summary);
    assert.equal(input.batchStartTime.toString(), String(Math.floor(Date.parse(summary.batchStartTime) / 1000)));
    assert.equal(input.batchEndTime.toString(), String(Math.floor(Date.parse(summary.batchEndTime) / 1000)));
  });

  it("checks anchor receipt fields against summary", function () {
    const summary = readJson("fixtures/anchoring/demo_batch_summary.json");
    const receipt = readJson("fixtures/anchoring/demo_anchor_receipt.json");
    assert.equal(receipt.status, "pass");
    assert.equal(receipt.batchDigest, summary.batchDigest);
    assert.equal(receipt.computedDigestByContract, summary.batchDigest);
    assert.equal(receipt.computedDigestByScript, summary.batchDigest);

    for (const key of [
      "batchID",
      "batchDigest",
      "l2ChainID",
      "l1ChainID",
      "admissionContract",
      "anchorContract",
      "fromStateRoot",
      "toStateRoot",
      "acceptedActionRoot",
      "nullifierDigest",
      "stateCommitmentDigest",
      "count",
      "firstL2Block",
      "lastL2Block",
    ]) {
      assert.equal(receipt.event[key], summary[key], `receipt.event.${key}`);
    }
  });

  it("checks cost estimate source gas, batch sizes, and formulas", function () {
    const gas = readJson("fixtures/m12/contract_gas.json");
    const receipt = readJson("fixtures/anchoring/demo_anchor_receipt.json");
    const cost = readJson("fixtures/anchoring/anchor_cost_estimate.json");
    assert.equal(cost.status, "pass");
    assert.equal(cost.sourceGas.l1UpdateStep1Gas, gas.transactions.updateStateStep1.gasUsed);
    assert.equal(cost.sourceGas.l1UpdateStep2Gas, gas.transactions.updateStateStep2.gasUsed);
    assert.equal(cost.sourceGas.l1AnchorGas, receipt.submitGasUsed);
    assert.deepEqual(cost.inputs.batchSizes, [10, 100, 1000]);
    assert.deepEqual(cost.costs.l2PlusL1Anchoring.map((row: any) => row.batchSize), [10, 100, 1000]);
    assert.equal(cost.interpretation.parametersAreIllustrative, true);
    assert.equal(cost.interpretation.l1AnchorDoesNotReplaceAdmission, true);
    assert.equal(cost.interpretation.l2AdmissionStillPerUpdate, true);
    assert.equal(cost.interpretation.notBatchValidityProof, true);
    assertCostEstimateFormula(cost);
  });

  it("scans public JSON fixtures and Markdown field positions for forbidden private keys", function () {
    for (const path of [
      "fixtures/anchoring/demo_batch_summary.json",
      "fixtures/anchoring/demo_anchor_receipt.json",
      "fixtures/anchoring/anchor_cost_estimate.json",
    ]) {
      assertNoForbiddenJsonKeys(readJson(path), path);
    }
    for (const path of MARKDOWN_SCAN_FILES) {
      assertNoForbiddenMarkdownFields(path);
    }
  });
});
