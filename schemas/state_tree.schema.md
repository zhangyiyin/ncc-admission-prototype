# State Tree Fixture Schema

`fixtures/m3/state_tree_expected.json` records the deterministic append sequence for the M3 state commitment tree.

Required fields:

- `depth`: fixed state tree depth. M3 uses `8`.
- `emptyRoot`: root of the empty append-only state tree.
- `zeroSchedule`: decimal field strings for `zero[0..depth]`.
- `appendResults`: ordered append results.
  - `label`: fixture label, such as `C_gen`.
  - `index`: append index.
  - `leaf`: state commitment as a decimal field string.
  - `oldRoot`: root before append.
  - `newRoot`: root after append.
- `knownRoots`: accepted historical roots, including the empty root.

The public-style data are commitments, indices, and roots. Any private state opening used to derive a commitment is debug-only fixture input and is not a public chain record.
