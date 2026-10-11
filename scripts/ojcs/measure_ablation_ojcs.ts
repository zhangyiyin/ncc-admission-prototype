import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = "run_artifacts/ojcs/ablation";
const OUT = "fixtures/ojcs/ablation_runs.csv";
const SUMMARY = "fixtures/ojcs/ablation_summary.json";
const REPORT = "docs/OJCS_ABLATION_FEASIBILITY.md";
const PTAU = "run_artifacts/m8/ptau/pot18_final.ptau";
const WARMUP = 5;
const FORMAL = 30;

type Variant = {
  name: "Basic" | "Action" | "Full";
  slug: string;
  circuit: string;
  input: string;
};

type CompileMetrics = {
  nonLinearConstraints: number;
  linearConstraints: number;
  totalConstraints: number;
  publicInputs: number;
  privateInputs: number;
  wires: number;
  labels: number;
};

type Observation = {
  variant: string;
  run: number;
  phase: string;
  milliseconds: number;
  warmup: boolean;
};

const variants: Variant[] = [
  {
    name: "Basic",
    slug: "basic",
    circuit: "circuits/update_compliance_state/UpdateComplianceStateBasic.circom",
    input: "fixtures/m5/update_basic_input_step2.json",
  },
  {
    name: "Action",
    slug: "action",
    circuit: "circuits/update_compliance_state/UpdateComplianceStateAction.circom",
    input: "fixtures/m6/update_action_input_step2.json",
  },
  {
    name: "Full",
    slug: "full",
    circuit: "circuits/update_compliance_state/UpdateComplianceStateFull.circom",
    input: "fixtures/m7/update_full_input_step2.json",
  },
];

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

