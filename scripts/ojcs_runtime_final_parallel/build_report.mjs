import fs from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT="fixtures/ojcs_runtime_final_parallel";
const CSV=`${ROOT}/proving_runs.csv`;
const SYS=`${ROOT}/system_samples.csv`;
const PRE=`${ROOT}/preconditioning_summary.json`;
const OUT=`${ROOT}/measurement_summary.json`;
const REPORT="docs/OJCS_RUNTIME_FINAL_PARALLEL_REPORT.md";


const ops=["init","update_step1","update_step2"];
const phases=["witness","prove","verify"];

function median(s){
  const n=s.length,m=Math.floor(n/2);
  return n%2?s[m]:(s[m-1]+s[m])/2;
}
function tukey(v){
  const s=[...v].sort((a,b)=>a-b), n=s.length, m=Math.floor(n/2);
  const lo=s.slice(0,m), hi=n%2===0?s.slice(m):s.slice(m+1);
  const q1=median(lo), med=median(s), q3=median(hi);
  return {q1,median:med,q3,iqr:q3-q1};
}
function nearestRank(v,p){
  const s=[...v].sort((a,b)=>a-b);
  const rank=Math.ceil(p*s.length);
  return s[Math.max(0,Math.min(s.length-1,rank-1))];
}
function stats(v){
  const t=tukey(v);
  const s=[...v].sort((a,b)=>a-b);
  return {
    n:v.length,
    minMs:s[0],
    q1Ms:t.q1,
    medianMs:t.median,
    q3Ms:t.q3,
    iqrMs:t.iqr,
    iqrOverMedian:t.median===0?null:t.iqr/t.median,
    meanMs:v.reduce((a,b)=>a+b,0)/v.length,
    maxMs:s[s.length-1],
    p95Ms:nearestRank(v,0.95),
  };
}
function fmt(x){ return Number(x).toFixed(3); }
function pct(x){ return `${(100*Number(x)).toFixed(2)}%`; }

const lines=fs.readFileSync(CSV,"utf8").trim().split(/\r?\n/);
lines.shift();
const rows=lines.map(line=>{
  const [round,operation,order_position,phase,milliseconds,timestamp]=line.split(",");
  return {
    round:+round,operation,orderPosition:+order_position,phase,
    milliseconds:+milliseconds,timestamp
  };
});

const overall={}, segments={}, convergence={}, convergenceChanges={};
for(const op of ops){
  overall[op]={}; segments[op]={}; convergence[op]={}; convergenceChanges[op]={};
  for(const ph of phases){
    const rs=rows.filter(x=>x.operation===op&&x.phase===ph).sort((a,b)=>a.round-b.round);
    if(rs.length!==100) throw new Error(`${op}/${ph}: expected 100 observations, got ${rs.length}`);
    overall[op][ph]=stats(rs.map(x=>x.milliseconds));

    segments[op][ph]=[];
    for(let a=1;a<=91;a+=10){
      const b=a+9;
      const v=rs.filter(x=>x.round>=a&&x.round<=b).map(x=>x.milliseconds);
      if(v.length!==10) throw new Error(`${op}/${ph} segment ${a}-${b} n=${v.length}`);
      const s=stats(v);
      segments[op][ph].push({
        startRound:a,endRound:b,
        medianMs:s.medianMs,
        q1Ms:s.q1Ms,q3Ms:s.q3Ms,iqrMs:s.iqrMs,
        normalizedMedianToOverall:s.medianMs/overall[op][ph].medianMs,
      });
    }

    convergence[op][ph]=[];
    for(const n of [20,40,60,80,100]){
      const s=stats(rs.slice(0,n).map(x=>x.milliseconds));
      convergence[op][ph].push({
        n,
        medianMs:s.medianMs,q1Ms:s.q1Ms,q3Ms:s.q3Ms,iqrMs:s.iqrMs,
        iqrOverMedian:s.iqrOverMedian,
      });
    }
    const c=Object.fromEntries(convergence[op][ph].map(x=>[x.n,x]));
    const rel=(a,b)=>(b-a)/a;
    convergenceChanges[op][ph]={
      median60to80:rel(c[60].medianMs,c[80].medianMs),
      median80to100:rel(c[80].medianMs,c[100].medianMs),
      iqr60to80:rel(c[60].iqrMs,c[80].iqrMs),
      iqr80to100:rel(c[80].iqrMs,c[100].iqrMs),
    };
  }
}

