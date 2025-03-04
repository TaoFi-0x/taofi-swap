import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying SturdyPairRegistry to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("SturdyPairRegistry", {
    contract: "SturdyPairRegistry",
    from: deployer,
    args: [
      deployer,
      [deployer]
    ],
    log: true
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  // localhost
  if (process.env.FORK) {
    return false;
  }

  // mainnet
  return true;
};

func.tags = ["SturdyPairRegistry"];