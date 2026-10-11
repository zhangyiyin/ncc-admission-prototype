export const FR_MODULUS = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

export function assertFr(x: bigint): bigint {
  if (x < 0n || x >= FR_MODULUS) {
    throw new Error(`Value is not in BN254 scalar field: ${x.toString()}`);
  }
  return x;
}

export function parseFr(x: string | number | bigint): bigint {
  let v: bigint;
  if (typeof x === "bigint") {
    v = x;
  } else if (typeof x === "number") {
    if (!Number.isInteger(x) || !Number.isSafeInteger(x)) {
      throw new Error(`Unsafe or non-integer number cannot be parsed as Fr: ${x}`);
    }
    v = BigInt(x);
  } else {
    const s = x.trim();
    if (!/^[0-9]+$/.test(s)) {
      throw new Error(`Expected decimal field string, got: ${x}`);
    }
    v = BigInt(s);
  }
  return assertFr(v);
}

export function frToDecimal(x: bigint): string {
  return assertFr(x).toString(10);
}

export function frToHex32(x: bigint): string {
  const h = assertFr(x).toString(16);
  return `0x${h.padStart(64, "0")}`;
}
