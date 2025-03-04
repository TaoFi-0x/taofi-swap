import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying SturdyWhitelist to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, execute } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("SturdyWhitelist", {
    contract: "SturdyWhitelist",
    from: deployer,
    args: [],
    log: true
  });

  await execute("SturdyWhitelist", { from: deployer }, "setSturdyDeployerWhitelist", [deployer], true);
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

func.tags = ["SturdyWhitelist"];