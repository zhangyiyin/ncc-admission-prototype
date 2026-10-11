// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPoseidonT3 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

/// @title BatchAnchor
/// @notice Minimal L1 batch anchoring contract for NCC L2 admission summaries.
/// @dev This contract only records deterministic batch summaries. It does not
/// verify per-update ZK proofs, does not execute ComplianceAdmission, does not
/// maintain the hidden compliance-state tree, and does not prove batch validity.
contract BatchAnchor {
    uint256 private constant BN254_Q =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    uint256 private constant TAG_BATCH_WINDOW = 2004;
    uint256 private constant TAG_BATCH_CONTRACTS = 2005;
    uint256 private constant TAG_BATCH_TIME = 2006;
    uint256 private constant TAG_BATCH_ROOTS_A = 2007;
    uint256 private constant TAG_BATCH_ROOTS_B = 2008;
    uint256 private constant TAG_BATCH_DIGEST_A = 2009;
    uint256 private constant TAG_BATCH_DIGEST_B = 2010;
    uint256 private constant TAG_BATCH_WINDOW_RANGE = 2015;

    bytes32 private constant BATCH_ANCHORED_TOPIC =
        keccak256("BatchAnchored(uint256,uint256,uint256,uint256,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)");

    IPoseidonT3 public immutable poseidonT3;

    mapping(uint256 => uint256) public anchoredBatchDigest;
    mapping(uint256 => bool) public isAnchoredDigest;

    struct BatchAnchorInput {
        uint256 batchID;
        uint256 l2ChainID;
        uint256 l1ChainID;
        address admissionContract;
        uint256 fromStateRoot;
        uint256 toStateRoot;
        uint256 acceptedActionRoot;
        uint256 nullifierDigest;
        uint256 stateCommitmentDigest;
        uint256 count;
        uint256 firstL2Block;
        uint256 lastL2Block;
        uint256 batchStartTime;
        uint256 batchEndTime;
        uint256 batchDigest;
    }

    event BatchAnchored(
        uint256 indexed batchID,
        uint256 indexed batchDigest,
        uint256 indexed l2ChainID,
        uint256 l1ChainID,
        address admissionContract,
        address anchorContract,
        uint256 fromStateRoot,
        uint256 toStateRoot,
        uint256 acceptedActionRoot,
        uint256 nullifierDigest,
        uint256 stateCommitmentDigest,
        uint256 count,
        uint256 firstL2Block,
        uint256 lastL2Block,
        uint256 batchStartTime,
        uint256 batchEndTime
    );

    constructor(address poseidonT3_) {
        require(poseidonT3_ != address(0), "BatchAnchor: zero PoseidonT3");
        poseidonT3 = IPoseidonT3(poseidonT3_);
    }

    function computeBatchDigest(
        BatchAnchorInput calldata input
    ) public view returns (uint256) {
        _validateDigestInputs(input);

        uint256 batchWindowHash = _hashTagged3(
            TAG_BATCH_WINDOW,
            input.batchID,
            input.l2ChainID,
            input.l1ChainID
        );

        uint256 batchWindowRangeHash = _hashTagged3(
            TAG_BATCH_WINDOW_RANGE,
            input.firstL2Block,
            input.lastL2Block,
            input.count
        );

        uint256 batchContractHash = _hashTagged2(
            TAG_BATCH_CONTRACTS,
            uint256(uint160(input.admissionContract)),
            uint256(uint160(address(this)))
        );

        uint256 batchTimeHash = _hashTagged2(
            TAG_BATCH_TIME,
            input.batchStartTime,
            input.batchEndTime
        );

        uint256 batchRootHashA = _hashTagged3(
            TAG_BATCH_ROOTS_A,
            input.fromStateRoot,
            input.toStateRoot,
            input.acceptedActionRoot
        );

        uint256 batchRootHashB = _hashTagged3(
            TAG_BATCH_ROOTS_B,
            input.nullifierDigest,
            input.stateCommitmentDigest,
            batchRootHashA
        );

        uint256 batchDigestA = _hashTagged3(
            TAG_BATCH_DIGEST_A,
            batchWindowHash,
            batchWindowRangeHash,
            batchContractHash
        );

        return _hashTagged3(
            TAG_BATCH_DIGEST_B,
            batchTimeHash,
            batchRootHashB,
            batchDigestA
        );
    }

    function submitBatchAnchor(
        BatchAnchorInput calldata input
    ) external returns (uint256 computedDigest) {
        _validateSubmitInputs(input);

        computedDigest = computeBatchDigest(input);
        require(computedDigest == input.batchDigest, "BatchAnchor: digest mismatch");

        _recordAnchor(input.batchID, input.batchDigest);
        _emitBatchAnchored(input);
        return computedDigest;
    }

    function _recordAnchor(uint256 batchID, uint256 batchDigest) internal {
        require(!isAnchoredDigest[batchDigest], "BatchAnchor: duplicate batchDigest");
        require(anchoredBatchDigest[batchID] == 0, "BatchAnchor: duplicate batchID");

        anchoredBatchDigest[batchID] = batchDigest;
        isAnchoredDigest[batchDigest] = true;
    }

    /// @dev Emits BatchAnchored through LOG4 to avoid Stack-too-deep in the
    /// legacy Solidity codegen path while preserving the declared event ABI.
    function _emitBatchAnchored(BatchAnchorInput calldata input) internal {
        bytes memory data = new bytes(13 * 32);

        _writeWord(data, 0, input.l1ChainID);
        _writeWord(data, 1, uint256(uint160(input.admissionContract)));
        _writeWord(data, 2, uint256(uint160(address(this))));
        _writeWord(data, 3, input.fromStateRoot);
        _writeWord(data, 4, input.toStateRoot);
        _writeWord(data, 5, input.acceptedActionRoot);
        _writeWord(data, 6, input.nullifierDigest);
        _writeWord(data, 7, input.stateCommitmentDigest);
        _writeWord(data, 8, input.count);
        _writeWord(data, 9, input.firstL2Block);
        _writeWord(data, 10, input.lastL2Block);
        _writeWord(data, 11, input.batchStartTime);
        _writeWord(data, 12, input.batchEndTime);

        bytes32 topic0 = BATCH_ANCHORED_TOPIC;
        uint256 topic1 = input.batchID;
        uint256 topic2 = input.batchDigest;
        uint256 topic3 = input.l2ChainID;

        assembly {
            log4(add(data, 0x20), 416, topic0, topic1, topic2, topic3)
        }
    }

    function _writeWord(bytes memory data, uint256 index, uint256 value) internal pure {
        assembly {
            mstore(add(add(data, 0x20), mul(index, 0x20)), value)
        }
    }

    function _validateSubmitInputs(BatchAnchorInput calldata input) internal pure {
        require(input.batchDigest != 0, "BatchAnchor: zero batchDigest");
        _requireField(input.batchDigest);
        _validateDigestInputs(input);
    }

    function _validateDigestInputs(BatchAnchorInput calldata input) internal pure {
        require(input.l2ChainID > 0, "BatchAnchor: zero l2ChainID");
        require(input.l1ChainID > 0, "BatchAnchor: zero l1ChainID");
        require(input.admissionContract != address(0), "BatchAnchor: zero admissionContract");
        require(input.count > 0, "BatchAnchor: zero count");
        require(input.firstL2Block <= input.lastL2Block, "BatchAnchor: invalid block window");
        require(input.batchStartTime <= input.batchEndTime, "BatchAnchor: invalid time window");

        _requireField(input.batchID);
        _requireField(input.l2ChainID);
        _requireField(input.l1ChainID);
        _requireField(input.fromStateRoot);
        _requireField(input.toStateRoot);
        _requireField(input.acceptedActionRoot);
        _requireField(input.nullifierDigest);
        _requireField(input.stateCommitmentDigest);
        _requireField(input.count);
        _requireField(input.firstL2Block);
        _requireField(input.lastL2Block);
        _requireField(input.batchStartTime);
        _requireField(input.batchEndTime);
    }

    function _requireField(uint256 value) internal pure {
        require(value < BN254_Q, "BatchAnchor: field overflow");
    }

    function _poseidon2(uint256 a, uint256 b) internal view returns (uint256) {
        _requireField(a);
        _requireField(b);
        uint256[2] memory input = [a, b];
        return poseidonT3.poseidon(input);
    }

    function _hashTagged2(
        uint256 tag,
        uint256 a,
        uint256 b
    ) internal view returns (uint256) {
        return _poseidon2(_poseidon2(tag, a), b);
    }

    function _hashTagged3(
        uint256 tag,
        uint256 a,
        uint256 b,
        uint256 c
    ) internal view returns (uint256) {
        return _poseidon2(_poseidon2(_poseidon2(tag, a), b), c);
    }
}
