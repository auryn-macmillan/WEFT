// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.8.27;

import { Test } from "forge-std/Test.sol";
import { FLAggregator } from "../FLAggregator.sol";
import { IRiscZeroVerifier } from "risc0/IRiscZeroVerifier.sol";
import { IEnclave } from "@enclave-e3/contracts/contracts/interfaces/IEnclave.sol";
import { E3 } from "@enclave-e3/contracts/contracts/interfaces/IE3.sol";

contract MockEnclave {
  mapping(uint256 => E3) internal e3s;
  mapping(uint256 => IEnclave.E3Stage) internal stages;

  function setStage(uint256 e3Id, IEnclave.E3Stage stage) external {
    stages[e3Id] = stage;
  }

  function setInputWindow(uint256 e3Id, uint256 start, uint256 end) external {
    e3s[e3Id].inputWindow[0] = uint64(start);
    e3s[e3Id].inputWindow[1] = uint64(end);
  }

  function getE3(uint256 e3Id) external view returns (E3 memory) {
    return e3s[e3Id];
  }

  function getE3Stage(uint256 e3Id) external view returns (IEnclave.E3Stage) {
    return stages[e3Id];
  }
}

contract MockRiscZeroVerifier {
  bytes public lastProof;
  bytes32 public lastImageId;
  bytes32 public lastJournalDigest;

  function verify(bytes calldata proof, bytes32 imageId, bytes32 journalDigest) external {
    lastProof = proof;
    lastImageId = imageId;
    lastJournalDigest = journalDigest;
  }
}

