// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Interface for the circomlibjs-generated Poseidon contract with 2 inputs.
/// @dev In circomlibjs naming, PoseidonT3 corresponds to 2 Poseidon inputs.
///      Tests deploy the generated EVM bytecode from poseidonContract.createCode(2).
interface PoseidonT3 {
    function poseidon(uint256[2] memory input) external view returns (uint256);
}
