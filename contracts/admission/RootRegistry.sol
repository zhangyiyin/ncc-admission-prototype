// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract RootRegistry {
    uint256 public constant FR_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    uint256 public rootRegAct;
    uint256 public rootStatusAct;
    uint256 public rootPolAct;
    address public owner;

    event ActiveRootsUpdated(
        uint256 rootRegAct,
        uint256 rootStatusAct,
        uint256 rootPolAct
    );

    error NotOwner();
    error InvalidFieldElement();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        uint256 initialRootRegAct,
        uint256 initialRootStatusAct,
        uint256 initialRootPolAct
    ) {
        owner = msg.sender;
        _checkField(initialRootRegAct);
        _checkField(initialRootStatusAct);
        _checkField(initialRootPolAct);

        rootRegAct = initialRootRegAct;
        rootStatusAct = initialRootStatusAct;
        rootPolAct = initialRootPolAct;

        emit ActiveRootsUpdated(rootRegAct, rootStatusAct, rootPolAct);
    }

    function setActiveRoots(
        uint256 newRootRegAct,
        uint256 newRootStatusAct,
        uint256 newRootPolAct
    ) external onlyOwner {
        _checkField(newRootRegAct);
        _checkField(newRootStatusAct);
        _checkField(newRootPolAct);

        rootRegAct = newRootRegAct;
        rootStatusAct = newRootStatusAct;
        rootPolAct = newRootPolAct;

        emit ActiveRootsUpdated(rootRegAct, rootStatusAct, rootPolAct);
    }

    function getActiveRoots()
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return (rootRegAct, rootStatusAct, rootPolAct);
    }

    function _checkField(uint256 value) private pure {
        if (value >= FR_MODULUS) revert InvalidFieldElement();
    }
}
