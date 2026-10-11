import fs from "node:fs";

import {
  checkAcceptedRecordAgainstPackage,
  computeGatewayDigests,
  parseNumberish,
} from "../../entities/gateway/gatewayChecker.ts";

import type {
  AcceptedRecordLike,
  GatewayExecutionPackage,
} from "../../entities/gateway/gatewayTypes.ts";

const OUT = "fixtures/ojcs/gateway_runs.csv";
const WARMUP = 5;
const FORMAL = 30;

type M9Expected = {
  stateRoots: {
    afterUpdateStep1: string;
    afterUpdateStep2: string;
  };
  stateIndices: {
    updateStep1: string;
    updateStep2: string;
  };
  records: {
    step1: Record<string, string>;
    step2: Record<string, string>;
  };
};

function readJson<T = any>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function csvLine(values: Array<string | number | boolean>): string {
  return values.map((v) => String(v)).join(",") + "\n";
}

function appendObservation(
  operation: string,
  run: number,
  phase: string,
  milliseconds: number,
  warmup: boolean,
): void {
  fs.appendFileSync(
    OUT,
    csvLine([
      operation,
      run,
      phase,
      milliseconds.toFixed(6),
      warmup,
    ]),
  );
}

async function timeAsync<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; ms: number }> {
  const start = process.hrtime.bigint();
  const value = await fn();
  const end = process.hrtime.bigint();
  return { value, ms: Number(end - start) / 1_000_000 };
}

function timeSync<T>(fn: () => T): { value: T; ms: number } {
  const start = process.hrtime.bigint();
  const value = fn();
  const end = process.hrtime.bigint();
  return { value, ms: Number(end - start) / 1_000_000 };
}

function makeRecord(
  raw: Record<string, string>,
  newStateRoot: string,
  stateIndex: string,
): AcceptedRecordLike {
  return {
    exists: true,
    rho: raw.rho,
    N_old: raw.N_old,
    C_new: raw.C_new,
    rtState: raw.rtState,
    newStateRoot,
    actionHash: raw.actionHash,
    amountCom: raw.amountCom,
    clauseCom: raw.clauseCom,
    stateIndex,
  };
}

function buildRecordMap(expected: M9Expected): Map<string, AcceptedRecordLike> {
  const map = new Map<string, AcceptedRecordLike>();

  const step1 = makeRecord(
    expected.records.step1,
    expected.stateRoots.afterUpdateStep1,
    expected.stateIndices.updateStep1,
  );

  const step2 = makeRecord(
    expected.records.step2,
    expected.stateRoots.afterUpdateStep2,
    expected.stateIndices.updateStep2,
  );

  map.set(parseNumberish(step1.rho).toString(10), step1);
  map.set(parseNumberish(step2.rho).toString(10), step2);

  return map;
}

async function measureOperation(
  operation: string,
  pkg: GatewayExecutionPackage,
  record: AcceptedRecordLike,
  expectedAccepted: boolean,
): Promise<void> {
  const total = WARMUP + FORMAL;

  for (let i = 0; i < total; i += 1) {
    const warmup = i < WARMUP;
    const run = warmup ? i + 1 : i - WARMUP + 1;
    const kind = warmup ? "warmup" : "formal";

    const digest = await timeAsync(() => computeGatewayDigests(pkg));
    appendObservation(operation, run, "digest", digest.ms, warmup);

    const checked = timeSync(() =>
      checkAcceptedRecordAgainstPackage(pkg, record, digest.value),
    );
    appendObservation(operation, run, "record_check", checked.ms, warmup);

    if (checked.value.accepted !== expectedAccepted) {
      throw new Error(
        `${operation} ${kind} ${run}: expected accepted=${expectedAccepted}, got ${checked.value.accepted}; failures=${checked.value.failures.join(",")}`,
      );
    }

    console.log(
      `${operation} ${kind} ${run}/${warmup ? WARMUP : FORMAL}: ` +
        `digest=${digest.ms.toFixed(6)} ms, ` +
        `record_check=${checked.ms.toFixed(6)} ms, ` +
        `accepted=${checked.value.accepted}`,
    );
  }
}

async function main(): Promise<void> {
  fs.mkdirSync("fixtures/ojcs", { recursive: true });
  fs.writeFileSync(OUT, "operation,run,phase,milliseconds,warmup\n");

  const expected = readJson<M9Expected>(
    "fixtures/m9/expected_admission_state.json",
  );

  const records = buildRecordMap(expected);

  const step1Pkg = readJson<GatewayExecutionPackage>(
    "fixtures/m10/gateway_package_step1.json",
  );
  const step2Pkg = readJson<GatewayExecutionPackage>(
    "fixtures/m10/gateway_package_step2.json",
  );
  const negativePkg = readJson<GatewayExecutionPackage>(
    "fixtures/m10/gateway_negative_cases/wrong_amount.json",
  );

  const step1Record = records.get(
    parseNumberish(step1Pkg.rho).toString(10),
  );
  const step2Record = records.get(
    parseNumberish(step2Pkg.rho).toString(10),
  );
  const negativeRecord = records.get(
    parseNumberish(negativePkg.rho).toString(10),
  );

  if (!step1Record) throw new Error("Missing accepted record for step1");
  if (!step2Record) throw new Error("Missing accepted record for step2");
  if (!negativeRecord) {
    throw new Error("Missing accepted record for wrong_amount negative package");
  }

  await measureOperation("step1", step1Pkg, step1Record, true);
  await measureOperation("step2", step2Pkg, step2Record, true);
  await measureOperation(
    "negative_wrong_amount",
    negativePkg,
    negativeRecord,
    false,
  );

  console.log("");
  console.log(`wrote ${OUT}`);
  console.log("measure_gateway_ojcs: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
