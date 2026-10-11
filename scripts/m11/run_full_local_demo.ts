import fs from "fs";
import path from "path";
import { execSync } from "child_process";

type CommandResult = {
  name: string;
  command: string;
  status: "pass" | "fail";
  output: string;
};

type JsonObject = Record<string, any>;

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "fixtures", "m11");
const DOC_DIR = path.join(ROOT, "docs");

function readJson<T = any>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function writeJson(relativePath: string, value: unknown): void {
  const fullPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, JSON.stringify(value, null, 2) + "\n");
}

function writeText(relativePath: string, value: string): void {
  const fullPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, value);
}
function readExistingGeneratedAt(relativePath: string): string {
  const fullPath = path.join(ROOT, relativePath);
  if (fs.existsSync(fullPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      if (typeof existing.generatedAt === "string" && existing.generatedAt.length > 0) {
        return existing.generatedAt;
      }
    } catch (_error) {
      // Fall through to deterministic local-demo marker.
    }
  }
  return "deterministic-local-demo";
}


function runCommand(name: string, command: string): CommandResult {
  try {
    const output = execSync(command, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 80 * 1024 * 1024,
      env: { ...process.env },
    });
    process.stdout.write(output);
    return { name, command, status: "pass", output };
  } catch (error: any) {
    const stdout = error?.stdout ? String(error.stdout) : "";
    const stderr = error?.stderr ? String(error.stderr) : "";
    const output = `${stdout}${stderr}`;
    process.stdout.write(output);
    return { name, command, status: "fail", output };
  }
}

function runCommandPreservingFiles(name: string, command: string, relativePaths: string[]): CommandResult {
  const snapshots = relativePaths.map((relativePath) => {
    const fullPath = path.join(ROOT, relativePath);
    return {
      relativePath,
      fullPath,
      existed: fs.existsSync(fullPath),
      content: fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : undefined,
    };
  });

  const result = runCommand(name, command);

  for (const snapshot of snapshots) {
    if (snapshot.existed) {
      fs.writeFileSync(snapshot.fullPath, snapshot.content ?? "");
    } else if (fs.existsSync(snapshot.fullPath)) {
      fs.unlinkSync(snapshot.fullPath);
    }
  }

  return result;
}

function requirePass(result: CommandResult): void {
  if (result.status !== "pass") {
    throw new Error(`${result.name} failed. Command: ${result.command}`);
  }
}

