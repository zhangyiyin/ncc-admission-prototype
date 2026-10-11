import fs from "node:fs";
import {
  BN254_Q,
  computeAcceptedActionRoot,
  computeBatchDigest,
  computeNullifierDigest,
  computeStateCommitmentDigest,
} from "./batch_digest.ts";

const REQUIRED_TOP_LEVEL_FIELDS = [
  "schemaVersion",
  "batchID",
  "l2ChainID",
  "l1ChainID",
  "admissionContract",
  "anchorContract",
  "fromStateRoot",
  "toStateRoot",
  "acceptedActionRoot",
  "nullifierDigest",
  "stateCommitmentDigest",
  "count",
  "firstL2Block",
  "lastL2Block",
  "batchStartTime",
  "batchEndTime",
  "batchDigest",
];

const FORBIDDEN_KEYS = new Set([
  "amount",
  "plainAmount",
  "withdrawAmount",
  "rAmt",
  "r_amt",
  "owner",
  "owner_u",
  "sk_u",
  "secretKey",
  "C_old",
  "oldStateCommitment",
  "usedAmountOld",
  "usedAmountNew",
  "usedAmount",
  "merklePath",
  "path_state",
  "regPath",
  "statusPath",
  "policyPath",
  "linkableID",
  "linkableId",
  "nym",
  "userTag",
  "userLevelTag",
  "aggregationTag",
]);

const ALLOWED_KEYS = new Set([
  "amountCom",
  "containsPlainAmount",
]);

function fail(message: string): never {
  console.error(`check_batch_summary_schema: fail: ${message}`);
  process.exit(1);
}

function readJson(path: string): unknown {
  if (!fs.existsSync(path)) {
    fail(`missing file: ${path}`);
  }
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (err) {
    fail(`invalid JSON in ${path}: ${(err as Error).message}`);
  }
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
  return value;
}

function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeys(item, keys);
    }
    return keys;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
}

function checkForbiddenKeys(value: unknown, label: string): void {
  for (const key of collectKeys(value)) {
    if (ALLOWED_KEYS.has(key)) {
      continue;
    }
    if (FORBIDDEN_KEYS.has(key)) {
      fail(`${label} contains forbidden public key: ${key}`);
    }
  }
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

function isPositiveDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]*$/.test(value);
}

function assertDecimalString(value: unknown, label: string): string {
  if (!isDecimalString(value)) {
    fail(`${label} must be a non-negative integer decimal string`);
  }
  return value;
}

function assertPositiveDecimalString(value: unknown, label: string): string {
  if (!isPositiveDecimalString(value)) {
    fail(`${label} must be a positive integer decimal string`);
  }
  return value;
}

function assertFieldElement(value: unknown, label: string): string {
  const text = assertDecimalString(value, label);
  const n = BigInt(text);
  if (n < 0n || n >= BN254_Q) {
    fail(`${label} must satisfy 0 <= value < BN254 scalar field`);
  }
  return text;
}

function assertEvmAddress(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    fail(`${label} must be an EVM address string`);
  }
  return value;
}

function assertNonZeroEvmAddress(value: unknown, label: string): string {
  const address = assertEvmAddress(value, label);
  if (/^0x0{40}$/i.test(address)) {
    fail(`${label} must be non-zero`);
  }
  return address;
}

function assertIsoTime(value: unknown, label: string): string {
  if (typeof value !== "string") {
    fail(`${label} must be an ISO timestamp string`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    fail(`${label} is not parseable as an ISO timestamp`);
  }
  return value;
}

function checkSchema(schemaPath: string): void {
  const schema = assertObject(readJson(schemaPath), "schema");
  checkForbiddenKeys(schema, "schema");

  const required = assertArray(schema.required, "schema.required");
  const requiredSet = new Set(required.map((item) => String(item)));
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!requiredSet.has(field)) {
      fail(`schema.required is missing ${field}`);
    }
  }

  const properties = assertObject(schema.properties, "schema.properties");
  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in properties)) {
      fail(`schema.properties is missing ${field}`);
    }
  }

  const schemaVersion = assertObject(properties.schemaVersion, "schemaVersion property");
  if (schemaVersion.const !== "ncc-l2-anchor-batch-summary/v1") {
    fail("schemaVersion const must be ncc-l2-anchor-batch-summary/v1");
  }

  if (!("records" in properties)) {
    fail("schema should define optional records for local audit fixtures");
  }
}

function checkPrivacy(privacyValue: unknown): void {
  const privacy = assertObject(privacyValue, "privacy");
  const expected: Record<string, boolean> = {
    forbiddenFieldsExcluded: true,
    containsPlainAmount: false,
    containsOwner: false,
    containsOldStateCommitment: false,
    containsUsedAmount: false,
    containsMerklePaths: false,
    containsUserLevelTag: false,
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (privacy[key] !== expectedValue) {
      fail(`privacy.${key} must be ${expectedValue}`);
    }
  }
}

