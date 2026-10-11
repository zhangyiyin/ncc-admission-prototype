import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type UpdateInput = Record<string, string>;
type PublicExpected = {
  named: {
    rtState: string;
    N_old: string;
    C_new: string;
    actionHash: string;
    amountCom: string;
    clauseCom: string;
    rho: string;
  };
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
  console.log(`wrote ${path}`);
}

function asAddressHex(decimal: string): string {
  const x = BigInt(decimal);
  const hex = x.toString(16).padStart(40, "0");
  if (hex.length > 40) {
    throw new Error(`contractAddr does not fit uint160: ${decimal}`);
  }
  return `0x${hex}`;
}

function buildPackage(label: "step1" | "step2", input: UpdateInput, expected: PublicExpected) {
  return {
    label,
    rho: expected.named.rho,
    scope: {
      e: input.e,
      policyID: input.policyID,
      gatewayID: input.gatewayID
    },
    execution: {
      amount: input.amount,
      rAmt: input.rAmt,
      nonce: input.nonce,
      category: input.category,
      chainID: input.chainID,
      contractAddr: asAddressHex(input.contractAddr),
      receiverDigest: input.receiverDigest
    },
    expectedPublic: {
      amountCom: expected.named.amountCom,
      actionHash: expected.named.actionHash,
      clauseCom: expected.named.clauseCom,
      C_new: expected.named.C_new,
      N_old: expected.named.N_old,
      rtState: expected.named.rtState
    }
  };
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function withField(base: any, field: string, value: string) {
  const out = clone(base);
  out.label = field;
  if (field === "wrong_rho" || field === "unaccepted_rho") {
    out.rho = value;
  } else if (field === "wrong_policyID") {
    out.scope.policyID = value;
  } else if (field === "wrong_gatewayID") {
    out.scope.gatewayID = value;
  } else {
    out.execution[field.replace("wrong_", "")] = value;
  }
  return out;
}

function writeReport(): void {
  const report = `# M10 Gateway Execution Report

## Status

- build_gateway_packages: pass
- check_gateway_execution: pending
- hardhat compile: pending
- hardhat test m10: pending

## Step1

- rho: pending
- amountCom recomputed matches record: pending
- actionHash recomputed matches record: pending
- accepted: pending

## Step2

- rho: pending
- amountCom recomputed matches record: pending
- actionHash recomputed matches record: pending
- accepted: pending

## Negative cases

- wrong_amount: pending
- wrong_rAmt: pending
- wrong_nonce: pending
- wrong_receiverDigest: pending
- wrong_contractAddr: pending
- wrong_chainID: pending
- wrong_category: pending
- wrong_policyID: pending
- wrong_gatewayID: pending
- wrong_rho: pending
- unaccepted_rho: pending

## Architecture

- no Solidity contract changes: yes
- no circuit changes: yes
- no verifier changes: yes
- no proof regeneration: yes
- gateway does not rely on public amount: yes

## Known warnings

- Gateway packages are off-chain private demo fixtures and must not be treated as public-chain calldata, events, or storage.
`;
  writeFileSync("docs/M10_GATEWAY_EXECUTION_REPORT.md", report, "utf8");
}

function writeSpec(): void {
  const spec = `# M10 Gateway Execution Specification

## Scope

M10 implements an off-chain gateway execution checker. The gateway consumes a private execution package, recomputes the amount and action digests using the M1-R2 hash helpers, reads an accepted record from the M9 admission layer, and checks consistency before producing an off-chain execution receipt.

M10 does not implement new Solidity contracts, new circuits, new Groth16 setup, real bank settlement, real KYC, real source-of-funds systems, gas benchmarks, public testnet deployment, or the full third-withdrawal reject demo.

## Gateway package

The gateway package is off-chain private data. It may contain:

- amount
- rAmt
- nonce
- category
- chainID
- contractAddr
- receiverDigest
- scope identifiers
- rho

These values must not be treated as public-chain calldata, events, or storage.

## Digest recomputation

The gateway computes:

\`\`\`text
scopeHash = hashScope(e, policyID, gatewayID)
amountCom = hashAmount(amount, rAmt, scopeHash, nonce)
actionContextHash = hashActionContext(category, chainID, contractAddr, nonce, receiverDigest)
actionHash = hashAction(scopeHash, amountCom, actionContextHash)
\`\`\`

The implementation must use the existing M1-R2 helpers from \`entities/common/crypto/hashObjects.ts\`. It must not locally reimplement Poseidon input ordering.

## Accepted record check

The gateway looks up \`acceptedRecords[rho]\` in \`ComplianceAdmission\` or a fixture source mirroring M9 accepted records. It checks:

- record exists
- record.rho equals package.rho
- record.amountCom equals recomputed amountCom
- record.actionHash equals recomputed actionHash
- record.clauseCom equals package expected public clauseCom
- record.C_new equals package expected public C_new
- record.N_old equals package expected public N_old
- record.rtState equals package expected public rtState

## Boundary

M10 does not verify Merkle paths, state transitions, threshold policy, source-of-funds clause opening, clauseStatus, evidenceSalt, or rClause. Those are handled by the M7 circuit, M8 verifier, and M9 admission contract.

M10 does not require the Solidity admission contract to recompute amountCom, actionHash, clauseCom, or rho.

## Receipts

Gateway receipts are off-chain execution receipts. They summarize gateway checks and selected private execution debug fields for local testing. They are not public-chain records.

## Negative cases

M10 negative packages cover wrong amount, wrong rAmt, wrong nonce, wrong receiverDigest, wrong contractAddr, wrong chainID, wrong category, wrong policyID, wrong gatewayID, wrong rho, and unaccepted rho. The category, policyID, and gatewayID cases are isolated gateway-side package mismatch tests. They do not represent circuit rejection or admission-contract rejection.
`;
  writeFileSync("docs/M10_GATEWAY_EXECUTION_SPEC.md", spec, "utf8");
}

function main(): void {
  mkdirSync("fixtures/m10/gateway_negative_cases", { recursive: true });
  mkdirSync("scripts/m10", { recursive: true });
  mkdirSync("test/m10", { recursive: true });

  const input1 = readJson<UpdateInput>("fixtures/m7/update_full_input_step1.json");
  const input2 = readJson<UpdateInput>("fixtures/m7/update_full_input_step2.json");
  const pub1 = readJson<PublicExpected>("fixtures/m7/update_full_public_expected_step1.json");
  const pub2 = readJson<PublicExpected>("fixtures/m7/update_full_public_expected_step2.json");

  const step1 = buildPackage("step1", input1, pub1);
  const step2 = buildPackage("step2", input2, pub2);

  writeJson("fixtures/m10/gateway_package_step1.json", step1);
  writeJson("fixtures/m10/gateway_package_step2.json", step2);

  const negatives: Record<string, any> = {
    wrong_amount: withField(step1, "wrong_amount", (BigInt(step1.execution.amount) + 1n).toString()),
    wrong_rAmt: withField(step1, "wrong_rAmt", (BigInt(step1.execution.rAmt) + 1n).toString()),
    wrong_nonce: withField(step1, "wrong_nonce", (BigInt(step1.execution.nonce) + 1n).toString()),
    wrong_receiverDigest: withField(step1, "wrong_receiverDigest", (BigInt(step1.execution.receiverDigest) + 1n).toString()),
    wrong_contractAddr: withField(step1, "wrong_contractAddr", asAddressHex((BigInt(input1.contractAddr) + 1n).toString())),
    wrong_chainID: withField(step1, "wrong_chainID", (BigInt(step1.execution.chainID) + 1n).toString()),
    wrong_category: withField(step1, "wrong_category", (BigInt(step1.execution.category) + 1n).toString()),
    wrong_policyID: withField(step1, "wrong_policyID", (BigInt(step1.scope.policyID) + 1n).toString()),
    wrong_gatewayID: withField(step1, "wrong_gatewayID", (BigInt(step1.scope.gatewayID) + 1n).toString()),
    wrong_rho: withField(step1, "wrong_rho", step2.rho),
    unaccepted_rho: withField(step1, "unaccepted_rho", "123456789012345678901234567890")
  };

  for (const [name, value] of Object.entries(negatives)) {
    writeJson(`fixtures/m10/gateway_negative_cases/${name}.json`, value);
  }

  writeSpec();
  writeReport();

  console.log("build_gateway_packages: pass");
}

main();
