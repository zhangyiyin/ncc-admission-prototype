# OJ-CS Measurement Report

## Scope

This report measures the final local NCC prototype after the OJ-CS range-soundness audit. The implementation baseline remains `b7ccdfe`; the final circuit, R1CS, wasm, proving/verification keys, Solidity verifier, admission contract, and public-input order are unchanged.

The **manuscript-authoritative runtime dataset** is the sustained default-parallel 100-run dataset in `fixtures/ojcs_runtime_final_parallel/`. Earlier exploratory and diagnostic measurements were used only to refine the measurement methodology and are not part of the manuscript-authoritative runtime dataset.

These results are **local prototype measurements**. They are not production service-level latency measurements and are not production L2 benchmarks.

## Environment

- OS: Ubuntu 22.04.5 LTS
- Kernel: 6.8.0-124-generic
- CPU: Intel(R) Core(TM) i9-10885H CPU @ 2.40GHz
- Logical processors visible to VM: 4
- Memory: captured in `fixtures/ojcs/measurement_environment.json`
- Virtualization: virtual machine / virtualized environment; hypervisor reported by lscpu: KVM
- Node.js: v22.23.1
- npm: 10.9.8
- Hardhat: 3.9.0
- Solidity compiler configured for the project: 0.8.28, optimizer enabled=true, runs=200
- Solidity compiler confirmed by Hardhat build metadata: 0.8.28+commit.7893614a
- Circom: circom compiler 2.2.3
- snarkjs: ^0.7.6 (project dependency)
- Curve: BN254 / alt_bn128
- Proving system: Groth16
- Local blockchain runtime: Hardhat local EVM
- Local chain ID: 31337

The exact input, wasm, zkey, and verification-key SHA-256 hashes are recorded in `fixtures/ojcs/measurement_environment.json`.

## Methodology

### Authoritative proving / verification runtime

The final runtime benchmark uses the existing **4-vCPU virtualized environment**. Before formal measurement, `UpdateComplianceStateFull` is proved continuously for a fixed **10-minute sustained preconditioning** interval using the default snarkjs/ffjavascript parallel path. Preconditioning observations do not enter the formal CSV.

Formal measurement then runs **100 cyclically interleaved rounds**. Each round contains Init, Update1, and Update2 once, with execution order rotating as `Init -> Update1 -> Update2`, `Update1 -> Update2 -> Init`, and `Update2 -> Init -> Update1`.

Witness generation uses a fresh `node generate_witness...` child process. Proof generation uses a fresh default-parallel `npx snarkjs groth16 prove ...` child process; `{singleThread:true}` and CPU affinity restrictions are not used. Verification uses a fresh `npx snarkjs groth16 verify ...` child process. `process.hrtime.bigint()` surrounds the complete child-process invocation, so process startup, corresponding artifact loading, and file I/O are included. Circuit compilation, Powers of Tau, Groth16 setup, zkey generation, verifier generation, and contract deployment are excluded.

No formal observations are deleted and no outlier filtering is applied. Manuscript runtime reporting uses **median + Tukey IQR**. Quartiles use the Tukey median-of-halves rule. p95 is retained in `fixtures/ojcs_runtime_final_parallel/measurement_summary.json` as a diagnostic artifact only, not as a manuscript-authoritative statistic.

### Gateway timing

The gateway benchmark is unchanged from the prior OJ-CS measurement artifact. It remains a separate 30-run local in-process benchmark of the existing gateway digest computation and accepted-record check; this runtime promotion does not alter or rerun gateway results.

## Proving and verification timing

| Operation | Phase | n | Median ms | Q1 ms | Q3 ms | IQR ms | Mean ms | Min ms | Max ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| init | witness | 100 | 171.644 | 160.249 | 193.096 | 32.847 | 177.110 | 119.000 | 237.478 |
| init | prove | 100 | 2851.735 | 2782.224 | 3109.190 | 326.966 | 2957.229 | 2461.963 | 4018.343 |
| init | verify | 100 | 918.255 | 867.557 | 1000.544 | 132.987 | 941.798 | 772.955 | 1285.947 |
| update_step1 | witness | 100 | 221.091 | 200.278 | 237.947 | 37.669 | 222.811 | 169.084 | 356.121 |
| update_step1 | prove | 100 | 3349.037 | 3272.341 | 3716.215 | 443.874 | 3491.510 | 2835.749 | 4934.204 |
| update_step1 | verify | 100 | 929.162 | 884.437 | 993.414 | 108.977 | 943.932 | 799.040 | 1564.622 |
| update_step2 | witness | 100 | 219.497 | 200.116 | 239.339 | 39.223 | 228.407 | 171.223 | 562.382 |
| update_step2 | prove | 100 | 3370.241 | 3258.130 | 3725.088 | 466.958 | 3519.283 | 3001.688 | 5436.440 |
| update_step2 | verify | 100 | 928.467 | 885.424 | 1011.290 | 125.866 | 949.554 | 817.592 | 1215.606 |

