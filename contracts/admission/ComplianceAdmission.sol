// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRootRegistry} from "../interfaces/IRootRegistry.sol";
import {IInitComplianceStateVerifier} from "../interfaces/IInitComplianceStateVerifier.sol";
import {IUpdateComplianceStateVerifier} from "../interfaces/IUpdateComplianceStateVerifier.sol";
import {IncrementalPoseidonTree} from "../libraries/IncrementalPoseidonTree.sol";

contract ComplianceAdmission {
    using IncrementalPoseidonTree for IncrementalPoseidonTree.Tree;

    uint256 private constant INIT_ROOT_REG = 0;
    uint256 private constant INIT_ROOT_STATUS = 1;
    uint256 private constant INIT_ROOT_POL = 2;
    uint256 private constant INIT_N_GEN = 3;
    uint256 private constant INIT_C_GEN = 4;
    uint256 private constant INIT_POLICY_SCOPE_HASH = 5;

    uint256 private constant UPD_ROOT_REG = 0;
    uint256 private constant UPD_ROOT_STATUS = 1;
    uint256 private constant UPD_ROOT_POL = 2;
    uint256 private constant UPD_RT_STATE = 3;
    uint256 private constant UPD_N_OLD = 4;
    uint256 private constant UPD_C_NEW = 5;
    uint256 private constant UPD_ACTION_HASH = 6;
    uint256 private constant UPD_AMOUNT_COM = 7;
    uint256 private constant UPD_CLAUSE_COM = 8;
    uint256 private constant UPD_RHO = 9;

    IRootRegistry public rootRegistry;
    IInitComplianceStateVerifier public initVerifier;
    IUpdateComplianceStateVerifier public updateVerifier;

    mapping(uint256 => bool) public usedGenesisNullifiers;
    mapping(uint256 => bool) public usedStateNullifiers;
    mapping(uint256 => bool) public acceptedRhos;

    struct InitProof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256[6] publicSignals;
    }

    struct UpdateProof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
        uint256[10] publicSignals;
    }

    struct AcceptedRecord {
        bool exists;
        uint256 rho;
        uint256 N_old;
        uint256 C_new;
        uint256 rtState;
        uint256 newStateRoot;
        uint256 actionHash;
        uint256 amountCom;
        uint256 clauseCom;
        uint256 stateIndex;
    }

    struct InitRecord {
        bool exists;
        uint256 N_gen;
        uint256 C_gen;
        uint256 policyScopeHash;
        uint256 newStateRoot;
        uint256 stateIndex;
    }

    mapping(uint256 => AcceptedRecord) public acceptedRecords;
    mapping(uint256 => InitRecord) public initRecordsByNullifier;

    IncrementalPoseidonTree.Tree private stateTree;

    event StateInitialized(
        uint256 indexed N_gen,
        uint256 indexed C_gen,
        uint256 indexed stateIndex,
        uint256 newStateRoot,
        uint256 policyScopeHash
    );

    event UpdateAccepted(
        uint256 indexed rho,
        uint256 indexed N_old,
        uint256 indexed C_new,
        uint256 rtState,
        uint256 newStateRoot,
        uint256 stateIndex,
        uint256 actionHash,
        uint256 amountCom,
        uint256 clauseCom
    );

    error InvalidAddress();
    error ActiveRootMismatch();
    error GenesisNullifierAlreadyUsed();
    error StateNullifierAlreadyUsed();
    error RhoAlreadyAccepted();
    error UnknownStateRoot();
    error InvalidInitProof();
    error InvalidUpdateProof();

    constructor(
        address rootRegistry_,
        address initVerifier_,
        address updateVerifier_,
        address poseidonT3_,
        uint32 stateTreeDepth_
    ) {
        if (
            rootRegistry_ == address(0) ||
            initVerifier_ == address(0) ||
            updateVerifier_ == address(0) ||
            poseidonT3_ == address(0)
        ) revert InvalidAddress();

        rootRegistry = IRootRegistry(rootRegistry_);
        initVerifier = IInitComplianceStateVerifier(initVerifier_);
        updateVerifier = IUpdateComplianceStateVerifier(updateVerifier_);
        stateTree.init(poseidonT3_, stateTreeDepth_);
    }

    function initializeState(InitProof calldata proof)
        external
        returns (uint256 stateIndex, uint256 newStateRoot)
    {
        _requireActiveRoots(
            proof.publicSignals[INIT_ROOT_REG],
            proof.publicSignals[INIT_ROOT_STATUS],
            proof.publicSignals[INIT_ROOT_POL]
        );

        uint256 N_gen = proof.publicSignals[INIT_N_GEN];
        if (usedGenesisNullifiers[N_gen]) revert GenesisNullifierAlreadyUsed();

        bool ok = initVerifier.verifyProof(proof.a, proof.b, proof.c, proof.publicSignals);
        if (!ok) revert InvalidInitProof();

        usedGenesisNullifiers[N_gen] = true;
        (uint32 insertedIndex, uint256 rootAfterInsert) = stateTree.insert(proof.publicSignals[INIT_C_GEN]);

        stateIndex = uint256(insertedIndex);
        newStateRoot = rootAfterInsert;

        _storeInitRecord(proof.publicSignals, stateIndex, newStateRoot);
    }

    function updateState(UpdateProof calldata proof)
        external
        returns (uint256 stateIndex, uint256 newStateRoot)
    {
        _requireActiveRoots(
            proof.publicSignals[UPD_ROOT_REG],
            proof.publicSignals[UPD_ROOT_STATUS],
            proof.publicSignals[UPD_ROOT_POL]
        );

        _precheckUpdate(proof.publicSignals);

        bool ok = updateVerifier.verifyProof(proof.a, proof.b, proof.c, proof.publicSignals);
        if (!ok) revert InvalidUpdateProof();

        usedStateNullifiers[proof.publicSignals[UPD_N_OLD]] = true;
        acceptedRhos[proof.publicSignals[UPD_RHO]] = true;

        (uint32 insertedIndex, uint256 rootAfterInsert) = stateTree.insert(proof.publicSignals[UPD_C_NEW]);
        stateIndex = uint256(insertedIndex);
        newStateRoot = rootAfterInsert;

        _storeAcceptedRecord(proof.publicSignals, stateIndex, newStateRoot);
    }

    function currentStateRoot() external view returns (uint256) {
        return stateTree.root();
    }

    function isKnownStateRoot(uint256 root_) external view returns (bool) {
        return stateTree.isKnownRoot(root_);
    }

    function isGenesisNullifierUsed(uint256 N_gen) external view returns (bool) {
        return usedGenesisNullifiers[N_gen];
    }

    function isStateNullifierUsed(uint256 N_old) external view returns (bool) {
        return usedStateNullifiers[N_old];
    }

    function isRhoAccepted(uint256 rho) external view returns (bool) {
        return acceptedRhos[rho];
    }

    function getAcceptedRecord(uint256 rho) external view returns (AcceptedRecord memory) {
        return acceptedRecords[rho];
    }

    function getInitRecord(uint256 N_gen) external view returns (InitRecord memory) {
        return initRecordsByNullifier[N_gen];
    }

    function stateTreeNextIndex() external view returns (uint256) {
        return uint256(stateTree.nextIndex);
    }

    function stateTreeDepth() external view returns (uint256) {
        return uint256(stateTree.treeDepth());
    }

    function _requireActiveRoots(
        uint256 rootReg,
        uint256 rootStatus,
        uint256 rootPol
    ) private view {
        (uint256 activeReg, uint256 activeStatus, uint256 activePol) = rootRegistry.getActiveRoots();
        if (rootReg != activeReg || rootStatus != activeStatus || rootPol != activePol) {
            revert ActiveRootMismatch();
        }
    }

    function _precheckUpdate(uint256[10] calldata publicSignals) private view {
        uint256 rtState = publicSignals[UPD_RT_STATE];
        uint256 N_old = publicSignals[UPD_N_OLD];
        uint256 rho = publicSignals[UPD_RHO];

        if (!stateTree.isKnownRoot(rtState)) revert UnknownStateRoot();
        if (usedStateNullifiers[N_old]) revert StateNullifierAlreadyUsed();
        if (acceptedRhos[rho]) revert RhoAlreadyAccepted();
    }

    function _storeInitRecord(
        uint256[6] calldata publicSignals,
        uint256 stateIndex,
        uint256 newStateRoot
    ) private {
        uint256 N_gen = publicSignals[INIT_N_GEN];
        uint256 C_gen = publicSignals[INIT_C_GEN];
        uint256 policyScopeHash = publicSignals[INIT_POLICY_SCOPE_HASH];

        initRecordsByNullifier[N_gen] = InitRecord({
            exists: true,
            N_gen: N_gen,
            C_gen: C_gen,
            policyScopeHash: policyScopeHash,
            newStateRoot: newStateRoot,
            stateIndex: stateIndex
        });

        emit StateInitialized(N_gen, C_gen, stateIndex, newStateRoot, policyScopeHash);
    }

    function _storeAcceptedRecord(
        uint256[10] calldata publicSignals,
        uint256 stateIndex,
        uint256 newStateRoot
    ) private {
        uint256 rho = publicSignals[UPD_RHO];

        acceptedRecords[rho] = AcceptedRecord({
            exists: true,
            rho: rho,
            N_old: publicSignals[UPD_N_OLD],
            C_new: publicSignals[UPD_C_NEW],
            rtState: publicSignals[UPD_RT_STATE],
            newStateRoot: newStateRoot,
            actionHash: publicSignals[UPD_ACTION_HASH],
            amountCom: publicSignals[UPD_AMOUNT_COM],
            clauseCom: publicSignals[UPD_CLAUSE_COM],
            stateIndex: stateIndex
        });

        emit UpdateAccepted(
            rho,
            publicSignals[UPD_N_OLD],
            publicSignals[UPD_C_NEW],
            publicSignals[UPD_RT_STATE],
            newStateRoot,
            stateIndex,
            publicSignals[UPD_ACTION_HASH],
            publicSignals[UPD_AMOUNT_COM],
            publicSignals[UPD_CLAUSE_COM]
        );
    }
}
