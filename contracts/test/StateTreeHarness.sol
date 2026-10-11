// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IncrementalPoseidonTree} from "../libraries/IncrementalPoseidonTree.sol";

contract StateTreeHarness {
    using IncrementalPoseidonTree for IncrementalPoseidonTree.Tree;

    event LeafInserted(uint256 indexed index, uint256 leaf, uint256 newRoot);

    IncrementalPoseidonTree.Tree private tree;

    constructor(address poseidonT3, uint32 depth_) {
        tree.init(poseidonT3, depth_);
    }

    function insert(uint256 leaf) external returns (uint256 index, uint256 newRoot) {
        (uint32 insertedIndex, uint256 rootAfterInsert) = tree.insert(leaf);
        emit LeafInserted(insertedIndex, leaf, rootAfterInsert);
        return (uint256(insertedIndex), rootAfterInsert);
    }

    function root() external view returns (uint256) {
        return tree.root();
    }

    function nextIndex() external view returns (uint256) {
        return uint256(tree.nextIndex);
    }

    function depth() external view returns (uint256) {
        return uint256(tree.treeDepth());
    }

    function isKnownRoot(uint256 root_) external view returns (bool) {
        return tree.isKnownRoot(root_);
    }

    function zero(uint256 level) external view returns (uint256) {
        return tree.zero(level);
    }
}
