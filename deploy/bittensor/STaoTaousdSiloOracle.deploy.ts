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
  const PYTH_TAO_USD_ORACLE = "0x2880aB155794e7179c9eE2e38200202908C17B43";
  const TAO_USD_PRICE_FEED_ID = "0x410f41de235f2db824e562ea7ab2d3d3d4ff048316c61d629c0b93f58584e1af";

  const { deployer } = await getNamedAccounts();

  const STAO = await get("STAO");

  await deploy("TaousdSiloOracle", {
    contract: "STaoTaoUSDOracle",
    from: deployer,
    args: [PYTH_TAO_USD_ORACLE, TAO_USD_PRICE_FEED_ID, STAO.address, 86400, 0, "TaousdSiloOracle"],
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
