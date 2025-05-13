import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { ethers } from "hardhat";
import { MockStakingPrecompile, TAOStaker } from "../../typechain-types";

const { expect } = chai;

describe("TAOStaker", function () {
  let taoStaker: TAOStaker;
  let mockStakingPrecompile: MockStakingPrecompile;
  let owner: SignerWithAddress;
  let nonOwner: SignerWithAddress;
  const PUB_KEY =
    "0x1234567890123456789012345678901234567890123456789012345678901234";
  const STAKING_PRECOMPILE = "0x0000000000000000000000000000000000001001";
  const HOTKEY1 =
    "0x1111111111111111111111111111111111111111111111111111111111111111";
  const HOTKEY2 =
    "0x2222222222222222222222222222222222222222222222222222222222222222";
  const HOTKEY3 =
    "0x3333333333333333333333333333333333333333333333333333333333333333";

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();

    // Deploy MockStakingPrecompile
    const MockStakingPrecompileFactory = await ethers.getContractFactory(
      "MockStakingPrecompile"
    );
    mockStakingPrecompile = await MockStakingPrecompileFactory.deploy();
    await mockStakingPrecompile.deployed();

    // Deploy TAOStaker
    const TAOStakerFactory = await ethers.getContractFactory("TAOStaker");
    taoStaker = await TAOStakerFactory.deploy();
    await taoStaker.deployed();

    // Initialize TAOStaker with mock staking precompile
    await taoStaker.initialize(PUB_KEY, mockStakingPrecompile.address);
  });

  describe("Initialization", function () {
    it("should initialize with correct values", async function () {
      expect(await taoStaker.getPubKey()).to.equal(PUB_KEY);
      expect(await taoStaker.getStakingPrecompile()).to.equal(
        mockStakingPrecompile.address
      );
    });

    it("should revert if initialized twice", async function () {
      await expect(
        taoStaker.initialize(PUB_KEY, mockStakingPrecompile.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Getters", function () {
    it("should return correct pub key", async function () {
      expect(await taoStaker.getPubKey()).to.equal(PUB_KEY);
    });

    it("should return correct staking precompile address", async function () {
      expect(await taoStaker.getStakingPrecompile()).to.equal(
        mockStakingPrecompile.address
      );
    });

    it("should return empty hotkeys array initially", async function () {
      const hotkeys = await taoStaker.getHotkeys();
      expect(hotkeys.length).to.equal(0);
    });
  });

  describe("Setters", function () {
    it("should allow owner to set pub key", async function () {
      const newPubKey =
        "0x9876543210987654321098765432109876543210987654321098765432109876";
      await taoStaker.connect(owner).setPubKey(newPubKey);
      expect(await taoStaker.getPubKey()).to.equal(newPubKey);
    });

    it("should not allow non-owner to set pub key", async function () {
      const newPubKey =
        "0x9876543210987654321098765432109876543210987654321098765432109876";
      await expect(
        taoStaker.connect(nonOwner).setPubKey(newPubKey)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should allow owner to set staking precompile", async function () {
      const newPrecompile = "0x0000000000000000000000000000000000001002";
      await taoStaker.connect(owner).setStakingPrecompile(newPrecompile);
      expect(await taoStaker.getStakingPrecompile()).to.equal(newPrecompile);
    });

    it("should not allow non-owner to set staking precompile", async function () {
      const newPrecompile = "0x0000000000000000000000000000000000001002";
      await expect(
        taoStaker.connect(nonOwner).setStakingPrecompile(newPrecompile)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Hotkey Management", function () {
    it("should allow owner to add hotkeys", async function () {
      const hotkeys = [HOTKEY1, HOTKEY2];
      await taoStaker.connect(owner).addHotKeys(hotkeys);

      const storedHotkeys = await taoStaker.getHotkeys();
      expect(storedHotkeys.length).to.equal(2);
      expect(storedHotkeys[0]).to.equal(HOTKEY1);
      expect(storedHotkeys[1]).to.equal(HOTKEY2);
    });

    it("should not allow non-owner to add hotkeys", async function () {
      const hotkeys = [HOTKEY1, HOTKEY2];
      await expect(
        taoStaker.connect(nonOwner).addHotKeys(hotkeys)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert when adding duplicate hotkey", async function () {
      const hotkeys = [HOTKEY1];
      await taoStaker.connect(owner).addHotKeys(hotkeys);
      await expect(
        taoStaker.connect(owner).addHotKeys(hotkeys)
      ).to.be.revertedWith("HotKeyAlreadyAdded");
    });

    it("should allow owner to remove hotkeys", async function () {
      // First add hotkeys
      const hotkeys = [HOTKEY1, HOTKEY2];
      await taoStaker.connect(owner).addHotKeys(hotkeys);

      // Then remove the first hotkey
      await taoStaker.connect(owner).removeHotKeys([0]);

      const storedHotkeys = await taoStaker.getHotkeys();
      expect(storedHotkeys.length).to.equal(1); // Array length remains same
      expect(storedHotkeys[0]).to.equal(HOTKEY2);
      expect(await taoStaker.isHotKeyAdded(HOTKEY1)).to.be.false;
    });

    it("should not allow non-owner to remove hotkeys", async function () {
      await taoStaker.connect(owner).addHotKeys([HOTKEY1]);
      await expect(
        taoStaker.connect(nonOwner).removeHotKeys([0])
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should revert when removing non-existent hotkey", async function () {
      await expect(taoStaker.connect(owner).removeHotKeys([0])).to.be.reverted;
    });

    it("should properly rebalance stakes across hotkeys", async function () {
      const contractAddress = await taoStaker.address;
      const contractPubKey = ethers.utils.hexZeroPad(contractAddress, 32);
      await taoStaker.connect(owner).setPubKey(contractPubKey);

      // Add initial hotkeys
      const hotkeys = [HOTKEY1, HOTKEY2, HOTKEY3];
      await taoStaker.connect(owner).addHotKeys(hotkeys);

      // Send some TAO to the contract
      const initialAmount = ethers.utils.parseEther("10.0");
      await owner.sendTransaction({
        to: taoStaker.address,
        value: initialAmount,
      });

      // Initial stake distribution - all on first hotkey
      const initialTargets = [
        initialAmount, // HOTKEY1
        ethers.utils.parseEther("0"), // HOTKEY2
        ethers.utils.parseEther("0"), // HOTKEY3
      ];
      await taoStaker.connect(owner).rebalance(initialTargets);

      // Verify initial stake distribution
      const initialStake1 = await taoStaker.getHotKeyStakedAmount(HOTKEY1);
      const initialStake2 = await taoStaker.getHotKeyStakedAmount(HOTKEY2);
      const initialStake3 = await taoStaker.getHotKeyStakedAmount(HOTKEY3);
      expect(initialStake1).to.equal(initialAmount);
      expect(initialStake2).to.equal(0);
      expect(initialStake3).to.equal(0);

      // Verify contract balance is zero (all staked)
      const contractBalanceAfterInitialStake = await ethers.provider.getBalance(
        taoStaker.address
      );
      expect(contractBalanceAfterInitialStake).to.equal(0);

      // Remove first hotkey
      await taoStaker.connect(owner).removeHotKeys([0]);

      // Verify HOTKEY1 is properly unstaked
      const stakeAfterRemoval = await taoStaker.getHotKeyStakedAmount(HOTKEY1);
      expect(stakeAfterRemoval).to.equal(0);

      // Verify TAO is returned to the contract
      const contractBalanceAfterRemoval = await ethers.provider.getBalance(
        taoStaker.address
      );
      expect(contractBalanceAfterRemoval).to.equal(initialAmount);

      // Verify HOTKEY1 is no longer in the hotkeys array
      const storedHotkeys = await taoStaker.getHotkeys();
      expect(storedHotkeys.length).to.equal(2);
      expect(storedHotkeys[0]).to.equal(HOTKEY3);
      expect(storedHotkeys[1]).to.equal(HOTKEY2);
      expect(await taoStaker.isHotKeyAdded(HOTKEY1)).to.be.false;

      // Send more TAO to the contract
      const additionalAmount = ethers.utils.parseEther("5.0");
      await owner.sendTransaction({
        to: taoStaker.address,
        value: additionalAmount,
      });

      // Distribute new TAO across remaining hotkeys
      const additionalTargets = [
        ethers.utils.parseEther("8.0"), // HOTKEY2
        ethers.utils.parseEther("7.0"), // HOTKEY3
      ];
      await taoStaker.connect(owner).rebalance(additionalTargets);

      // Verify stake distribution before final rebalance
      const beforeStake2 = await taoStaker.getHotKeyStakedAmount(HOTKEY2);
      const beforeStake3 = await taoStaker.getHotKeyStakedAmount(HOTKEY3);
      expect(beforeStake2).to.equal(ethers.utils.parseEther("7.0"));
      expect(beforeStake3).to.equal(ethers.utils.parseEther("8.0"));

      // Verify contract balance is zero (all staked)
      const contractBalanceAfterAdditionalStake =
        await ethers.provider.getBalance(taoStaker.address);
      expect(contractBalanceAfterAdditionalStake).to.equal(0);

      // Final rebalance with different target amounts
      const finalTargets = [
        ethers.utils.parseEther("4.0"), // HOTKEY2
        ethers.utils.parseEther("1.0"), // HOTKEY3
      ];
      await taoStaker.connect(owner).rebalance(finalTargets);

      // Verify final stake distribution
      const finalStake2 = await taoStaker.getHotKeyStakedAmount(HOTKEY2);
      const finalStake3 = await taoStaker.getHotKeyStakedAmount(HOTKEY3);
      expect(finalStake2).to.equal(finalTargets[1]);
      expect(finalStake3).to.equal(finalTargets[0]);

      // Verify contract balance is zero (all staked)
      const finalContractBalance = await ethers.provider.getBalance(
        taoStaker.address
      );
      expect(finalContractBalance).to.equal(ethers.utils.parseEther("10"));

      // Verify total staked amount remains the same
      const totalStaked = await taoStaker.totalStakedTAO();
      expect(totalStaked).to.equal(initialAmount.add(additionalAmount));
    });
  });
});
