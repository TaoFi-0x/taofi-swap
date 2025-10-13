import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying SwapAndStake to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const uniswapRouter = "";

  await deploy("SwapAndStake", {
    contract: "SwapAndStake",
    from: deployer,
    args: [
      '0xB833E8137FEDf80de7E908dc6fea43a029142F20',
      '0x9Dc08C6e2BF0F1eeD1E00670f80Df39145529F81',
      '0x667A1AA098D03f788eBaD7678B7c02504EaC6092',
      '0x0000000000000000000000000000000000000805',
      '0xB833E8137FEDf80de7E908dc6fea43a029142F20',
      '0xBE965D7308060577b8E29829945c5C6120e9d76C'
    ],
    log: true
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  return false;
  // localhost
  if (process.env.FORK) {
    return process.env.FORK !== "bittensor";
  }

  // mainnet
  return true;
};

func.tags = ["SwapAndStake"];