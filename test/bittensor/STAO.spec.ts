import chai from "chai";
import { BigNumberish } from "ethers";
import { ethers, getNamedAccounts, upgrades } from "hardhat";
import { MockStakingPrecompile, STAO } from "../../typechain";
import { evmRevert, evmSnapshot } from "../helpers/make-suite";

const { expect } = chai;

let HEAD_SNAPSHOT: string = "0x1";
let SNAPSHOT: string = "0x1";
const setSnapshot = (id: string) => {
  SNAPSHOT = id;
};

async function getSTAO(deployer: string, sTAO: STAO, amount: BigNumberish) {
  await sTAO.deposit(deployer, 0, {
    from: deployer,
    value: amount,
    gasLimit: 300000,
  });
}

describe("STAO Contract", function () {
  let mockStakingPrecompile: MockStakingPrecompile;
  let sTAO: any;
  let deployer: string;
  let pubKey: string;

  const HOTKEY1 =
    "0x1111111111111111111111111111111111111111111111111111111111111111";

  before(async () => {
    try {
      // Deploy MockStakingPrecompile
      const MockStakingPrecompile = await ethers.getContractFactory(
        "MockStakingPrecompile"
      );
      mockStakingPrecompile = await MockStakingPrecompile.deploy();
      await mockStakingPrecompile.deployed();

      const STAO = await ethers.getContractFactory("STAO");
      sTAO = await upgrades.deployProxy(STAO, [], {
        initializer: "initialize",
        unsafeAllow: [
          "missing-initializer",
          "struct-definition",
          "enum-definition",
        ],
      });
      await sTAO.deployed();

      // set pub key for sTAO
      pubKey = ethers.utils
        .hexZeroPad(
          ethers.utils.hexlify(ethers.BigNumber.from(sTAO.address)),
          32
        )
        .toLowerCase();

      await expect(sTAO.setPubKey(pubKey))
        .to.emit(sTAO, "PubKeySet")
        .withArgs(pubKey);

      // Set mock staking precompile address
      await expect(sTAO.setStakingPrecompile(mockStakingPrecompile.address))
        .to.emit(sTAO, "StakingPrecompileSet")
        .withArgs(mockStakingPrecompile.address);

      await sTAO.addHotKeys([HOTKEY1]);

      ({ deployer } = await getNamedAccounts());

      const id = await evmSnapshot();
      HEAD_SNAPSHOT = id;
    } catch (error) {
      console.error("could not setup tests", error);
    }
  });

  afterEach(async () => {
    try {
      await evmRevert(SNAPSHOT);
    } catch (error) {
      console.error("could not set snapshot", error);
    }
  });

  after(async () => {
    setSnapshot(HEAD_SNAPSHOT);
  });

  it("Deposit TAO, get sTAO", async () => {
    const initialBalance = Number(await ethers.provider.getBalance(deployer));

    const amount = ethers.utils.parseEther("0.69");
    await getSTAO(deployer, sTAO, amount);

    const balanceAfter = await sTAO.balanceOf(deployer);
    const balanceAfterNum = Number(ethers.utils.formatEther(balanceAfter));

    const stakedAtFirstHotKey = await sTAO.getHotKeyStakedAmount(HOTKEY1);
    expect(stakedAtFirstHotKey).to.be.eq(amount);

    expect(balanceAfterNum).to.be.approximately(
      Number(ethers.utils.formatEther(amount)),
      0.00001
    );
    expect(Number(await ethers.provider.getBalance(deployer))).to.be.lessThan(
      initialBalance
    );
  });

  it("Get sTAO to TAO rate after accruing staking yields to get more TAO", async () => {
    const initialBalance = Number(await ethers.provider.getBalance(deployer));
    const amount = "10000000000000000000"; // 10 TAO

    await getSTAO(deployer, sTAO, amount);

    const balanceAfter = await sTAO.balanceOf(deployer);
    const balanceAfterNum = Number(ethers.utils.formatEther(balanceAfter));

    expect(balanceAfterNum).to.be.approximately(
      Number(ethers.utils.formatEther(amount)),
      0.00001
    );
    expect(Number(await ethers.provider.getBalance(deployer))).to.be.lessThan(
      initialBalance
    );

    // hotkey to delegate to (increaseStake)
    const hotkey = HOTKEY1;

    // check totalStakes for coldkey
    // deployer coldkey - bytes32(uint256(uint160(sTAO.address)))
    const pubKey = await sTAO.getPubKey();

    expect(
      (await mockStakingPrecompile.getTotalColdkeyStake(pubKey)).toString()
    ).to.be.eq(amount);
    expect(
      (await mockStakingPrecompile.totalStakes(pubKey)).toString()
    ).to.be.eq(amount);

    // simulate staking rewards - accrue 1 TAO
    await mockStakingPrecompile.accrueStakingRewards(
      hotkey,
      0,
      "1000000000000000000"
    );

    // both these should be the same
    expect(
      (await mockStakingPrecompile.getTotalColdkeyStake(pubKey)).toString()
    ).to.be.eq("11000000000000000000");
    expect(
      (await mockStakingPrecompile.totalStakes(pubKey)).toString()
    ).to.be.eq("11000000000000000000");

    const deployerShares = await sTAO.balanceOf(deployer);
    const deployerSharesNum = Number(ethers.utils.formatEther(deployerShares));
    expect(deployerSharesNum).to.be.approximately(10, 0.00001);

    const rate = await sTAO.convertToAssets(
      ethers.utils.parseUnits("1", await sTAO.decimals())
    );
    const rateNum = Number(ethers.utils.formatEther(rate));
    expect(rateNum).to.be.approximately(1.1, 0.00001);
  });

  it("Burn sTAO for TAO", async () => {
    const amount = "690000000000000000";
    await getSTAO(deployer, sTAO, amount);

    const balance = await sTAO.balanceOf(deployer);
    const balanceNum = Number(ethers.utils.formatEther(balance));
    expect(balanceNum).to.be.approximately(
      Number(ethers.utils.formatEther(amount)),
      0.00001
    );

    const initialBalance = Number(await ethers.provider.getBalance(deployer));
    const actualSTaoBalance = await sTAO.balanceOf(deployer);

    await expect(sTAO.withdraw(actualSTaoBalance, deployer, 0))
      .to.emit(sTAO, "Withdrawal")
      .withArgs(deployer, deployer, amount, actualSTaoBalance);

    expect((await sTAO.balanceOf(deployer)).toString()).to.be.eq("0");
    expect(
      Number(await ethers.provider.getBalance(deployer))
    ).to.be.greaterThan(initialBalance);
  });

  it("Should track sTAO balances", async () => {
    const amount = "690000000000000000";

    // Add event check for deposit
    await expect(sTAO.deposit(deployer, 0, { value: amount }))
      .to.emit(sTAO, "Deposit")
      .withArgs(deployer, deployer, amount, amount);

    const balance = await sTAO.balanceOf(deployer);

    const balanceNum = Number(ethers.utils.formatEther(balance));
    expect(balanceNum).to.be.approximately(
      Number(ethers.utils.formatEther(amount)),
      0.00001
    );
  });

  it("Should revert if slippage is too big on deposit", async () => {
    const amount = "690000000000000000";
    const expectedShares = await sTAO.convertToShares(amount, 0);

    await expect(
      sTAO.deposit(deployer, expectedShares + 1, { value: amount })
    ).to.be.revertedWith("Slippage too big");
  });

  it("Should revert if slippage is too big on withdraw", async () => {
    const amount = "690000000000000000";
    // Deposit first
    await sTAO.deposit(deployer, 0, { value: amount });
    const sTaoReceived = await sTAO.balanceOf(deployer);
    const expectedTao = await sTAO.convertToAssets(sTaoReceived);

    await expect(
      sTAO.withdraw(sTaoReceived, deployer, expectedTao + 1)
    ).to.be.revertedWith("Slippage too big");
  });

  it("Should distribute staking rewards to multiple sTAO holders", async () => {
    const signers = await ethers.getSigners();
    const alice = signers[0].address;
    const bob = signers[1].address;
    const aliceLawyer = signers[2].address;

    // Deposit Alice
    const aliceDepositAmount = ethers.utils.parseEther("1");
    await sTAO.deposit(alice, 0, { value: aliceDepositAmount });

    // Simulate staking rewards
    const firstStakingReward = ethers.utils.parseEther("0.1");
    const hotkey = HOTKEY1;

    // await sTAO.increaseStake(hotkey, aliceDepositAmount);
    await mockStakingPrecompile.accrueStakingRewards(
      hotkey,
      0,
      firstStakingReward
    );

    // Deposit Bob
    const bobDepositAmount = ethers.utils.parseEther("3.3");
    await sTAO.deposit(bob, 0, { value: bobDepositAmount });

    // Simulate staking rewards
    const secondStakingReward = ethers.utils.parseEther("0.2");
    await mockStakingPrecompile.accrueStakingRewards(
      hotkey,
      0,
      secondStakingReward
    );

    // Check total staked TAO
    expect(await sTAO.totalStakedTAO()).to.be.eq(
      aliceDepositAmount
        .add(bobDepositAmount)
        .add(firstStakingReward)
        .add(secondStakingReward)
    );

    // Both withdraw everything
    const aliceShares = await sTAO.balanceOf(alice);
    const aliceLawyerBalanceBefore = await ethers.provider.getBalance(
      aliceLawyer
    );

    await sTAO.withdraw(aliceShares, aliceLawyer, 0, {
      from: alice,
    });

    expect(await sTAO.balanceOf(alice)).to.be.eq(0);

    const aliceLawyerBalanceAfter = await ethers.provider.getBalance(
      aliceLawyer
    );
    const aliceLawyerBalanceDifference = aliceLawyerBalanceAfter.sub(
      aliceLawyerBalanceBefore
    );

    // Alice should be able to withdraw her deposit
    //  + full rewards from first distribution
    //  + 1/4 of the second distribution
    //  - 1 wei due to precision loss
    const aliceExpectedWithdrawal = aliceDepositAmount
      .add(firstStakingReward)
      .add(secondStakingReward.div(4));

    // Check alice balance
    expect(aliceLawyerBalanceDifference).to.be.eq(
      aliceExpectedWithdrawal.sub(1)
    );

    // Check that the Bob holds rest of the shares
    expect(await sTAO.totalSupply()).to.be.eq(await sTAO.balanceOf(bob));
  });

  beforeEach(async () => {
    setSnapshot(await evmSnapshot());
  });
});
