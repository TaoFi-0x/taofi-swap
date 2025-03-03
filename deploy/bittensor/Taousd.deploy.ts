import { deployments, ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { getContractAddress } from "ethers/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await getNamedAccounts();

  const { save } = deployments;

  console.log(`Deploying Taousd to ${hre.network.name}. Hit ctrl + c to abort`);

  const Taousd = await ethers.getContractFactory("Taousd");
  const deployTx = await Taousd.deploy("Taousd", "τUSD");

  const taousdAddress = getContractAddress({
    from: deployTx.deployTransaction.from,
    nonce: deployTx.deployTransaction.nonce,
  });

  console.log("Taousd deployed to:", taousdAddress);

  save("Taousd", {
    abi: (await deployments.getArtifact("Taousd")).abi,
    address: taousdAddress,
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  // localhost
  if (process.env.FORK) {
    return process.env.FORK !== "bittensor";
  }

  // mainnet
  return true;
};

func.tags = ["Taousd"];