contract FLAggregatorTest is Test {
  uint256 internal constant E3_ID = 1;
  bytes32 internal constant IMAGE_ID = bytes32(uint256(1234));

  MockEnclave internal mockEnclave;
  MockRiscZeroVerifier internal mockVerifier;
  FLAggregator internal aggregator;

  function setUp() external {
    mockEnclave = new MockEnclave();
    mockVerifier = new MockRiscZeroVerifier();
    aggregator = new FLAggregator(IEnclave(address(mockEnclave)), IRiscZeroVerifier(address(mockVerifier)), IMAGE_ID);
  }

  function testValidateStoresConfigAndReturnsSchemeId() external {
    bytes memory params = _roundParams(2, 2, 4, 4, address(this));

    bytes32 schemeId = aggregator.validate(E3_ID, 0, params, "", "");

    assertEq(schemeId, aggregator.ENCRYPTION_SCHEME_ID());

    (uint32 numClients, uint32 numChunks, uint32 scaleFactor, uint32 maxGradInt, address coordinator) = aggregator.rounds(E3_ID);
    assertEq(numClients, 2);
    assertEq(numChunks, 2);
    assertEq(scaleFactor, 4);
    assertEq(maxGradInt, 4);
    assertEq(coordinator, address(this));
    assertEq(aggregator.paramsHash(E3_ID), keccak256(params));
  }

  function testValidateRejectsOverflowInvariantViolation() external {
    bytes memory params = _roundParams(100, 1, 100, 100, address(this));

    vm.expectRevert(FLAggregator.OverflowInvariantViolated.selector);
    aggregator.validate(E3_ID, 0, params, "", "");
  }

  function testValidateRejectsInvalidParams() external {
    vm.expectRevert(FLAggregator.InvalidNumClients.selector);
    aggregator.validate(E3_ID, 0, _roundParams(1, 1, 1, 1, address(this)), "", "");

    vm.expectRevert(FLAggregator.InvalidNumChunks.selector);
    aggregator.validate(E3_ID + 1, 0, _roundParams(2, 0, 1, 1, address(this)), "", "");

    vm.expectRevert(FLAggregator.InvalidScaleFactor.selector);
    aggregator.validate(E3_ID + 2, 0, _roundParams(2, 1, 0, 1, address(this)), "", "");

    vm.expectRevert(FLAggregator.InvalidCoordinator.selector);
    aggregator.validate(E3_ID + 3, 0, _roundParams(2, 1, 1, 1, address(0)), "", "");
  }

  function testPublishInputIncrementsInputCount() external {
    _validateDefaultRound();
    mockEnclave.setStage(E3_ID, IEnclave.E3Stage.KeyPublished);
    mockEnclave.setInputWindow(E3_ID, 50, 150);
    vm.warp(100);

    vm.prank(address(0xA11CE));
    aggregator.publishInput(E3_ID, abi.encode(_ciphertexts(2), 2));

    assertEq(aggregator.inputCounts(E3_ID), 1);
    assertTrue(aggregator.submitted(E3_ID, address(0xA11CE)));
  }

  function testPublishInputRejectsDuplicateSubmission() external {
    _validateDefaultRound();
    mockEnclave.setStage(E3_ID, IEnclave.E3Stage.KeyPublished);
    mockEnclave.setInputWindow(E3_ID, 50, 150);
    vm.warp(100);

    address client = address(0xB0B);
    bytes memory payload = abi.encode(_ciphertexts(2), 2);

    vm.prank(client);
    aggregator.publishInput(E3_ID, payload);

    vm.expectRevert(abi.encodeWithSelector(FLAggregator.DuplicateSubmission.selector, E3_ID, client));
    vm.prank(client);
    aggregator.publishInput(E3_ID, payload);
  }

  function testPublishInputRejectsWrongChunkCount() external {
    _validateDefaultRound();
    mockEnclave.setStage(E3_ID, IEnclave.E3Stage.KeyPublished);
    mockEnclave.setInputWindow(E3_ID, 50, 150);
    vm.warp(100);

    vm.expectRevert(abi.encodeWithSelector(FLAggregator.InvalidChunkCount.selector, 2, 1));
    vm.prank(address(0xCAFE));
    aggregator.publishInput(E3_ID, abi.encode(_ciphertexts(1), 1));
  }

  function testVerifyCallsRiscZeroVerifierWithExpectedJournalDigest() external {
    bytes memory params = _roundParams(2, 2, 4, 4, address(this));
    aggregator.validate(E3_ID, 0, params, "", "");

    bytes32 ciphertextOutputHash = keccak256("ciphertext-output");
    bytes memory proof = hex"123456";

    bool ok = aggregator.verify(E3_ID, ciphertextOutputHash, proof);

    assertTrue(ok);
    assertEq(keccak256(mockVerifier.lastProof()), keccak256(proof));
    assertEq(mockVerifier.lastImageId(), IMAGE_ID);
    assertEq(mockVerifier.lastJournalDigest(), sha256(_expectedJournal(ciphertextOutputHash, keccak256(params), bytes32(0))));
  }

  function _validateDefaultRound() internal {
    aggregator.validate(E3_ID, 0, _roundParams(2, 2, 4, 4, address(this)), "", "");
  }

  function _roundParams(
    uint32 numClients,
    uint32 numChunks,
    uint32 scaleFactor,
    uint32 maxGradInt,
    address coordinator
  ) internal pure returns (bytes memory) {
    return abi.encode(numClients, numChunks, scaleFactor, maxGradInt, coordinator);
  }

  function _ciphertexts(uint256 count) internal pure returns (bytes[] memory ciphertexts) {
    ciphertexts = new bytes[](count);
    for (uint256 i = 0; i < count; i++) {
      ciphertexts[i] = abi.encodePacked(bytes1(uint8(i + 1)));
    }
  }

  function _expectedJournal(bytes32 ciphertextOutputHash, bytes32 roundParamsHash, bytes32 inputRoot)
    internal
    pure
    returns (bytes memory journal)
  {
    journal = new bytes(396);
    _encodeLengthPrefixAndHash(journal, 0, ciphertextOutputHash);
    _encodeLengthPrefixAndHash(journal, 132, roundParamsHash);
    _encodeLengthPrefixAndHash(journal, 264, inputRoot);
  }

  function _encodeLengthPrefixAndHash(bytes memory journal, uint256 startIndex, bytes32 hashVal) internal pure {
    journal[startIndex] = 0x20;
    startIndex += 4;

    for (uint256 i = 0; i < 32; i++) {
      journal[startIndex + i * 4] = hashVal[i];
    }
  }
}