function run(
  cmd: string,
  args: string[],
  logPath?: string,
): { stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";

  if (logPath) {
    fs.writeFileSync(
      logPath,
      `$ ${cmd} ${args.join(" ")}\n\n## stdout\n${stdout}\n\n## stderr\n${stderr}\n`,
      "utf8",
    );
  }

  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed with exit ${r.status}\n${stdout}\n${stderr}`,
    );
  }
  return { stdout, stderr };
}

function runTimed(
  cmd: string,
  args: string[],
  logPath: string,
): { ms: number; stdout: string; stderr: string } {
  const start = process.hrtime.bigint();
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const end = process.hrtime.bigint();
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  fs.writeFileSync(
    logPath,
    `$ ${cmd} ${args.join(" ")}\n\n## stdout\n${stdout}\n\n## stderr\n${stderr}\n`,
    "utf8",
  );
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed with exit ${r.status}\n${stdout}\n${stderr}`,
    );
  }
  return {
    ms: Number(end - start) / 1_000_000,
    stdout,
    stderr,
  };
}

function parseNumber(text: string, re: RegExp, label: string): number {
  const m = text.match(re);
  if (!m) throw new Error(`Could not parse ${label} from circom output`);
  return Number(m[1]);
}

function parseCompileMetrics(text: string): CompileMetrics {
  const nonLinearConstraints = parseNumber(
    text,
    /^\s*non-linear constraints:\s*(\d+)\s*$/im,
    "non-linear constraints",
  );
  const linearConstraints = parseNumber(
    text,
    /^\s*linear constraints:\s*(\d+)\s*$/im,
    "linear constraints",
  );
  const publicInputs = parseNumber(
    text,
    /public inputs:\s*(\d+)/i,
    "public inputs",
  );
  const privateInputs = parseNumber(
    text,
    /private inputs:\s*(\d+)/i,
    "private inputs",
  );
  const wires = parseNumber(text, /wires:\s*(\d+)/i, "wires");
  const labels = parseNumber(text, /labels:\s*(\d+)/i, "labels");
  return {
    nonLinearConstraints,
    linearConstraints,
    totalConstraints: nonLinearConstraints + linearConstraints,
    publicInputs,
    privateInputs,
    wires,
    labels,
  };
}

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  const lower = sorted.slice(0, mid);
  const upper = n % 2 === 0 ? sorted.slice(mid) : sorted.slice(mid + 1);
  const q1 = median(lower);
  const med = median(sorted);
  const q3 = median(upper);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const f = (x: number) => Number(x.toFixed(6));
  return {
    n,
    minMs: f(sorted[0]),
    q1Ms: f(q1),
    medianMs: f(med),
    q3Ms: f(q3),
    iqrMs: f(q3 - q1),
    maxMs: f(sorted[n - 1]),
    meanMs: f(mean),
  };
}

function csv(v: Array<string | number | boolean>): string {
  return v.map(String).join(",") + "\n";
}

function appendObs(o: Observation): void {
  fs.appendFileSync(
    OUT,
    csv([o.variant, o.run, o.phase, o.milliseconds.toFixed(6), o.warmup]),
  );
}

async function prepare(v: Variant): Promise<{
  metrics: CompileMetrics;
  r1cs: string;
  wasm: string;
  witnessGen: string;
  zkey: string;
  vkey: string;
}> {
  const dir = path.join(ROOT, v.slug);
  const build = path.join(dir, "build");
  const logs = path.join(dir, "logs");
  ensureDir(build);
  ensureDir(logs);

  const compile = run(
    "circom",
    [v.circuit, "--r1cs", "--wasm", "--sym", "-o", build],
    path.join(logs, "compile.log"),
  );
  const metrics = parseCompileMetrics(`${compile.stdout}\n${compile.stderr}`);

  const baseName = path.basename(v.circuit, ".circom");
  const r1cs = path.join(build, `${baseName}.r1cs`);
  const jsDir = path.join(build, `${baseName}_js`);
  const wasm = path.join(jsDir, `${baseName}.wasm`);
  const witnessGen = path.join(jsDir, "generate_witness.js");
  fs.writeFileSync(
    path.join(jsDir, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
  );

  const zkey = path.join(dir, `${baseName}_ablation.zkey`);
  const vkey = path.join(dir, "verification_key.json");

  run(
    "npx",
    ["snarkjs", "groth16", "setup", r1cs, PTAU, zkey],
    path.join(logs, "groth16_setup.log"),
  );
  run(
    "npx",
    ["snarkjs", "zkey", "verify", r1cs, PTAU, zkey],
    path.join(logs, "zkey_verify.log"),
  );
  run(
    "npx",
    ["snarkjs", "zkey", "export", "verificationkey", zkey, vkey],
    path.join(logs, "export_vkey.log"),
  );

  return { metrics, r1cs, wasm, witnessGen, zkey, vkey };
}

async function benchmark(
  v: Variant,
  prepared: Awaited<ReturnType<typeof prepare>>,
): Promise<void> {
  const work = path.join(ROOT, v.slug, "work");
  const logs = path.join(ROOT, v.slug, "logs");
  ensureDir(work);

  const total = WARMUP + FORMAL;
  for (let i = 0; i < total; i += 1) {
    const warmup = i < WARMUP;
    const runNo = warmup ? i + 1 : i - WARMUP + 1;
    const kind = warmup ? "warmup" : "formal";
    const prefix = `${kind}_${String(runNo).padStart(2, "0")}`;

    const witness = path.join(work, "witness.wtns");
    const proof = path.join(work, "proof.json");
    const pub = path.join(work, "public.json");
    for (const p of [witness, proof, pub]) {
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }

    const w = runTimed(
      "node",
      [prepared.witnessGen, prepared.wasm, v.input, witness],
      path.join(logs, `${prefix}_witness.log`),
    );
    appendObs({ variant: v.name, run: runNo, phase: "witness", milliseconds: w.ms, warmup });

    const p = runTimed(
      "npx",
      ["snarkjs", "groth16", "prove", prepared.zkey, witness, proof, pub],
      path.join(logs, `${prefix}_prove.log`),
    );
    appendObs({ variant: v.name, run: runNo, phase: "prove", milliseconds: p.ms, warmup });

    const vr = runTimed(
      "npx",
      ["snarkjs", "groth16", "verify", prepared.vkey, pub, proof],
      path.join(logs, `${prefix}_verify.log`),
    );
    appendObs({ variant: v.name, run: runNo, phase: "verify", milliseconds: vr.ms, warmup });

    console.log(
      `${v.name} ${kind} ${runNo}/${warmup ? WARMUP : FORMAL}: ` +
      `witness=${w.ms.toFixed(3)} ms, prove=${p.ms.toFixed(3)} ms, verify=${vr.ms.toFixed(3)} ms`,
    );
  }
}

function parseRows(): Observation[] {
  const lines = fs.readFileSync(OUT, "utf8").trim().split(/\r?\n/);
  lines.shift();
  return lines.map((line) => {
    const [variant, run, phase, milliseconds, warmup] = line.split(",");
    return {
      variant,
      run: Number(run),
      phase,
      milliseconds: Number(milliseconds),
      warmup: warmup === "true",
    };
  });
}

function buildSummary(
  prepared: Record<string, Awaited<ReturnType<typeof prepare>>>,
) {
  const rows = parseRows().filter((r) => !r.warmup);
  const out: any = {
    generatedAt: new Date().toISOString(),
    warmupRuns: WARMUP,
    formalRuns: FORMAL,
    transition: "step2: 18000 -> 36000",
    quartileAlgorithm:
      "Tukey median-of-halves; Q1/Q3 are medians of lower/upper halves of sorted formal observations.",
    variants: {},
  };

  for (const v of variants) {
    const phases: any = {};
    for (const phase of ["witness", "prove", "verify"]) {
      const values = rows
        .filter((r) => r.variant === v.name && r.phase === phase)
        .map((r) => r.milliseconds);
      phases[phase] = stats(values);
    }

    out.variants[v.name] = {
      circuit: v.circuit,
      input: v.input,
      metrics: prepared[v.name].metrics,
      timing: phases,
    };
  }
  return out;
}

function updateReport(summary: any): void {
  let report = fs.readFileSync(REPORT, "utf8");

  const rows = variants.map((v) => {
    const x = summary.variants[v.name];
    const m = x.metrics;
    const p = x.timing.prove;
    const vr = x.timing.verify;
    return `| ${v.name} | ${m.nonLinearConstraints} | ${m.linearConstraints} | ${m.totalConstraints} | ${m.publicInputs} | ${p.medianMs.toFixed(3)} | ${p.iqrMs.toFixed(3)} | ${vr.medianMs.toFixed(3)} | ${vr.iqrMs.toFixed(3)} |`;
  }).join("\n");

  const section = `
