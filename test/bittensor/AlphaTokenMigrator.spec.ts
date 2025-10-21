import { expect } from "chai";
import type { Contract, Signer } from "ethers";
import { ethers } from "hardhat";

const toId = (addr: string) => ethers.utils.hexZeroPad(addr.toLowerCase(), 32);

describe("AlphaTokenMigrator (unit, local)", function () {
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let deployerAddr: string;
  let aliceAddr: string;
  let bobAddr: string;

  // fresh contracts per test to avoid approval/balance leakage
  let impl: Contract; // MultiOwnableSmartAccount implementation
  let registry: Contract; // SmartAccountRegistry
  let factory: Contract; // BeaconProxyFactory (UpgradeableBeacon)
  let migrator: Contract; // AlphaTokenMigrator

  let TKA: Contract; // ERC20 mock
  let TKB: Contract; // ERC20 mock
  let TKZ: Contract; // ERC20 mock (kept at zero for alice)

  before(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddr = await deployer.getAddress();
    aliceAddr = await alice.getAddress();
    bobAddr = await bob.getAddress();
  });

  async function deployCore() {
    // impl
    const MOSA_Impl = await ethers.getContractFactory(
      "MultiOwnableSmartAccount",
      deployer
    );
    impl = await MOSA_Impl.deploy();
    await impl.deployed();

    // registry
    const Registry = await ethers.getContractFactory(
      "SmartAccountRegistry",
      deployer
    );
    registry = await Registry.deploy();
    await registry.deployed();

    // factory (beacon)
    const Factory = await ethers.getContractFactory(
      "BeaconProxyFactory",
      deployer
    );
    factory = await Factory.deploy(
      impl.address,
      await deployer.getAddress(),
      registry.address
    );
    await factory.deployed();

    // migrator
    const Migrator = await ethers.getContractFactory(
      "AlphaTokenMigrator",
      deployer
    );
    migrator = await Migrator.deploy(factory.address);
    await migrator.deployed();
  }

  async function deployTokens() {
    const Token = await ethers.getContractFactory("TestToken", deployer);
    TKA = await Token.deploy("Token A", "TKA");
    TKB = await Token.deploy("Token B", "TKB");
    TKZ = await Token.deploy("Token Zero", "TKZ");
    await Promise.all([TKA.deployed(), TKB.deployed(), TKZ.deployed()]);
  }

  async function mintToAlice() {
    await TKA.mint(aliceAddr, ethers.utils.parseEther("100"));
    await TKB.mint(aliceAddr, ethers.utils.parseEther("42"));
    // TKZ stays 0
  }

  beforeEach(async () => {
    await deployCore();
    await deployTokens();
  });

  it("predicts, deploys, and migrates balances into the new smart account", async () => {
    await mintToAlice();

    const owners = [toId(aliceAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("migrate-1"));

    // approvals for both tokens (zero-balance TKZ needs none)
    await TKA.connect(alice).approve(
      migrator.address,
      ethers.constants.MaxUint256
    );
    await TKB.connect(alice).approve(
      migrator.address,
      ethers.constants.MaxUint256
    );

    // prediction depends on caller (EOA) because migrator pre-binds salt with msg.sender
    const predicted = await migrator.connect(alice).getNextAccountAddress(salt);

    // snapshot before
    const aBalA_before = await TKA.balanceOf(aliceAddr);
    const aBalB_before = await TKB.balanceOf(aliceAddr);
    const aBalZ_before = await TKZ.balanceOf(aliceAddr);
    expect(aBalZ_before).to.equal(0);

    // create + migrate (no custom event expected)
    await migrator
      .connect(alice)
      .createAccountAndMigrate(
        owners,
        [TKA.address, TKB.address, TKZ.address],
        salt
      );

    // proxy exists at predicted
    const code = await ethers.provider.getCode(predicted);
    expect(code && code !== "0x").to.equal(true);

    // attach and verify factory + owners
    const proxy = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted
    );
    expect(await proxy.getFactory()).to.equal(factory.address);

    const ownersAfter: string[] = await proxy.getOwners();
    expect(ownersAfter).to.deep.equal(owners);

    // balances moved atomically
    expect(await TKA.balanceOf(predicted)).to.equal(aBalA_before);
    expect(await TKB.balanceOf(predicted)).to.equal(aBalB_before);
    expect(await TKZ.balanceOf(predicted)).to.equal(0);

    expect(await TKA.balanceOf(aliceAddr)).to.equal(0);
    expect(await TKB.balanceOf(aliceAddr)).to.equal(0);
    expect(await TKZ.balanceOf(aliceAddr)).to.equal(0);
  });

  it("prediction depends on caller (Alice vs Bob) with same salt", async () => {
    const owners = [toId(aliceAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("migrate-2"));

    const pAlice = await migrator.connect(alice).getNextAccountAddress(salt);
    const pBob = await migrator.connect(bob).getNextAccountAddress(salt);
    expect(pAlice).to.not.equal(pBob);

    // deploy for Bob to confirm pBob is correct (no tokens listed)
    await (
      await migrator.connect(bob).createAccountAndMigrate(owners, [], salt)
    ).wait();
    const codeBob = await ethers.provider.getCode(pBob);
    expect(codeBob && codeBob !== "0x").to.equal(true);
  });

  it("reverts if allowance is missing for any token (atomic behavior)", async () => {
    // mint small balances
    await TKA.mint(aliceAddr, ethers.utils.parseEther("1"));
    await TKB.mint(aliceAddr, ethers.utils.parseEther("1"));

    const owners = [toId(aliceAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.randomBytes(32));

    // approve ONLY TKA; no approval for TKB
    await TKA.connect(alice).approve(
      migrator.address,
      ethers.constants.MaxUint256
    );

    await expect(
      migrator
        .connect(alice)
        .createAccountAndMigrate(owners, [TKA.address, TKB.address], salt)
    ).to.be.revertedWith("ERC20InsufficientAllowance");

    // balances unchanged because the whole call reverted
    expect(await TKA.balanceOf(aliceAddr)).to.equal(
      ethers.utils.parseEther("1")
    );
    expect(await TKB.balanceOf(aliceAddr)).to.equal(
      ethers.utils.parseEther("1")
    );
  });

  it("zero-balance tokens don't need allowance and are harmless in the list", async () => {
    // ensure alice has zero TKZ
    expect(await TKZ.balanceOf(aliceAddr)).to.equal(0);

    const owners = [toId(aliceAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("zero-ok"));

    const predicted = await migrator.connect(alice).getNextAccountAddress(salt);

    await migrator
      .connect(alice)
      .createAccountAndMigrate(owners, [TKZ.address], salt);

    const code = await ethers.provider.getCode(predicted);
    expect(code && code !== "0x").to.equal(true);

    expect(await TKZ.balanceOf(predicted)).to.equal(0);
  });
});
