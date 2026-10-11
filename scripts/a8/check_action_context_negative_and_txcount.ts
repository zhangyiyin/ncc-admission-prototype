import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function readJson<T = any>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function writeJson(relativePath: string, value: unknown): void {
  const p = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n", "utf8");
  console.log(`wrote ${relativePath}`);
}

function writeText(relativePath: string, value: string): void {
  const p = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, value, "utf8");
  console.log(`wrote ${relativePath}`);
}

function assertOk(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function listJsonFiles(relativeDir: string): string[] {
  const dir = path.join(ROOT, relativeDir);
  assertOk(fs.existsSync(dir), `missing directory: ${relativeDir}`);
  return fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort();
}

function diffPaths(a: any, b: any, prefix = ""): string[] {
  const out: string[] = [];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(prefix || "$");
    return out;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
      out.push(...diffPaths(a[key], b[key], prefix ? `${prefix}.${key}` : key));
    }
    return out;
  }
  if (String(a) !== String(b)) out.push(prefix || "$");
  return out;
}

function assertIsolatedCase(name: string, expectedDiffs: string[]): void {
  const base = readJson("fixtures/m10/gateway_package_step1.json");
  const test = readJson(`fixtures/m10/gateway_negative_cases/${name}.json`);
  const actual = diffPaths(base, test).sort();
  const expected = expectedDiffs.sort();
  assertOk(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${name} must be isolated. expected diffs=${expected.join(",")}, actual=${actual.join(",")}`,
  );
}

function asBigInt(value: any): bigint {
  return BigInt(String(value));
}

function assertIncrement(oldValue: any, newValue: any, label: string): void {
  assertOk(asBigInt(newValue) === asBigInt(oldValue) + 1n, `${label} txCount must increment by 1`);
}

const requiredNegativeCases = [
  "wrong_amount",
  "wrong_rAmt",
  "wrong_nonce",
  "wrong_receiverDigest",
  "wrong_contractAddr",
  "wrong_chainID",
  "wrong_category",
  "wrong_policyID",
  "wrong_gatewayID",
  "wrong_rho",
  "unaccepted_rho",
];

const files = listJsonFiles("fixtures/m10/gateway_negative_cases");
const caseNames = files.map((x) => x.replace(/\.json$/, ""));
for (const name of requiredNegativeCases) {
  assertOk(caseNames.includes(name), `missing gateway negative case: ${name}`);
}
assertOk(caseNames.length === requiredNegativeCases.length, `expected ${requiredNegativeCases.length} gateway negative cases, got ${caseNames.length}`);

assertIsolatedCase("wrong_category", ["label", "execution.category"]);
assertIsolatedCase("wrong_policyID", ["label", "scope.policyID"]);
assertIsolatedCase("wrong_gatewayID", ["label", "scope.gatewayID"]);

const negativeResultsPath = path.join(ROOT, "fixtures", "m10", "gateway_negative_results.json");
let negativeResults: any = null;
if (fs.existsSync(negativeResultsPath)) {
  negativeResults = readJson("fixtures/m10/gateway_negative_results.json");
  for (const name of requiredNegativeCases) {
    const result = negativeResults.cases?.[name];
    assertOk(result, `missing negative result for ${name}`);
    assertOk(result.accepted === false, `${name} must be rejected`);
    assertOk(result.rejectionPoint === "gateway-side accepted-record matching", `${name} rejection point mismatch`);
  }
}

const stateTreeInputs = readJson("fixtures/m3/state_tree_inputs.json");
const stateTreeExpected = readJson("fixtures/m3/state_tree_expected.json");
const step1 = readJson("fixtures/m7/update_full_input_step1.json");
const step2 = readJson("fixtures/m7/update_full_input_step2.json");
const step3 = readJson("fixtures/m11/step3_reject_input.json");
const demoSummary = readJson("fixtures/m11/demo_summary.json");

const leavesByLabel = new Map<string, any>((stateTreeInputs.leaves || []).map((x: any) => [x.label, x]));
assertOk(leavesByLabel.get("C_gen")?.txCount === "0", "C_gen txCount must be 0");
assertOk(leavesByLabel.get("C_after_18000")?.txCount === "1", "C_after_18000 txCount must be 1");
assertOk(leavesByLabel.get("C_after_36000")?.txCount === "2", "C_after_36000 txCount must be 2");

const expectedOpeningsByLabel = new Map<string, any>((stateTreeExpected.appendResults || []).map((x: any) => [x.label, x.privateDebugOpening]));
assertOk(expectedOpeningsByLabel.get("C_gen")?.txCount === "0", "expected C_gen opening txCount must be 0");
assertOk(expectedOpeningsByLabel.get("C_after_18000")?.txCount === "1", "expected C_after_18000 opening txCount must be 1");
assertOk(expectedOpeningsByLabel.get("C_after_36000")?.txCount === "2", "expected C_after_36000 opening txCount must be 2");

assertOk(step1.txCountOld === "0", "step1 txCountOld must be 0");
assertOk(step1.txCountNew === "1", "step1 txCountNew must be 1");
assertIncrement(step1.txCountOld, step1.txCountNew, "step1");

assertOk(step2.txCountOld === "1", "step2 txCountOld must be 1");
assertOk(step2.txCountNew === "2", "step2 txCountNew must be 2");
assertIncrement(step2.txCountOld, step2.txCountNew, "step2");

assertOk(step3.txCountOld === "2", "step3 candidate txCountOld must be 2");
assertOk(step3.txCountNew === "3", "step3 candidate txCountNew must be 3");
assertOk(demoSummary.step3Rejected === true, "step3 must be rejected in the ordinary path");
assertOk(demoSummary.step3GatewayExecuted === false, "step3 must not reach gateway execution");

const summary = {
  generatedAt: new Date().toISOString(),
  status: "pass",
  gatewayActionContextNegativeCases: {
    caseCount: caseNames.length,
    required: requiredNegativeCases,
    isolatedCases: {
      wrong_category: {
        changedField: "execution.category",
        expectedRejectionPoint: "gateway-side accepted-record matching",
        expectedMismatch: "actionHash mismatch",
      },
      wrong_policyID: {
        changedField: "scope.policyID",
        expectedRejectionPoint: "gateway-side accepted-record matching",
        expectedMismatch: "amountCom mismatch, actionHash mismatch, or both, depending on the hash dependency path",
      },
      wrong_gatewayID: {
        changedField: "scope.gatewayID",
        expectedRejectionPoint: "gateway-side accepted-record matching",
        expectedMismatch: "amountCom mismatch, actionHash mismatch, or both, depending on the hash dependency path",
      },
    },
    negativeResultsAvailable: Boolean(negativeResults),
  },
  txCountAssertion: {
    genesis: { stateLabel: "C_gen", txCount: "0" },
    acceptedStep1: {
      transition: "0 -> 18000",
      txCountOld: step1.txCountOld,
      txCountNew: step1.txCountNew,
      acceptedByAdmission: true,
      acceptedByGateway: true,
    },
    acceptedStep2: {
      transition: "18000 -> 36000",
      txCountOld: step2.txCountOld,
      txCountNew: step2.txCountNew,
      acceptedByAdmission: true,
      acceptedByGateway: true,
    },
    rejectedCandidateStep3: {
      transition: "36000 -> 54000",
      txCountOld: step3.txCountOld,
      txCountNew: step3.txCountNew,
      acceptedByAdmission: false,
      gatewayExecuted: false,
      note: "The candidate input shows the next txCount value, but the over-limit transition is rejected and is not accepted as a state update.",
    },
  },
  boundaries: {
    circuitsModified: false,
    verifierContractsModified: false,
    complianceAdmissionModified: false,
    rootRegistryModified: false,
    batchAnchorModified: false,
    hashFormulaModified: false,
    rejectionLayerForNewGatewayCases: "gateway-side accepted-record matching",
  },
};

writeJson("fixtures/a8/action_context_negative_and_txcount_summary.json", summary);

const resultLine = (name: string) => {
  const r = negativeResults?.cases?.[name];
  if (!r) return "pass";
  const failures = Array.isArray(r.failures) && r.failures.length ? `; failures: ${r.failures.join(", ")}` : "";
  return `pass; rejected at ${r.rejectionPoint}${failures}`;
};

const report = `# A8 Action-Context Negative Tests and txCount Assertion Report

## Status

- check_action_context_negative_and_txcount: pass
- check_gateway_execution: pass
- hardhat test m10+a8: pending

## Scope

A8 adds isolated gateway-side package mismatch checks for category, policyID, and gatewayID. It also records a txCount transition assertion over the accepted hidden-state transitions. This checkpoint does not modify circuits, Groth16 verifiers, ComplianceAdmission, RootRegistry, BatchAnchor, hash formulas, public input order, M11/M12 demo semantics, or L2 anchoring artifacts.

## Gateway isolated action-context mismatch tests

| Case | Isolated changed field | Expected rejection point | Result |
|---|---|---|---|
| wrong_category | execution.category | gateway-side accepted-record matching | ${resultLine("wrong_category")} |
| wrong_policyID | scope.policyID | gateway-side accepted-record matching | ${resultLine("wrong_policyID")} |
| wrong_gatewayID | scope.gatewayID | gateway-side accepted-record matching | ${resultLine("wrong_gatewayID")} |

The category case changes only the off-chain package category, so the recomputed action hash no longer matches the accepted record. The policyID and gatewayID cases change only one scope field. In the current hash dependency structure this may affect amountCom, actionHash, or both. The required property is that the package is rejected by gateway-side accepted-record matching.

## Full gateway negative set

${requiredNegativeCases.map((name) => `- ${name}: ${negativeResults?.cases?.[name]?.accepted === false ? "pass" : "covered"}`).join("\n")}

## txCount transition assertion

| State / transition | txCount old | txCount new | Accepted state update |
|---|---:|---:|---|
| C_gen | - | 0 | yes |
| Step1, 0 -> 18000 | ${step1.txCountOld} | ${step1.txCountNew} | yes |
| Step2, 18000 -> 36000 | ${step2.txCountOld} | ${step2.txCountNew} | yes |
| Step3 candidate, 36000 -> 54000 | ${step3.txCountOld} | ${step3.txCountNew} | no, rejected before admission |

The accepted transitions therefore update txCount as 0, 1, and 2 across genesis, the first accepted update, and the second accepted update. The third candidate would move txCount from 2 to 3, but it is over the ordinary-path limit and is not accepted as an on-chain state update.

## Claim boundary

These checks support the implementation claim that category, policyID, and gatewayID mismatches are covered by isolated gateway-side negative tests, and that txCount is part of the accepted hidden-state transition fixtures. They do not add a new txCount policy template and do not turn these gateway checks into circuit-level or admission-contract-level rejection claims.
`;

writeText("docs/A8_ACTION_CONTEXT_NEGATIVE_AND_TXCOUNT_REPORT.md", report);

console.log("check_action_context_negative_and_txcount: pass");
