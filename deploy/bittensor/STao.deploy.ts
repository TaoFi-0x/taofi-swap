import { deployments, upgrades, ethers, artifacts, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
const { execute, get, save } = deployments;

/* TODO:
 * - Create API3 Oracle Deployment script
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(`Deploying STAO to ${hre.network.name}. Hit ctrl + c to abort`);


  const { deployer } = await getNamedAccounts();

  const STAOFactory = await ethers.getContractFactory("STAO");
  const stao = await upgrades.deployProxy(STAOFactory, [], {
    initializer: "initialize",
  });
  const STAO = await stao.deployed();

  const { abi } = await artifacts.readArtifact("STAO");

  save("STAO", {
    abi: abi,
    address: STAO.address,
  });

  console.log(`STAO deployed to ${STAO.address}`);

  const tempStakingPrecompileAddress = (await get("TempStakingPrecompile")).address;

  await execute("STAO", { from: deployer }, "setStakingPrecompile", tempStakingPrecompileAddress);
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

func.tags = ["STAO"];
func.dependencies = ["TempStakingPrecompile"]