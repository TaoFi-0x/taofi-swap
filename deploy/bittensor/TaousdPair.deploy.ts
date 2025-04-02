import { deployments, ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/* TODO:
 * - Create API3 Oracle Deployment script
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployer } = await getNamedAccounts();

  console.log(
    `Deploying TaousdPair to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, get, getArtifact, save } = deployments;
  const taousdPairAbi = (await getArtifact("TaousdPair")).abi;
  const variableInterestRate = (await get("TaousdSiloInterestRate")).address;
  const STaoTaoUSDOracle = (await get("TaousdSiloOracle")).address;
  const sTAOAddress = (await get("STAO")).address;

  const pairDeployerAddress = (await get("TaousdPairDeployer")).address;
  const pairDeployer = await ethers.getContractAt(
    "SturdyPairDeployer",
    pairDeployerAddress
  );

  // await runWhitelist([deployer, sturdyPairDeployerAddr]);

  const Taousd = await get("Taousd");
  const taousdAddress = Taousd.address;

  const abiEncoder = new ethers.utils.AbiCoder();
  // TODO[shr1ftyy]: change the config data to use API3 oracle address
  const configData = abiEncoder.encode(
    [
      "address",
      "address",
      "address",
      "uint32",
      "address",
      "uint64",
      "uint256",
      "uint256",
      "uint256",
    ],
    [
      taousdAddress,
      sTAOAddress, // collateral token address
      STaoTaoUSDOracle, // oracle address
      0, //0%
      variableInterestRate, // interest rate address - TODO[shr1ftyy]: modify the interest rate params
      0,
      50000, //50%
      10000, //10%
      0,
    ]
  );

  save("Taousd", {
    abi: (await getArtifact("Taousd")).abi,
    address: taousdAddress,
  });

  console.log("deploying taousd pair");

  const tx = await pairDeployer.deploy(configData, { gasLimit: 7500000 });

  const rc = await tx.wait();
  const event = rc.events?.find((event) => event.event === "LogDeploy");
  const pairAddress = event?.args?.[0];

  console.log("TaousdPair deployed to:", pairAddress);

  save("TaousdPair", { abi: taousdPairAbi, address: pairAddress });
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

func.tags = ["TaousdPair"];
func.dependencies = [
  "STAO",
  "Taousd",
  "TaousdPairDeployer",
  "TaousdSiloInterestRate",
  "TaousdSiloOracle",
];
