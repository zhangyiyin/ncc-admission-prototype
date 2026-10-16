import { AbiCoder, Interface } from "ethers";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const R = resolve(".");
const J = (p:string) => JSON.parse(readFileSync(join(R,p),"utf8"));
const bytes = (h:string) => (h.length - 2) / 2;
const dec = (x:any) => BigInt(x).toString();

function eq(a:any,b:any,label:string){
  if(Array.isArray(a)&&Array.isArray(b)){
    if(a.length!==b.length) throw new Error(label+": length mismatch");
    for(let i=0;i<a.length;i++) eq(a[i],b[i],`${label}[${i}]`);
    return;
  }
  if(dec(a)!==dec(b)) throw new Error(label+": value mismatch");
}

function getArgs(call:any){
  const p = call.proof ?? call;
  return {
    a: p.a ?? p.pA,
    b: p.b ?? p.pB,
    c: p.c ?? p.pC,
    publicSignals: p.publicSignals ?? p.pubSignals ?? p.input
  };
}

function measure(
  op:string, artifactPath:string, callPath:string, publicPath:string, proofPath:string, n:number
){
  const artifact = J(artifactPath);
  const iface = new Interface(artifact.abi);
  const fn = iface.getFunction("verifyProof");
  if(!fn) throw new Error(op+": verifyProof missing");
  const types = fn.inputs.map(x=>x.format("sighash"));
  const args = getArgs(J(callPath));
  const pub = J(publicPath);
  J(proofPath); // require the corresponding valid M8 proof artifact to exist/read

  if(args.publicSignals.length!==n || pub.length!==n) throw new Error(op+": public-input count mismatch");
  eq(args.publicSignals,pub,op+" publicSignals");

  const coder = AbiCoder.defaultAbiCoder();
  const proofHex = coder.encode(types.slice(0,3),[args.a,args.b,args.c]);
  const pubHex = coder.encode([types[3]],[args.publicSignals]);
  const calldata = iface.encodeFunctionData("verifyProof",[args.a,args.b,args.c,args.publicSignals]);

  const out = {
    operation: op,
    publicInputCount: n,
    proofPayloadBytes: bytes(proofHex),
    publicInputBytes: bytes(pubHex),
    verifyProofCalldataBytes: bytes(calldata),
    fullTxCalldataBytes: null,
    verifierAbiTypes: types,
    source: { proofJson: proofPath, publicSignalsJson: publicPath, solidityArgsFixture: callPath, verifierArtifact: artifactPath }
  };
  if(out.verifyProofCalldataBytes !== 4 + out.proofPayloadBytes + out.publicInputBytes)
    throw new Error(op+": calldata decomposition mismatch");
  return out;
}

const init = measure(
  "Init",
  "artifacts/contracts/verifiers/InitComplianceStateVerifier.sol/InitComplianceStateVerifier.json",
  "fixtures/m9/init_call.json",
  "run_artifacts/m8/proofs/init/public.json",
  "run_artifacts/m8/proofs/init/proof.json",
  6
);
const full = measure(
  "Full Update",
  "artifacts/contracts/verifiers/UpdateComplianceStateVerifier.sol/UpdateComplianceStateVerifier.json",
  "fixtures/m9/update_step1_call.json",
  "run_artifacts/m8/proofs/update_step1/public.json",
  "run_artifacts/m8/proofs/update_step1/proof.json",
  10
);

const expected:any = {
  Init: [256,192,452],
  "Full Update": [256,320,580]
};
for(const x of [init,full]){
  const got=[x.proofPayloadBytes,x.publicInputBytes,x.verifyProofCalldataBytes];
  const exp=expected[x.operation];
  if(got.some((v:number,i:number)=>v!==exp[i]))
    throw new Error(`${x.operation}: measured ${got.join("/")} B, sanity check ${exp.join("/")} B; ABI=${x.verifierAbiTypes.join(",")}`);
}

const result = {
  schemaVersion: 1,
  measurement: "ABI-encoded Groth16 verifier calldata size",
  byteCountingConvention:
    "Byte counts are (hex.length-2)/2 on ABI-encoded hex. proofPayloadBytes=ABI(pA,pB,pC); publicInputBytes=ABI(pubSignals); verifyProofCalldataBytes includes the 4-byte selector. JSON/filesystem sizes are not used.",
  fullTxCalldataNote: "Not measured; optional in the requested task.",
  operations: { init, fullUpdate: full }
};

mkdirSync(join(R,"fixtures/ojcs"),{recursive:true});
writeFileSync(join(R,"fixtures/ojcs/calldata_size.json"),JSON.stringify(result,null,2)+"\n");

console.log(JSON.stringify(result,null,2));
console.log("\n| Operation | Proof payload | Public inputs | verifyProof calldata | Full tx calldata |");
console.log("|---|---:|---:|---:|---:|");
console.log(`| Init | ${init.proofPayloadBytes} B | ${init.publicInputBytes} B | ${init.verifyProofCalldataBytes} B | N/A |`);
console.log(`| Full Update | ${full.proofPayloadBytes} B | ${full.publicInputBytes} B | ${full.verifyProofCalldataBytes} B | N/A |`);
