# ncc-admission-prototype

## Overview

This repository is the public reproducibility artifact for **Non-Linkable Cumulative Compliance for Regulated Public-Chain Admission (NCC)**.

NCC maintains cumulative compliance state across admitted actions while avoiding an explicit predecessor edge or reusable same-user aggregation tag in ordinary public admission records. The prototype includes hidden cumulative-state transitions, unique initialization and predecessor consumption, active authority-root checks, action binding, accepted-record matching, and a process-local single-use gateway authorization layer.

This is a research prototype, not a production compliance, gateway, or settlement system.

## Repository structure

```text
circuits/      Circom initialization and update relations
contracts/     EVM admission, registry, tree, verifier, and anchoring contracts
entities/      Cryptographic, Merkle, authority, admission, and gateway helpers
scripts/       Reproduction, checking, measurement, and anchoring scripts
test/          Hardhat/Mocha regression tests
fixtures/      Deterministic demo data and paper-facing result artifacts
docs/          Reader-facing reports and deployment/privacy documentation
schemas/       Object and anchoring schemas
```

See `MANIFEST.md` for the authoritative result map.

## Prototype scope

The main prototype implements hidden cumulative state, current registration/status/policy membership, historical predecessor-state membership, one-time predecessor consumption, cumulative amount and transaction-count transitions, threshold-clause consistency, action binding through `amountCom`, `actionHash`, `clauseCom`, and `rho`, EVM admission, accepted records keyed by `rho`, gateway package matching, and process-local single-use authorization.

The gateway authorization state is in-memory and local to one live process. Restart persistence, multi-instance coordination, and admission/external-settlement atomicity are not implemented.

## Requirements

The reported environment used Linux, Node.js 22.x, npm 10.x, Hardhat 3.x, Solidity 0.8.28, Circom 2.2.x, snarkjs 0.7.x, Groth16 over BN254, and a local Hardhat EVM.

Install the locked Node dependencies with:

```bash
npm ci
```

`circom` must also be available in `PATH`.

The release preserves the dependency versions used for the reported experiments. `npm audit` may report known issues in transitive development dependencies; these versions are retained for reproducibility and are not intended as a production deployment stack.

## Clean-clone quick start

Generated Groth16 proving artifacts are intentionally not versioned. A clean clone can prepare the proof-dependent regression inputs with:

```bash
npm ci
npx ts-node scripts/m8/setup_groth16_verifiers.ts
npx ts-node scripts/m8/prove_m8_samples.ts
npx ts-node scripts/m9/build_admission_calls.ts
python3 scripts/repro/prepare_regression_compat.py
npx hardhat compile
npx hardhat test
```

`prepare_regression_compat.py` creates ignored local compatibility outputs required by unchanged regression tests. These generated files are not paper-facing measurements and are not committed.

### Groth16 calldata size

The ABI-encoded proof and verifier-call sizes can be reproduced with:

```bash
npx ts-node scripts/ojcs/measure_calldata_size.ts
```

Measured sizes:

| Operation | Proof payload | Public inputs | `verifyProof` calldata |
| --- | ---: | ---: | ---: |
| Init | 256 B | 192 B | 452 B |
| Full Update | 256 B | 320 B | 580 B |

`Proof payload` denotes the ABI encoding of `pA`, `pB`, and `pC` only. `Public inputs` denotes the ABI encoding of `pubSignals`. `verifyProof` calldata includes the 4-byte function selector. JSON artifact/file sizes are not used.

Machine-readable result:

```text
fixtures/ojcs/calldata_size.json
```

The Full Update proof payload itself is 256 B; the 580 B value is the complete `verifyProof` calldata, not the proof size.

## Full local demo

After the proof-dependent inputs above are prepared:

```bash
npx ts-node scripts/m11/run_full_local_demo.ts
npx ts-node scripts/m11/check_full_local_demo.ts
```

The demo accepts the 0 -> 18,000 and 18,000 -> 36,000 cumulative updates and rejects the 36,000 -> 54,000 candidate at the circuit layer.

```text
fixtures/m11/
docs/M11_FULL_LOCAL_DEMO_REPORT.md
```

## Gateway replay regression

```bash
npx ts-node scripts/m10/check_gateway_execution.ts
npx hardhat test test/m10/gatewayExecution.test.ts
```

The regression covers first authorization, replay rejection, independent authorization of distinct accepted `rho` values, and mismatch rejection without consuming the corresponding `rho`.

```text
entities/gateway/
fixtures/m10/
docs/M10_GATEWAY_EXECUTION_REPORT.md
```

## Circuit sizes, range tests, and depth scaling

Staged Basic / Action / Full circuit-size comparison:

```text
circuits/update_compliance_state/
fixtures/ojcs/ablation_summary.json
scripts/ojcs/measure_ablation_ojcs.ts
```

Range and overflow cases:

```bash
npx ts-node scripts/ojcs/check_range_soundness.ts
npx hardhat test test/ojcs/rangeSoundness.test.ts
```

```text
fixtures/ojcs/range_cases/
fixtures/ojcs/range_soundness_cases.json
docs/OJCS_RANGE_SOUNDNESS_AUDIT.md
```

Uniform membership-depth scaling:

```bash
python3 scripts/ojcs_depth_scaling/measure_constraints.py
```

```text
fixtures/ojcs_depth_scaling/constraint_scaling.json
docs/OJCS_MEMBERSHIP_DEPTH_SCALING.md
```

The reported totals at uniform depths 8, 16, 24, and 32 are 31,777, 48,481, 65,185, and 81,889 constraints.

## Runtime, gateway timing, and gas

Manuscript-authoritative sustained runtime:

```text
fixtures/ojcs_runtime_final_parallel/
docs/OJCS_RUNTIME_FINAL_PARALLEL_REPORT.md
run_ojcs_runtime_final_parallel.sh
scripts/ojcs_runtime_final_parallel/
```

This dataset uses 100 cyclically interleaved formal rounds after sustained preconditioning.

Gateway timing and combined measurement summary:

```text
fixtures/ojcs/gateway_runs.csv
fixtures/ojcs/measurement_summary.json
fixtures/ojcs/measurement_environment.json
docs/OJCS_MEASUREMENT_REPORT.md
```

Authoritative local EVM gas:

```text
fixtures/m12/contract_gas.json
scripts/m12/measure_contract_gas.ts
```

It records 758,308 gas for initialization and 899,250 / 899,262 gas for the two accepted updates.

## L2 anchoring artifact

```text
contracts/anchoring/
scripts/anchoring/
test/anchoring/
fixtures/anchoring/
schemas/anchoring/batch_summary.schema.json
docs/DEPLOYMENT_VARIANT_L2_BATCH_ANCHORING.md
```

The L1 digest is delayed audit evidence, not a validity proof and not the real-time gateway authorization signal.

## Limitations

This prototype does not claim production-ready KYC/AML/source-of-funds validation, production banking settlement, admission/external-execution atomicity, durable or distributed gateway replay protection, malicious-gateway prevention, complete metadata anonymity, proof aggregation or recursion, cross-L2 shared quota, production L2/mainnet performance, or production-scale large-depth witness maintenance.

The deployed local state tree has fixed depth 8. Persistent nullifiers, accepted records, and historical roots grow with accepted actions; pruning and compaction are not implemented.

## License

Released under the MIT License. See `LICENSE`.
