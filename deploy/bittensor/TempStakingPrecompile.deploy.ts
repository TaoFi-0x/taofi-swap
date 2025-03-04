import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await getNamedAccounts();

  const { deploy } = deployments;

  console.log(`Deploying TempStakingPrecompile to ${hre.network.name}. Hit ctrl + c to abort`);

  await deploy("TempStakingPrecompile", {
    contract: "TempStakingPrecompile",
    from: deployer,
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
  return true;
};

func.tags = ["TempStakingPrecompile"];
