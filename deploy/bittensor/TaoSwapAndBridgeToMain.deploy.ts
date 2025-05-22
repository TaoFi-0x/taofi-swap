import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying TaoSwapAndBridgeToMain to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const uniswapRouter = "";

  await deploy("TaoSwapAndBridgeToMain", {
    contract: "TaoSwapAndBridgeToMain",
    from: deployer,
    args: [uniswapRouter],
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

func.tags = ["TaoSwapAndBridgeToMain"];