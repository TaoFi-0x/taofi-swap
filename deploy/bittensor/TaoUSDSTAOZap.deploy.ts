import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying TaoUSDSTAOZap to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const taoUSD = "0x9bB4FC27453e04318bf968f2E994B47eDa8F724D";
  const sTAO = "0xf4E83cBF44415a9e677310950e250E2167842c7D";
  const uniswapRouter = "0x86fe181fBEa665e52226b2981Df83a89b6edE822";

  await deploy("TaoUSDSTAOZap", {
    contract: "TaoUSDSTAOZap",
    from: deployer,
    args: [taoUSD, sTAO, uniswapRouter],
    log: true,
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  // localhost
  if (process.env.FORK) {
    return process.env.FORK !== "bittensor";
  }

  // mainnet
  return false;
};

func.tags = ["TaoUSDSTAOZap"];
