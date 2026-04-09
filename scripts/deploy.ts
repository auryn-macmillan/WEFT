import { ethers } from "ethers";

const FL_AGGREGATOR_ABI = [
  "function validate(uint256 e3Id, uint256 seed, bytes calldata e3ProgramParams, bytes calldata computeProviderParams, bytes calldata customParams) external returns (bytes32)",
  "function publishInput(uint256 e3Id, bytes memory data) external",
  "function verify(uint256 e3Id, bytes32 ciphertextOutputHash, bytes memory proof) external returns (bool)",
  "function rounds(uint256 e3Id) external view returns (uint32 numClients, uint32 numChunks, uint32 scaleFactor, uint32 maxGradInt, address coordinator)",
  "function inputCounts(uint256 e3Id) external view returns (uint256)",
];

async function main() {
  const [deployer] = await (ethers as any).getSigners?.() ?? [];
  if (!deployer) {
    throw new Error("No deployer signer available. Run with hardhat network.");
  }

  const enclaveAddress = process.env.ENCLAVE_ADDRESS;
  const risc0VerifierAddress = process.env.RISC0_VERIFIER_ADDRESS;
  const imageId = process.env.IMAGE_ID;

  if (!enclaveAddress || !risc0VerifierAddress || !imageId) {
    throw new Error(
      "Missing env vars: ENCLAVE_ADDRESS, RISC0_VERIFIER_ADDRESS, IMAGE_ID",
    );
  }

  console.log("Deploying FLAggregator...");
  console.log(`  Enclave:        ${enclaveAddress}`);
  console.log(`  RISC0 Verifier: ${risc0VerifierAddress}`);
  console.log(`  Image ID:       ${imageId}`);

  const Factory = await (ethers as any).getContractFactory("FLAggregator");
  const contract = await Factory.deploy(
    enclaveAddress,
    risc0VerifierAddress,
    imageId,
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`FLAggregator deployed at: ${address}`);

  return address;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
