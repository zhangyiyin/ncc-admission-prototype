import fs from "node:fs";
import path from "node:path";

const OUT_JSON = "fixtures/anchoring/anchor_cost_estimate.json";
const OUT_TABLE = "fixtures/anchoring/anchor_cost_table.md";
const OUT_DOC = "docs/ANCHORING_COST_ESTIMATE.md";

type CostRow = {
  batchSize: number;
  anchorUsdPerUpdate: string;
  lowUsd: string;
  highUsd: string;
  lowCny: string;
  highCny: string;
};

function fail(message: string): never {
  console.error(`estimate_anchor_costs: fail: ${message}`);
  process.exit(1);
}

function readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    fail(`missing required input: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    fail(`invalid JSON in ${filePath}: ${(err as Error).message}`);
  }
}

function writeText(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text.endsWith("\n") ? text : `${text}\n`);
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function readDecimalEnv(name: string, defaultValue: string): string {
  const value = process.env[name] ?? defaultValue;
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
    fail(`${name} must be a non-negative decimal number`);
  }
  return value;
}

function decimalToNumber(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    fail(`${label} must be a finite non-negative number`);
  }
  return n;
}

function readBatchSizes(): number[] {
  const raw = process.env.BATCH_SIZES ?? "10,100,1000";
  const values = raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  if (values.length === 0) {
    fail("BATCH_SIZES must contain at least one positive integer");
  }
  const sizes = values.map((item) => {
    if (!/^[1-9][0-9]*$/.test(item)) {
      fail(`invalid BATCH_SIZES item: ${item}`);
    }
    const n = Number(item);
    if (!Number.isSafeInteger(n) || n <= 0) {
      fail(`invalid BATCH_SIZES item: ${item}`);
    }
    return n;
  });
  const seen = new Set<number>();
  for (const size of sizes) {
    if (seen.has(size)) {
      fail(`duplicate BATCH_SIZES item: ${size}`);
    }
    seen.add(size);
  }
  return sizes;
}

function readGasString(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    fail(`${label} must be a positive integer decimal string`);
  }
  return value;
}

function readPositiveInt(value: unknown, label: string): number {
  const text = readGasString(value, label);
  const n = Number(text);
  if (!Number.isSafeInteger(n) || n <= 0) {
    fail(`${label} is outside the safe integer range`);
  }
  return n;
}

function formatUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    fail(`invalid cost value: ${value}`);
  }
  return value.toFixed(6);
}

function asRange(low: string, high: string): string {
  return `${low}-${high}`;
}

function computeUsdFromGas(gas: number, l1Gwei: number, ethUsd: number): number {
  return gas * l1Gwei * 1e-9 * ethUsd;
}

function makeCostRows(batchSizes: number[], anchorTotalUsd: number, l2LowUsd: number, l2HighUsd: number, usdCny: number): CostRow[] {
  return batchSizes.map((batchSize) => {
    const anchorUsdPerUpdate = anchorTotalUsd / batchSize;
    const lowUsd = l2LowUsd + anchorUsdPerUpdate;
    const highUsd = l2HighUsd + anchorUsdPerUpdate;
    return {
      batchSize,
      anchorUsdPerUpdate: formatUsd(anchorUsdPerUpdate),
      lowUsd: formatUsd(lowUsd),
      highUsd: formatUsd(highUsd),
      lowCny: formatUsd(lowUsd * usdCny),
      highCny: formatUsd(highUsd * usdCny),
    };
  });
}

function validateInputs(contractGas: any, receipt: any, summary: any): { l1UpdateStep1Gas: number; l1UpdateStep2Gas: number; l1AnchorGas: number } {
  if (String(summary.count) !== "3") {
    fail(`demo batch count must be 3, got ${String(summary.count)}`);
  }
  if (receipt.status !== "pass") {
    fail(`demo anchor receipt status must be pass, got ${String(receipt.status)}`);
  }
  if (!summary.batchDigest || !receipt.batchDigest || String(summary.batchDigest) !== String(receipt.batchDigest)) {
    fail("receipt.batchDigest must equal summary.batchDigest");
  }
  const l1UpdateStep1Gas = readPositiveInt(contractGas.transactions?.updateStateStep1?.gasUsed, "fixtures/m12/contract_gas.json transactions.updateStateStep1.gasUsed");
  const l1UpdateStep2Gas = readPositiveInt(contractGas.transactions?.updateStateStep2?.gasUsed, "fixtures/m12/contract_gas.json transactions.updateStateStep2.gasUsed");
  const l1AnchorGas = readPositiveInt(receipt.submitGasUsed, "fixtures/anchoring/demo_anchor_receipt.json submitGasUsed");
  return { l1UpdateStep1Gas, l1UpdateStep2Gas, l1AnchorGas };
}

function buildTable(estimate: any): string {
  const gas = estimate.sourceGas;
  const costs = estimate.costs;
  const lines: string[] = [];
  lines.push("# Anchor Cost Table");
  lines.push("");
  lines.push("Illustrative parameterized estimate. These values are not real-time market prices.");
  lines.push("");
  lines.push("## Gas inputs");
  lines.push("");
  lines.push("| Item | Gas |");
  lines.push("|---|---:|");
  lines.push(`| L1 updateState step1 | ${gas.l1UpdateStep1Gas} |`);
  lines.push(`| L1 updateState step2 | ${gas.l1UpdateStep2Gas} |`);
  lines.push(`| L1 updateState average | ${gas.l1UpdateAverageGas} |`);
  lines.push(`| L1 BatchAnchor submit | ${gas.l1AnchorGas} |`);
  lines.push("");
  lines.push("## Per-update cost estimate");
  lines.push("");
  lines.push("| Path | Batch size | USD per update | CNY per update | Notes |");
  lines.push("|---|---:|---:|---:|---|");
  lines.push(`| L1 per-update admission | - | ${costs.l1PerUpdateAdmission.usd} | ${costs.l1PerUpdateAdmission.cny} | M12 updateState average gas on L1 parameterization |`);
  lines.push(`| L2 per-update admission | - | ${asRange(costs.l2PerUpdateAdmission.lowUsd, costs.l2PerUpdateAdmission.highUsd)} | ${asRange(costs.l2PerUpdateAdmission.lowCny, costs.l2PerUpdateAdmission.highCny)} | parameterized L2 update estimate |`);
  for (const row of costs.l2PlusL1Anchoring) {
    lines.push(`| L2 + L1 anchor | ${row.batchSize} | ${asRange(row.lowUsd, row.highUsd)} | ${asRange(row.lowCny, row.highCny)} | L2 update + anchor/N |`);
  }
  lines.push("");
  lines.push("## Parameters");
  lines.push("");
  lines.push("| Parameter | Value |");
  lines.push("|---|---:|");
  lines.push(`| ETH_USD | ${estimate.inputs.ethUsd} |`);
  lines.push(`| USD_CNY | ${estimate.inputs.usdCny} |`);
  lines.push(`| L1_GWEI | ${estimate.inputs.l1Gwei} |`);
  lines.push(`| L2_UPDATE_USD_LOW | ${estimate.inputs.l2UpdateUsdLow} |`);
  lines.push(`| L2_UPDATE_USD_HIGH | ${estimate.inputs.l2UpdateUsdHigh} |`);
  lines.push(`| BATCH_SIZES | ${estimate.inputs.batchSizes.join(", ")} |`);
  return lines.join("\n");
}

function buildReport(estimate: any): string {
  const gas = estimate.sourceGas;
  const inputs = estimate.inputs;
  const costs = estimate.costs;
  const anchorRows = costs.l2PlusL1Anchoring.map((row: any) => `| ${row.batchSize} | ${row.anchorUsdPerUpdate} | ${asRange(row.lowUsd, row.highUsd)} | ${asRange(row.lowCny, row.highCny)} |`).join("\n");
  return `# Anchoring Cost Estimate

## 1. Purpose

This report estimates the per-update cost of the first deployment optimization variant. It compares an L1 per-update admission baseline, a parameterized L2 per-update admission path, and a parameterized L2 per-update admission path with amortized L1 batch anchoring.

The estimate is a deployment cost analysis. It is not a change to the admission relation. It does not reduce proof verification work inside the canonical admission layer. The L1 anchor is delayed audit evidence and does not replace L2 admission.

## 2. Source Measurements

The L1 per-update baseline uses the M12 local Hardhat gas measurements for the existing ComplianceAdmission update path.

| Item | Gas |
|---|---:|
| updateState step1 | ${gas.l1UpdateStep1Gas} |
| updateState step2 | ${gas.l1UpdateStep2Gas} |
| updateState average | ${gas.l1UpdateAverageGas} |

The L1 batch anchor input uses the A4 local Hardhat BatchAnchor submit gas.

| Item | Gas |
|---|---:|
| BatchAnchor submit | ${gas.l1AnchorGas} |

The script also checks that the A4 anchor receipt has status pass, that the A4 demo batch count is 3, and that the receipt batch digest matches the demo batch summary digest.

## 3. Parameterization

All price and exchange-rate inputs are explicit parameters. The default values are illustrative examples for sensitivity analysis, not real-time market prices.

| Parameter | Value |
|---|---:|
| ETH_USD | ${inputs.ethUsd} |
| USD_CNY | ${inputs.usdCny} |
| L1_GWEI | ${inputs.l1Gwei} |
| L2_UPDATE_USD_LOW | ${inputs.l2UpdateUsdLow} |
| L2_UPDATE_USD_HIGH | ${inputs.l2UpdateUsdHigh} |
| BATCH_SIZES | ${inputs.batchSizes.join(", ")} |

The L2 update USD low/high values are sensitivity parameters. They are not production benchmarks and should not be cited as current L2 fee quotes. The CNY conversion is also illustrative and parameterized.

## 4. Cost Formulas

The L1 per-update admission estimate is computed as:

\`\`\`text
l1_update_cost_usd =
  l1UpdateGas * L1_GWEI * 1e-9 * ETH_USD
\`\`\`

The L1 anchor cost is computed as:

\`\`\`text
l1_anchor_cost_usd =
  anchorGas * L1_GWEI * 1e-9 * ETH_USD
\`\`\`

For a batch size N, the L2 plus L1 anchoring estimate is:

\`\`\`text
variant_cost_low(N) =
  L2_UPDATE_USD_LOW + l1_anchor_cost_usd / N

variant_cost_high(N) =
  L2_UPDATE_USD_HIGH + l1_anchor_cost_usd / N
\`\`\`

## 5. Estimated Per-Update Costs

| Path | Batch size | USD per update | CNY per update | Notes |
|---|---:|---:|---:|---|
| L1 per-update admission | - | ${costs.l1PerUpdateAdmission.usd} | ${costs.l1PerUpdateAdmission.cny} | M12 updateState average gas under the selected L1 parameters |
| L2 per-update admission | - | ${asRange(costs.l2PerUpdateAdmission.lowUsd, costs.l2PerUpdateAdmission.highUsd)} | ${asRange(costs.l2PerUpdateAdmission.lowCny, costs.l2PerUpdateAdmission.highCny)} | Parameterized L2 update estimate |
${costs.l2PlusL1Anchoring.map((row: any) => `| L2 + L1 anchor | ${row.batchSize} | ${asRange(row.lowUsd, row.highUsd)} | ${asRange(row.lowCny, row.highCny)} | L2 update + anchor/N |`).join("\n")}

The amortized L1 anchor component by batch size is:

| Batch size | Anchor USD per update | Total USD low-high | Total CNY low-high |
|---|---:|---:|---:|
${anchorRows}

## 6. Interpretation

L2 anchoring is a deployment cost optimization. It does not remove per-update proof verification from the canonical admission layer. Each update is still admitted one by one on the canonical L2 or appchain.

The L2 admission layer still verifies proofs, checks active roots, maintains nullifiers, appends hidden state commitments, records accepted state roots, and records accepted action references. The gateway execution basis remains the L2 accepted record and the gateway private package check.

The L1 anchor records a batch summary for audit evidence, final anchoring, and later dispute material. It does not authorize individual updates in the default path, does not replace L2 admission, and does not prove that the batch is valid.

As N increases, the L1 anchor cost per update decreases because the same anchor transaction is amortized over more accepted updates.

## 7. Limitations

This report is a parameterized estimate, not a real-time price fetch. It does not query ETH/USD, gas price, L2 fees, exchange rates, or public testnets.

M12 updateState gas and A4 BatchAnchor submit gas are local Hardhat measurements. They characterize the prototype under the local measurement setup and should not be written as production chain fee conclusions.

The L2 update USD low/high interval is a sensitivity parameter. It is not a production benchmark and not a claim about any specific L2.

This is not C2 batch validity. It is not recursive proof aggregation. The batch digest commits to an accepted L2 transcript summary, but it does not prove that all records inside the batch are valid. Correctness still comes from per-update admission on the canonical L2 layer.

The result can support a thesis or paper deployment optimization argument, especially when comparing direct L1 per-update admission with an L2 real-time admission plus delayed L1 anchoring variant. It should not be framed as a new cryptographic batching mechanism or as a real-world chain fee result.
`;
}