## Gateway timing

| Operation | Phase | n | Median ms | Q1 ms | Q3 ms | IQR ms | Mean ms | Min ms | Max ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| step1 | digest | 30 | 1.197 | 1.143 | 1.246 | 0.103 | 1.279 | 1.077 | 3.710 |
| step1 | record_check | 30 | 0.035 | 0.034 | 0.037 | 0.004 | 0.038 | 0.032 | 0.098 |
| step2 | digest | 30 | 1.202 | 1.154 | 1.246 | 0.091 | 1.214 | 1.091 | 1.644 |
| step2 | record_check | 30 | 0.035 | 0.034 | 0.038 | 0.004 | 0.038 | 0.033 | 0.065 |
| negative_wrong_amount | digest | 30 | 1.243 | 1.211 | 1.342 | 0.131 | 1.287 | 1.149 | 1.751 |
| negative_wrong_amount | record_check | 30 | 0.037 | 0.036 | 0.039 | 0.003 | 0.041 | 0.034 | 0.097 |

The negative gateway result is a package-level rejection measurement using the existing gateway checker. It is not claimed as a circuit-level or admission-contract rejection.

## Gas source

The gas values below come from the existing local Hardhat M12 gas artifact, `fixtures/m12/contract_gas.json`. They remain applicable because the released artifact preserves the circuit, verifier, admission contract, and public-input ordering used for the reported gas measurement.

| Item | Gas |
|---|---:|
| init verifier verifyProof estimate | 250389 |
| update step1 verifier verifyProof estimate | 279001 |
| update step2 verifier verifyProof estimate | 279013 |
| initializeState transaction | 758308 |
| updateState step1 transaction | 899250 |
| updateState step2 transaction | 899262 |

Admission transaction gas includes more than verifier execution: root checks, nullifier checks, state-tree append, and storage writes are also part of the local admission path. The verifier-only estimates are shown only as a breakdown aid.

## Measurement-history note

Earlier exploratory and diagnostic measurements were used only to refine the measurement methodology and are not part of the manuscript-authoritative runtime dataset.

## Raw artifacts

- **authoritative proving observations:** `fixtures/ojcs_runtime_final_parallel/proving_runs.csv`
- **authoritative runtime summary (includes diagnostic p95/convergence/segment analysis):** `fixtures/ojcs_runtime_final_parallel/measurement_summary.json`
- **authoritative sustained runtime report:** `docs/OJCS_RUNTIME_FINAL_PARALLEL_REPORT.md`
- system/load observations: `fixtures/ojcs_runtime_final_parallel/system_samples.csv`
- benchmark artifact hashes: `fixtures/ojcs_runtime_final_parallel/artifact_hashes_before.txt` and `artifact_hashes_after.txt`
- original combined OJ-CS measurement summary (now pointing to the final runtime data while preserving gateway/gas): `fixtures/ojcs/measurement_summary.json`
- measurement environment inventory: `fixtures/ojcs/measurement_environment.json`
- unchanged gateway observations: `fixtures/ojcs/gateway_runs.csv`

## Limitations

The measurements are from one local virtualized development environment and are not hardware-independent performance claims. No public testnet, production L2, remote proving service, network round trip, production database, or production gateway service is included. Gateway timings are local in-process measurements. Proving timings include command-process startup overhead and therefore should be interpreted as reproducible local end-to-end tool invocation timings rather than isolated cryptographic-kernel timings.

The default-parallel 100-run trace retains observable sustained runtime variability across the 4-vCPU virtualized environment. All such observations remain in the dataset. The benchmark is therefore reported as an empirical local end-to-end distribution rather than as a claim of stationary cryptographic-kernel latency.
