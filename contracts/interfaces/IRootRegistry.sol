// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IRootRegistry {
    function rootRegAct() external view returns (uint256);
    function rootStatusAct() external view returns (uint256);
    function rootPolAct() external view returns (uint256);

    function getActiveRoots()
        external
        view
        returns (uint256, uint256, uint256);
}
