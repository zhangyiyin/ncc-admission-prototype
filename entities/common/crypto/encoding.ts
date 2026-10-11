import { getBytes, keccak256, toUtf8Bytes } from "ethers";
import { assertFr, FR_MODULUS } from "./fr.ts";

export function addressToFr(addr: string): bigint {
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    throw new Error(`Invalid EVM address: ${addr}`);
  }
  return assertFr(BigInt(addr));
}

export function uintToFr(x: bigint, bitLimit?: number): bigint {
  if (x < 0n) {
    throw new Error(`Unsigned integer expected, got: ${x.toString()}`);
  }
  if (bitLimit !== undefined) {
    if (!Number.isInteger(bitLimit) || bitLimit <= 0) {
      throw new Error(`Invalid bitLimit: ${bitLimit}`);
    }
    const max = 1n << BigInt(bitLimit);
    if (x >= max) {
      throw new Error(`Value ${x.toString()} exceeds uint${bitLimit}`);
    }
  }
  return assertFr(x);
}

export function chainIdToFr(chainId: bigint): bigint {
  return uintToFr(chainId, 64);
}

export function keccakToFr(input: Uint8Array | string): bigint {
  const bytes = typeof input === "string"
    ? (input.startsWith("0x") ? getBytes(input) : toUtf8Bytes(input))
    : input;
  return BigInt(keccak256(bytes)) % FR_MODULUS;
}
