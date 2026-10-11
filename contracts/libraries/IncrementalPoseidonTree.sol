// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPoseidonT3ForIncrementalTree {
    function poseidon(uint256[2] memory input) external view returns (uint256);
}

library IncrementalPoseidonTree {
    uint256 internal constant FR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint32 internal constant MAX_DEPTH = 32;

    error AlreadyInitialized();
    error InvalidDepth();
    error InvalidPoseidon();
    error InvalidLeaf();
    error TreeFull();
    error InvalidLevel();

    struct Tree {
        bool initialized;
        address poseidonT3;
        uint32 depth;
        uint32 nextIndex;
        mapping(uint256 => uint256) zeros;
        mapping(uint256 => uint256) filledSubtrees;
        mapping(uint256 => bool) knownRoots;
        uint256 currentRoot;
    }

    function init(Tree storage self, address poseidonT3, uint32 depth_) internal {
        if (self.initialized) revert AlreadyInitialized();
        if (poseidonT3 == address(0)) revert InvalidPoseidon();
        if (depth_ == 0 || depth_ > MAX_DEPTH) revert InvalidDepth();

        self.initialized = true;
        self.poseidonT3 = poseidonT3;
        self.depth = depth_;
        self.nextIndex = 0;
        self.zeros[0] = 0;

        for (uint32 i = 0; i < depth_; i++) {
            self.filledSubtrees[i] = self.zeros[i];
            self.zeros[i + 1] = _hashNode(self, self.zeros[i], self.zeros[i]);
        }

        self.currentRoot = self.zeros[depth_];
        self.knownRoots[self.currentRoot] = true;
    }

    function insert(Tree storage self, uint256 leaf) internal returns (uint32 index, uint256 newRoot) {
        if (leaf >= FR_MODULUS) revert InvalidLeaf();

        uint256 capacity = uint256(1) << self.depth;
        if (uint256(self.nextIndex) >= capacity) revert TreeFull();

        index = self.nextIndex;
        uint256 current = leaf;
        uint256 currentIndex = uint256(index);

        for (uint32 level = 0; level < self.depth; level++) {
            if (currentIndex % 2 == 0) {
                self.filledSubtrees[level] = current;
                current = _hashNode(self, current, self.zeros[level]);
            } else {
                current = _hashNode(self, self.filledSubtrees[level], current);
            }
            currentIndex >>= 1;
        }

        self.nextIndex = index + 1;
        self.currentRoot = current;
        self.knownRoots[current] = true;
        return (index, current);
    }

    function root(Tree storage self) internal view returns (uint256) {
        return self.currentRoot;
    }

    function isKnownRoot(Tree storage self, uint256 root_) internal view returns (bool) {
        return self.knownRoots[root_];
    }

    function zero(Tree storage self, uint256 level) internal view returns (uint256) {
        if (level > self.depth) revert InvalidLevel();
        return self.zeros[level];
    }


    function treeDepth(Tree storage self) internal view returns (uint32) {
        return self.depth;
    }

    function _hashNode(Tree storage self, uint256 left, uint256 right) private view returns (uint256) {
        uint256[2] memory input;
        input[0] = left;
        input[1] = right;
        return IPoseidonT3ForIncrementalTree(self.poseidonT3).poseidon(input);
    }
}
