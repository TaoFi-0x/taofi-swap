import { deployments, ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  console.log(
    `Deploying SwapBridgeAndCallFromMain to ${hre.network.name}. Hit ctrl + c to abort`
  );

  const { save, getArtifact } = deployments;

  const impleContractFactory = await ethers.getContractFactory("SwapBridgeAndCallFromMain");
  const implementation = await impleContractFactory.deploy();
  await implementation.deployed();

  console.log("Implementation deployed to", implementation.address);

  const initializeFunctionCall = impleContractFactory.interface.encodeFunctionData(
    "initialize",
    []
  );

  const ProxyFactory = await ethers.getContractFactory("ProxyContract");
  const encodedConstructorArguments = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "bytes"],
    [implementation.address, "0x218289B9E70869Dd30e608Aa111Cf1F045765a4b", initializeFunctionCall]
  );
  console.log("initializeFunctionCall", initializeFunctionCall);

  const proxyContract = await ProxyFactory.deploy(encodedConstructorArguments);
  await proxyContract.deployed();
  
  save("SwapBridgeAndCallFromMain", {
    abi: (await getArtifact("SwapBridgeAndCallFromMain")).abi,
    address: proxyContract.address,
  });
};

export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  return false;
};

func.tags = ["SwapBridgeAndCallFromMain"];