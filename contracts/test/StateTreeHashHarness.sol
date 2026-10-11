// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PoseidonT3} from "../libraries/PoseidonT3.sol";

/// @notice Test-only harness for the M1-R2 main-path Solidity hash requirement.
/// @dev Solidity main path only needs Poseidon2 for incremental state-tree node hashes.
///      Higher-arity protocol digests are proof-verified public values, not recomputed here.
contract StateTreeHashHarness {
    PoseidonT3 public immutable poseidonT3;

    constructor(address poseidonT3Address) {
        poseidonT3 = PoseidonT3(poseidonT3Address);
    }

    function hashMerkleNode(uint256 left, uint256 right) public view returns (uint256) {
        uint256[2] memory input;
        input[0] = left;
        input[1] = right;
        return poseidonT3.poseidon(input);
    }

    function zeroSchedule3() external view returns (uint256 zero1, uint256 zero2, uint256 zero3) {
        zero1 = hashMerkleNode(0, 0);
        zero2 = hashMerkleNode(zero1, zero1);
        zero3 = hashMerkleNode(zero2, zero2);
    }
}
