import { expect } from "chai";
import { network } from "hardhat";

describe("T0Hello", function () {
  it("returns ping value", async function () {
    const { ethers } = await network.connect();
    const hello = await ethers.deployContract("T0Hello");

    expect(await hello.ping()).to.equal(1n);
  });
});
