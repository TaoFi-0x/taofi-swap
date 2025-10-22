import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying SwapAndTransfer to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("SwapAndTransfer", {
    contract: "SwapAndTransfer",
    from: deployer,
    args: [
      '0x9Dc08C6e2BF0F1eeD1E00670f80Df39145529F81',
      '0x667A1AA098D03f788eBaD7678B7c02504EaC6092',
      '0x0000000000000000000000000000000000000800',
    ],
    log: true
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

func.tags = ["SwapAndTransfer"];