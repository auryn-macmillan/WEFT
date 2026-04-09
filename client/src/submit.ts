import { ethers } from "ethers";

export interface SubmitConfig {
  e3Id: bigint;
  flAggregatorAddress: string;
  signer: ethers.Signer;
}

const FL_AGGREGATOR_ABI = [
  "function publishInput(uint256 e3Id, bytes data) returns (bytes)",
];

export async function submitGradients(
  ciphertexts: Uint8Array[],
  config: SubmitConfig,
): Promise<ethers.TransactionReceipt> {
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes[]", "uint256"],
    [ciphertexts.map((ciphertext) => ethers.hexlify(ciphertext)), ciphertexts.length],
  );

  const contract = new ethers.Contract(
    config.flAggregatorAddress,
    FL_AGGREGATOR_ABI,
    config.signer,
  );

  const tx = await contract.publishInput(config.e3Id, encodedData);
  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("publishInput transaction was not mined");
  }

  return receipt;
}
