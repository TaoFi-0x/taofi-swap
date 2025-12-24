import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying UnstakeAndSwap to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("UnstakeAndSwap", {
    contract: "UnstakeAndSwap",
    from: deployer,
    args: [
      '0xB833E8137FEDf80de7E908dc6fea43a029142F20',
      '0x9Dc08C6e2BF0F1eeD1E00670f80Df39145529F81',
      '0x667A1AA098D03f788eBaD7678B7c02504EaC6092',
      '0xB833E8137FEDf80de7E908dc6fea43a029142F20',
      '0x1AFC275AB13a60f82B1044f3fbd29dee5360F9C1'
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

func.tags = ["UnstakeAndSwap"];