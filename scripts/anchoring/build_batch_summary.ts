import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { network } from "hardhat";
import {
  BN254_Q,
  computeAcceptedActionRoot,
  computeBatchDigest,
  computeNullifierDigest,
  computeStateCommitmentDigest,
  fieldFromDecimalString,
  isoTimestampToUnixSecondsField,
  summaryToContractInput,
} from "./batch_digest.ts";

const require = createRequire(import.meta.url);
const { poseidonContract } = require("circomlibjs");

const OUT_SUMMARY = "fixtures/anchoring/demo_batch_summary.json";
const OUT_RECEIPT = "fixtures/anchoring/demo_anchor_receipt.json";

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

const ALLOWED_KEYS = new Set([
  "amountCom",
  "containsPlainAmount",
]);

function fail(message: string): never {
  throw new Error(`build_batch_summary: ${message}`);
}

function readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    fail(`missing required artifact: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function assertNoForbiddenKeys(value: unknown, label: string): void {
  for (const key of collectKeys(value)) {
    if (ALLOWED_KEYS.has(key)) continue;
    if (FORBIDDEN_KEYS.has(key)) {
      fail(`${label} contains forbidden key: ${key}`);
    }
  }
}

function requireEq(actual: unknown, expected: unknown, label: string): void {
  if (String(actual) !== String(expected)) {
    fail(`${label} mismatch: got ${String(actual)}, expected ${String(expected)}`);
  }
}

function requireTrue(value: unknown, label: string): void {
  if (value !== true) {
    fail(`${label} must be true`);
  }
}

function requireFalse(value: unknown, label: string): void {
  if (value !== false) {
    fail(`${label} must be false`);
  }
}

function getStep(transcript: any, label: string): any {
  const step = transcript.steps.find((item: any) => item.label === label);
  if (!step) {
    fail(`demo_transcript missing step ${label}`);
  }
  return step;
}

function assertFieldString(value: unknown, label: string): string {
  return fieldFromDecimalString(value, label).toString();
}

function assertAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    fail(`${label} must be an EVM address string`);
  }
  if (/^0x0{40}$/i.test(value)) {
    fail(`${label} must be non-zero`);
  }
  return value;
}

function buildRecords(): any[] {
  const transcript = readJson("fixtures/m11/demo_transcript.json");
  const demoSummary = readJson("fixtures/m11/demo_summary.json");
  const rejectReport = readJson("fixtures/m11/step3_reject_report.json");
  const initInput = readJson("fixtures/m4/init_input_user_001.json");
  const step1Input = readJson("fixtures/m7/update_full_input_step1.json");
  const step2Input = readJson("fixtures/m7/update_full_input_step2.json");

  requireTrue(demoSummary.initAccepted, "demoSummary.initAccepted");
  requireTrue(demoSummary.step1AdmissionAccepted, "demoSummary.step1AdmissionAccepted");
  requireTrue(demoSummary.step1GatewayAccepted, "demoSummary.step1GatewayAccepted");
  requireTrue(demoSummary.step2AdmissionAccepted, "demoSummary.step2AdmissionAccepted");
  requireTrue(demoSummary.step2GatewayAccepted, "demoSummary.step2GatewayAccepted");
  requireTrue(demoSummary.step3Rejected, "demoSummary.step3Rejected");
  requireFalse(demoSummary.step3ProofGenerated, "demoSummary.step3ProofGenerated");
  requireFalse(demoSummary.step3OnChainUpdateAttempted, "demoSummary.step3OnChainUpdateAttempted");
  requireFalse(demoSummary.step3GatewayExecuted, "demoSummary.step3GatewayExecuted");
  requireTrue(rejectReport.rejected, "step3_reject_report.rejected");
  requireFalse(rejectReport.proofGenerated, "step3_reject_report.proofGenerated");
  requireFalse(rejectReport.onChainUpdateAttempted, "step3_reject_report.onChainUpdateAttempted");
  requireFalse(rejectReport.gatewayExecuted, "step3_reject_report.gatewayExecuted");

  const initStep = getStep(transcript, "init");
  const step1 = getStep(transcript, "step1");
  const step2 = getStep(transcript, "step2");

  requireEq(initStep.N_gen, initInput.N_gen, "init N_gen");
  requireEq(initStep.C_gen, initInput.C_gen, "init C_gen");
  requireEq(initStep.newStateRoot, transcript.roots.afterInit, "init newStateRoot");

  requireEq(step1.publicRecord.N_old, step1Input.N_old, "step1 N_old");
  requireEq(step1.publicRecord.C_new, step1Input.C_new, "step1 C_new");
  requireEq(step1.publicRecord.rtState, step1Input.rtState, "step1 rtState");
  requireEq(step1.publicRecord.newStateRoot, transcript.roots.afterStep1, "step1 newStateRoot");
  requireEq(step1.publicRecord.rho, step1Input.rho, "step1 rho");
  requireEq(step1.publicRecord.actionHash, step1Input.actionHash, "step1 actionHash");
  requireEq(step1.publicRecord.amountCom, step1Input.amountCom, "step1 amountCom");
  requireEq(step1.publicRecord.clauseCom, step1Input.clauseCom, "step1 clauseCom");

  requireEq(step2.publicRecord.N_old, step2Input.N_old, "step2 N_old");
  requireEq(step2.publicRecord.C_new, step2Input.C_new, "step2 C_new");
  requireEq(step2.publicRecord.rtState, step2Input.rtState, "step2 rtState");
  requireEq(step2.publicRecord.newStateRoot, transcript.roots.afterStep2, "step2 newStateRoot");
  requireEq(step2.publicRecord.rho, step2Input.rho, "step2 rho");
  requireEq(step2.publicRecord.actionHash, step2Input.actionHash, "step2 actionHash");
  requireEq(step2.publicRecord.amountCom, step2Input.amountCom, "step2 amountCom");
  requireEq(step2.publicRecord.clauseCom, step2Input.clauseCom, "step2 clauseCom");

  requireEq(transcript.roots.afterInit, "6184715872336434441857866957448557330732440228231919952177520071042425498083", "known root after init");
  requireEq(transcript.roots.afterStep1, "18214468675329363424914426193265284265526863822044876243062858448795993613495", "known root after step1");
  requireEq(transcript.roots.afterStep2, "9004445721392407617765566758736899121143153381771154831081323089196260973334", "known root after step2");

  return [
    {
      type: "init",
      recordIndex: "0",
      stateCommitment: assertFieldString(initInput.C_gen, "init.C_gen"),
      stateRootAfter: assertFieldString(transcript.roots.afterInit, "roots.afterInit"),
      nullifier: assertFieldString(initInput.N_gen, "init.N_gen"),
      rho: null,
      actionHash: null,
      amountCom: null,
      clauseCom: null,
    },
    {
      type: "update",
      recordIndex: "1",
      rtState: assertFieldString(step1Input.rtState, "step1.rtState"),
      nullifier: assertFieldString(step1Input.N_old, "step1.N_old"),
      stateCommitment: assertFieldString(step1Input.C_new, "step1.C_new"),
      stateRootAfter: assertFieldString(transcript.roots.afterStep1, "roots.afterStep1"),
      rho: assertFieldString(step1Input.rho, "step1.rho"),
      actionHash: assertFieldString(step1Input.actionHash, "step1.actionHash"),
      amountCom: assertFieldString(step1Input.amountCom, "step1.amountCom"),
      clauseCom: assertFieldString(step1Input.clauseCom, "step1.clauseCom"),
    },
    {
      type: "update",
      recordIndex: "2",
      rtState: assertFieldString(step2Input.rtState, "step2.rtState"),
      nullifier: assertFieldString(step2Input.N_old, "step2.N_old"),
      stateCommitment: assertFieldString(step2Input.C_new, "step2.C_new"),
      stateRootAfter: assertFieldString(transcript.roots.afterStep2, "roots.afterStep2"),
      rho: assertFieldString(step2Input.rho, "step2.rho"),
      actionHash: assertFieldString(step2Input.actionHash, "step2.actionHash"),
      amountCom: assertFieldString(step2Input.amountCom, "step2.amountCom"),
      clauseCom: assertFieldString(step2Input.clauseCom, "step2.clauseCom"),
    },
  ];
}

async function buildSummary(anchorAddress: string): Promise<any> {
  const transcript = readJson("fixtures/m11/demo_transcript.json");
  const gas = readJson("fixtures/m12/contract_gas.json");
  const step1Input = readJson("fixtures/m7/update_full_input_step1.json");
  const records = buildRecords();

  const admissionContract = assertAddress(gas.deployments?.ComplianceAdmission?.address, "M12 ComplianceAdmission address");
  requireEq(step1Input.chainID, "31337", "step1 chainID");

  const summary: any = {
    schemaVersion: "ncc-l2-anchor-batch-summary/v1",
    batchID: "1",
    l2ChainID: "31337",
    l1ChainID: "1",
    admissionContract,
    anchorContract: assertAddress(anchorAddress, "deployed BatchAnchor address"),
    fromStateRoot: assertFieldString(transcript.roots.knownEmptyRoot, "roots.knownEmptyRoot"),
    toStateRoot: assertFieldString(transcript.roots.afterStep2, "roots.afterStep2"),
    acceptedActionRoot: "0",
    nullifierDigest: "0",
    stateCommitmentDigest: "0",
    count: "3",
    firstL2Block: "1",
    lastL2Block: "3",
    batchStartTime: "2026-07-03T00:00:00.000Z",
    batchEndTime: "2026-07-03T00:05:00.000Z",
    batchDigest: "0",
    digestAlgorithm: "poseidon-bn254-field-v1",
    fieldEncoding: "decimal-string-bn254",
    source: {
      baselineCommit: "f910bb1",
      architectureCommit: "728aade",
      demo: "M11 full local demo",
      measurement: "M12 measurement report",
    },
    privacy: {
      forbiddenFieldsExcluded: true,
      containsPlainAmount: false,
      containsOwner: false,
      containsOldStateCommitment: false,
      containsUsedAmount: false,
      containsMerklePaths: false,
      containsUserLevelTag: false,
    },
    records,
  };

  summary.acceptedActionRoot = await computeAcceptedActionRoot(summary.records);
  summary.nullifierDigest = await computeNullifierDigest(summary.records);
  summary.stateCommitmentDigest = await computeStateCommitmentDigest(summary.records);
  summary.batchDigest = await computeBatchDigest(summary);

  if (summary.batchDigest === "0" || BigInt(summary.batchDigest) >= BN254_Q) {
    fail("computed batchDigest must be a non-zero BN254 field element");
  }
  assertNoForbiddenKeys(summary, "demo_batch_summary");
  return summary;
}

async function deployPoseidonT3(ethers: any): Promise<any> {
  const [deployer] = await ethers.getSigners();
  const factory = new ethers.ContractFactory(
    poseidonContract.generateABI(2),
    poseidonContract.createCode(2),
    deployer,
  );
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  return contract;
}

function argToString(value: unknown): string {
  return BigInt(value as bigint).toString();
}

function requireEventField(actual: unknown, expected: string, label: string): void {
  requireEq(argToString(actual), expected, label);
}

async function main(): Promise<void> {
  const { ethers } = await network.connect();

  const poseidon = await deployPoseidonT3(ethers);
  const BatchAnchor = await ethers.getContractFactory("BatchAnchor");
  const anchor: any = await BatchAnchor.deploy(await poseidon.getAddress());
  await anchor.waitForDeployment();
  const anchorAddress = await anchor.getAddress();

  const summary = await buildSummary(anchorAddress);
  const contractInput = summaryToContractInput(summary);

  const computedDigestByContract = BigInt(await anchor.computeBatchDigest(contractInput)).toString();
  if (computedDigestByContract !== summary.batchDigest) {
    fail(`contract digest mismatch: got ${computedDigestByContract}, expected ${summary.batchDigest}`);
  }

  const tx = await anchor.submitBatchAnchor(contractInput);
  const receipt = await tx.wait();

  requireEq(argToString(await anchor.anchoredBatchDigest(BigInt(summary.batchID))), summary.batchDigest, "anchoredBatchDigest");
  if ((await anchor.isAnchoredDigest(BigInt(summary.batchDigest))) !== true) {
    fail("isAnchoredDigest must be true after submitBatchAnchor");
  }

  let parsedEvent: any | undefined;
  for (const log of receipt.logs) {
    try {
      const parsed = anchor.interface.parseLog(log);
      if (parsed && parsed.name === "BatchAnchored") {
        parsedEvent = parsed;
        break;
      }
    } catch {
      // Ignore logs from other contracts.
    }
  }
  if (!parsedEvent) {
    fail("BatchAnchored event not found");
  }

  requireEventField(parsedEvent.args.batchID, summary.batchID, "event.batchID");
  requireEventField(parsedEvent.args.batchDigest, summary.batchDigest, "event.batchDigest");
  requireEventField(parsedEvent.args.l2ChainID, summary.l2ChainID, "event.l2ChainID");
  requireEventField(parsedEvent.args.l1ChainID, summary.l1ChainID, "event.l1ChainID");
  requireEq(String(parsedEvent.args.admissionContract).toLowerCase(), summary.admissionContract.toLowerCase(), "event.admissionContract");
  requireEq(String(parsedEvent.args.anchorContract).toLowerCase(), summary.anchorContract.toLowerCase(), "event.anchorContract");
  requireEventField(parsedEvent.args.fromStateRoot, summary.fromStateRoot, "event.fromStateRoot");
  requireEventField(parsedEvent.args.toStateRoot, summary.toStateRoot, "event.toStateRoot");
  requireEventField(parsedEvent.args.acceptedActionRoot, summary.acceptedActionRoot, "event.acceptedActionRoot");
  requireEventField(parsedEvent.args.nullifierDigest, summary.nullifierDigest, "event.nullifierDigest");
  requireEventField(parsedEvent.args.stateCommitmentDigest, summary.stateCommitmentDigest, "event.stateCommitmentDigest");
  requireEventField(parsedEvent.args.count, summary.count, "event.count");
  requireEventField(parsedEvent.args.firstL2Block, summary.firstL2Block, "event.firstL2Block");
  requireEventField(parsedEvent.args.lastL2Block, summary.lastL2Block, "event.lastL2Block");

  const batchStartTimeUnix = isoTimestampToUnixSecondsField(summary.batchStartTime, "batchStartTime").toString();
  const batchEndTimeUnix = isoTimestampToUnixSecondsField(summary.batchEndTime, "batchEndTime").toString();
  requireEventField(parsedEvent.args.batchStartTime, batchStartTimeUnix, "event.batchStartTime");
  requireEventField(parsedEvent.args.batchEndTime, batchEndTimeUnix, "event.batchEndTime");

  const receiptOut = {
    status: "pass",
    network: "Hardhat local EVM",
    batchID: summary.batchID,
    batchDigest: summary.batchDigest,
    poseidonT3: await poseidon.getAddress(),
    anchorContract: summary.anchorContract,
    admissionContract: summary.admissionContract,
    computedDigestByContract,
    computedDigestByScript: summary.batchDigest,
    submitTransactionHash: tx.hash,
    submitGasUsed: receipt.gasUsed.toString(),
    event: {
      batchID: summary.batchID,
      batchDigest: summary.batchDigest,
      l2ChainID: summary.l2ChainID,
      l1ChainID: summary.l1ChainID,
      admissionContract: summary.admissionContract,
      anchorContract: summary.anchorContract,
      fromStateRoot: summary.fromStateRoot,
      toStateRoot: summary.toStateRoot,
      acceptedActionRoot: summary.acceptedActionRoot,
      nullifierDigest: summary.nullifierDigest,
      stateCommitmentDigest: summary.stateCommitmentDigest,
      count: summary.count,
      firstL2Block: summary.firstL2Block,
      lastL2Block: summary.lastL2Block,
      batchStartTimeUnix,
      batchEndTimeUnix,
    },
    privacy: {
      forbiddenFieldsExcluded: true,
    },
  };

  assertNoForbiddenKeys(receiptOut, "demo_anchor_receipt");
  writeJson(OUT_SUMMARY, summary);
  writeJson(OUT_RECEIPT, receiptOut);

  console.log(`wrote ${OUT_SUMMARY}`);
  console.log(`wrote ${OUT_RECEIPT}`);
  console.log("build_batch_summary: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