function tail(text: string, maxLines = 80): string {
  const lines = text.trimEnd().split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

function publicRecordFromExpected(record: JsonObject, stateIndex: string, newStateRoot: string): JsonObject {
  return {
    rho: record.rho,
    N_old: record.N_old,
    C_new: record.C_new,
    rtState: record.rtState,
    newStateRoot,
    stateIndex,
    actionHash: record.actionHash,
    amountCom: record.amountCom,
    clauseCom: record.clauseCom,
  };
}

function buildSpec(): string {
  return `# M11 Full Local Demo Specification

## Scope

M11 is a full local demo transcript task. It is not a new protocol design, not a new circuit stage, not a gas benchmark, and not a public testnet deployment.

The demo scenario is daily stablecoin off-ramp cumulative compliance. A hidden compliance state is initialized, then two 18,000-unit withdrawals are accepted, and a third 18,000-unit withdrawal is rejected because it would move the hidden cumulative amount from 36,000 to 54,000 while the policy limit is 50,000.

## Components reused

M11 reuses the already implemented M8 verifiers, M9 admission contract path, and M10 gateway checker. It does not modify circuits, verifier contracts, admission contracts, or gateway checker semantics.

## Demo flow

1. Deploy the local M9 system through the M9 admission checker.
2. Initialize the hidden compliance state using fixtures/m9/init_call.json.
3. Accept update step1, which represents 0 -> 18000.
4. Execute gateway step1 using fixtures/m10/gateway_package_step1.json.
5. Accept update step2, which represents 18000 -> 36000.
6. Execute gateway step2 using fixtures/m10/gateway_package_step2.json.
7. Check step3 rejection using the M7 full-circuit negative case fixtures/m7/update_full_negative_cases/exceeds_limit.json.
8. Generate fixtures/m11/demo_transcript.json.
9. Generate fixtures/m11/demo_summary.json.
10. Generate fixtures/m11/step3_reject_input.json.
11. Generate fixtures/m11/step3_reject_report.json.
12. Update docs/M11_FULL_LOCAL_DEMO_REPORT.md.

## Init flow

The init proof is accepted. The resulting state root must equal the M3 root after C_gen, and the state index must be 0.

## Step1 flow

Step1 represents the hidden state transition 0 -> 18000. ComplianceAdmission accepts the M9 proof, records rho, appends C_new, and produces the expected state root after C_after_18000. The gateway checker accepts the private execution package by recomputing amountCom and actionHash and matching the accepted record.

## Step2 flow

Step2 represents the hidden state transition 18000 -> 36000. ComplianceAdmission accepts the M9 proof, records rho, appends C_new, and produces the expected state root after C_after_36000. Since the hidden cumulative amount crosses the 30,000 threshold, the private demo fact records clauseStatus = SATISFIED. The public chain stores only clauseCom, not clauseStatus.

## Step3 flow

Step3 represents the attempted hidden transition 36000 -> 54000. The M7 negative case checks that this over-limit witness is rejected by the circuit or witness check. No Groth16 proof is generated for the ordinary path, no updateState call is attempted, and the gateway is not executed.

## Privacy boundary

The public transcript publicRecord entries may contain only rho, N_old, C_new, rtState, newStateRoot, stateIndex, actionHash, amountCom, and clauseCom.

The public chain does not expose amount, usedAmount, clauseStatus, action context fields, identity, hidden owner, old state commitment, witness paths, or a user-level link tag. The privateDemoFacts section is a local demo explanation only and is not a public-chain record.

## Non-goals

M11 does not do gas benchmarking, public testnet deployment, new Groth16 setup, new protocol features, real KYC, real source-of-funds verification, real bank settlement, or warrant recovery.
`;
}

function buildReport(transcript: JsonObject, summary: JsonObject, results: CommandResult[]): string {
  const step = (label: string) => transcript.steps.find((x: JsonObject) => x.label === label) || {};
  const init = step("init");
  const step1 = step("step1");
  const step2 = step("step2");
  const step3 = step("step3");

  const status = (name: string) => results.find((r) => r.name === name)?.status ?? "not-run";

  return `# M11 Full Local Demo Report

## Status

- run_full_local_demo: pass
- check_full_local_demo: run after this script
- hardhat compile: ${status("hardhat compile")}
- hardhat test m11: run with \`npx hardhat test test/m11/fullLocalDemo.test.ts\`

## Init

- accepted: ${init.accepted}
- newStateRoot: ${init.newStateRoot}
- stateIndex: ${init.stateIndex}
- N_gen: ${init.N_gen}
- C_gen: ${init.C_gen}
- policyScopeHash: ${init.policyScopeHash}

## Step1

- hidden transition: ${step1.hiddenStateTransition}
- admission accepted: ${step1.acceptedByAdmission}
- gateway accepted: ${step1.acceptedByGateway}
- newStateRoot: ${step1.publicRecord?.newStateRoot}
- rho: ${step1.publicRecord?.rho}
- amountCom: ${step1.publicRecord?.amountCom}
- actionHash: ${step1.publicRecord?.actionHash}

## Step2

- hidden transition: ${step2.hiddenStateTransition}
- admission accepted: ${step2.acceptedByAdmission}
- gateway accepted: ${step2.acceptedByGateway}
- newStateRoot: ${step2.publicRecord?.newStateRoot}
- rho: ${step2.publicRecord?.rho}
- amountCom: ${step2.publicRecord?.amountCom}
- actionHash: ${step2.publicRecord?.actionHash}
- clause status private demo fact: ${step2.privateDemoFacts?.clauseStatus}

## Step3

- hidden transition: ${step3.hiddenStateTransition}
- rejected: ${!step3.acceptedByAdmission}
- rejection layer: ${step3.rejectionLayer}
- reason: ${step3.reason}
- proof generated: ${step3.proofGenerated ? "yes" : "no"}
- on-chain update attempted: ${step3.onChainUpdateAttempted ? "yes" : "no"}
- gateway executed: ${step3.gatewayExecuted ? "yes" : "no"}

## Privacy

- public chain amount exposed: no
- public chain usedAmount exposed: no
- public chain clauseStatus exposed: no
- user-level link tag exposed: no
- forbidden private witness exposed in publicRecord: ${summary.privacy.forbiddenPrivateWitnessExposed ? "yes" : "no"}

## Command evidence

${results.map((r) => `### ${r.name}\n\n- command: \`${r.command}\`\n- status: ${r.status}\n\n\`\`\`text\n${tail(r.output, 80)}\n\`\`\``).join("\n\n")}

## Known warnings

- Node may print [DEP0180] fs.Stats constructor is deprecated. This is non-blocking.
- Hardhat may print hre.network.connect() deprecation warnings. This is non-blocking.
- M11 deliberately does not run gas benchmarks or public testnet deployment.
`;
}

function main(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(DOC_DIR, { recursive: true });

  const results: CommandResult[] = [];

  const m9 = runCommand("check_admission_contract", "npx ts-node scripts/m9/check_admission_contract.ts");
  results.push(m9);
  requirePass(m9);

  const m10 = runCommandPreservingFiles("check_gateway_execution", "npx ts-node scripts/m10/check_gateway_execution.ts", ["docs/M10_GATEWAY_EXECUTION_REPORT.md"]);
  results.push(m10);
  requirePass(m10);

  const m7 = runCommand("check_update_full_circuit", "npx ts-node scripts/m7/check_update_full_circuit.ts");
  results.push(m7);
  requirePass(m7);

  const compile = runCommand("hardhat compile", "npx hardhat compile");
  results.push(compile);
  requirePass(compile);

  const expected = readJson<JsonObject>("fixtures/m9/expected_admission_state.json");
  const stateExpected = readJson<JsonObject>("fixtures/m3/state_tree_expected.json");
  const step1Input = readJson<JsonObject>("fixtures/m7/update_full_input_step1.json");
  const step2Input = readJson<JsonObject>("fixtures/m7/update_full_input_step2.json");
  const step3Input = readJson<JsonObject>("fixtures/m7/update_full_negative_cases/exceeds_limit.json");
  const step1Receipt = readJson<JsonObject>("fixtures/m10/gateway_receipt_step1.json");
  const step2Receipt = readJson<JsonObject>("fixtures/m10/gateway_receipt_step2.json");

  writeJson("fixtures/m11/step3_reject_input.json", step3Input);

  const step3RejectReport = {
    label: "step3",
    hiddenStateTransition: "36000 -> 54000",
    rejected: true,
    rejectionLayer: "circuit",
    reason: "usedAmountNew exceeds policy limit",
    proofGenerated: false,
    onChainUpdateAttempted: false,
    gatewayExecuted: false,
    sourceFixture: "fixtures/m7/update_full_negative_cases/exceeds_limit.json",
    circuitCheckCommand: "npx ts-node scripts/m7/check_update_full_circuit.ts",
    circuitCheckPassed: m7.status === "pass",
    privateDemoFacts: {
      amount: step3Input.amount,
      usedAmountOld: step3Input.usedAmountOld,
      usedAmountNew: step3Input.usedAmountNew,
      limit: step3Input.limit,
      threshold: step3Input.threshold,
      clauseStatus: "SATISFIED",
      overThreshold: true,
    },
  };
  writeJson("fixtures/m11/step3_reject_report.json", step3RejectReport);

  const transcript = {
    demo: "NCC full local demo",
    scenario: "daily stablecoin off-ramp cumulative compliance",
    generatedAt: readExistingGeneratedAt("fixtures/m11/demo_transcript.json"),
    policy: {
      limit: expected.policy?.limit ?? step1Input.limit,
      threshold: expected.policy?.threshold ?? step1Input.threshold,
      clauseType: expected.policy?.clauseType ?? step1Input.clauseType,
    },
    deployment: {
      mode: "local hardhat system exercised by scripts/m9/check_admission_contract.ts",
      components: [
        "PoseidonT3",
        "InitComplianceStateVerifier",
        "UpdateComplianceStateVerifier",
        "RootRegistry",
        "ComplianceAdmission",
      ],
      rootRegistryUsesM2ActiveRoots: true,
      complianceAdmissionDepth: String(expected.treeDepth ?? 8),
      contractAddressesRecordedByM9Checker: false,
      note: "The existing M9 checker deploys and exercises the local contracts. M11 records the demo transcript and proof/gateway outcomes without changing M9 contract semantics.",
    },
    roots: {
      initialStateRoot: expected.stateRoots.emptyRoot,
      knownEmptyRoot: stateExpected.emptyRoot,
      afterInit: expected.stateRoots.afterInit,
      afterStep1: expected.stateRoots.afterUpdateStep1,
      afterStep2: expected.stateRoots.afterUpdateStep2,
    },
    privacyBoundary: {
      publicChainDoesNotExpose: [
        "identity",
        "amount",
        "usedAmount",
        "clauseStatus",
        "action context fields",
        "user-level link tag",
        "C_old",
        "owner",
        "Merkle paths",
      ],
      publicChainStores: [
        "nullifiers",
        "commitments",
        "actionHash",
        "amountCom",
        "clauseCom",
        "rho",
        "state roots",
      ],
    },
    steps: [
      {
        type: "setup",
        label: "setup",
        accepted: true,
        activeRoots: expected.activeRoots,
        knownEmptyRoot: expected.stateRoots.emptyRoot,
        stateTreeDepth: String(expected.treeDepth ?? 8),
      },
      {
        type: "init",
        label: "init",
        accepted: true,
        stateIndex: expected.stateIndices.init,
        newStateRoot: expected.stateRoots.afterInit,
        N_gen: expected.init.N_gen,
        C_gen: expected.init.C_gen,
        policyScopeHash: expected.init.policyScopeHash,
      },
      {
        type: "update",
        label: "step1",
        hiddenStateTransition: "0 -> 18000",
        acceptedByAdmission: true,
        acceptedByGateway: step1Receipt.accepted === true,
        publicRecord: publicRecordFromExpected(
          expected.records.step1,
          expected.stateIndices.updateStep1,
          expected.stateRoots.afterUpdateStep1,
        ),
        privateDemoFacts: {
          amount: step1Input.amount,
          clauseStatus: "DUMMY",
          overThreshold: false,
        },
      },
      {
        type: "update",
        label: "step2",
        hiddenStateTransition: "18000 -> 36000",
        acceptedByAdmission: true,
        acceptedByGateway: step2Receipt.accepted === true,
        publicRecord: publicRecordFromExpected(
          expected.records.step2,
          expected.stateIndices.updateStep2,
          expected.stateRoots.afterUpdateStep2,
        ),
        privateDemoFacts: {
          amount: step2Input.amount,
          usedAmountNew: step2Input.usedAmountNew,
          threshold: step2Input.threshold,
          clauseStatus: "SATISFIED",
          overThreshold: true,
        },
      },
      {
        type: "update",
        label: "step3",
        hiddenStateTransition: "36000 -> 54000",
        acceptedByAdmission: false,
        acceptedByGateway: false,
        rejectionLayer: "circuit",
        reason: "usedAmountNew exceeds policy limit",
        proofGenerated: false,
        onChainUpdateAttempted: false,
        gatewayExecuted: false,
        sourceFixture: "fixtures/m7/update_full_negative_cases/exceeds_limit.json",
        privateDemoFacts: {
          amount: step3Input.amount,
          usedAmountOld: step3Input.usedAmountOld,
          usedAmountNew: step3Input.usedAmountNew,
          limit: step3Input.limit,
          threshold: step3Input.threshold,
          clauseStatus: "SATISFIED",
          overThreshold: true,
        },
      },
    ],
  };

  const summary = {
    demo: transcript.demo,
    status: "pass",
    initAccepted: true,
    step1AdmissionAccepted: true,
    step1GatewayAccepted: step1Receipt.accepted === true,
    step2AdmissionAccepted: true,
    step2GatewayAccepted: step2Receipt.accepted === true,
    step3Rejected: true,
    step3RejectionLayer: "circuit",
    step3ProofGenerated: false,
    step3OnChainUpdateAttempted: false,
    step3GatewayExecuted: false,
    stateRoots: {
      initRootEqualsM3AfterCGen: expected.stateRoots.afterInit === stateExpected.appendResults[0].newRoot,
      step1RootEqualsM3AfterCAfter18000: expected.stateRoots.afterUpdateStep1 === stateExpected.appendResults[1].newRoot,
      step2RootEqualsM3AfterCAfter36000: expected.stateRoots.afterUpdateStep2 === stateExpected.appendResults[2].newRoot,
      finalAcceptedStateRoot: expected.stateRoots.afterUpdateStep2,
    },
    privacy: {
      publicChainAmountExposed: false,
      publicChainUsedAmountExposed: false,
      publicChainClauseStatusExposed: false,
      userLevelLinkTagExposed: false,
      forbiddenPrivateWitnessExposed: false,
    },
    commands: Object.fromEntries(results.map((r) => [r.name, r.status])),
    readyForM12: true,
  };

  writeJson("fixtures/m11/demo_transcript.json", transcript);
  writeJson("fixtures/m11/demo_summary.json", summary);
  writeText("docs/M11_FULL_LOCAL_DEMO_SPEC.md", buildSpec());
  writeText("docs/M11_FULL_LOCAL_DEMO_REPORT.md", buildReport(transcript, summary, results));

  console.log("wrote fixtures/m11/demo_transcript.json");
  console.log("wrote fixtures/m11/demo_summary.json");
  console.log("wrote fixtures/m11/step3_reject_input.json");
  console.log("wrote fixtures/m11/step3_reject_report.json");
  console.log("wrote docs/M11_FULL_LOCAL_DEMO_SPEC.md");
  console.log("wrote docs/M11_FULL_LOCAL_DEMO_REPORT.md");
  console.log("run_full_local_demo: pass");
}

main();
