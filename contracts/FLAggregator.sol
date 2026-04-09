// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.27;

import { IRiscZeroVerifier } from "risc0/IRiscZeroVerifier.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IE3Program } from "@enclave-e3/contracts/contracts/interfaces/IE3Program.sol";
import { IEnclave } from "@enclave-e3/contracts/contracts/interfaces/IEnclave.sol";
import { E3 } from "@enclave-e3/contracts/contracts/interfaces/IE3.sol";

contract FLAggregator is IE3Program, Ownable {
  struct RoundConfig {
    uint32 numClients;
    uint32 numChunks;
    uint32 scaleFactor;
    uint32 maxGradInt;
    address coordinator;
  }

  bytes32 public constant ENCRYPTION_SCHEME_ID = keccak256("fhe.rs:BFV");
  uint256 public constant PLAINTEXT_MOD = 100;

  IEnclave public enclave;
  IRiscZeroVerifier public risc0Verifier;
  bytes32 public imageId;

  mapping(uint256 => RoundConfig) public rounds;
  mapping(uint256 => uint256) public inputCounts;
  mapping(uint256 => mapping(address => bool)) public submitted;
  mapping(uint256 => bytes32) public paramsHash;

  error CallerNotAuthorized();
  error E3AlreadyInitialized();
  error EnclaveAddressZero();
  error Risc0VerifierAddressZero();
  error InvalidNumClients();
  error InvalidNumChunks();
  error InvalidScaleFactor();
  error InvalidCoordinator();
  error OverflowInvariantViolated();
  error EmptyInputData();
  error KeyNotPublished(uint256 e3Id);
  error InputDeadlinePassed(uint256 e3Id, uint256 deadline);
  error E3NotAcceptingInputs(uint256 e3Id);
  error InvalidChunkCount(uint256 expected, uint256 actual);
  error RoundAlreadyFull(uint256 e3Id);
  error EmptyCiphertext(uint256 index);
  error DuplicateSubmission(uint256 e3Id, address sender);

  event InputReceived(uint256 indexed e3Id, address indexed sender, uint256 inputCount);

  constructor(IEnclave _enclave, IRiscZeroVerifier _risc0Verifier, bytes32 _imageId) Ownable(msg.sender) {
    if (address(_enclave) == address(0)) revert EnclaveAddressZero();
    if (address(_risc0Verifier) == address(0)) revert Risc0VerifierAddressZero();

    enclave = _enclave;
    risc0Verifier = _risc0Verifier;
    imageId = _imageId;
  }

  function validate(
    uint256 e3Id,
    uint256,
    bytes calldata e3ProgramParams,
    bytes calldata,
    bytes calldata
  ) external override returns (bytes32) {
    if (msg.sender != address(enclave) && msg.sender != owner()) revert CallerNotAuthorized();
    if (paramsHash[e3Id] != bytes32(0)) revert E3AlreadyInitialized();

    (uint32 numClients, uint32 numChunks, uint32 scaleFactor, uint32 maxGradInt, address coordinator) = abi.decode(
      e3ProgramParams,
      (uint32, uint32, uint32, uint32, address)
    );

    if (numClients < 2) revert InvalidNumClients();
    if (numChunks < 1) revert InvalidNumChunks();
    if (scaleFactor == 0) revert InvalidScaleFactor();
    if (coordinator == address(0)) revert InvalidCoordinator();

    // AGENTS.MD §Overflow Safety Invariant
    if (uint256(numClients) * uint256(scaleFactor) * uint256(maxGradInt) >= PLAINTEXT_MOD / 2) {
      revert OverflowInvariantViolated();
    }

    rounds[e3Id] = RoundConfig({
      numClients: numClients,
      numChunks: numChunks,
      scaleFactor: scaleFactor,
      maxGradInt: maxGradInt,
      coordinator: coordinator
    });
    paramsHash[e3Id] = keccak256(e3ProgramParams);

    return ENCRYPTION_SCHEME_ID;
  }

  function publishInput(uint256 e3Id, bytes memory data) external override {
    E3 memory e3 = enclave.getE3(e3Id);

    if (enclave.getE3Stage(e3Id) != IEnclave.E3Stage.KeyPublished) {
      revert KeyNotPublished(e3Id);
    }
    if (block.timestamp > e3.inputWindow[1]) {
      revert InputDeadlinePassed(e3Id, e3.inputWindow[1]);
    }
    if (block.timestamp < e3.inputWindow[0]) {
      revert E3NotAcceptingInputs(e3Id);
    }
    if (data.length == 0) revert EmptyInputData();

    (bytes[] memory ciphertexts, uint256 numChunks) = abi.decode(data, (bytes[], uint256));

    uint256 expectedNumChunks = rounds[e3Id].numChunks;
    if (ciphertexts.length != expectedNumChunks) {
      revert InvalidChunkCount(expectedNumChunks, ciphertexts.length);
    }
    if (numChunks != expectedNumChunks) {
      revert InvalidChunkCount(expectedNumChunks, numChunks);
    }
    if (inputCounts[e3Id] >= rounds[e3Id].numClients) {
      revert RoundAlreadyFull(e3Id);
    }
    if (submitted[e3Id][msg.sender]) {
      revert DuplicateSubmission(e3Id, msg.sender);
    }

    for (uint256 i = 0; i < ciphertexts.length; i++) {
      if (ciphertexts[i].length == 0) revert EmptyCiphertext(i);
    }

    // TODO: add GRECO-style input validity proof (P3 circuit)
    submitted[e3Id][msg.sender] = true;
    inputCounts[e3Id] += 1;

    emit InputReceived(e3Id, msg.sender, inputCounts[e3Id]);
  }

  function verify(uint256 e3Id, bytes32 ciphertextOutputHash, bytes memory proof) external view override returns (bool) {
    bytes memory journal = new bytes(396);

    _encodeLengthPrefixAndHash(journal, 0, ciphertextOutputHash);
    _encodeLengthPrefixAndHash(journal, 132, paramsHash[e3Id]);
    _encodeLengthPrefixAndHash(journal, 264, bytes32(0));

    risc0Verifier.verify(proof, imageId, sha256(journal));
    return true;
  }

  function _encodeLengthPrefixAndHash(bytes memory journal, uint256 startIndex, bytes32 hashVal) internal pure {
    journal[startIndex] = 0x20;
    startIndex += 4;

    for (uint256 i = 0; i < 32; i++) {
      journal[startIndex + i * 4] = hashVal[i];
    }
  }
}
