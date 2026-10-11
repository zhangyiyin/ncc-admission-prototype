# OJ-CS Membership-Depth Constraint Scaling

## Scope

This artifact reports **uniform membership-depth scaling** for `UpdateComplianceStateFull` on baseline `2d3d158`.

The circuit has one `depth` parameter, and that same depth is applied simultaneously to four Merkle membership paths:

- registration
- status
- policy
- state

Therefore, this experiment is **not state-tree-only scaling**. Increasing the tested depth changes all four membership paths together.

The experiment is compile-only. It compiles R1CS for depths 8, 16, 24, and 32 in an isolated temporary/output directory. It does not modify the production Full circuit or existing proving artifacts.

## Constraint results

| Uniform membership depth | Non-linear constraints | Linear constraints | Total constraints | Public inputs |
|---:|---:|---:|---:|---:|
| 8 | 14,351 | 17,426 | 31,777 | 10 |
| 16 | 22,191 | 26,290 | 48,481 | 10 |
| 24 | 30,031 | 35,154 | 65,185 | 10 |
| 32 | 37,871 | 44,018 | 81,889 | 10 |

Across these measured depths, constraint growth is exactly affine:

- non-linear: **+980 constraints per additional depth level**
- linear: **+1,108 constraints per additional depth level**
- total: **+2,088 constraints per additional depth level**

Equivalently,

```text
non-linear(depth) = 6511 + 980 * depth
linear(depth)     = 8562 + 1108 * depth
total(depth)      = 15073 + 2088 * depth
```

The public-input count remains 10.

## Measurement boundary

This artifact intentionally contains no runtime scaling claim:

- **no witness benchmark**
- **no proving benchmark**
- **no setup/zkey generation**
- **no Solidity verifier generation**

The current off-chain Merkle tooling uses dense tree construction. Its memory/work grows with `2^depth`, which becomes impractical for the depth-24 and depth-32 cases used in this constraint-scaling experiment. A scalable sparse/on-demand witness-maintenance implementation is **not implemented in the prototype**. For that reason, this artifact stops at R1CS constraint scaling and does not extrapolate proving runtime from the compile-only measurements.

## On-chain incremental tree limitation

`IncrementalPoseidonTree.sol` stores persistent tree metadata and state including initialization status, the Poseidon contract address, tree depth, next insertion index, zero values, filled subtrees, the set of known historical roots, and the current root.

Each successful insertion updates the relevant `filledSubtrees` entries along the insertion path, increments `nextIndex`, replaces `currentRoot`, and marks the new root in `knownRoots`.

The current historical-root policy has the following properties:

- `knownRoots` are retained indefinitely once recorded; there is no expiry/removal path.
- there is **no pruning, rolling window, or compaction** mechanism.
- tree capacity is `2^depth`.
- at depth 8, the tree therefore accepts exactly **256 commitments**.
- after those 256 insertions, the next insertion encounters the capacity check and reverts with **`TreeFull()`**.

This historical-root retention is a prototype storage limitation; it is not a claim that the number of roots is mathematically unbounded for a fixed finite-depth tree.

## Reproducibility

The checked-in measurement script is:

```text
scripts/ojcs_depth_scaling/measure_constraints.py
```

It creates temporary circuit variants that differ only in the `UpdateComplianceStateFull(depth)` main instantiation, compiles **R1CS only**, parses the compiler counts using line-anchored metric matching, and writes the JSON summary. Temporary R1CS files are discarded with the temporary directory.

The production `UpdateComplianceStateFull.circom`, contracts, zkey/vkey, and Solidity verifier are not modified by this artifact.
