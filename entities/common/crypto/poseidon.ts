import { assertFr } from "./fr.ts";

let poseidonPromise: Promise<any> | undefined;

export async function getPoseidon(): Promise<any> {
  if (!poseidonPromise) {
    poseidonPromise = import("circomlibjs").then((mod: any) => mod.buildPoseidon());
  }
  return poseidonPromise;
}

export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  if (inputs.length === 0) {
    throw new Error("Poseidon input must not be empty");
  }
  const normalized = inputs.map(assertFr);
  const poseidon = await getPoseidon();
  const out = poseidon(normalized);
  return assertFr(BigInt(poseidon.F.toString(out)));
}
