import assert from "node:assert/strict";
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

async function deployAnchor(): Promise<{ ethers: any; BatchAnchor: any; anchor: any; anchorAddress: string }> {
  const { ethers } = await network.connect();
  const poseidon = await deployPoseidonT3(ethers);
  const BatchAnchor = await ethers.getContractFactory("BatchAnchor");
  const anchor: any = await BatchAnchor.deploy(await poseidon.getAddress());
  await anchor.waitForDeployment();
  return { ethers, BatchAnchor, anchor, anchorAddress: await anchor.getAddress() };
}

async function withDigest(anchor: any, input: BatchInput): Promise<BatchInput> {
  const digest = BigInt(await anchor.computeBatchDigest({ ...input, batchDigest: 0n }));
  return { ...input, batchDigest: digest };
}

async function expectRejected(label: string, action: () => Promise<unknown>, expectedReason?: string): Promise<void> {
  try {
    const result: any = await action();
    if (result && typeof result.wait === "function") {
      await result.wait();
    }
  } catch (err) {
    const message = String((err as Error).message ?? err);
    if (expectedReason) {
      assert.ok(message.includes(expectedReason), `${label} rejected with unexpected reason: ${message}`);
    }
    return;
  }
  assert.fail(`${label} was not rejected`);
}

function assertEqualBigint(actual: unknown, expected: bigint, label: string): void {
  assert.equal(BigInt(actual as bigint), expected, label);
}

function assertEqualAddress(actual: unknown, expected: string, label: string): void {
  assert.equal(String(actual).toLowerCase(), expected.toLowerCase(), label);
}

describe("L2-A6 BatchAnchor", function () {
  it("deploys PoseidonT3 and BatchAnchor", async function () {
    const { anchor, anchorAddress } = await deployAnchor();
    assert.match(anchorAddress, /^0x[0-9a-fA-F]{40}$/);
    assert.notEqual(anchorAddress.toLowerCase(), "0x0000000000000000000000000000000000000000");
    assert.match(await anchor.poseidonT3(), /^0x[0-9a-fA-F]{40}$/);
  });

  it("rejects zero PoseidonT3 address in constructor", async function () {
    const { BatchAnchor } = await deployAnchor();
    await expectRejected(
      "zero PoseidonT3 constructor",
      async () => {
        const bad: any = await BatchAnchor.deploy("0x0000000000000000000000000000000000000000");
        return bad.waitForDeployment();
      },
      "zero PoseidonT3",
    );
  });

  it("computes a non-zero BN254 digest, excludes input.batchDigest, and includes address(this)", async function () {
    const { ethers, anchor } = await deployAnchor();
    const sample = makeSample();

    const digestA = BigInt(await anchor.computeBatchDigest({ ...sample, batchDigest: 0n }));
    const digestB = BigInt(await anchor.computeBatchDigest({ ...sample, batchDigest: 123456n }));
    assert.ok(digestA > 0n && digestA < BN254_Q, "digest should be a non-zero BN254 field element");
    assert.equal(digestA, digestB, "computeBatchDigest must not include input.batchDigest");

    const poseidon2 = await deployPoseidonT3(ethers);
    const BatchAnchor = await ethers.getContractFactory("BatchAnchor");
    const secondAnchor: any = await BatchAnchor.deploy(await poseidon2.getAddress());
    await secondAnchor.waitForDeployment();
    const digestSecond = BigInt(await secondAnchor.computeBatchDigest({ ...sample, batchDigest: 0n }));
    assert.notEqual(digestA, digestSecond, "digest must include address(this) as anchorContractField");
  });

  it("accepts a valid submit, records mappings, and emits a matching BatchAnchored event", async function () {
    const { anchor, anchorAddress } = await deployAnchor();
    const valid = await withDigest(anchor, makeSample());

    const tx = await anchor.submitBatchAnchor(valid);
    const receipt = await tx.wait();

    assertEqualBigint(await anchor.anchoredBatchDigest(valid.batchID), valid.batchDigest, "anchoredBatchDigest");
    assert.equal(await anchor.isAnchoredDigest(valid.batchDigest), true, "isAnchoredDigest");

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
        // Ignore non-BatchAnchor logs.
      }
    }
    assert.equal(sawEvent, true, "BatchAnchored event should be emitted");
  });

  it("rejects duplicate batchDigest and duplicate batchID", async function () {
    const { anchor } = await deployAnchor();
    const valid = await withDigest(anchor, makeSample());
    await (await anchor.submitBatchAnchor(valid)).wait();

    await expectRejected("duplicate batchDigest", async () => anchor.submitBatchAnchor(valid), "duplicate batchDigest");

    const duplicateBatchID = await withDigest(anchor, makeSample({ lastL2Block: 4n, batchEndTime: 1700000400n }));
    assert.notEqual(duplicateBatchID.batchDigest, valid.batchDigest, "fixture should isolate duplicate batchID");
    await expectRejected("duplicate batchID", async () => anchor.submitBatchAnchor(duplicateBatchID), "duplicate batchID");
  });

  it("rejects invalid submit inputs", async function () {
    const { anchor } = await deployAnchor();

    await expectRejected(
      "zero batchDigest",
      async () => anchor.submitBatchAnchor(makeSample({ batchID: 2n, batchDigest: 0n })),
      "zero batchDigest",
    );
    await expectRejected(
      "zero admissionContract",
      async () =>
        anchor.submitBatchAnchor(
          makeSample({ batchID: 3n, admissionContract: "0x0000000000000000000000000000000000000000", batchDigest: 1n }),
        ),
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
      async () =>
        anchor.submitBatchAnchor(makeSample({ batchID: 6n, batchStartTime: 1700000301n, batchEndTime: 1700000300n, batchDigest: 1n })),
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
  });

  it("BatchAnchored event ABI contains no forbidden private field names", async function () {
    const { BatchAnchor } = await deployAnchor();
    const eventFragment: any = BatchAnchor.interface.getEvent("BatchAnchored");
    assert.ok(eventFragment, "BatchAnchored event should exist");
    for (const input of eventFragment.inputs) {
      assert.equal(FORBIDDEN_EVENT_FIELDS.has(String(input.name)), false, `forbidden event field: ${String(input.name)}`);
    }
  });
});
