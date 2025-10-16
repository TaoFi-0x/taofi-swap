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

  let impl: Contract; // MOSA implementation (logic)
  let factory: Contract; // UpgradeableBeacon + factory front
  let registry: Contract; // SmartAccountRegistry

  before(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddr = await deployer.getAddress();
    aliceAddr = await alice.getAddress();
    bobAddr = await bob.getAddress();

    // 1) Deploy MOSA implementation
    const MOSA_Impl = await ethers.getContractFactory(
      "MultiOwnableSmartAccount",
      deployer
    );
    impl = await MOSA_Impl.deploy();
    await impl.deployed();

    // 2) Deploy registry
    const Registry = await ethers.getContractFactory(
      "SmartAccountRegistry",
      deployer
    );
    registry = await Registry.deploy();
    await registry.deployed();

    // 3) Deploy factory (UpgradeableBeacon owner = deployer)
    const Factory = await ethers.getContractFactory(
      "BeaconProxyFactory",
      deployer
    );
    factory = await Factory.deploy(
      impl.address,
      deployerAddr,
      registry.address
    );
    await factory.deployed();
  });

  it("exposes implementation() and smartAccountRegistry()", async () => {
    const implementation = await factory.implementation();
    expect(implementation).to.equal(impl.address);

    const reg = await factory.smartAccountRegistry();
    expect(reg).to.equal(registry.address);
  });

  it("predicts proxy address deterministically (salt bound to sender) and initializes owners+factory", async () => {
    const initialOwners = [toId(deployerAddr), toId(aliceAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-one"));

    // IMPORTANT: pass the SAME sender you will use for createProxy
    const predicted = await factory.getNextProxyAddress(
      initialOwners,
      salt,
      deployerAddr
    );

    // deploy from that sender
    const tx = await factory.connect(deployer).createProxy(initialOwners, salt);
    await tx.wait();

    // code exists at predicted
    const code = await ethers.provider.getCode(predicted);
    expect(code && code !== "0x").to.equal(true);

    // attach and verify initialization
    const proxy = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted,
      deployer
    );

    // factory wiring
    expect(await proxy.getFactory()).to.equal(factory.address);

    // owners set
    const owners: string[] = await proxy.getOwners(); // bytes32[]
    expect(owners.length).to.equal(2);
    expect(owners).to.include(initialOwners[0]);
    expect(owners).to.include(initialOwners[1]);

    // nonces start at 0
    expect(await proxy.getNonce(initialOwners[0])).to.equal(0);
    expect(await proxy.getNonce(initialOwners[1])).to.equal(0);
  });

  it("different sender -> different predicted address for the same salt+owners", async () => {
    const initialOwners = [toId(deployerAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-two"));

    const predictedFromDeployer = await factory.getNextProxyAddress(
      initialOwners,
      salt,
      deployerAddr
    );
    const predictedFromAlice = await factory.getNextProxyAddress(
      initialOwners,
      salt,
      aliceAddr
    );

    expect(predictedFromDeployer).to.not.equal(predictedFromAlice);

    // deploy with alice; must land at alice prediction
    await (
      await factory.connect(alice).createProxy(initialOwners, salt)
    ).wait();
    const codeAlice = await ethers.provider.getCode(predictedFromAlice);
    expect(codeAlice && codeAlice !== "0x").to.equal(true);
  });

  it("same inputs (owners, salt, sender) -> same predicted address before deployment", async () => {
    const owners = [toId(bobAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.randomBytes(32));

    const p1 = await factory.getNextProxyAddress(owners, salt, bobAddr);
    const p2 = await factory.getNextProxyAddress(owners, salt, bobAddr);
    expect(p1).to.equal(p2);

    // deploy from bob and verify code exists at that address
    await (await factory.connect(bob).createProxy(owners, salt)).wait();
    const code = await ethers.provider.getCode(p1);
    expect(code && code !== "0x").to.equal(true);
  });

  it("new proxy → addOwner via self-call triggers registry registration", async () => {
    // fresh proxy (owned by deployer)
    const owners = [toId(deployerAddr)];
    const salt = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("salt-reg"));

    const predicted = await factory.getNextProxyAddress(
      owners,
      salt,
      deployerAddr
    );
    await (await factory.connect(deployer).createProxy(owners, salt)).wait();

    const proxy = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted,
      deployer
    );

    // prepare self-call addOwner(bytes32) for alice
    const aliceId = toId(aliceAddr);
    const addAlice = proxy.interface.encodeFunctionData("addOwner(bytes32)", [
      aliceId,
    ]);

    await expect(proxy.connect(deployer).executeCall(predicted, 0, addAlice))
      .to.emit(proxy, "OwnerAdded")
      .withArgs(aliceId);

    // registry reflects registration (SmartAccountRegistry.registerSmartAccount)
    const registered = await registry.getSmartAccounts(aliceId);
    expect(registered).to.include(predicted);
  });

  it("upgrade beacon to new implementation; newly created proxies use the new logic", async () => {
    // deploy another MOSA impl (could be same code; this is just testing beacon upgrade)
    const MOSA_New = await ethers.getContractFactory(
      "MultiOwnableSmartAccount",
      deployer
    );
    const newImpl = await MOSA_New.deploy();
    await newImpl.deployed();

    await expect(factory.connect(deployer).upgradeTo(newImpl.address))
      .to.emit(factory, "Upgraded")
      .withArgs(newImpl.address);

    expect(await factory.implementation()).to.equal(newImpl.address);

    // create a new proxy after upgrade
    const owners = [toId(aliceAddr), toId(bobAddr)];
    const salt = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes("salt-after-upgrade")
    );
    const predicted = await factory.getNextProxyAddress(
      owners,
      salt,
      aliceAddr
    );

    await (await factory.connect(alice).createProxy(owners, salt)).wait();

    const proxy = await ethers.getContractAt(
      "MultiOwnableSmartAccount",
      predicted,
      alice
    );
    expect(await proxy.getFactory()).to.equal(factory.address);

    const o = await proxy.getOwners();
    expect(o.length).to.equal(2);
    expect(o).to.include(owners[0]);
    expect(o).to.include(owners[1]);
  });
});
