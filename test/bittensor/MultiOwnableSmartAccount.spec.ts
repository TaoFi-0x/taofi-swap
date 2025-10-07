import { expect } from "chai";
import type { Contract, Signer } from "ethers";
import { ethers } from "hardhat";

describe("MultiOwnableSmartAccount (unit, local, no execution)", function () {
  let account: Contract;
  let deployer: Signer;
  let alice: Signer;
  let bob: Signer;

  let deployerAddr: string;
  let aliceAddr: string;
  let bobAddr: string;

  // bytes32 ownerIds (left-padded from LOWERCASED EVM addresses)
  let deployerId: string;
  let aliceId: string;
  let bobId: string;

  const toId = (addr: string) =>
    ethers.utils.hexZeroPad(addr.toLowerCase(), 32);

  before(async () => {
    [deployer, alice, bob] = await ethers.getSigners();
    deployerAddr = await deployer.getAddress();
    aliceAddr = await alice.getAddress();
    bobAddr = await bob.getAddress();

    deployerId = toId(deployerAddr);
    aliceId = toId(aliceAddr);
    bobId = toId(bobAddr);

    const MOSA = await ethers.getContractFactory(
      "MultiOwnableSmartAccount",
      deployer
    );
    account = await MOSA.deploy();
    await account.deployed();

    // initialize now takes bytes32 ownerId and emits bytes32
    await expect(account.initialize(deployerId))
      .to.emit(account, "OwnerAdded")
      .withArgs(deployerId);
  });

  describe("initialize()", () => {
    it("sets initial owner and emits event", async () => {
      const owners: string[] = await account.getOwners(); // bytes32[]
      expect(owners.length).to.equal(1);
      expect(owners[0]).to.equal(deployerId);

      expect(await account.isOwner(deployerId)).to.equal(true);
      expect(await account.isOwner(aliceId)).to.equal(false);
    });

    it("reverts when called twice", async () => {
      await expect(account.initialize(aliceId)).to.be.revertedWith(
        "InvalidInitialization"
      );
    });
  });

  describe("ETH reception", () => {
    it("receive() accepts ETH", async () => {
      const before = await ethers.provider.getBalance(account.address);

      const tx = await (alice as any).sendTransaction({
        to: account.address,
        value: ethers.utils.parseEther("0.5"),
      });
      await tx.wait();

      const after = await ethers.provider.getBalance(account.address);
      expect(after.sub(before)).to.equal(ethers.utils.parseEther("0.5"));
    });
  });

  describe("introspection", () => {
    it("isOwner works for different owners", async () => {
      expect(await account.isOwner(deployerId)).to.equal(true);
      expect(await account.isOwner(aliceId)).to.equal(false);
      expect(await account.isOwner(bobId)).to.equal(false);
    });

    it("getOwners returns current set", async () => {
      const owners: string[] = await account.getOwners(); // bytes32[]
      expect(owners).to.deep.equal([deployerId]);
    });

    it("getNonce is 0 for fresh owners and non-owners", async () => {
      expect(await account.getNonce(deployerId)).to.equal(0);
      expect(await account.getNonce(aliceId)).to.equal(0);
      expect(await account.getNonce(bobId)).to.equal(0);
    });
  });

  describe("owner management (onlySelf)", () => {
    it("addOwner reverts when called externally", async () => {
      await expect(
        account.connect(deployer).addOwner(aliceId)
      ).to.be.revertedWith("MOSA:NOT_SELF");
      await expect(account.connect(alice).addOwner(bobId)).to.be.revertedWith(
        "MOSA:NOT_SELF"
      );
    });

    it("removeOwner reverts when called externally", async () => {
      await expect(
        account.connect(deployer).removeOwner(deployerId)
      ).to.be.revertedWith("MOSA:NOT_SELF");
    });
  });

  describe("owner management via self-call (executeCall)", () => {
    let fresh: Contract;

    beforeEach(async () => {
      const MOSA = await ethers.getContractFactory(
        "MultiOwnableSmartAccount",
        deployer
      );
      fresh = await MOSA.deploy();
      await fresh.deployed();
      await fresh.initialize(deployerId);
    });

    it("adds a new owner (alice) via self-call and emits OwnerAdded", async () => {
      const addAlice = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);

      await expect(
        fresh.connect(deployer).executeCall(fresh.address, 0, addAlice)
      )
        .to.emit(fresh, "OwnerAdded")
        .withArgs(aliceId);

      expect(await fresh.isOwner(aliceId)).to.equal(true);

      const owners: string[] = await fresh.getOwners(); // bytes32[]
      expect(owners).to.include(deployerId);
      expect(owners).to.include(aliceId);
    });

    it("reverts when adding an existing owner", async () => {
      const addAlice = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);

      await fresh.connect(deployer).executeCall(fresh.address, 0, addAlice);
      expect(await fresh.isOwner(aliceId)).to.equal(true);

      await expect(
        fresh.connect(deployer).executeCall(fresh.address, 0, addAlice)
      ).to.be.revertedWith("MOSA:ALREADY_OWNER");
    });

    it("reverts when removing a non-owner (bob)", async () => {
      expect(await fresh.isOwner(bobId)).to.equal(false);

      const removeBob = fresh.interface.encodeFunctionData(
        "removeOwner(bytes32)",
        [bobId]
      );

      await expect(
        fresh.connect(deployer).executeCall(fresh.address, 0, removeBob)
      ).to.be.revertedWith("MOSA:NOT_OWNER");
    });

    it("removes an existing owner (alice) via self-call and emits OwnerRemoved", async () => {
      const addAlice = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);
      const removeAlice = fresh.interface.encodeFunctionData(
        "removeOwner(bytes32)",
        [aliceId]
      );

      // add first
      await fresh.connect(deployer).executeCall(fresh.address, 0, addAlice);
      expect(await fresh.isOwner(aliceId)).to.equal(true);

      // remove
      await expect(
        fresh.connect(deployer).executeCall(fresh.address, 0, removeAlice)
      )
        .to.emit(fresh, "OwnerRemoved")
        .withArgs(aliceId);

      expect(await fresh.isOwner(aliceId)).to.equal(false);
      expect(await fresh.isOwner(deployerId)).to.equal(true);
    });
  });

  describe("executeWithSig (single call)", () => {
    const TYPES = {
      ExecuteWithSig: [
        { name: "namespace", type: "uint8" },
        { name: "managerId", type: "bytes32" },
        { name: "target", type: "address" },
        { name: "value", type: "uint256" },
        { name: "dataHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    async function signExecute(
      signer: Signer,
      domain: any,
      message: {
        namespace: number;
        managerId: string;
        target: string;
        value: string | number;
        dataHash: string;
        nonce: number;
        deadline: number;
      }
    ) {
      // @ts-ignore
      return signer._signTypedData(domain, TYPES, message);
    }

    let fresh: Contract;
    let chainId: number;

    before(async () => {
      chainId = (await ethers.provider.getNetwork()).chainId;
    });

    beforeEach(async () => {
      const MOSA = await ethers.getContractFactory(
        "MultiOwnableSmartAccount",
        deployer
      );
      fresh = await MOSA.deploy();
      await fresh.deployed();
      await fresh.initialize(deployerId);
    });

    it("executes addOwner via valid EIP-712 signature and bumps nonce", async () => {
      const namespace = 1;
      const managerId = deployerId;
      const target = fresh.address;
      const value = 0;

      const calldata = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);
      const dataHash = ethers.utils.keccak256(calldata);
      const nonce = (await fresh.getNonce(deployerId)).toNumber();

      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = now + 3600;

      const domain = {
        name: "MultiOwnableSmartAccount",
        version: "1",
        chainId,
        verifyingContract: fresh.address,
      };

      const sig = await signExecute(deployer, domain, {
        namespace,
        managerId,
        target,
        value,
        dataHash,
        nonce,
        deadline,
      });

      await expect(
        fresh.executeWithSig(
          namespace,
          managerId,
          target,
          value,
          calldata,
          nonce,
          deadline,
          sig
        )
      )
        .to.emit(fresh, "OwnerAdded")
        .withArgs(aliceId);

      expect(await fresh.getNonce(deployerId)).to.equal(nonce + 1);
      expect(await fresh.isOwner(aliceId)).to.equal(true);
    });

    it("sends ETH out from the smart account via signed execute (value transfer, empty calldata)", async () => {
      // fund the smart account with 1 ETH
      await (deployer as any).sendTransaction({
        to: fresh.address,
        value: ethers.utils.parseEther("1"),
      });

      const sendAmount = ethers.utils.parseEther("0.25");
      const recipient = bobAddr;

      const namespace = 1;
      const managerId = deployerId;
      const target = recipient; // EOA
      const value = sendAmount;
      const calldata = "0x";
      const dataHash = ethers.utils.keccak256(calldata);
      const nonce = (await fresh.getNonce(deployerId)).toNumber();

      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = now + 3600;

      const domain = {
        name: "MultiOwnableSmartAccount",
        version: "1",
        chainId,
        verifyingContract: fresh.address,
      };

      const sig = await (deployer as any)._signTypedData(domain, TYPES, {
        namespace,
        managerId,
        target,
        value,
        dataHash,
        nonce,
        deadline,
      });

      const saBefore = await ethers.provider.getBalance(fresh.address);
      const recBefore = await ethers.provider.getBalance(recipient);

      // anyone can relay; use alice to prove it
      await fresh
        .connect(alice)
        .executeWithSig(
          namespace,
          managerId,
          target,
          value,
          calldata,
          nonce,
          deadline,
          sig
        );

      const saAfter = await ethers.provider.getBalance(fresh.address);
      const recAfter = await ethers.provider.getBalance(recipient);

      expect(saBefore.sub(saAfter)).to.equal(sendAmount);
      expect(recAfter.sub(recBefore)).to.equal(sendAmount);
      expect(await fresh.getNonce(deployerId)).to.equal(nonce + 1);
    });

    it("reverts with BAD_NONCE when nonce mismatches", async () => {
      const namespace = 1;
      const managerId = deployerId;
      const target = fresh.address;
      const value = 0;
      const calldata = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);
      const dataHash = ethers.utils.keccak256(calldata);
      const correct = (await fresh.getNonce(deployerId)).toNumber();
      const badNonce = correct + 1;

      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = now + 3600;

      const domain = {
        name: "MultiOwnableSmartAccount",
        version: "1",
        chainId,
        verifyingContract: fresh.address,
      };

      const sig = await signExecute(deployer, domain, {
        namespace,
        managerId,
        target,
        value,
        dataHash,
        nonce: badNonce,
        deadline,
      });

      await expect(
        fresh.executeWithSig(
          namespace,
          managerId,
          target,
          value,
          calldata,
          badNonce,
          deadline,
          sig
        )
      ).to.be.revertedWith("MOSA:BAD_NONCE");
    });

    it("reverts with EXPIRED when deadline has passed", async () => {
      const namespace = 1;
      const managerId = deployerId;
      const target = fresh.address;
      const value = 0;
      const calldata = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);
      const dataHash = ethers.utils.keccak256(calldata);
      const nonce = (await fresh.getNonce(deployerId)).toNumber();

      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = now - 1;

      const domain = {
        name: "MultiOwnableSmartAccount",
        version: "1",
        chainId,
        verifyingContract: fresh.address,
      };

      const sig = await signExecute(deployer, domain, {
        namespace,
        managerId,
        target,
        value,
        dataHash,
        nonce,
        deadline,
      });

      await expect(
        fresh.executeWithSig(
          namespace,
          managerId,
          target,
          value,
          calldata,
          nonce,
          deadline,
          sig
        )
      ).to.be.revertedWith("MOSA:EXPIRED");
    });

    it("reverts with NS_UNSUPPORTED for wrong namespace", async () => {
      const namespace = 2; // unsupported
      const managerId = deployerId;
      const target = fresh.address;
      const value = 0;
      const calldata = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);
      const dataHash = ethers.utils.keccak256(calldata);
      const nonce = (await fresh.getNonce(deployerId)).toNumber();

      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = now + 3600;

      const domain = {
        name: "MultiOwnableSmartAccount",
        version: "1",
        chainId,
        verifyingContract: fresh.address,
      };

      const sig = await signExecute(deployer, domain, {
        namespace,
        managerId,
        target,
        value,
        dataHash,
        nonce,
        deadline,
      });

      await expect(
        fresh.executeWithSig(
          namespace,
          managerId,
          target,
          value,
          calldata,
          nonce,
          deadline,
          sig
        )
      ).to.be.revertedWith("MOSA:NS_UNSUPPORTED");
    });

    it("reverts with NOT_OWNER when managerId is not an owner", async () => {
      const namespace = 1;
      const managerId = bobId; // not an owner
      const target = fresh.address;
      const value = 0;
      const calldata = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);
      const dataHash = ethers.utils.keccak256(calldata);
      const nonce = 0;

      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = now + 3600;

      const domain = {
        name: "MultiOwnableSmartAccount",
        version: "1",
        chainId,
        verifyingContract: fresh.address,
      };

      const sig = await signExecute(bob, domain, {
        namespace,
        managerId,
        target,
        value,
        dataHash,
        nonce,
        deadline,
      });

      await expect(
        fresh.executeWithSig(
          namespace,
          managerId,
          target,
          value,
          calldata,
          nonce,
          deadline,
          sig
        )
      ).to.be.revertedWith("MOSA:NOT_OWNER");
    });

    it("reverts with BAD_SIG when signature doesn't match managerId", async () => {
      const namespace = 1;
      const managerId = deployerId; // expects deployer signer
      const target = fresh.address;
      const value = 0;
      const calldata = fresh.interface.encodeFunctionData("addOwner(bytes32)", [
        aliceId,
      ]);
      const dataHash = ethers.utils.keccak256(calldata);
      const nonce = (await fresh.getNonce(deployerId)).toNumber();

      const now = (await ethers.provider.getBlock("latest"))!.timestamp;
      const deadline = now + 3600;

      const domain = {
        name: "MultiOwnableSmartAccount",
        version: "1",
        chainId,
        verifyingContract: fresh.address,
      };

      const sig = await signExecute(alice, domain, {
        namespace,
        managerId,
        target,
        value,
        dataHash,
        nonce,
        deadline,
      });

      await expect(
        fresh.executeWithSig(
          namespace,
          managerId,
          target,
          value,
          calldata,
          nonce,
          deadline,
          sig
        )
      ).to.be.revertedWith("MOSA:BAD_SIG");
    });
  });
});
