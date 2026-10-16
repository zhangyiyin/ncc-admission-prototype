# Public Release Manifest

This repository is a curated public reproducibility snapshot of the implementation used for the reported experiments.

## Included

The public artifact contains implementation sources, unchanged regression tests, executable reproduction/checking scripts, deterministic demo fixtures, paper-facing measurement data, schemas, and concise reader-facing reports.

Generated proving keys, witnesses, R1CS files, generated WASM, build caches, local run outputs, development diagnostics, manuscript files, review-response material, task-management material, and internal version-control history are not part of the release.

## Authoritative paper-facing result map

### Full local demo

```text
fixtures/m11/
docs/M11_FULL_LOCAL_DEMO_REPORT.md
scripts/m11/
test/m11/
```

### Gateway matching and single-use authorization

```text
entities/gateway/
fixtures/m10/
docs/M10_GATEWAY_EXECUTION_REPORT.md
scripts/m10/
test/m10/
```

Gateway single-use state is process-local and nonpersistent.

### Staged circuit sizes

```text
circuits/update_compliance_state/
fixtures/ojcs/ablation_summary.json
scripts/ojcs/measure_ablation_ojcs.ts
```

### Range / overflow checks

```text
fixtures/ojcs/range_cases/
fixtures/ojcs/range_soundness_cases.json
docs/OJCS_RANGE_SOUNDNESS_AUDIT.md
scripts/ojcs/check_range_soundness.ts
test/ojcs/rangeSoundness.test.ts
```

### Uniform membership-depth scaling

```text
fixtures/ojcs_depth_scaling/constraint_scaling.json
docs/OJCS_MEMBERSHIP_DEPTH_SCALING.md
scripts/ojcs_depth_scaling/measure_constraints.py
```

### Sustained runtime

```text
fixtures/ojcs_runtime_final_parallel/
docs/OJCS_RUNTIME_FINAL_PARALLEL_REPORT.md
scripts/ojcs_runtime_final_parallel/
run_ojcs_runtime_final_parallel.sh
```

The formal runtime dataset contains 100 interleaved rounds per operation.

### Gateway timing and measurement summary

```text
fixtures/ojcs/gateway_runs.csv
fixtures/ojcs/measurement_summary.json
fixtures/ojcs/measurement_environment.json
docs/OJCS_MEASUREMENT_REPORT.md
scripts/ojcs/measure_gateway_ojcs.ts
```

### Groth16 calldata-size measurement

- `scripts/ojcs/measure_calldata_size.ts` — ABI-encoded Groth16 proof, public-input, and verifier-call calldata size measurement.
- `fixtures/ojcs/calldata_size.json` — machine-readable result of the calldata-size measurement.

### Gas

```text
fixtures/m12/contract_gas.json
scripts/m12/measure_contract_gas.ts
```

### L2 admission / L1 anchoring artifact

```text
contracts/anchoring/
scripts/anchoring/
test/anchoring/
fixtures/anchoring/
schemas/anchoring/batch_summary.schema.json
docs/DEPLOYMENT_VARIANT_L2_BATCH_ANCHORING.md
```

## Generated regression compatibility outputs

Some unchanged regression tests expect local report/measurement files that are no longer part of the paper-facing release surface. Run:

```bash
python3 scripts/repro/prepare_regression_compat.py
```

after M8/M9 proof-input preparation and before the full Hardhat test suite. The generated compatibility outputs are ignored by Git and are not manuscript-authoritative result files.

## Claim boundaries

The release implements process-local single-use gateway authorization for an accepted `rho`. It does not implement restart-persistent or distributed replay state, and it does not make admission and an external settlement side effect atomic.

The L2 anchoring component is a deployment/cost artifact. The L1 digest is not a batch validity proof and does not replace the canonical real-time admission layer.
