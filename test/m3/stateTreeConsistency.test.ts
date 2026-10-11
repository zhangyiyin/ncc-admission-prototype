import { expect } from "chai";
import { readFileSync } from "node:fs";
import { network } from "hardhat";
import { poseidonContract } from "circomlibjs";
import { FR_MODULUS } from "../../entities/common/crypto/fr.ts";

type Expected = {
  depth: number;
  emptyRoot: string;
  zeroSchedule: string[];
  appendResults: Array<{ label: string; index: number; leaf: string; oldRoot: string; newRoot: string }>;
  knownRoots: string[];
};

function expectedFixture(): Expected {
  return JSON.parse(readFileSync("fixtures/m3/state_tree_expected.json", "utf8")) as Expected;
}

async function deployPoseidonAndHarness(depth: number) {
  const connection = await network.connect();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  const poseidonFactory = new ethers.ContractFactory(
    poseidonContract.generateABI(2),
    poseidonContract.createCode(2),
    deployer,
  );
  const poseidon = await poseidonFactory.deploy();
  await poseidon.waitForDeployment();

  const harness = await ethers.deployContract("StateTreeHarness", [await poseidon.getAddress(), depth]);
  await harness.waitForDeployment();
  return { harness };
}

async function expectRevert(promise: Promise<unknown>, label: string): Promise<void> {
  let reverted = false;
  try {
    await promise;
  } catch {
    reverted = true;
  }
  expect(reverted, label).to.equal(true);
}

describe("M3 on-chain state tree and off-chain mirror consistency", function () {
  it("deploys StateTreeHarness and matches JS empty root", async function () {
    const expected = expectedFixture();
    const { harness } = await deployPoseidonAndHarness(expected.depth);
    expect(await harness.depth()).to.equal(BigInt(expected.depth));
    expect(await harness.root()).to.equal(BigInt(expected.emptyRoot));
    expect(await harness.nextIndex()).to.equal(0n);
  });

  it("Solidity zero schedule matches JS zero schedule", async function () {
    const expected = expectedFixture();
    const { harness } = await deployPoseidonAndHarness(expected.depth);
    for (let level = 0; level <= expected.depth; level += 1) {
      expect(await harness.zero(level), `zero[${level}]`).to.equal(BigInt(expected.zeroSchedule[level]));
    }
  });

  it("append roots match JS after C_gen, C_after_18000, and C_after_36000", async function () {
    const expected = expectedFixture();
    const { harness } = await deployPoseidonAndHarness(expected.depth);

    for (const item of expected.appendResults) {
      expect(await harness.root(), `oldRoot before ${item.label}`).to.equal(BigInt(item.oldRoot));
      const staticResult = await harness.insert.staticCall(BigInt(item.leaf));
      expect(staticResult[0], `static index ${item.label}`).to.equal(BigInt(item.index));
      expect(staticResult[1], `static root ${item.label}`).to.equal(BigInt(item.newRoot));
      const tx = await harness.insert(BigInt(item.leaf));
      await tx.wait();
      expect(await harness.root(), `root after ${item.label}`).to.equal(BigInt(item.newRoot));
    }

    expect(await harness.nextIndex()).to.equal(3n);
  });

  it("tracks accepted historical roots", async function () {
    const expected = expectedFixture();
    const { harness } = await deployPoseidonAndHarness(expected.depth);

    expect(await harness.isKnownRoot(BigInt(expected.emptyRoot))).to.equal(true);
    for (const item of expected.appendResults) {
      const tx = await harness.insert(BigInt(item.leaf));
      await tx.wait();
      expect(await harness.isKnownRoot(BigInt(item.newRoot)), item.label).to.equal(true);
    }

    expect(await harness.isKnownRoot(123456789n)).to.equal(false);
  });

  it("rejects non-field leaves", async function () {
    const expected = expectedFixture();
    const { harness } = await deployPoseidonAndHarness(expected.depth);
    await expectRevert(harness.insert(FR_MODULUS), "field modulus leaf should revert");
  });

  it("rejects capacity overflow", async function () {
    const { harness } = await deployPoseidonAndHarness(1);
    let tx = await harness.insert(1n);
    await tx.wait();
    tx = await harness.insert(2n);
    await tx.wait();
    await expectRevert(harness.insert(3n), "third insert into depth-1 tree should revert");
  });
});
