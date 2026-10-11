import { readFileSync } from "node:fs";
import { network } from "hardhat";
import * as circomlibjs from "circomlibjs";

function assertEqual(name: string, actual: bigint, expected: string): void {
  if (actual !== BigInt(expected)) {
    throw new Error(`${name} mismatch: actual=${actual.toString()} expected=${expected}`);
  }
}

async function main(): Promise<void> {
  const expected = JSON.parse(readFileSync("fixtures/m1/hash-expected.json", "utf8"));
  const { ethers } = await network.create();
  const [signer] = await ethers.getSigners();

  const { poseidonContract } = circomlibjs as any;
  const poseidonFactory = new ethers.ContractFactory(
    poseidonContract.generateABI(2),
    poseidonContract.createCode(2),
    signer,
  );
  const poseidon = await poseidonFactory.deploy();
  await poseidon.waitForDeployment();

  const harness = await ethers.deployContract("StateTreeHashHarness", [await poseidon.getAddress()]);

  const node = await harness.hashMerkleNode(BigInt(expected.outputs.C_gen), BigInt(expected.outputs.C_state1));
  assertEqual("merkleNode", node, expected.outputs.merkleNode);

  const zeroSchedule = await harness.zeroSchedule3();
  assertEqual("zero1", zeroSchedule[0], expected.outputs.zero1);
  assertEqual("zero2", zeroSchedule[1], expected.outputs.zero2);
  assertEqual("zero3", zeroSchedule[2], expected.outputs.zero3);

  console.log("Solidity Poseidon2 comparison: pass");
}

main().catch((err) => {
  console.error(err);
  console.error("Solidity Poseidon2 comparison: fail");
  process.exit(1);
});
