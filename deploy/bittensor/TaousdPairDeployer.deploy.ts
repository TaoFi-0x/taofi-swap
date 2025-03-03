import { deployments, ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying SturdyPairDeployer to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, get, execute, getArtifact, save } = deployments;
  const { deployer } = await getNamedAccounts();

  const sturdyWhitelist = (await get("SturdyWhitelist")).address;
  const sturdyPairRegistry = (await get("SturdyPairRegistry")).address;
  const taousdPair = await getArtifact("TaousdPair");

  await deploy("TaousdPairDeployer", {
    contract: "SturdyPairDeployer",
    from: deployer,
    args: [
      {
        circuitBreaker: deployer,
        comptroller: deployer,
        timelock: deployer,
        sturdyWhitelist: sturdyWhitelist,
        sturdyPairRegistry: sturdyPairRegistry,
      },
    ],
    log: true,
  });

  const sturdyPairDeployerAddress = (await get("TaousdPairDeployer")).address;

  console.log("SturdyPairDeployer deployed to:", sturdyPairDeployerAddress);

  const sturdyPairDeployer = await ethers.getContractAt(
    "SturdyPairDeployer",
    sturdyPairDeployerAddress
  );

  await sturdyPairDeployer.setCreationCode(taousdPair.bytecode);

  console.log("Creation code set");

  const sturdyPairRegistryContract = await ethers.getContractAt(
    "SturdyPairRegistry",
    sturdyPairRegistry
  );

  await sturdyPairRegistryContract.setDeployers(
    [sturdyPairDeployerAddress],
    true
  );

  console.log("Deployers set");
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

func.tags = ["TaousdPairDeployer"];
func.dependencies = ["SturdyWhitelist", "SturdyPairRegistry"];