function checkRecord(recordValue: unknown, index: number): Record<string, unknown> {
  const record = assertObject(recordValue, `records[${index}]`);
  if (record.recordIndex !== String(index)) {
    fail(`records[${index}].recordIndex must be ${index}`);
  }

  if (record.type === "init") {
    assertDecimalString(record.recordIndex, `records[${index}].recordIndex`);
    assertFieldElement(record.stateCommitment, `records[${index}].stateCommitment`);
    assertFieldElement(record.stateRootAfter, `records[${index}].stateRootAfter`);
    assertFieldElement(record.nullifier, `records[${index}].nullifier`);
    for (const key of ["rho", "actionHash", "amountCom", "clauseCom"]) {
      if (key in record && record[key] !== null) {
        fail(`records[${index}].${key} must be null for init records`);
      }
    }
    return record;
  }

  if (record.type === "update") {
    assertDecimalString(record.recordIndex, `records[${index}].recordIndex`);
    assertFieldElement(record.rtState, `records[${index}].rtState`);
    assertFieldElement(record.nullifier, `records[${index}].nullifier`);
    assertFieldElement(record.stateCommitment, `records[${index}].stateCommitment`);
    assertFieldElement(record.stateRootAfter, `records[${index}].stateRootAfter`);
    for (const key of ["rho", "actionHash", "amountCom", "clauseCom"]) {
      if (!(key in record) || record[key] === null || record[key] === undefined) {
        fail(`records[${index}].${key} is required for update records`);
      }
      assertFieldElement(record[key], `records[${index}].${key}`);
    }
    return record;
  }

  fail(`records[${index}].type must be init or update`);
}

function assertEqualText(actual: unknown, expected: string, label: string): void {
  if (String(actual) !== expected) {
    fail(`${label} mismatch: got ${String(actual)}, expected ${expected}`);
  }
}

async function checkFixture(fixturePath: string): Promise<void> {
  const fixture = assertObject(readJson(fixturePath), "fixture");
  checkForbiddenKeys(fixture, "fixture");

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!(field in fixture)) {
      fail(`fixture is missing required field ${field}`);
    }
  }

  if (fixture.schemaVersion !== "ncc-l2-anchor-batch-summary/v1") {
    fail("fixture.schemaVersion mismatch");
  }
  if ("digestAlgorithm" in fixture && fixture.digestAlgorithm !== "poseidon-bn254-field-v1") {
    fail("fixture.digestAlgorithm must be poseidon-bn254-field-v1");
  }
  if ("fieldEncoding" in fixture && fixture.fieldEncoding !== "decimal-string-bn254") {
    fail("fixture.fieldEncoding must be decimal-string-bn254");
  }

  assertDecimalString(fixture.batchID, "batchID");
  assertPositiveDecimalString(fixture.l2ChainID, "l2ChainID");
  assertPositiveDecimalString(fixture.l1ChainID, "l1ChainID");
  assertNonZeroEvmAddress(fixture.admissionContract, "admissionContract");
  assertNonZeroEvmAddress(fixture.anchorContract, "anchorContract");

  assertFieldElement(fixture.fromStateRoot, "fromStateRoot");
  assertFieldElement(fixture.toStateRoot, "toStateRoot");
  assertFieldElement(fixture.acceptedActionRoot, "acceptedActionRoot");
  assertFieldElement(fixture.nullifierDigest, "nullifierDigest");
  assertFieldElement(fixture.stateCommitmentDigest, "stateCommitmentDigest");
  assertFieldElement(fixture.batchDigest, "batchDigest");

  const count = BigInt(assertPositiveDecimalString(fixture.count, "count"));
  const firstBlock = BigInt(assertDecimalString(fixture.firstL2Block, "firstL2Block"));
  const lastBlock = BigInt(assertDecimalString(fixture.lastL2Block, "lastL2Block"));
  if (firstBlock > lastBlock) {
    fail("firstL2Block must be <= lastL2Block");
  }

  const start = Date.parse(assertIsoTime(fixture.batchStartTime, "batchStartTime"));
  const end = Date.parse(assertIsoTime(fixture.batchEndTime, "batchEndTime"));
  if (start > end) {
    fail("batchStartTime must be <= batchEndTime");
  }

  if ("privacy" in fixture) {
    checkPrivacy(fixture.privacy);
  }

  if (!("records" in fixture)) {
    fail("fixture must include records for L2-A4 demo batch checking");
  }
  const records = assertArray(fixture.records, "records");
  if (BigInt(records.length) !== count) {
    fail("count must equal records.length when records are present");
  }
  if (records.length !== 3) {
    fail("L2-A4 demo batch must contain exactly 3 accepted records");
  }

  const checkedRecords = records.map(checkRecord);
  if (checkedRecords[0].type !== "init") {
    fail("records[0].type must be init");
  }
  for (let i = 1; i < checkedRecords.length; i += 1) {
    if (checkedRecords[i].type !== "update") {
      fail(`records[${i}].type must be update`);
    }
  }

  const acceptedActionRoot = await computeAcceptedActionRoot(checkedRecords);
  const nullifierDigest = await computeNullifierDigest(checkedRecords);
  const stateCommitmentDigest = await computeStateCommitmentDigest(checkedRecords);
  const batchDigest = await computeBatchDigest(fixture);

  assertEqualText(fixture.acceptedActionRoot, acceptedActionRoot, "acceptedActionRoot recomputation");
  assertEqualText(fixture.nullifierDigest, nullifierDigest, "nullifierDigest recomputation");
  assertEqualText(fixture.stateCommitmentDigest, stateCommitmentDigest, "stateCommitmentDigest recomputation");
  assertEqualText(fixture.batchDigest, batchDigest, "batchDigest recomputation");
}

async function main(): Promise<void> {
  const [, , schemaPath, fixturePath] = process.argv;
  if (!schemaPath) {
    fail("usage: npx ts-node scripts/anchoring/check_batch_summary_schema.ts <schema.json> [fixture.json]");
  }

  checkSchema(schemaPath);
  if (fixturePath) {
    await checkFixture(fixturePath);
  }

  console.log("check_batch_summary_schema: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
