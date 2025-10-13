import { artifacts, deployments, ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
const { execute, get, save } = deployments;

const STAKING_PRECOMPILE_ADDRESS = "0x0000000000000000000000000000000000000805";
const USDC = "0xB833E8137FEDf80de7E908dc6fea43a029142F20";
const WTAO = "0x9Dc08C6e2BF0F1eeD1E00670f80Df39145529F81";
const UNISWAP_ROUTER = "0x667A1AA098D03f788eBaD7678B7c02504EaC6092";
const BRIDGE = "0xB833E8137FEDf80de7E908dc6fea43a029142F20";

const deployAlphaTokenImplementation = async () => {
  console.log("Deploying AlphaTokenImplementation...");

  const AlphaTokenFactory = await ethers.getContractFactory("AlphaToken");
  const alphaTokenImplementation = await AlphaTokenFactory.deploy();
  await alphaTokenImplementation.deployed();

  const { abi: alphaTokenAbi } = await artifacts.readArtifact("AlphaToken");

  await save("AlphaTokenImplementation", {
    abi: alphaTokenAbi,
    address: alphaTokenImplementation.address,
  });

  console.log(`AlphaToken deployed to ${alphaTokenImplementation.address}`);
};

const deployAlphaTokenFactory = async () => {
  console.log("Deploying AlphaTokenFactory...");

  const alphaTokenImplementationAddress = (
    await get("AlphaTokenImplementation")
  ).address;

  const AlphaTokenFactory = await ethers.getContractFactory(
    "AlphaTokenFactory"
  );
  const alphaTokenFactory = await AlphaTokenFactory.deploy(
    alphaTokenImplementationAddress
  );
  await alphaTokenFactory.deployed();

  const { abi: alphaTokenFactoryAbi } = await artifacts.readArtifact(
    "AlphaTokenFactory"
  );

  await save("AlphaTokenFactory", {
    abi: alphaTokenFactoryAbi,
    address: alphaTokenFactory.address,
  });

  console.log(`AlphaTokenFactory deployed to ${alphaTokenFactory.address}`);
};

const deployStakingManager = async () => {
  console.log("Deploying StakingManager...");

  const alphaTokenFactoryAddress = (await get("AlphaTokenFactory")).address;

  const StakingManagerFactory = await ethers.getContractFactory(
    "StakingManager"
  );
  const stakingManagerImplementation = await StakingManagerFactory.deploy();
  await stakingManagerImplementation.deployed();

  const StakingManagerProxyFactory = await ethers.getContractFactory(
    "StakingManagerProxy"
  );

  const initializeFunctionCall =
    StakingManagerFactory.interface.encodeFunctionData("initialize", [
      STAKING_PRECOMPILE_ADDRESS,
      alphaTokenFactoryAddress,
    ]);

  const stakingManagerProxy = await StakingManagerProxyFactory.deploy(
    stakingManagerImplementation.address,
    "0xA3c92e5cbb6146384Aa5A41540EC3fc6a184139C",
    initializeFunctionCall
  );

  console.log("StakingManager initialized");

  const { abi: stakingManagerAbi } = await artifacts.readArtifact(
    "StakingManager"
  );
  await save("StakingManager", {
    abi: stakingManagerAbi,
    address: stakingManagerProxy.address,
  });

  console.log(`StakingManager deployed to ${stakingManagerProxy.address}`);
};

const deploySwapAndStake = async () => {
  console.log("Deploying SwapAndStake...");

  const stakingManagerAddress = (await get("StakingManager")).address;

  const SwapAndStakeFactory = await ethers.getContractFactory("SwapAndStake");
  const swapAndStake = await SwapAndStakeFactory.deploy(
    USDC,
    WTAO,
    UNISWAP_ROUTER,
    STAKING_PRECOMPILE_ADDRESS,
    BRIDGE,
    stakingManagerAddress
  );

  await swapAndStake.deployed();

  const { abi: swapAndStakeAbi } = await artifacts.readArtifact("SwapAndStake");

  await save("SwapAndStake", {
    abi: swapAndStakeAbi,
    address: swapAndStake.address,
  });

  console.log(`SwapAndStake deployed to ${swapAndStake.address}`);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const owner = "0x526a9eA036FB26f9D8b88236Df49C55EF9756B32";

  // Deploy MultiOwnableSmartAccount implementation

  const MultiOwnableSmartAccountFactory = await ethers.getContractFactory(
    "MultiOwnableSmartAccount"
  );
  const multiOwnableSmartAccountImplementation =
    await MultiOwnableSmartAccountFactory.deploy();
  await multiOwnableSmartAccountImplementation.deployed();

  // Deploy BeaconProxyFactory

  const BeaconProxyFactory = await ethers.getContractFactory(
    "BeaconProxyFactory"
  );
  const beaconProxyFactory = await BeaconProxyFactory.deploy(
    multiOwnableSmartAccountImplementation.address,
    owner
  );
  await beaconProxyFactory.deployed();

  const { abi: beaconProxyFactoryAbi } = await artifacts.readArtifact(
    "BeaconProxyFactory"
  );
  await save("BeaconProxyFactory", {
    abi: beaconProxyFactoryAbi,
    address: beaconProxyFactory.address,
  });

  // Deploy AlphaTokenMigrator

  const AlphaTokenMigratorFactory = await ethers.getContractFactory(
    "AlphaTokenMigrator"
  );
  const alphaTokenMigrator = await AlphaTokenMigratorFactory.deploy(
    beaconProxyFactory.address
  );
  await alphaTokenMigrator.deployed();

  const { abi: alphaTokenMigratorAbi } = await artifacts.readArtifact(
    "AlphaTokenMigrator"
  );
  await save("AlphaTokenMigrator", {
    abi: alphaTokenMigratorAbi,
    address: alphaTokenMigrator.address,
  });

  console.log(`AlphaTokenMigrator deployed to ${alphaTokenMigrator.address}`);
};
export default func;

func.skip = async (hre: HardhatRuntimeEnvironment) => {
  return false;
};

func.tags = ["FullDeploy"];
