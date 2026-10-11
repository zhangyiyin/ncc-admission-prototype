import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildPoseidon } = require("circomlibjs");

export const BN254_Q = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");

export const TAGS = {
  TAG_BATCH_FOLD_INIT: 2000n,
  TAG_BATCH_ACTIONS: 2001n,
  TAG_BATCH_NULLIFIERS: 2002n,
  TAG_BATCH_STATE_COMS: 2003n,
  TAG_BATCH_WINDOW: 2004n,
  TAG_BATCH_CONTRACTS: 2005n,
  TAG_BATCH_TIME: 2006n,
  TAG_BATCH_ROOTS_A: 2007n,
  TAG_BATCH_ROOTS_B: 2008n,
  TAG_BATCH_DIGEST_A: 2009n,
  TAG_BATCH_DIGEST_B: 2010n,
  TAG_BATCH_RECORD_INIT: 2011n,
  TAG_BATCH_UPDATE_CORE1: 2012n,
  TAG_BATCH_UPDATE_CORE2: 2013n,
  TAG_BATCH_RECORD_UPDATE: 2014n,
  TAG_BATCH_WINDOW_RANGE: 2015n,
  TAG_BATCH_UPDATE_CORE3: 2016n,
} as const;

type FieldLike = string | bigint | number;

let poseidonPromise: Promise<any> | undefined;

function getPoseidon(): Promise<any> {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }
  return poseidonPromise;
}

export function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

export function assertDecimalString(value: unknown, label: string): string {
  if (!isDecimalString(value)) {
    throw new Error(`${label} must be a non-negative integer decimal string`);
  }
  return value;
}

export function fieldFromDecimalString(value: unknown, label: string): bigint {
  const text = assertDecimalString(value, label);
  return toField(text, label);
}

export function toField(value: FieldLike, label = "field"): bigint {
  let n: bigint;
  if (typeof value === "bigint") {
    n = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    n = BigInt(value);
  } else {
    if (!isDecimalString(value)) {
      throw new Error(`${label} must be a non-negative integer decimal string`);
    }
    n = BigInt(value);
  }

  if (n < 0n || n >= BN254_Q) {
    throw new Error(`${label} must satisfy 0 <= value < BN254 scalar field`);
  }
  return n;
}

export function fieldToDecimalString(value: bigint): string {
  return toField(value, "fieldToDecimalString.value").toString();
}

export function evmAddressToField(address: unknown, label = "address"): bigint {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`${label} must be an EVM address string`);
  }
  return toField(BigInt(address), label);
}

export function assertNonZeroEvmAddress(address: unknown, label = "address"): string {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`${label} must be an EVM address string`);
  }
  if (/^0x0{40}$/i.test(address)) {
    throw new Error(`${label} must be non-zero`);
  }
  return address;
}

export function isoTimestampToUnixSecondsField(value: unknown, label = "timestamp"): bigint {
  if (typeof value !== "string") {
    throw new Error(`${label} must be an ISO timestamp string`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`${label} is not parseable as an ISO timestamp`);
  }
  return toField(BigInt(Math.floor(ms / 1000)), label);
}

export function assertTimeWindow(summary: any): void {
  const start = isoTimestampToUnixSecondsField(summary.batchStartTime, "batchStartTime");
  const end = isoTimestampToUnixSecondsField(summary.batchEndTime, "batchEndTime");
  if (start > end) {
    throw new Error("batchStartTime must be <= batchEndTime");
  }
}

export async function poseidon2(a: FieldLike, b: FieldLike): Promise<bigint> {
  const fa = toField(a, "poseidon2.a");
  const fb = toField(b, "poseidon2.b");
  const poseidon = await getPoseidon();
  const out = poseidon([fa.toString(), fb.toString()]);
  return toField(BigInt(poseidon.F.toObject(out).toString()), "poseidon2.output");
}

export async function hashTagged2(tag: FieldLike, a: FieldLike, b: FieldLike): Promise<bigint> {
  return poseidon2(await poseidon2(tag, a), b);
}

export async function hashTagged3(tag: FieldLike, a: FieldLike, b: FieldLike, c: FieldLike): Promise<bigint> {
  return poseidon2(await poseidon2(await poseidon2(tag, a), b), c);
}

export async function foldDigest(domainTag: FieldLike, values: FieldLike[]): Promise<bigint> {
  let acc = await poseidon2(TAGS.TAG_BATCH_FOLD_INIT, domainTag);
  for (let i = 0; i < values.length; i += 1) {
    acc = await hashTagged2(domainTag, acc, values[i]);
  }
  return acc;
}

function requireRecords(records: unknown): any[] {
  if (!Array.isArray(records)) {
    throw new Error("summary.records must be an array");
  }
  return records;
}

export async function computeAcceptedActionRoot(records: unknown): Promise<string> {
  const values = requireRecords(records)
    .filter((record) => record && record.type === "update")
    .map((record, index) => fieldFromDecimalString(record.rho, `updateRecords[${index}].rho`));
  return fieldToDecimalString(await foldDigest(TAGS.TAG_BATCH_ACTIONS, values));
}

