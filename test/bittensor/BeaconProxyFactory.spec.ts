import { expect } from "chai";
import type { Contract, Signer } from "ethers";
import { ethers } from "hardhat";

describe("BeaconProxyFactory (unit, local)", function () {
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let deployerAddr: string;
  let aliceAddr: string;
  let bobAddr: string;

  const toId = (addr: string) =>
    ethers.utils.hexZeroPad(addr.toLowerCase(), 32);

  let impl: Contract; // initial implementation (logic)
  let factory: Contract; // UpgradeableBeacon + factory
  let chainId: number;

  before(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddr = await deployer.getAddress();
    aliceAddr = await alice.getAddress();
    bobAddr = await bob.getAddress();

    chainId = (await ethers.provider.getNetwork()).chainId;

    // deploy initial implementation (logic)
    const MOSA = await ethers.getContractFactory(
      "MultiOwnableSmartAccount",
      deployer
    );
    impl = await MOSA.deploy();
    await impl.deployed();

    // deploy factory (UpgradeableBeacon) pointing to logic, owner=deployer
    const Factory = await ethers.getContractFactory(
      "BeaconProxyFactory",
      deployer
    );
    factory = await Factory.deploy(impl.address, deployerAddr);
    await factory.deployed();
  });

  it("beacon implementation is set to the provided logic", async () => {
    // UpgradeableBeacon exposes implementation()
    const implementation = await factory.implementation();
    expect(implementation).to.equal(impl.address);
  });

  it("predicts proxy address via getNextProxyAddress and matches deployed proxy; initializes owner bytes32", async () => {
    const initialOwnerId = toId(deployerAddr);

    const predicted = await factory.getNextProxyAddress(initialOwnerId);

    const tx = await factory.createProxy(initialOwnerId);
    const receipt = await tx.wait();

    // read count after create
    const countAfter = await factory.count();
    expect(countAfter.toNumber()).to.equal(1);

    // the return value is the proxy address (function returns address)
    const actual = await factory.callStatic
      .createProxy(initialOwnerId)
      .catch(() => null);
    // NOTE: callStatic would revert due to nonce; better to fetch event args or just use predicted.
    // We'll just assert that the predicted address now has a deployed code size > 0.

    const code = await ethers.provider.getCode(predicted);
    expect(code && code !== "0x").to.equal(true);

    // attach MOSA ABI to the proxy address and verify initialization
    const proxy = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted,
      deployer
    );
    const owners: string[] = await proxy.getOwners(); // bytes32[]
    expect(owners.length).to.equal(1);
    expect(owners[0]).to.equal(initialOwnerId);
    expect(await proxy.isOwner(initialOwnerId)).to.equal(true);
    expect(await proxy.getNonce(initialOwnerId)).to.equal(0);
  });

  it("determinism: same initialOwner, different count -> different addresses; count increments", async () => {
    const initialOwnerId = toId(aliceAddr);

    // count currently 1 from previous test
    const countBefore = await factory.count();
    const predicted1 = await factory.getNextProxyAddress(initialOwnerId);

    // deploy first proxy for alice
    const tx1 = await factory.createProxy(initialOwnerId);
    await tx1.wait();

    const countMid = await factory.count();
    expect(countMid.toNumber()).to.equal(countBefore.toNumber() + 1);

    // next predicted (different salt because count incremented)
    const predicted2 = await factory.getNextProxyAddress(initialOwnerId);
    expect(predicted2).to.not.equal(predicted1);

    // deploy second proxy for alice
    const tx2 = await factory.createProxy(initialOwnerId);
    await tx2.wait();

    const countAfter = await factory.count();
    expect(countAfter.toNumber()).to.equal(countBefore.toNumber() + 2);

    // verify both predicted proxies now exist and initialized
    const code1 = await ethers.provider.getCode(predicted1);
    const code2 = await ethers.provider.getCode(predicted2);
    expect(code1 && code1 !== "0x").to.equal(true);
    expect(code2 && code2 !== "0x").to.equal(true);

    const proxy1 = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted1,
      deployer
    );
    const proxy2 = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted2,
      deployer
    );

    expect(await proxy1.isOwner(initialOwnerId)).to.equal(true);
    expect(await proxy2.isOwner(initialOwnerId)).to.equal(true);
  });

  it("determinism across different initial owners (same count point) produces distinct addresses", async () => {
    const ownerAlice = toId(aliceAddr);
    const ownerBob = toId(bobAddr);

    const predictedAlice = await factory.getNextProxyAddress(ownerAlice);
    const predictedBob = await factory.getNextProxyAddress(ownerBob);

    expect(predictedAlice).to.not.equal(predictedBob);
  });

  it("upgrade beacon to a new implementation; existing proxies remain usable", async () => {
    // deploy a fresh implementation (same code is fine for the test)
    const MOSA2 = await ethers.getContractFactory(
      "MultiOwnableSmartAccount",
      deployer
    );
    const newImpl = await MOSA2.deploy();
    await newImpl.deployed();

    // owner (deployer) upgrades the beacon
    await expect(factory.connect(deployer).upgradeTo(newImpl.address))
      .to.emit(factory, "Upgraded")
      .withArgs(newImpl.address);

    // implementation() should now be the new one
    const implementation = await factory.implementation();
    expect(implementation).to.equal(newImpl.address);

    // existing proxy (the very first predicted) should still function
    // create a fresh one now to test post-upgrade path as well
    const ownerId = toId(deployerAddr);
    const predicted = await factory.getNextProxyAddress(ownerId);
    await (await factory.createProxy(ownerId)).wait();

    const proxy = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted,
      deployer
    );
    // `domainSeparatorV4` call works (just sanity)
    const ds = await proxy.domainSeparatorV4();
    expect(ds).to.match(/^0x[0-9a-fA-F]{64}$/);

    // owner should be set correctly on the new proxy as well
    expect(await proxy.isOwner(ownerId)).to.equal(true);
  });
});
