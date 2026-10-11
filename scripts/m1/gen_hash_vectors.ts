import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateHashVectors } from "../../entities/common/crypto/testVectors.ts";
import type { RawHashInputs } from "../../entities/common/crypto/testVectors.ts";

async function main(): Promise<void> {
  mkdirSync("fixtures/m1", { recursive: true });
  mkdirSync("docs", { recursive: true });

  const raw = JSON.parse(readFileSync("fixtures/m1/hash-inputs.json", "utf8")) as RawHashInputs;
  const vectors = await generateHashVectors(raw);
  writeFileSync("fixtures/m1/hash-expected.json", `${JSON.stringify(vectors, null, 2)}\n`);

  writeFileSync("docs/M1_HASH_VECTOR_REPORT.md", `# M1-R2 Hash Vector Report\n\n## Current status\n\n- JS vector generation: pass\n- Circom harness comparison: pending\n- Solidity Poseidon2 comparison: pending\n- Hardhat compile: pending\n- Hardhat test: pending\n\n## Solidity Poseidon\n\nM1-R2 keeps Solidity Poseidon only for the 2-input state-tree node hash. The generated executable bytecode is deployed in tests from circomlibjs \`poseidonContract.createCode(2)\`. The Solidity source file \`contracts/libraries/PoseidonT3.sol\` is an interface for that generated contract.\n`);

  console.log("JS hash vectors generated: fixtures/m1/hash-expected.json");
  console.log("Solidity Poseidon2 deploy bytecode source: circomlibjs poseidonContract.createCode(2)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
