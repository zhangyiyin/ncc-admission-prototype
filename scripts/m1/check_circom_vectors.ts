import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateHashVectors } from "../../entities/common/crypto/testVectors.ts";
import type { RawHashInputs } from "../../entities/common/crypto/testVectors.ts";

const outputKeys = [
  "owner",
  "scopeHash",
  "policyScopeHash",
  "stateCoreHashGen",
  "stateCoreHash1",
  "stateCoreHash2",
  "C_gen",
  "C_state1",
  "C_state2",
  "amountCom1",
  "amountCom2",
  "N_gen",
  "N_old",
  "regLeaf",
  "statusLeaf",
  "policyParamsHash",
  "policyLeaf",
  "actionContextHash1",
  "actionHash1",
  "evidenceDigestDummy",
  "evidenceDigestSatisfied",
  "clauseComDummy",
  "clauseComSatisfied",
  "rho1",
  "merkleNode",
  "zero1",
  "zero2",
  "zero3",
];

function run(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

function signalMap(symPath: string, witnessPath: string): Record<string, string> {
  const witness = JSON.parse(readFileSync(witnessPath, "utf8")) as string[];
  const map: Record<string, string> = {};
  const lines = readFileSync(symPath, "utf8").split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const witnessIndex = Number(parts[1]);
    const name = parts.slice(3).join(",");
    if (!Number.isInteger(witnessIndex) || witnessIndex < 0 || witnessIndex >= witness.length) continue;
    if (name.startsWith("main.")) {
      map[name.slice("main.".length)] = witness[witnessIndex];
    }
  }
  return map;
}

async function main(): Promise<void> {
  mkdirSync("build/m1", { recursive: true });

  const raw = JSON.parse(readFileSync("fixtures/m1/hash-inputs.json", "utf8")) as RawHashInputs;
  const expected = JSON.parse(readFileSync("fixtures/m1/hash-expected.json", "utf8"));
  const live = await generateHashVectors(raw);

  const circomInput: Record<string, string> = {};
  for (const key of [
    "sk_u", "e", "policyID", "gatewayID", "policyVersion", "regScope", "regSalt",
    "statusActive", "statusSalt", "limit", "threshold", "clauseType", "category",
    "chainID", "contractAddr", "nonce1", "nonce2", "receiverDigest", "risk0", "flags0",
    "rGen", "rState1", "rState2", "rAmt1", "rAmt2", "rClauseDummy", "rClauseSatisfied",
    "evidenceSaltDummy", "evidenceSaltSatisfied", "amount1", "amount2"
  ]) {
    circomInput[key] = live.inputs[key];
  }
  writeFileSync("build/m1/hash_vector_input.circom.json", `${JSON.stringify(circomInput, null, 2)}\n`);

  run("circom", ["circuits/test/hash_vector_harness.circom", "--r1cs", "--wasm", "--sym", "-o", "build/m1"]);
  writeFileSync("build/m1/hash_vector_harness_js/package.json", '{"type":"commonjs"}\n');
  run("node", [
    "build/m1/hash_vector_harness_js/generate_witness.js",
    "build/m1/hash_vector_harness_js/hash_vector_harness.wasm",
    "build/m1/hash_vector_input.circom.json",
    "build/m1/hash_vector_harness.wtns",
  ]);
  run("npx", ["snarkjs", "wtns", "export", "json", "build/m1/hash_vector_harness.wtns", "build/m1/hash_vector_harness_witness.json"]);

  const signals = signalMap("build/m1/hash_vector_harness.sym", "build/m1/hash_vector_harness_witness.json");
  const mismatches: string[] = [];
  for (const key of outputKeys) {
    if (signals[key] !== expected.outputs[key]) {
      mismatches.push(`${key}: circom=${signals[key]} expected=${expected.outputs[key]}`);
    }
  }

  if (mismatches.length > 0) {
    console.error("Circom vector comparison failed:");
    for (const line of mismatches) console.error(line);
    process.exit(1);
  }

  console.log("Circom vector comparison: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
