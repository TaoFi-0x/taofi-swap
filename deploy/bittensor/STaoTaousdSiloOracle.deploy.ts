import { deployments, ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// TODO[shr1ftyy]: how should this be re-written or deployment on bittensor mainnet?
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying TaousdSiloOracle to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { get, getArtifact, save, deploy } = deployments;
  const sTaoTaoUSDOracle = await getArtifact("STaoTaoUSDOracle");
  const sTaoUsdOracleAbi = sTaoTaoUSDOracle.abi;

  const { deployer } = await getNamedAccounts();

  await deploy("MockAPI3Feed", {
    contract: "MockV3Aggregator",
    from: deployer,
    args: [
      18, // decimals
      "500000000000000000000", // initial price: 500 USD
    ],
    log: true,
  });

  const api3FeedAddress = (await get("MockAPI3Feed")).address;

  const STAO = await get("STAO");

  await deploy("TaousdSiloOracle", {
    contract: "STaoTaoUSDOracle",
    from: deployer,
    args: [api3FeedAddress, STAO.address, 86400, 0, "TaousdSiloOracle"],
    log: true,
  });

  const taoUsdSiloOracleAddress = (await get("TaousdSiloOracle")).address;

  save("TaousdSiloOracle", {
    abi: sTaoUsdOracleAbi,
    address: taoUsdSiloOracleAddress,
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

func.tags = ["TaousdSiloOracle"];