export async function computeNullifierDigest(records: unknown): Promise<string> {
  const values = requireRecords(records)
    .filter((record) => record && record.type === "update")
    .map((record, index) => fieldFromDecimalString(record.nullifier, `updateRecords[${index}].nullifier`));
  return fieldToDecimalString(await foldDigest(TAGS.TAG_BATCH_NULLIFIERS, values));
}

export async function computeStateCommitmentDigest(records: unknown): Promise<string> {
  const values = requireRecords(records).map((record, index) =>
    fieldFromDecimalString(record.stateCommitment, `records[${index}].stateCommitment`),
  );
  return fieldToDecimalString(await foldDigest(TAGS.TAG_BATCH_STATE_COMS, values));
}

export async function computeBatchDigest(summary: any): Promise<string> {
  assertTimeWindow(summary);
  assertNonZeroEvmAddress(summary.admissionContract, "admissionContract");
  assertNonZeroEvmAddress(summary.anchorContract, "anchorContract");

  const batchID = fieldFromDecimalString(summary.batchID, "batchID");
  const l2ChainID = fieldFromDecimalString(summary.l2ChainID, "l2ChainID");
  const l1ChainID = fieldFromDecimalString(summary.l1ChainID, "l1ChainID");
  const firstL2Block = fieldFromDecimalString(summary.firstL2Block, "firstL2Block");
  const lastL2Block = fieldFromDecimalString(summary.lastL2Block, "lastL2Block");
  const count = fieldFromDecimalString(summary.count, "count");

  if (count === 0n) {
    throw new Error("count must be positive");
  }
  if (l2ChainID === 0n) {
    throw new Error("l2ChainID must be positive");
  }
  if (l1ChainID === 0n) {
    throw new Error("l1ChainID must be positive");
  }
  if (firstL2Block > lastL2Block) {
    throw new Error("firstL2Block must be <= lastL2Block");
  }

  const batchWindowHash = await hashTagged3(TAGS.TAG_BATCH_WINDOW, batchID, l2ChainID, l1ChainID);
  const batchWindowRangeHash = await hashTagged3(TAGS.TAG_BATCH_WINDOW_RANGE, firstL2Block, lastL2Block, count);
  const batchContractHash = await hashTagged2(
    TAGS.TAG_BATCH_CONTRACTS,
    evmAddressToField(summary.admissionContract, "admissionContract"),
    evmAddressToField(summary.anchorContract, "anchorContract"),
  );
  const batchTimeHash = await hashTagged2(
    TAGS.TAG_BATCH_TIME,
    isoTimestampToUnixSecondsField(summary.batchStartTime, "batchStartTime"),
    isoTimestampToUnixSecondsField(summary.batchEndTime, "batchEndTime"),
  );
  const batchRootHashA = await hashTagged3(
    TAGS.TAG_BATCH_ROOTS_A,
    fieldFromDecimalString(summary.fromStateRoot, "fromStateRoot"),
    fieldFromDecimalString(summary.toStateRoot, "toStateRoot"),
    fieldFromDecimalString(summary.acceptedActionRoot, "acceptedActionRoot"),
  );
  const batchRootHashB = await hashTagged3(
    TAGS.TAG_BATCH_ROOTS_B,
    fieldFromDecimalString(summary.nullifierDigest, "nullifierDigest"),
    fieldFromDecimalString(summary.stateCommitmentDigest, "stateCommitmentDigest"),
    batchRootHashA,
  );
  const batchDigestA = await hashTagged3(
    TAGS.TAG_BATCH_DIGEST_A,
    batchWindowHash,
    batchWindowRangeHash,
    batchContractHash,
  );
  return fieldToDecimalString(await hashTagged3(TAGS.TAG_BATCH_DIGEST_B, batchTimeHash, batchRootHashB, batchDigestA));
}

export function summaryToContractInput(summary: any): any {
  return {
    batchID: fieldFromDecimalString(summary.batchID, "batchID"),
    l2ChainID: fieldFromDecimalString(summary.l2ChainID, "l2ChainID"),
    l1ChainID: fieldFromDecimalString(summary.l1ChainID, "l1ChainID"),
    admissionContract: assertNonZeroEvmAddress(summary.admissionContract, "admissionContract"),
    fromStateRoot: fieldFromDecimalString(summary.fromStateRoot, "fromStateRoot"),
    toStateRoot: fieldFromDecimalString(summary.toStateRoot, "toStateRoot"),
    acceptedActionRoot: fieldFromDecimalString(summary.acceptedActionRoot, "acceptedActionRoot"),
    nullifierDigest: fieldFromDecimalString(summary.nullifierDigest, "nullifierDigest"),
    stateCommitmentDigest: fieldFromDecimalString(summary.stateCommitmentDigest, "stateCommitmentDigest"),
    count: fieldFromDecimalString(summary.count, "count"),
    firstL2Block: fieldFromDecimalString(summary.firstL2Block, "firstL2Block"),
    lastL2Block: fieldFromDecimalString(summary.lastL2Block, "lastL2Block"),
    batchStartTime: isoTimestampToUnixSecondsField(summary.batchStartTime, "batchStartTime"),
    batchEndTime: isoTimestampToUnixSecondsField(summary.batchEndTime, "batchEndTime"),
    batchDigest: fieldFromDecimalString(summary.batchDigest, "batchDigest"),
  };
}
