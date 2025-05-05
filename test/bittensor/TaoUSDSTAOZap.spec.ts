import chai from "chai";
import { ethers } from "hardhat";
import { evmRevert, evmSnapshot } from "../helpers/make-suite";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  TaoUSDSTAOZap,
  Taousd,
  STAO,
  MockStakingPrecompile,
  MockUniswapRouter,
} from "../../typechain";
import { convertToCurrencyDecimals } from "../helpers/misc-utils";

const { expect } = chai;

describe("TaoUSDSTAOZap Contract", function () {
  let zap: TaoUSDSTAOZap;
  let taousd: Taousd;
  let sTAO: STAO;
  let mockStakingPrecompile: MockStakingPrecompile;
  let mockUniswapRouter: MockUniswapRouter;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let snapshotId: string;
  let pubKey: string;

  before(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy MockStakingPrecompile
    const MockStakingPrecompile = await ethers.getContractFactory(
      "MockStakingPrecompile"
    );
    mockStakingPrecompile = await MockStakingPrecompile.deploy();
    await mockStakingPrecompile.deployed();

    // Deploy MockUniswapRouter
    const MockUniswapRouter = await ethers.getContractFactory(
      "MockUniswapRouter"
    );
    mockUniswapRouter = await MockUniswapRouter.deploy();
    await mockUniswapRouter.deployed();

    // Deploy MockTaousd
    const MockTaousdFactory = await ethers.getContractFactory("MockTaousd");
    taousd = await MockTaousdFactory.connect(owner).deploy("TaoUSD", "τUSD");
    await taousd.deployed();

    // Deploy STAO
    const STAOFactory = await ethers.getContractFactory("STAO");
    sTAO = await STAOFactory.deploy();
    await sTAO.deployed();
    await sTAO.initialize();

    // Set pubkey for sTAO
    pubKey = ethers.utils
      .hexZeroPad(ethers.utils.hexlify(ethers.BigNumber.from(sTAO.address)), 32)
      .toLowerCase();
    await sTAO.setPubKey(pubKey);

    // Set mock staking precompile address
    await sTAO.setStakingPrecompile(mockStakingPrecompile.address);

    // Deploy Zap contract
    const ZapFactory = await ethers.getContractFactory("TaoUSDSTAOZap");
    zap = await ZapFactory.deploy(
      taousd.address,
      sTAO.address,
      mockUniswapRouter.address
    );
    await zap.deployed();

    // Approve router to spend sTAO from zap contract
    await sTAO
      .connect(owner)
      .approve(mockUniswapRouter.address, ethers.constants.MaxUint256);
  });

  beforeEach(async () => {
    snapshotId = await evmSnapshot();
  });

  afterEach(async () => {
    await evmRevert(snapshotId);
  });

  it("Checks initial configuration", async () => {
    expect(await zap.taoUSD()).to.be.equal(taousd.address);
    expect(await zap.sTAO()).to.be.equal(sTAO.address);
    expect(await zap.uniswapRouter()).to.be.equal(mockUniswapRouter.address);
  });

  it("Should successfully zap taoUSD and TAO into LP tokens", async () => {
    const taoUSDAmount = await convertToCurrencyDecimals(
      taousd.address,
      "1000"
    );
    const taoAmount = ethers.utils.parseEther("10");
    const networkFee = ethers.utils.parseEther("0.01");

    // Set network fee
    await sTAO.setNetworkFee(networkFee);

    // Mint taoUSD to user
    await taousd.connect(owner).mint(user.address, taoUSDAmount);

    // Approve zap contract to spend user's taoUSD
    await taousd.connect(user).approve(zap.address, taoUSDAmount);

    // Mock the expected liquidity amount
    const expectedLiquidity = ethers.utils.parseEther("5"); // arbitrary amount
    await mockUniswapRouter.setExpectedLiquidity(expectedLiquidity);

    // Calculate min amounts (assuming 1% slippage)
    const minTaoUSDAmount = taoUSDAmount.mul(99).div(100);

    // Execute zap
    await zap.connect(user).zapAddLiquidity(taoUSDAmount, minTaoUSDAmount, 0, {
      value: taoAmount.add(networkFee),
    });

    // Verify balances - tokens should be in the router contract
    expect(await taousd.balanceOf(user.address)).to.equal(0);
    expect(await taousd.balanceOf(mockUniswapRouter.address)).to.equal(
      taoUSDAmount
    );
    expect(await sTAO.balanceOf(user.address)).to.equal(0);
    expect(await sTAO.balanceOf(mockUniswapRouter.address)).to.be.gt(0);
  });

  it("Should revert if insufficient TAO is sent", async () => {
    const taoUSDAmount = await convertToCurrencyDecimals(
      taousd.address,
      "1000"
    );
    const networkFee = ethers.utils.parseEther("0.01");
    const taoAmount = networkFee.sub(1);

    await sTAO.setNetworkFee(networkFee);
    await taousd.connect(owner).mint(user.address, taoUSDAmount);
    await taousd.connect(user).approve(zap.address, taoUSDAmount);

    await expect(
      zap.connect(user).zapAddLiquidity(taoUSDAmount, 0, 0, {
        value: taoAmount,
      })
    ).to.be.reverted;
  });

  it("Should revert if slippage is too high", async () => {
    const taoUSDAmount = await convertToCurrencyDecimals(
      taousd.address,
      "1000"
    );
    const taoAmount = ethers.utils.parseEther("10");
    const networkFee = ethers.utils.parseEther("0.01");

    await sTAO.setNetworkFee(networkFee);
    await taousd.connect(owner).mint(user.address, taoUSDAmount);
    await taousd.connect(user).approve(zap.address, taoUSDAmount);

    // Set unreasonably high min amounts
    const tooHighMinAmount = taoUSDAmount.mul(2);

    await expect(
      zap
        .connect(user)
        .zapAddLiquidity(taoUSDAmount, tooHighMinAmount, tooHighMinAmount, {
          value: taoAmount.add(networkFee),
        })
    ).to.be.revertedWith("Slippage too big");
  });

  it("Mock TaoUSD should work correctly", async () => {
    const amount = await convertToCurrencyDecimals(taousd.address, "1000");

    // Check initial state
    expect(await taousd.name()).to.equal("Tau USD");
    expect(await taousd.symbol()).to.equal("τUSD");
    expect(await taousd.decimals()).to.equal(6);
    expect(await taousd.balanceOf(user.address)).to.equal(0);

    // Test minting
    await taousd.connect(owner).mint(user.address, amount);
    expect(await taousd.balanceOf(user.address)).to.equal(amount);

    // Test burning
    await taousd.connect(owner).burn(user.address, amount);
    expect(await taousd.balanceOf(user.address)).to.equal(0);

    // Test transfer
    await taousd.connect(owner).mint(owner.address, amount);
    await taousd.connect(owner).transfer(user.address, amount);
    expect(await taousd.balanceOf(user.address)).to.equal(amount);
    expect(await taousd.balanceOf(owner.address)).to.equal(0);
  });
});
