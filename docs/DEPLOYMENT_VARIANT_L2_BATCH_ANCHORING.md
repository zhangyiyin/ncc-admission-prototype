# L2 Admission with Batched L1 Anchoring

## Scope

This document describes the deployment artifact used with the NCC prototype. Real-time admission remains on one canonical EVM-compatible L2 or appchain. Each initialization and update is verified by the same admission relation used by the local EVM prototype. L1 stores only a deterministic summary commitment over already accepted admission records.

The L1 anchor is not a validity proof, does not replace per-update admission verification, and does not authorize a gateway action by itself.

## Architecture

The deployment separates four roles:

1. **User / prover.** Produces initialization or update proofs and the private execution package.
2. **Canonical admission layer.** Verifies proofs, enforces active-root checks and nullifier consumption, appends accepted state commitments, and records accepted action references.
3. **Gateway.** Queries an accepted record by `rho`, recomputes the private-package bindings, and applies the process-local single-use authorization check before the external side effect.
4. **Batch anchor.** Commits a deterministic summary of accepted admission records to L1 for delayed audit evidence.

For one regulatory scope there must be exactly one canonical admission layer. Independent same-scope deployments on multiple L2s would require a shared state/nullifier mechanism that this artifact does not implement.

## Batch summary

Machine-readable schema:

```text
schemas/anchoring/batch_summary.schema.json
```

Committed demo and result artifacts:

```text
fixtures/anchoring/demo_batch_summary.json
fixtures/anchoring/demo_anchor_receipt.json
fixtures/anchoring/anchor_cost_estimate.json
fixtures/anchoring/anchor_cost_table.md
fixtures/anchoring/anchoring_test_report.json
fixtures/anchoring/l2_anchoring_final_summary.json
```

The summary commits to public admission information such as the state-root interval, accepted-action digest, nullifier digest, state-commitment digest, record count, and batch digest. It does not introduce plaintext amount, hidden owner, predecessor commitment, cumulative totals, Merkle paths, or a user-level aggregation tag.

## Cost interpretation

Baseline local EVM admission gas source:

```text
fixtures/m12/contract_gas.json
```

The anchoring cost calculation and measured local anchor receipt are under `fixtures/anchoring/`. These numbers support a parameterized amortization calculation. They are not measurements from a production L2, public testnet, bridge, sequencer, or mainnet environment.

## Reproduction

```text
contracts/anchoring/BatchAnchor.sol
scripts/anchoring/
test/anchoring/
fixtures/anchoring/
schemas/anchoring/batch_summary.schema.json
```

The ordinary admission protocol, proof public-input ordering, nullifier semantics, action binding, and gateway package matching are unchanged by this deployment artifact.

## Limitations

This artifact does not implement proof aggregation, recursion, a batch validity proof, cross-L2 shared cumulative quota, production L2 integration, production settlement rollback, or admission/external-execution atomicity.

Gateway single-use authorization remains process-local. A production multi-instance gateway requires a shared persistent atomic idempotency mechanism.
