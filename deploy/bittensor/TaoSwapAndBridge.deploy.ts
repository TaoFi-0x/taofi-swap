import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying TaoSwapAndBridge to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("TaoSwapAndBridge", {
    contract: "TaoSwapAndBridge",
    from: deployer,
    args: [],
    log: true
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  // localhost
  if (process.env.FORK) {
    return process.env.FORK !== "main";
  }

  // mainnet
  return true;
};

func.tags = ["TaoSwapAndBridge"];