// System samples.
const sysLines=fs.readFileSync(SYS,"utf8").trim().split(/\r?\n/);
const sysHeader=sysLines.shift().split(",");
const sysRows=sysLines.map(line=>{
  const c=line.split(",");
  const o={};
  sysHeader.forEach((h,i)=>o[h]=c[i]??"");
  for(const k of ["round","load1","load5","load15","runnable_processes","total_processes","mem_available_kib","mem_free_kib","cpu_mhz_mean"]){
    if(o[k]!=="") o[k]=Number(o[k]);
  }
  return o;
});
const nums=(stage,key)=>sysRows.filter(x=>!stage||x.stage===stage).map(x=>x[key]).filter(x=>Number.isFinite(x));
const formalLoad=nums("formal","load1");
const formalMem=nums("formal","mem_available_kib");
const preLoad=nums("precondition","load1");
const preMem=nums("precondition","mem_available_kib");
const systemSummary={
  sampleCount:sysRows.length,
  precondition:{
    samples:sysRows.filter(x=>x.stage==="precondition").length,
    load1Min:Math.min(...preLoad),load1Max:Math.max(...preLoad),
    memAvailableKiBMin:Math.min(...preMem),memAvailableKiBMax:Math.max(...preMem),
  },
  formal:{
    samples:sysRows.filter(x=>x.stage==="formal").length,
    load1Min:Math.min(...formalLoad),load1Max:Math.max(...formalLoad),
    memAvailableKiBMin:Math.min(...formalMem),memAvailableKiBMax:Math.max(...formalMem),
  }
};

const preconditioning=JSON.parse(fs.readFileSync(PRE,"utf8"));

// No automatic final acceptance classification. Surface diagnostics for manual judgment.
const summary={
  generatedAt:new Date().toISOString(),
  methodology:{
    preconditioningSeconds:600,
    preconditioningOperation:"UpdateComplianceStateFull proof",
    preconditioningProofMode:"default-parallel npx snarkjs groth16 prove; not included in formal CSV",
    formalRounds:100,
    cyclicInterleaving:true,
    witnessMode:"fresh node generate_witness process",
    proofMode:"fresh npx snarkjs groth16 prove process; default parallel; no singleThread option",
    verifyMode:"fresh npx snarkjs groth16 verify process",
    timer:"process.hrtime.bigint() immediately around the whole child-process invocation",
    outlierFiltering:"none",
    formalSampleExclusion:"none",
    quartiles:"Tukey median-of-halves",
    p95:"nearest-rank: sorted[ceil(0.95*n)-1]",
    systemSampling:"/proc/loadavg, /proc/meminfo, diagnostic /proc/cpuinfo MHz; every 60s during preconditioning and every 2 formal rounds",
  },
  preconditioning,
  overall,
  segmentMedians:segments,
  cumulativeConvergence:convergence,
  cumulativeConvergenceChanges:convergenceChanges,
  systemSummary,
};
fs.writeFileSync(OUT,JSON.stringify(summary,null,2)+"\n");