function main(): void {
  const contractGas = readJson("fixtures/m12/contract_gas.json");
  const receipt = readJson("fixtures/anchoring/demo_anchor_receipt.json");
  const summary = readJson("fixtures/anchoring/demo_batch_summary.json");

  const ethUsdText = readDecimalEnv("ETH_USD", "3000");
  const usdCnyText = readDecimalEnv("USD_CNY", "7.2");
  const l1GweiText = readDecimalEnv("L1_GWEI", "15");
  const l2LowText = readDecimalEnv("L2_UPDATE_USD_LOW", "0.001");
  const l2HighText = readDecimalEnv("L2_UPDATE_USD_HIGH", "0.05");
  const batchSizes = readBatchSizes();

  const ethUsd = decimalToNumber(ethUsdText, "ETH_USD");
  const usdCny = decimalToNumber(usdCnyText, "USD_CNY");
  const l1Gwei = decimalToNumber(l1GweiText, "L1_GWEI");
  const l2LowUsd = decimalToNumber(l2LowText, "L2_UPDATE_USD_LOW");
  const l2HighUsd = decimalToNumber(l2HighText, "L2_UPDATE_USD_HIGH");
  if (l2LowUsd > l2HighUsd) {
    fail("L2_UPDATE_USD_LOW must be <= L2_UPDATE_USD_HIGH");
  }

  const { l1UpdateStep1Gas, l1UpdateStep2Gas, l1AnchorGas } = validateInputs(contractGas, receipt, summary);
  const l1UpdateAverageGas = Math.round((l1UpdateStep1Gas + l1UpdateStep2Gas) / 2);
  const l1UpdateUsd = computeUsdFromGas(l1UpdateAverageGas, l1Gwei, ethUsd);
  const anchorTotalUsd = computeUsdFromGas(l1AnchorGas, l1Gwei, ethUsd);
  const l2Rows = makeCostRows(batchSizes, anchorTotalUsd, l2LowUsd, l2HighUsd, usdCny);

  const estimate = {
    status: "pass",
    note: "Illustrative parameterized estimate, not real-time market pricing.",
    inputs: {
      ethUsd: ethUsdText,
      usdCny: usdCnyText,
      l1Gwei: l1GweiText,
      l2UpdateUsdLow: l2LowText,
      l2UpdateUsdHigh: l2HighText,
      batchSizes,
    },
    sourceGas: {
      l1UpdateStep1Gas: String(l1UpdateStep1Gas),
      l1UpdateStep2Gas: String(l1UpdateStep2Gas),
      l1UpdateAverageGas: String(l1UpdateAverageGas),
      l1AnchorGas: String(l1AnchorGas),
    },
    costs: {
      l1PerUpdateAdmission: {
        usd: formatUsd(l1UpdateUsd),
        cny: formatUsd(l1UpdateUsd * usdCny),
      },
      l2PerUpdateAdmission: {
        lowUsd: formatUsd(l2LowUsd),
        highUsd: formatUsd(l2HighUsd),
        lowCny: formatUsd(l2LowUsd * usdCny),
        highCny: formatUsd(l2HighUsd * usdCny),
      },
      l1AnchorTotal: {
        usd: formatUsd(anchorTotalUsd),
        cny: formatUsd(anchorTotalUsd * usdCny),
      },
      l2PlusL1Anchoring: l2Rows,
    },
    validation: {
      demoBatchCount: String(summary.count),
      anchorReceiptStatus: String(receipt.status),
      receiptBatchDigestEqualsSummaryBatchDigest: true,
    },
    interpretation: {
      l1AnchorDoesNotReplaceAdmission: true,
      l2AdmissionStillPerUpdate: true,
      notBatchValidityProof: true,
      noRecursiveProofAggregation: true,
      parametersAreIllustrative: true,
    },
  };

  const tableMarkdown = buildTable(estimate);
  const reportMarkdown = buildReport(estimate);
  writeJson(OUT_JSON, estimate);
  writeText(OUT_TABLE, tableMarkdown);
  writeText(OUT_DOC, reportMarkdown);
  console.log(`wrote ${OUT_JSON}`);
  console.log(`wrote ${OUT_TABLE}`);
  console.log(`wrote ${OUT_DOC}`);
  console.log("estimate_anchor_costs: pass");
}

main();
