import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { network } from "hardhat";

const OUT = "fixtures/ojcs/measurement_environment.json";

function run(cmd: string, args: string[] = []): string {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function readJson(path: string): any {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function sha256(path: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(path));
  return h.digest("hex");
}

function parseKeyValue(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function parseOsRelease(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, idx)] = value;
  }
  return out;
}

function configuredSolidity(): { version: string; optimizerEnabled: boolean | null; optimizerRuns: number | null } {
  const text = fs.readFileSync("hardhat.config.ts", "utf8");
  const version = text.match(/solidity:\s*\{[\s\S]*?version:\s*["']([^"']+)["']/)?.[1] ?? "unknown";
  const enabledRaw = text.match(/optimizer:\s*\{[\s\S]*?enabled:\s*(true|false)/)?.[1];
  const runsRaw = text.match(/optimizer:\s*\{[\s\S]*?runs:\s*(\d+)/)?.[1];
  return {
    version,
    optimizerEnabled: enabledRaw == null ? null : enabledRaw === "true",
    optimizerRuns: runsRaw == null ? null : Number(runsRaw),
  };
}

async function main(): Promise<void> {
  fs.mkdirSync("fixtures/ojcs", { recursive: true });

  const osRelease = parseOsRelease(run("cat", ["/etc/os-release"]));
  const cpu = parseKeyValue(run("lscpu"));
  const free = run("free", ["-b"]);
  const packageJson = readJson("package.json");

  const { ethers } = await network.connect();
  const net = await ethers.provider.getNetwork();

  const artifactPaths = {
    initInput: "fixtures/m4/init_input_user_001.json",
    updateStep1Input: "fixtures/m7/update_full_input_step1.json",
    updateStep2Input: "fixtures/m7/update_full_input_step2.json",
    initWasm: "run_artifacts/m8/init/InitComplianceState_js/InitComplianceState.wasm",
    initZkey: "run_artifacts/m8/init/InitComplianceState_final.zkey",
    initVkey: "run_artifacts/m8/init/verification_key.json",
    updateWasm: "run_artifacts/m8/update/UpdateComplianceStateFull_js/UpdateComplianceStateFull.wasm",
    updateZkey: "run_artifacts/m8/update/UpdateComplianceStateFull_final.zkey",
    updateVkey: "run_artifacts/m8/update/verification_key.json",
  };

  for (const [label, p] of Object.entries(artifactPaths)) {
    if (!fs.existsSync(p)) throw new Error(`Missing ${label}: ${p}`);
  }

  const artifactHashes = Object.fromEntries(
    Object.entries(artifactPaths).map(([label, p]) => [
      label,
      { path: p, sha256: sha256(p) },
    ]),
  );

  const result = {
    generatedAt: new Date().toISOString(),
    host: {
      os: osRelease.PRETTY_NAME ?? osRelease.NAME ?? "unknown",
      kernel: run("uname", ["-r"]),
      uname: run("uname", ["-a"]),
      architecture: cpu["Architecture"] ?? "unknown",
      cpuModel: cpu["Model name"] ?? "unknown",
      logicalProcessorsVisible: Number(run("nproc")),
      lscpuReportedCpus: cpu["CPU(s)"] ?? "unknown",
      threadsPerCore: cpu["Thread(s) per core"] ?? "unknown",
      coresPerSocket: cpu["Core(s) per socket"] ?? "unknown",
      sockets: cpu["Socket(s)"] ?? "unknown",
      hypervisorVendor: cpu["Hypervisor vendor"] ?? null,
      virtualizationType: cpu["Virtualization type"] ?? null,
      memoryFreeOutputBytes: free,
      environmentClassification:
        cpu["Hypervisor vendor"] || cpu["Virtualization type"] ? "virtual machine / virtualized environment" : "bare metal not detected",
    },
    tools: {
      node: run("node", ["--version"]),
      npm: run("npm", ["--version"]),
      hardhat: run("npx", ["hardhat", "--version"]),
      circom: run("circom", ["--version"]),
      snarkjs: (packageJson.dependencies?.snarkjs ?? "unknown") + " (project dependency)",
      circomlib: (packageJson.dependencies?.circomlib ?? "unknown") + " (project dependency)",
      solidity: {
        ...configuredSolidity(),
        source: "hardhat.config.ts",
      },
    },
    zk: {
      provingSystem: "Groth16",
      curve: "BN254 / alt_bn128",
    },
    localBlockchain: {
      runtime: "Hardhat local EVM",
      chainId: net.chainId.toString(),
    },
    measurementProtocol: {
      warmupRunsPerOperation: 5,
      formalRunsPerOperation: 30,
      executionOrder: "sequential",
      provingTiming: "wall-clock process timing via process.hrtime.bigint(); compile/setup/key generation excluded",
      gatewayTiming: "in-process wall-clock timing via process.hrtime.bigint()",
      quartileMethod: "Tukey median-of-halves: Q1 is median of lower half and Q3 is median of upper half of sorted formal observations; the overall median is excluded from both halves when n is odd",
    },
    artifacts: artifactHashes,
  };

  fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`wrote ${OUT}`);
  console.log("capture_measurement_environment: pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
