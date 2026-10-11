import { createRequire } from "node:module";
import { network } from "hardhat";

const require = createRequire(import.meta.url);
const { poseidonContract } = require("circomlibjs");

const BN254_Q = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

const FORBIDDEN_EVENT_FIELDS = new Set([
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

type BatchInput = {
  batchID: bigint;
  l2ChainID: bigint;
  l1ChainID: bigint;
  admissionContract: string;
  fromStateRoot: bigint;
  toStateRoot: bigint;
  acceptedActionRoot: bigint;
  nullifierDigest: bigint;
  stateCommitmentDigest: bigint;
  count: bigint;
  firstL2Block: bigint;
  lastL2Block: bigint;
  batchStartTime: bigint;
  batchEndTime: bigint;
  batchDigest: bigint;
};

function fail(message: string): never {
  console.error(`check_batch_anchor_contract: fail: ${message}`);
  process.exit(1);
}

function assertEqualBigint(actual: unknown, expected: bigint, label: string): void {
  if (BigInt(actual as bigint) !== expected) {
    fail(`${label} mismatch: got ${String(actual)}, expected ${expected.toString()}`);
  }
}

function assertEqualAddress(actual: unknown, expected: string, label: string): void {
  if (String(actual).toLowerCase() !== expected.toLowerCase()) {
    fail(`${label} mismatch: got ${String(actual)}, expected ${expected}`);
  }
}

async function expectRejected(
  label: string,
  action: () => Promise<unknown>,
  expectedReason?: string,
): Promise<void> {
  try {
    const result: any = await action();
    if (result && typeof result.wait === "function") {
      await result.wait();
    }
  } catch (err) {
    const message = String((err as Error).message ?? err);
    if (expectedReason && !message.includes(expectedReason)) {
      fail(`${label} rejected with unexpected reason: ${message}`);
    }
    return;
  }
  fail(`${label} was not rejected`);
}

function makeSample(overrides: Partial<BatchInput> = {}): BatchInput {
  return {
    batchID: 1n,
    l2ChainID: 31337n,
    l1ChainID: 1n,
    admissionContract: "0x0000000000000000000000000000000000001001",
    fromStateRoot: 111n,
    toStateRoot: 222n,
    acceptedActionRoot: 333n,
    nullifierDigest: 444n,
    stateCommitmentDigest: 555n,
    count: 3n,
    firstL2Block: 1n,
    lastL2Block: 3n,
    batchStartTime: 1700000000n,
    batchEndTime: 1700000300n,
    batchDigest: 0n,
    ...overrides,
  };
}

async function withDigest(anchor: any, input: BatchInput): Promise<BatchInput> {
  const digest = BigInt(await anchor.computeBatchDigest({ ...input, batchDigest: 0n }));
  return { ...input, batchDigest: digest };
}

function checkEventAbi(factory: any): void {
  const eventFragment: any = factory.interface.getEvent("BatchAnchored");
  if (!eventFragment) {
    fail("BatchAnchored event missing");
  }
  for (const input of eventFragment.inputs) {
    const name = String(input.name);
    if (FORBIDDEN_EVENT_FIELDS.has(name)) {
      fail(`BatchAnchored event contains forbidden field: ${name}`);
    }
  }
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

async function main(): Promise<void> {
  const { ethers } = await network.connect();

  const poseidon = await deployPoseidonT3(ethers);

  const BatchAnchor = await ethers.getContractFactory("BatchAnchor");
  checkEventAbi(BatchAnchor);

  const anchor: any = await BatchAnchor.deploy(await poseidon.getAddress());
  await anchor.waitForDeployment();
  const anchorAddress = await anchor.getAddress();

  await expectRejected(
    "zero PoseidonT3 constructor",
    async () => {
      const bad: any = await BatchAnchor.deploy("0x0000000000000000000000000000000000000000");
      return bad.waitForDeployment();
    },
    "zero PoseidonT3",
  );

  const valid = await withDigest(anchor, makeSample());
  if (valid.batchDigest === 0n || valid.batchDigest >= BN254_Q) {
    fail("computed digest must be a non-zero BN254 field element");
  }

  const tx = await anchor.submitBatchAnchor(valid);
  const receipt = await tx.wait();

  assertEqualBigint(await anchor.anchoredBatchDigest(valid.batchID), valid.batchDigest, "anchoredBatchDigest(batchID)");
  if ((await anchor.isAnchoredDigest(valid.batchDigest)) !== true) {
    fail("isAnchoredDigest(computedDigest) must be true");
  }

  let sawEvent = false;
  for (const log of receipt.logs) {
    try {
      const parsed = anchor.interface.parseLog(log);
      if (parsed && parsed.name === "BatchAnchored") {
        sawEvent = true;
        assertEqualBigint(parsed.args.batchID, valid.batchID, "event.batchID");
        assertEqualBigint(parsed.args.batchDigest, valid.batchDigest, "event.batchDigest");
        assertEqualBigint(parsed.args.l2ChainID, valid.l2ChainID, "event.l2ChainID");
        assertEqualBigint(parsed.args.l1ChainID, valid.l1ChainID, "event.l1ChainID");
        assertEqualAddress(parsed.args.admissionContract, valid.admissionContract, "event.admissionContract");
        assertEqualAddress(parsed.args.anchorContract, anchorAddress, "event.anchorContract");
        assertEqualBigint(parsed.args.fromStateRoot, valid.fromStateRoot, "event.fromStateRoot");
        assertEqualBigint(parsed.args.toStateRoot, valid.toStateRoot, "event.toStateRoot");
        assertEqualBigint(parsed.args.acceptedActionRoot, valid.acceptedActionRoot, "event.acceptedActionRoot");
        assertEqualBigint(parsed.args.nullifierDigest, valid.nullifierDigest, "event.nullifierDigest");
        assertEqualBigint(parsed.args.stateCommitmentDigest, valid.stateCommitmentDigest, "event.stateCommitmentDigest");
        assertEqualBigint(parsed.args.count, valid.count, "event.count");
        assertEqualBigint(parsed.args.firstL2Block, valid.firstL2Block, "event.firstL2Block");
        assertEqualBigint(parsed.args.lastL2Block, valid.lastL2Block, "event.lastL2Block");
        assertEqualBigint(parsed.args.batchStartTime, valid.batchStartTime, "event.batchStartTime");
        assertEqualBigint(parsed.args.batchEndTime, valid.batchEndTime, "event.batchEndTime");
      }
    } catch {
      // Ignore logs from other contracts.
    }
  }
  if (!sawEvent) {
    fail("BatchAnchored event not emitted");
  }

  await expectRejected(
    "duplicate batchDigest",
    async () => anchor.submitBatchAnchor(valid),
    "duplicate batchDigest",
  );

  const duplicateBatchID = await withDigest(anchor, makeSample({ lastL2Block: 4n, batchEndTime: 1700000400n }));
  await expectRejected(
    "duplicate batchID",
    async () => anchor.submitBatchAnchor(duplicateBatchID),
    "duplicate batchID",
  );

  await expectRejected(
    "zero batchDigest",
    async () => anchor.submitBatchAnchor(makeSample({ batchID: 2n, batchDigest: 0n })),
    "zero batchDigest",
  );

  await expectRejected(
    "zero admissionContract",
    async () => anchor.submitBatchAnchor(makeSample({ batchID: 3n, admissionContract: "0x0000000000000000000000000000000000000000", batchDigest: 1n })),
    "zero admissionContract",
  );

  await expectRejected(
    "zero count",
    async () => anchor.submitBatchAnchor(makeSample({ batchID: 4n, count: 0n, batchDigest: 1n })),
    "zero count",
  );

  await expectRejected(
    "invalid block window",
    async () => anchor.submitBatchAnchor(makeSample({ batchID: 5n, firstL2Block: 10n, lastL2Block: 3n, batchDigest: 1n })),
    "invalid block window",
  );

  await expectRejected(
    "invalid time window",
    async () => anchor.submitBatchAnchor(makeSample({ batchID: 6n, batchStartTime: 1700000301n, batchEndTime: 1700000300n, batchDigest: 1n })),
    "invalid time window",
  );

  const mismatchBase = await withDigest(anchor, makeSample({ batchID: 7n, lastL2Block: 7n, batchEndTime: 1700000700n }));
  await expectRejected(
    "digest mismatch",
    async () => anchor.submitBatchAnchor({ ...mismatchBase, batchDigest: mismatchBase.batchDigest + 1n }),
    "digest mismatch",
  );

  await expectRejected(
    "field overflow",
    async () => anchor.submitBatchAnchor(makeSample({ batchID: 8n, fromStateRoot: BN254_Q, batchDigest: 1n })),
    "field overflow",
  );

  console.log("check_batch_anchor_contract: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
