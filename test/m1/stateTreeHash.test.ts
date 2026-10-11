import { expect } from "chai";
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import * as circomlibjs from "circomlibjs";

async function deployPoseidon2(ethers: any, signer: any): Promise<any> {
  const { poseidonContract } = circomlibjs as any;
  const factory = new ethers.ContractFactory(
    poseidonContract.generateABI(2),
    poseidonContract.createCode(2),
    signer,
  );
  const poseidon = await factory.deploy();
  await poseidon.waitForDeployment();
  return poseidon;
}

describe("StateTreeHashHarness", function () {
  it("matches JS Poseidon2 Merkle node and zero schedule", async function () {
    const expected = JSON.parse(readFileSync("fixtures/m1/hash-expected.json", "utf8"));
    const { ethers } = await network.create();
    const [signer] = await ethers.getSigners();
    const poseidon = await deployPoseidon2(ethers, signer);
    const harness = await ethers.deployContract("StateTreeHashHarness", [await poseidon.getAddress()]);

    const node = await harness.hashMerkleNode(BigInt(expected.outputs.C_gen), BigInt(expected.outputs.C_state1));
    expect(node).to.equal(BigInt(expected.outputs.merkleNode));

    const zeroSchedule = await harness.zeroSchedule3();
    expect(zeroSchedule[0]).to.equal(BigInt(expected.outputs.zero1));
    expect(zeroSchedule[1]).to.equal(BigInt(expected.outputs.zero2));
    expect(zeroSchedule[2]).to.equal(BigInt(expected.outputs.zero3));
  });
});
