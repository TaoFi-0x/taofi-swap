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

  const taoUSD = "0x9bB4FC27453e04318bf968f2E994B47eDa8F724D";
  const taoUSDBridge = "0x8f9864c1f79eBC8aEc0949671aC0463bf40E5933";
  const taoUSDsTAOZapAddress = (await get("TaoUSDSTAOZap")).address;

  await deploy("TaoSwapAndBridgeToMain", {
    contract: "TaoSwapAndBridgeToMain",
    from: deployer,
    args: [taoUSD, taoUSDBridge, taoUSDsTAOZapAddress],
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