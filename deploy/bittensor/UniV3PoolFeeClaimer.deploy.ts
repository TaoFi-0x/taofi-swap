import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying UniV3PoolFeeClaimer to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("UniV3PoolFeeClaimer", {
    contract: "UniV3PoolFeeClaimer",
    from: deployer,
    args: ["0x244e6cc02e9a800Ff960d76D6f70C7eAC2641324"],
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

func.tags = ["UniV3PoolFeeClaimer"];