
import fs from "fs";
import { network } from "hardhat";
import { poseidonContract } from "circomlibjs";

const OUT = "fixtures/m12/contract_gas.json";

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function deployedGas(contract: any): Promise<string> {
  const tx = contract.deploymentTransaction?.();
  if (!tx) return "0";
  const receipt = await tx.wait();
  return receipt.gasUsed.toString();
}

async function deployPoseidonT3(ethers: any) {
  const [deployer] = await ethers.getSigners();
  const poseidonFactory = new ethers.ContractFactory(
    poseidonContract.generateABI(2),
    poseidonContract.createCode(2),
    deployer,
  );
  const poseidon = await poseidonFactory.deploy();
  await poseidon.waitForDeployment();
  return poseidon;
}

async function deployRootRegistry(ethers: any, roots: any) {
  const F = await ethers.getContractFactory("RootRegistry");
  try {
    const c = await F.deploy(roots.rootRegAct, roots.rootStatusAct, roots.rootPolAct);
    await c.waitForDeployment();
    return c;
  } catch (_e) {
    const c = await F.deploy();
    await c.waitForDeployment();
    const tx = await c.setActiveRoots(roots.rootRegAct, roots.rootStatusAct, roots.rootPolAct);
    await tx.wait();
    return c;
  }
}

async function callTx(label: string, variants: (() => Promise<any>)[]) {
  let lastErr: any;
  for (const v of variants) {
    try {
      const tx = await v();
      const r = await tx.wait();
      return { label, gasUsed: r.gasUsed.toString(), transactionHash: r.hash };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`all variants failed for ${label}`);
}

async function estimate(label: string, variants: (() => Promise<any>)[]) {
  let lastErr: any;
  for (const v of variants) {
    try {
      const gas = await v();
      return { label, gas: gas.toString() };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`all estimate variants failed for ${label}`);
}

async function main() {
  fs.mkdirSync("fixtures/m12", { recursive: true });
  const { ethers } = await network.connect();

  const expected = readJson("fixtures/m9/expected_admission_state.json");
  const init = readJson("fixtures/m9/init_call.json").proof;
  const step1 = readJson("fixtures/m9/update_step1_call.json").proof;
  const step2 = readJson("fixtures/m9/update_step2_call.json").proof;

  const poseidon = await deployPoseidonT3(ethers);

  const initVerifier = await ethers.deployContract("InitComplianceStateVerifier");
  await initVerifier.waitForDeployment();

  const updateVerifier = await ethers.deployContract("UpdateComplianceStateVerifier");
  await updateVerifier.waitForDeployment();

  const registry = await deployRootRegistry(ethers, expected.activeRoots);

  const admission = await ethers.deployContract("ComplianceAdmission", [
    await registry.getAddress(),
    await initVerifier.getAddress(),
    await updateVerifier.getAddress(),
    await poseidon.getAddress(),
    expected.treeDepth,
  ]);
  await admission.waitForDeployment();

  const verifyProofGas = {
    init: await estimate("init verifier verifyProof", [
      () => initVerifier.verifyProof.estimateGas(init.a, init.b, init.c, init.publicSignals),
    ]),
    updateStep1: await estimate("update verifier verifyProof step1", [
      () => updateVerifier.verifyProof.estimateGas(step1.a, step1.b, step1.c, step1.publicSignals),
    ]),
    updateStep2: await estimate("update verifier verifyProof step2", [
      () => updateVerifier.verifyProof.estimateGas(step2.a, step2.b, step2.c, step2.publicSignals),
    ]),
  };

  const txGas = {
    initializeState: await callTx("initializeState", [
      () => admission.initializeState(init),
      () => admission.initializeState(init.a, init.b, init.c, init.publicSignals),
    ]),
    updateStateStep1: await callTx("updateState step1", [
      () => admission.updateState(step1),
      () => admission.updateState(step1.a, step1.b, step1.c, step1.publicSignals),
    ]),
    updateStateStep2: await callTx("updateState step2", [
      () => admission.updateState(step2),
      () => admission.updateState(step2.a, step2.b, step2.c, step2.publicSignals),
    ]),
  };

  const deployments = {
    PoseidonT3: { address: await poseidon.getAddress(), gasUsed: await deployedGas(poseidon) },
    InitComplianceStateVerifier: { address: await initVerifier.getAddress(), gasUsed: await deployedGas(initVerifier) },
    UpdateComplianceStateVerifier: { address: await updateVerifier.getAddress(), gasUsed: await deployedGas(updateVerifier) },
    RootRegistry: { address: await registry.getAddress(), gasUsed: await deployedGas(registry) },
    ComplianceAdmission: { address: await admission.getAddress(), gasUsed: await deployedGas(admission) },
  };

  const result = {
    generatedAt: new Date().toISOString(),
    network: "Hardhat local EVM",
    note: "Admission transaction gas includes verifier call, root checks, nullifier checks, state tree append, and storage writes. verifyProof estimates are shown only for breakdown intuition.",
    deployments,
    transactions: txGas,
    verifierEstimates: verifyProofGas,
  };

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`wrote ${OUT}`);
  console.log("measure_contract_gas: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
