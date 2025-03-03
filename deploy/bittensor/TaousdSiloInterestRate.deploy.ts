import { deployments, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying TaousdSiloInterestRate to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { deploy, get, save, getArtifact } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("TaousdSiloInterestRate", {
    contract: "VariableInterestRate",
    from: deployer,
    args: [
      "TaousdSiloInterestRate",
      0,
      0,
      // Utilization Rate Settings
      75_000, //75%
      85_000, //85%
      0,
      // Interest Rate Settings (all rates are per second), 365.24 days per year
      158_247_046, //0.5% annual rate
      146_248_476_607, // 10,000% annual rate
      43_200, //given in seconds, equal to 12 hours
    ],
    log: true,
  });

  let TaousdSiloInterestRate = await get("TaousdSiloInterestRate");
  let taousdSiloInterestRateAddress = TaousdSiloInterestRate.address;

  save("TaousdSiloInterestRate", {
    abi: (await getArtifact("VariableInterestRate")).abi,
    address: taousdSiloInterestRateAddress,
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

func.tags = ["TaousdSiloInterestRate"];
