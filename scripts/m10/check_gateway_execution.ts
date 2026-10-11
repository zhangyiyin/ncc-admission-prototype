import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkAcceptedRecordAgainstPackage,
  computeGatewayDigests,
  parseNumberish
} from "../../entities/gateway/gatewayChecker.ts";
import { GatewayExecutionAuthorizer } from "../../entities/gateway/gatewayAuthorizer.ts";
import { createGatewayReceipt } from "../../entities/gateway/gatewayReceipts.ts";
import type {
  AcceptedRecordLike,
  GatewayExecutionPackage
} from "../../entities/gateway/gatewayTypes.ts";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
  console.log(`wrote ${path}`);
}

type M9Expected = {
  stateRoots: {
    afterUpdateStep1: string;
    afterUpdateStep2: string;
  };
  stateIndices: {
    updateStep1: string;
    updateStep2: string;
  };
  records: {
    step1: Record<string, string>;
    step2: Record<string, string>;
  };
};

function makeRecord(raw: Record<string, string>, newStateRoot: string, stateIndex: string): AcceptedRecordLike {
  return {
    exists: true,
    rho: raw.rho,
    N_old: raw.N_old,
    C_new: raw.C_new,
    rtState: raw.rtState,
    newStateRoot,
    actionHash: raw.actionHash,
    amountCom: raw.amountCom,
    clauseCom: raw.clauseCom,
    stateIndex
  };
}

function emptyRecord(rho: string): AcceptedRecordLike {
  return {
    exists: false,
    rho,
    N_old: "0",
    C_new: "0",
    rtState: "0",
    newStateRoot: "0",
    actionHash: "0",
    amountCom: "0",
    clauseCom: "0",
    stateIndex: "0"
  };
}

function buildRecordMap(expected: M9Expected): Map<string, AcceptedRecordLike> {
  const map = new Map<string, AcceptedRecordLike>();
  const step1 = makeRecord(
    expected.records.step1,
    expected.stateRoots.afterUpdateStep1,
    expected.stateIndices.updateStep1
  );
  const step2 = makeRecord(
    expected.records.step2,
    expected.stateRoots.afterUpdateStep2,
    expected.stateIndices.updateStep2
  );
  map.set(parseNumberish(step1.rho).toString(10), step1);
  map.set(parseNumberish(step2.rho).toString(10), step2);
  return map;
}

async function checkPackage(
  pkgPath: string,
  records: Map<string, AcceptedRecordLike>,
  mustAccept: boolean
): Promise<{ pkg: GatewayExecutionPackage; accepted: boolean; failures: string[] }> {
  const pkg = readJson<GatewayExecutionPackage>(pkgPath);
  const key = parseNumberish(pkg.rho).toString(10);
  const record = records.get(key) ?? emptyRecord(pkg.rho);
  const digests = await computeGatewayDigests(pkg);
  const result = checkAcceptedRecordAgainstPackage(pkg, record, digests);

  if (mustAccept && !result.accepted) {
    throw new Error(`${pkgPath}: expected accepted, failures=${result.failures.join(",")}`);
  }
  if (!mustAccept && result.accepted) {
    throw new Error(`${pkgPath}: expected rejection, but package was accepted`);
  }

  return { pkg, accepted: result.accepted, failures: result.failures };
}

async function checkAndWriteReceipt(
  pkgPath: string,
  receiptPath: string,
  records: Map<string, AcceptedRecordLike>,
  authorizer: GatewayExecutionAuthorizer
): Promise<{ pkg: GatewayExecutionPackage; amountComOk: boolean; actionHashOk: boolean; accepted: boolean }> {
  const pkg = readJson<GatewayExecutionPackage>(pkgPath);
  const record = records.get(parseNumberish(pkg.rho).toString(10)) ?? emptyRecord(pkg.rho);
  const digests = await computeGatewayDigests(pkg);
  const authorization = authorizer.authorizeOnce(pkg, record, digests);

  if (!authorization.authorized) {
    throw new Error(`${pkgPath}: expected execution authorization, failures=${authorization.failures.join(",")}`);
  }

  // Any external/business side effect belongs after authorizeOnce().
  writeJson(receiptPath, createGatewayReceipt(pkg, record, authorization.match));

  return {
    pkg,
    amountComOk: authorization.match.checks.amountComMatches,
    actionHashOk: authorization.match.checks.actionHashMatches,
    accepted: authorization.authorized
  };
}

