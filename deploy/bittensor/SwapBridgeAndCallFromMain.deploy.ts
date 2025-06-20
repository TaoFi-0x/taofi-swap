import { deployments, getNamedAccounts, upgrades, ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying SwapBridgeAndCallFromMain to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { save, getArtifact } = deployments;

  const impleContract = await ethers.getContractFactory("SwapBridgeAndCallFromMain");

  // Deploy as an upgradeable contract
  const proxy = await upgrades.deployProxy(impleContract, [], {
    initializer: "initialize",
    kind: "transparent", // or 'uups' if using UUPS
  });
  
  save("SwapBridgeAndCallFromMain", {
    abi: (await getArtifact("SwapBridgeAndCallFromMain")).abi,
    address: proxy.address,
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  // localhost
  if (process.env.FORK) {
    return process.env.FORK !== "main";
  }

  // mainnet
  return true;
};

func.tags = ["SwapBridgeAndCallFromMain"];