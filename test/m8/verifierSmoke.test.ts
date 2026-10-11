import { expect } from "chai";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import hre from "hardhat";
import { modifiedPublicSignals, readProofForSolidity } from "../../scripts/m8/proofUtils";

const ROOT = process.cwd();

function markReportAfterSmoke(): void {
  const path = join(ROOT, "docs/M8_VERIFIER_GENERATION_REPORT.md");
  if (!existsSync(path)) {
    return;
  }
  let s = readFileSync(path, "utf8");
  s = s.replace("- hardhat compile: pending", "- hardhat compile: pass");
  s = s.replace("- hardhat test m8: pending", "- hardhat test m8: pass");
  s = s.replace("- Solidity verify: pending", "- Solidity verify: pass");
  s = s.replace("- step1 Solidity verify: pending", "- step1 Solidity verify: pass");
  s = s.replace("- step2 Solidity verify: pending", "- step2 Solidity verify: pass");
  s = s.replace("- init modified public input rejected: pending", "- init modified public input rejected: pass");
  s = s.replace("- update modified public input rejected: pending", "- update modified public input rejected: pass");
  writeFileSync(path, s, "utf8");
}

describe("M8 Groth16 Solidity verifier smoke tests", function () {
  this.timeout(120000);

  it("deploys verifiers, accepts valid proofs, and rejects modified public inputs", async function () {
    const { ethers } = await hre.network.connect();

    const InitFactory = await ethers.getContractFactory("InitComplianceStateVerifier");
    const UpdateFactory = await ethers.getContractFactory("UpdateComplianceStateVerifier");

    const initVerifier = await InitFactory.deploy();
    await initVerifier.waitForDeployment();

    const updateVerifier = await UpdateFactory.deploy();
    await updateVerifier.waitForDeployment();

    const initArgs = readProofForSolidity(
      "run_artifacts/m8/proofs/init/proof.json",
      "run_artifacts/m8/proofs/init/public.json"
    );
    const updateStep1Args = readProofForSolidity(
      "run_artifacts/m8/proofs/update_step1/proof.json",
      "run_artifacts/m8/proofs/update_step1/public.json"
    );
    const updateStep2Args = readProofForSolidity(
      "run_artifacts/m8/proofs/update_step2/proof.json",
      "run_artifacts/m8/proofs/update_step2/public.json"
    );

    expect(
      await initVerifier.verifyProof(
        initArgs.a,
        initArgs.b,
        initArgs.c,
        initArgs.publicSignals
      )
    ).to.equal(true);

    expect(
      await updateVerifier.verifyProof(
        updateStep1Args.a,
        updateStep1Args.b,
        updateStep1Args.c,
        updateStep1Args.publicSignals
      )
    ).to.equal(true);

    expect(
      await updateVerifier.verifyProof(
        updateStep2Args.a,
        updateStep2Args.b,
        updateStep2Args.c,
        updateStep2Args.publicSignals
      )
    ).to.equal(true);

    expect(
      await initVerifier.verifyProof(
        initArgs.a,
        initArgs.b,
        initArgs.c,
        modifiedPublicSignals(initArgs.publicSignals)
      )
    ).to.equal(false);

    expect(
      await updateVerifier.verifyProof(
        updateStep1Args.a,
        updateStep1Args.b,
        updateStep1Args.c,
        modifiedPublicSignals(updateStep1Args.publicSignals)
      )
    ).to.equal(false);

    markReportAfterSmoke();
  });
});