const md=[];
md.push("# OJ-CS Final Sustained Default-Parallel Runtime Benchmark");
md.push("");
md.push("");
md.push("## Methodology");
md.push("");
md.push("A fixed 10-minute sustained preconditioning phase repeatedly ran `UpdateComplianceStateFull` using the default `npx snarkjs groth16 prove` path. Preconditioning proofs are excluded from the formal runtime CSV. Immediately afterward, 100 formal rounds were run with cyclic Init / Update1 / Update2 ordering. Witness, proof, and verification each use a fresh child process. The wall-clock timer surrounds the complete child-process invocation.");
md.push("");
md.push("No `singleThread` option, CPU affinity restriction, sample deletion, or outlier filtering is used. Quartiles use Tukey median-of-halves. p95 uses the nearest-rank definition `sorted[ceil(0.95*n)-1]`.");
md.push("");
md.push("## Preconditioning");
md.push("");
md.push(`- start: ${preconditioning.startTimestamp}`);
md.push(`- end: ${preconditioning.endTimestamp}`);
md.push(`- target: ${preconditioning.targetSeconds.toFixed(0)} s`);
md.push(`- actual: ${preconditioning.actualSeconds.toFixed(3)} s`);
md.push(`- completed full proofs: ${preconditioning.completedProofs}`);
md.push(`- final proof interrupted at fixed deadline: ${preconditioning.finalProofInterruptedAtFixedDeadline}`);
md.push(`- load1 start/end: ${preconditioning.startSystem.load1.toFixed(2)} / ${preconditioning.endSystem.load1.toFixed(2)}`);
md.push(`- MemAvailable start/end: ${preconditioning.startSystem.memAvailableKiB} / ${preconditioning.endSystem.memAvailableKiB} KiB`);
md.push("");
md.push("## Overall 100-run statistics");
md.push("");
md.push("| Operation | Phase | n | Median ms | Q1 ms | Q3 ms | IQR ms | IQR/median | Mean ms | Min ms | Max ms | p95 ms |");
md.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for(const op of ops) for(const ph of phases){
  const s=overall[op][ph];
  md.push(`| ${op} | ${ph} | ${s.n} | ${fmt(s.medianMs)} | ${fmt(s.q1Ms)} | ${fmt(s.q3Ms)} | ${fmt(s.iqrMs)} | ${pct(s.iqrOverMedian)} | ${fmt(s.meanMs)} | ${fmt(s.minMs)} | ${fmt(s.maxMs)} | ${fmt(s.p95Ms)} |`);
}
md.push("");
md.push("## 10-round segment medians");
md.push("");
md.push("| Operation | Phase | 1–10 | 11–20 | 21–30 | 31–40 | 41–50 | 51–60 | 61–70 | 71–80 | 81–90 | 91–100 |");
md.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for(const op of ops) for(const ph of phases){
  const seg=segments[op][ph];
  md.push(`| ${op} | ${ph} | ${seg.map(x=>fmt(x.medianMs)).join(" | ")} |`);
}
md.push("");
md.push("## Cumulative convergence");
md.push("");
md.push("| Operation | Phase | n | Median ms | Q1 ms | Q3 ms | IQR ms | IQR/median |");
md.push("|---|---|---:|---:|---:|---:|---:|---:|");
for(const op of ops) for(const ph of phases) for(const c of convergence[op][ph]){
  md.push(`| ${op} | ${ph} | ${c.n} | ${fmt(c.medianMs)} | ${fmt(c.q1Ms)} | ${fmt(c.q3Ms)} | ${fmt(c.iqrMs)} | ${pct(c.iqrOverMedian)} |`);
}
md.push("");
md.push("### n=60 -> 80 -> 100 change diagnostics");
md.push("");
md.push("| Operation | Phase | median 60→80 | median 80→100 | IQR 60→80 | IQR 80→100 |");
md.push("|---|---|---:|---:|---:|---:|");
for(const op of ops) for(const ph of phases){
  const c=convergenceChanges[op][ph];
  md.push(`| ${op} | ${ph} | ${pct(c.median60to80)} | ${pct(c.median80to100)} | ${pct(c.iqr60to80)} | ${pct(c.iqr80to100)} |`);
}
md.push("");
md.push("## System/load observations");
md.push("");
md.push(`- total lightweight system samples: ${systemSummary.sampleCount}`);
md.push(`- preconditioning load1 range: ${systemSummary.precondition.load1Min.toFixed(2)}–${systemSummary.precondition.load1Max.toFixed(2)}`);
md.push(`- preconditioning MemAvailable range: ${systemSummary.precondition.memAvailableKiBMin}–${systemSummary.precondition.memAvailableKiBMax} KiB`);
md.push(`- formal load1 range: ${systemSummary.formal.load1Min.toFixed(2)}–${systemSummary.formal.load1Max.toFixed(2)}`);
md.push(`- formal MemAvailable range: ${systemSummary.formal.memAvailableKiBMin}–${systemSummary.formal.memAvailableKiBMax} KiB`);
md.push("");
md.push("CPU MHz sampled from inside the VM is retained only as diagnostic metadata and is not used as a manuscript performance claim.");
md.push("");
md.push("## Interpretation boundary");
md.push("");
md.push("This report intentionally does not auto-classify convergence or regime shifts. Readers can inspect the 10-round segment medians, cumulative n=60/80/100 changes, raw CSV, and system samples. A persistent slow/fast regime, if present, remains part of the default-parallel 4-vCPU virtualized measurement rather than a reason to delete samples or rerun for better values.");
md.push("");
md.push("Raw formal observations: `fixtures/ojcs_runtime_final_parallel/proving_runs.csv`.");
md.push("");
md.push("System samples: `fixtures/ojcs_runtime_final_parallel/system_samples.csv`.");
md.push("");
md.push("Machine-readable summary: `fixtures/ojcs_runtime_final_parallel/measurement_summary.json`.");

fs.mkdirSync("docs",{recursive:true});
fs.writeFileSync(REPORT,md.join("\n")+"\n");
console.log(`wrote ${OUT}`);
console.log(`wrote ${REPORT}`);