## Measured ablation results

All three variants were compiled from the current source into \`run_artifacts/ojcs/ablation/\` and benchmarked on the same Step2 semantic transition (\`18000 -> 36000\`). Each operation used 5 warm-up runs followed by 30 formal runs. Fresh Groth16 zkey/vkey artifacts were generated only inside the isolated ablation directory from the existing \`run_artifacts/m8/ptau/pot18_final.ptau\`; the final M8 baseline artifacts were not modified.

| Variant | Non-linear constraints | Linear constraints | Total constraints | Public inputs | Proof median ms | Proof IQR ms | Verify median ms | Verify IQR ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
${rows}

Raw observations are stored in \`${OUT}\` and the machine-readable summary in \`${SUMMARY}\`.

Verifier gas is not reported as a controlled three-way metric. Basic and Action do not have existing final Solidity verifier artifacts in the repository, and the current experiment intentionally avoids changing the admission-contract baseline merely to create gas cells.
`;

  report = report.replace(/\n## Measured ablation results[\s\S]*$/m, "");
  report += section;
  fs.writeFileSync(REPORT, report);
}

async function main(): Promise<void> {
  ensureDir("fixtures/ojcs");
  ensureDir(ROOT);
  if (!fs.existsSync(PTAU)) throw new Error(`Missing ${PTAU}`);

  fs.writeFileSync(OUT, "variant,run,phase,milliseconds,warmup\n");

  const prepared: Record<string, Awaited<ReturnType<typeof prepare>>> = {};

  for (const v of variants) {
    console.log(`===== PREPARE ${v.name} =====`);
    prepared[v.name] = await prepare(v);
    console.log(JSON.stringify(prepared[v.name].metrics));
  }

  for (const v of variants) {
    console.log(`===== BENCHMARK ${v.name} =====`);
    await benchmark(v, prepared[v.name]);
  }

  const summary = buildSummary(prepared);
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2) + "\n");
  updateReport(summary);

  console.log("");
  console.log(`wrote ${OUT}`);
  console.log(`wrote ${SUMMARY}`);
  console.log(`updated ${REPORT}`);
  console.log("measure_ablation_ojcs: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
