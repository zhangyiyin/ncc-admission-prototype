# State Witness Schema

`fixtures/m3/state_witnesses.json` stores prover-side membership witnesses for the append-only state commitment tree.

Witness object:

```json
{
  "leaf": "...",
  "index": 0,
  "siblings": ["..."],
  "pathIndices": [0],
  "root": "..."
}
```

Rules:

- `leaf`, `siblings[*]`, and `root` are BN254 scalar-field decimal strings.
- `siblings.length == STATE_TREE_DEPTH`.
- `pathIndices.length == STATE_TREE_DEPTH`.
- `pathIndices[i] = 0` means the current node is the left child.
- `pathIndices[i] = 1` means the current node is the right child.

State witnesses are private inputs for future circuits. They are not public calldata, public events, or public storage.
