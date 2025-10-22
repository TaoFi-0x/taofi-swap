import { artifacts, deployments, ethers } from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
const { execute, get, save } = deployments;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const owner = "0x526a9eA036FB26f9D8b88236Df49C55EF9756B32";

  // Deploy SmartAccountRegistry

  const SmartAccountRegistryFactory = await ethers.getContractFactory(
    "SmartAccountRegistry"
  );
  const smartAccountRegistry = await SmartAccountRegistryFactory.deploy();
  await smartAccountRegistry.deployed();

  console.log(
    `SmartAccountRegistry deployed to ${smartAccountRegistry.address}`
  );

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
    owner,
    smartAccountRegistry.address
  );
  await beaconProxyFactory.deployed();

  const { abi: beaconProxyFactoryAbi } = await artifacts.readArtifact(
    "BeaconProxyFactory"
  );
  await save("BeaconProxyFactory", {
    abi: beaconProxyFactoryAbi,
    address: beaconProxyFactory.address,
  });

  console.log(`BeaconProxyFactory deployed to ${beaconProxyFactory.address}`);

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
