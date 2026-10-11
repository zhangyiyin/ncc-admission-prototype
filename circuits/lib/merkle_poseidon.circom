pragma circom 2.1.6;

include "./hash_helpers.circom";

template MerkleRootPoseidon(depth) {
    signal input leaf;
    signal input siblings[depth];
    signal input pathIndices[depth];
    signal output root;

    signal cur[depth + 1];
    cur[0] <== leaf;

    component nodeHash[depth];
    signal left[depth];
    signal right[depth];
    signal diff[depth];
    signal selectedDiff[depth];

    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        // Quadratic-safe selector:
        // pathIndex = 0 => left = cur,     right = sibling
        // pathIndex = 1 => left = sibling, right = cur
        // Avoids putting two signal multiplications in one constraint.
        diff[i] <== siblings[i] - cur[i];
        selectedDiff[i] <== pathIndices[i] * diff[i];
        left[i] <== cur[i] + selectedDiff[i];
        right[i] <== siblings[i] - selectedDiff[i];

        nodeHash[i] = HashMerkleNode();
        nodeHash[i].left <== left[i];
        nodeHash[i].right <== right[i];
        cur[i + 1] <== nodeHash[i].out;
    }

    root <== cur[depth];
}
