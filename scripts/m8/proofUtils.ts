import { existsSync, readFileSync } from "node:fs";

export const FR_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

export type SolidityProofArgs = {
  a: [string, string];
  b: [[string, string], [string, string]];
  c: [string, string];
  publicSignals: string[];
};

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function requirePath(path: string, label = path): void {
  if (!existsSync(path)) {
    throw new Error(`${label} does not exist: ${path}`);
  }
}

export function readProofForSolidity(proofPath: string, publicPath: string): SolidityProofArgs {
  const proof = readJson<any>(proofPath);
  const publicSignals = readJson<string[]>(publicPath);

  if (!Array.isArray(proof.pi_a) || !Array.isArray(proof.pi_b) || !Array.isArray(proof.pi_c)) {
    throw new Error(`invalid snarkjs proof shape: ${proofPath}`);
  }
  if (!Array.isArray(publicSignals)) {
    throw new Error(`invalid public signals shape: ${publicPath}`);
  }

  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]]
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
    publicSignals
  };
}

export function modifiedPublicSignals(publicSignals: string[]): string[] {
  if (publicSignals.length === 0) {
    throw new Error("cannot modify empty public signal array");
  }
  const out = [...publicSignals];
  out[0] = ((BigInt(out[0]) + 1n) % FR_MODULUS).toString();
  return out;
}

export function assertPublicSignalsEqual(actualPath: string, expectedPath: string, label: string): void {
  const actual = readJson<string[]>(actualPath);
  const expectedJson = readJson<any>(expectedPath);
  const expected = expectedJson.publicInputs;

  if (!Array.isArray(actual)) {
    throw new Error(`${label}: actual public.json is not an array`);
  }
  if (!Array.isArray(expected)) {
    throw new Error(`${label}: expected fixture has no publicInputs array`);
  }

  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${label}: public input ordering/value mismatch\nactual=${a}\nexpected=${e}`);
  }
}