function writeReport(
  step1: any,
  step2: any,
  negatives: Record<string, string>,
  replayRejected: boolean,
  mismatchDidNotConsume: boolean
): void {
  const report = `# M10 Gateway Execution Report

## Status

- build_gateway_packages: pass
- check_gateway_execution: pass
- hardhat compile: pending
- hardhat test m10: pending

## Step1

- rho: ${step1.pkg.rho}
- amountCom recomputed matches record: ${step1.amountComOk ? "yes" : "no"}
- actionHash recomputed matches record: ${step1.actionHashOk ? "yes" : "no"}
- accepted: ${step1.accepted ? "yes" : "no"}

## Step2

- rho: ${step2.pkg.rho}
- amountCom recomputed matches record: ${step2.amountComOk ? "yes" : "no"}
- actionHash recomputed matches record: ${step2.actionHashOk ? "yes" : "no"}
- accepted: ${step2.accepted ? "yes" : "no"}

## Negative cases

${Object.entries(negatives).map(([name, status]) => `- ${name}: ${status}`).join("\n")}

## Architecture

- no Solidity contract changes: yes
- no circuit changes: yes
- no verifier changes: yes
- no proof regeneration: yes
- gateway does not rely on public amount: yes
- execution authorization consumes rho before external side effects: yes
- replayed rho rejected: ${replayRejected ? "yes" : "no"}
- mismatched package does not consume rho: ${mismatchDidNotConsume ? "yes" : "no"}

## Known warnings

- \`executedRhos\` is process-local in-memory state in the current prototype. It does not provide persistence across process restarts or atomic replay protection across multiple gateway processes/instances; a production deployment requires a shared persistent atomic idempotency store.

- Gateway packages and receipts are off-chain local demo artifacts, not public-chain records.
`;
  writeFileSync("docs/M10_GATEWAY_EXECUTION_REPORT.md", report, "utf8");
}

async function main(): Promise<void> {
  mkdirSync("fixtures/m10", { recursive: true });

  const expected = readJson<M9Expected>("fixtures/m9/expected_admission_state.json");
  const records = buildRecordMap(expected);
  const authorizer = new GatewayExecutionAuthorizer();

  // A mismatched package must fail before rho consumption.
  const mismatchPkg = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_negative_cases/wrong_amount.json");
  const mismatchRecord = records.get(parseNumberish(mismatchPkg.rho).toString(10)) ?? emptyRecord(mismatchPkg.rho);
  const mismatchDigests = await computeGatewayDigests(mismatchPkg);
  const mismatchAuthorization = authorizer.authorizeOnce(mismatchPkg, mismatchRecord, mismatchDigests);
  if (mismatchAuthorization.authorized || authorizer.hasExecutedRho(mismatchPkg.rho)) {
    throw new Error("mismatched package unexpectedly consumed rho");
  }
  const mismatchDidNotConsume = true;

  const step1 = await checkAndWriteReceipt(
    "fixtures/m10/gateway_package_step1.json",
    "fixtures/m10/gateway_receipt_step1.json",
    records,
    authorizer
  );
  const step2 = await checkAndWriteReceipt(
    "fixtures/m10/gateway_package_step2.json",
    "fixtures/m10/gateway_receipt_step2.json",
    records,
    authorizer
  );

  const replayPkg = readJson<GatewayExecutionPackage>("fixtures/m10/gateway_package_step1.json");
  const replayRecord = records.get(parseNumberish(replayPkg.rho).toString(10)) ?? emptyRecord(replayPkg.rho);
  const replayDigests = await computeGatewayDigests(replayPkg);
  const replayAuthorization = authorizer.authorizeOnce(replayPkg, replayRecord, replayDigests);
  const replayRejected =
    !replayAuthorization.authorized &&
    replayAuthorization.replay &&
    replayAuthorization.failures.includes("rhoAlreadyExecuted");
  if (!replayRejected) {
    throw new Error("replayed rho was not rejected by execution authorizer");
  }

  const negDir = "fixtures/m10/gateway_negative_cases";
  if (!existsSync(negDir)) {
    throw new Error(`missing negative case directory: ${negDir}`);
  }

  const statuses: Record<string, string> = {};
  const negativeResults: Record<string, { accepted: boolean; failures: string[]; rejectionPoint: string }> = {};
  for (const file of readdirSync(negDir).filter((x) => x.endsWith(".json")).sort()) {
    const name = file.replace(/\.json$/, "");
    const result = await checkPackage(join(negDir, file), records, false);
    statuses[name] = result.accepted ? "fail" : "pass";
    negativeResults[name] = {
      accepted: result.accepted,
      failures: result.failures,
      rejectionPoint: "gateway-side accepted-record matching"
    };
  }

  const required = [
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
    "unaccepted_rho"
  ];
  for (const name of required) {
    if (statuses[name] !== "pass") {
      throw new Error(`negative case did not pass: ${name}`);
    }
  }

  writeJson("fixtures/m10/gateway_negative_results.json", {
    status: "pass",
    caseCount: Object.keys(statuses).length,
    required,
    cases: negativeResults
  });

  writeReport(step1, step2, statuses, replayRejected, mismatchDidNotConsume);
  console.log("check_gateway_execution: pass");
}

main();
