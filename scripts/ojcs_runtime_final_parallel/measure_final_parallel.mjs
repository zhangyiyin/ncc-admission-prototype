import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const OUT_DIR = "fixtures/ojcs_runtime_final_parallel";
const OUT = path.join(OUT_DIR, "proving_runs.csv");
const SYS = path.join(OUT_DIR, "system_samples.csv");
const LOG_DIR = "run_artifacts/ojcs_runtime_final_parallel/benchmark_logs";
const WORK_DIR = "run_artifacts/ojcs_runtime_final_parallel/benchmark_work";
const FORMAL = 100;
const SYSTEM_SAMPLE_EVERY_ROUNDS = 2;

const orders = [
  ["init","update_step1","update_step2"],
  ["update_step1","update_step2","init"],
  ["update_step2","init","update_step1"],
];

const targets = {
  init: {
    input: "fixtures/m4/init_input_user_001.json",
    wasm: "run_artifacts/m8/init/InitComplianceState_js/InitComplianceState.wasm",
    witnessGen: "run_artifacts/m8/init/InitComplianceState_js/generate_witness.js",
    zkey: "run_artifacts/m8/init/InitComplianceState_final.zkey",
    vkey: "run_artifacts/m8/init/verification_key.json",
  },
  update_step1: {
    input: "fixtures/m7/update_full_input_step1.json",
    wasm: "run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm",
    witnessGen: "run_artifacts/m8/update/UpdateComplianceStateFull_js/generate_witness.js",
    zkey: "run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey",
    vkey: "run_artifacts/m8/update/verification_key.json",
  },
  update_step2: {
    input: "fixtures/m7/update_full_input_step2.json",
    wasm: "run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm",
    witnessGen: "run_artifacts/m8/update/UpdateComplianceStateFull_js/generate_witness.js",
    zkey: "run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey",
    vkey: "run_artifacts/m8/update/verification_key.json",
  },
};

function ensure(p){ fs.mkdirSync(p,{recursive:true}); }
function must(p){ if(!fs.existsSync(p)) throw new Error(`missing ${p}`); }
function isoNow(){ return new Date().toISOString(); }

function readSystem(){
  const la=fs.readFileSync("/proc/loadavg","utf8").trim().split(/\s+/);
  const memLines=fs.readFileSync("/proc/meminfo","utf8").split(/\r?\n/);
  const mem={};
  for(const line of memLines){
    const m=line.match(/^([^:]+):\s+(\d+)/);
    if(m) mem[m[1]]=Number(m[2]);
  }
  let cpuMHz=[];
  try{
    const cpu=fs.readFileSync("/proc/cpuinfo","utf8").split(/\r?\n/);
    for(const line of cpu){
      const m=line.match(/^cpu MHz\s*:\s*([0-9.]+)/i);
      if(m) cpuMHz.push(Number(m[1]));
    }
  }catch{}
  let runnable="", total="";
  if(la[3]?.includes("/")) [runnable,total]=la[3].split("/");
  return {
    timestamp:isoNow(),
    load1:Number(la[0]),load5:Number(la[1]),load15:Number(la[2]),
    runnable,total,
    memAvailableKiB:mem.MemAvailable ?? "",
    memFreeKiB:mem.MemFree ?? "",
    cpuMHzMean:cpuMHz.length?cpuMHz.reduce((a,b)=>a+b,0)/cpuMHz.length:"",
  };
}

function appendSystem(round,note){
  const s=readSystem();
  const row=[
    s.timestamp,"formal",round??"",note,
    s.load1,s.load5,s.load15,
    s.runnable,s.total,
    s.memAvailableKiB,s.memFreeKiB,
    s.cpuMHzMean===""?"":s.cpuMHzMean.toFixed(3)
  ];
  // Header is created by preconditioning script.
  fs.appendFileSync(SYS,row.join(",")+"\n");
  console.log(`system sample round=${round??""} load1=${s.load1.toFixed(2)} memAvailableKiB=${s.memAvailableKiB}`);
}

function timed(cmd,args,logPath){
  const timestamp=isoNow();
  const start=process.hrtime.bigint();
  const r=spawnSync(cmd,args,{encoding:"utf8",shell:false,stdio:["ignore","pipe","pipe"]});
  const end=process.hrtime.bigint();
  fs.writeFileSync(
    logPath,
    `$ ${cmd} ${args.join(" ")}\n\n## stdout\n${r.stdout??""}\n\n## stderr\n${r.stderr??""}\n`
  );
  if(r.status!==0) throw new Error(`${cmd} failed rc=${r.status}\n${r.stderr??""}`);
  return {milliseconds:Number(end-start)/1e6,timestamp};
}

function append(round,op,pos,phase,result){
  fs.appendFileSync(
    OUT,
    `${round},${op},${pos},${phase},${result.milliseconds.toFixed(6)},${result.timestamp}\n`
  );
}

function observe(op,round,pos){
  const t=targets[op];
  const tag=`formal_r${String(round).padStart(3,"0")}_p${pos}_${op}`;
  const wd=path.join(WORK_DIR,op);
  ensure(wd);
  const witness=path.join(wd,"witness.wtns");
  const proof=path.join(wd,"proof.json");
  const pub=path.join(wd,"public.json");
  for(const p of [witness,proof,pub]) if(fs.existsSync(p)) fs.rmSync(p,{force:true});

  const w=timed(
    "node",[t.witnessGen,t.wasm,t.input,witness],
    path.join(LOG_DIR,`${tag}_witness.log`)
  );
  append(round,op,pos,"witness",w);

  // Intentionally restores snarkjs 0.7.6 default-parallel CLI behavior.
  // No singleThread option, taskset, or dependency modification is used.
  const p=timed(
    "npx",["snarkjs","groth16","prove",t.zkey,witness,proof,pub],
    path.join(LOG_DIR,`${tag}_prove.log`)
  );
  append(round,op,pos,"prove",p);

  const v=timed(
    "npx",["snarkjs","groth16","verify",t.vkey,pub,proof],
    path.join(LOG_DIR,`${tag}_verify.log`)
  );
  append(round,op,pos,"verify",v);

  console.log(
    `formal round ${round}/${FORMAL} pos=${pos} ${op}: ` +
    `witness=${w.milliseconds.toFixed(3)} ms, ` +
    `prove=${p.milliseconds.toFixed(3)} ms, ` +
    `verify=${v.milliseconds.toFixed(3)} ms`
  );
}

ensure(OUT_DIR); ensure(LOG_DIR); ensure(WORK_DIR);
if(fs.existsSync(OUT)) throw new Error(`${OUT} exists; refusing overwrite/re-run`);
if(!fs.existsSync(SYS)) throw new Error(`${SYS} missing; preconditioning must run first`);
fs.writeFileSync(OUT,"round,operation,order_position,phase,milliseconds,timestamp\n");

for(const t of Object.values(targets)){
  for(const p of [t.input,t.wasm,t.witnessGen,t.zkey,t.vkey]) must(p);
}

appendSystem(0,"formal_start_immediately_after_preconditioning");

for(let r=1;r<=FORMAL;r++){
  const order=orders[(r-1)%3];
  console.log(`formal round ${r} order: ${order.join(" -> ")}`);
  for(let i=0;i<3;i++) observe(order[i],r,i+1);
  if(r % SYSTEM_SAMPLE_EVERY_ROUNDS === 0) appendSystem(r,"periodic");
}
appendSystem(FORMAL,"formal_end");

console.log(`wrote ${OUT}`);
