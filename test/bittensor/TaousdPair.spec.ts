import chai from "chai";
import {
  deployments,
  ethers,
  getNamedAccounts,
  getUnnamedAccounts,
} from "hardhat";
import { evmRevert, evmSnapshot } from "../helpers/make-suite";
import { STAO } from "../../typechain";
import { convertToCurrencyDecimals } from "../helpers/misc-utils";
import { BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Deployment } from "hardhat-deploy/types";

const { expect } = chai;
const abi = ethers.utils.defaultAbiCoder;

let HEAD_SNAPSHOT: string = "0x1";
let SNAPSHOT: string = "0x1";
const setSnapshot = (id: string) => {
  SNAPSHOT = id;
};

async function getSTAO(
  borrower: SignerWithAddress,
  sTAO: STAO,
  amount: BigNumberish
) {
  await sTAO.connect(borrower).deposit(borrower.address, 0, {
    from: borrower.address,
    value: amount,
    gasLimit: 300000,
  });
}

describe("TaousdPair Contract", function () {
  let sTAO: any;
  let STAO: Deployment;
  let pubKey: string;

  before(async () => {
    try {
      const { get } = deployments;
      // Deploy MockStakingPrecompile
      const MockStakingPrecompile = await ethers.getContractFactory(
        "MockStakingPrecompile"
      );
      const mockStakingPrecompile = await MockStakingPrecompile.deploy();
      await mockStakingPrecompile.deployed();

      // Get STAO instance
      STAO = await get("STAO");
      sTAO = await ethers.getContractAt("STAO", STAO.address);

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
      const id = await evmSnapshot();
    } catch (error) {
      console.error("could not setup tests", error);
    }
  });
  beforeEach(async () => {
    try {
      evmRevert(SNAPSHOT);
    } catch (error) {
      console.error("could not set snapshot", error);
    }
  });
  after(async () => {
    await setSnapshot(HEAD_SNAPSHOT);
  });
  it("Check pair configuration", async () => {
    const { read, get } = deployments;

    const Taousd = await get("Taousd");
    const taousdPairOracleAddress = (await get("TaousdSiloOracle")).address;
    const taousdPairOracle = await ethers.getContractAt(
      "STaoTaoUSDOracle",
      taousdPairOracleAddress
    );
    const taousdPairOraclePriceDecimals = await taousdPairOracle.DECIMALS();
    const taousdPairInterestRateAddress = (await get("TaousdSiloInterestRate"))
      .address;

    expect(await read("TaousdPair", "asset")).to.be.eq(Taousd.address);
    expect(await read("TaousdPair", "collateralContract")).to.be.eq(
      sTAO.address
    );
    expect((await read("TaousdPair", "exchangeRateInfo")).oracle).to.be.eq(
      taousdPairOracleAddress
    );
    expect(
      (await read("TaousdPair", "exchangeRateInfo")).maxOracleDeviation
    ).to.be.eq(0);
    expect(await read("TaousdPair", "rateContract")).to.be.eq(
      taousdPairInterestRateAddress
    );
    expect(
      (await read("TaousdPair", "currentRateInfo")).feeToProtocolRate
    ).to.be.eq(0);
    expect(
      (await read("TaousdPair", "currentRateInfo")).fullUtilizationRate
    ).to.be.not.eq(0);
    expect(
      (await read("TaousdPair", "currentRateInfo")).lastTimestamp
    ).to.be.not.eq(0);
    expect(
      (await read("TaousdPair", "currentRateInfo")).lastBlock
    ).to.be.not.eq(0);
    expect(await read("TaousdPair", "cleanLiquidationFee")).to.be.eq(10000);
    expect(await read("TaousdPair", "protocolLiquidationFee")).to.be.eq(0);
    expect(await read("TaousdPair", "maxLTV")).to.be.eq(50000);
  });

  it("User1 deposits τUSD, User2 deposits TAO as collateral, borrows τUSD, then repays it", async () => {
    const { execute, get, read } = deployments;
    const { owner } = await getNamedAccounts();
    const [borrower, depositor] = await getUnnamedAccounts();
    const [ownerSigner, borrowerSigner, depositorSigner] =
      await ethers.getSigners();

    console.log(`sTao address: ${sTAO.address}`);
    console.log(await read("STAO", "name"));

    const Taousd = await get("Taousd");
    console.log(`taousd address: ${Taousd.address}`);
    const taousd = await ethers.getContractAt("Taousd", Taousd.address);
    console.log(await read("Taousd", "name"));

    const amount = await convertToCurrencyDecimals(Taousd.address, 100000);
    const taoAmount = await ethers.utils.parseEther("10");
    const collateralAmount = await read("STAO", "convertToShares", taoAmount, 0);
    const poolAddress = (await get("TaousdPair")).address;

    // prepare taousd
    // increase limits for the deployer
    console.log("setLimits");
    await taousd.setLimits(
      ownerSigner.address,
      ethers.constants.MaxUint256.div(2),
      ethers.constants.MaxUint256.div(2)
    );

    console.log("mint");
    await taousd.mint(depositor, amount);
    // Approve
    await taousd.connect(depositorSigner).approve(poolAddress, amount);
    // Deposit
    await execute(
      "TaousdPair",
      { from: depositor },
      "deposit",
      amount,
      depositor
    );
    //check depositor snapshot
    const depositorSnapShot = await read(
      "TaousdPair",
      "getUserSnapshot",
      depositor
    );
    expect(
      await read(
        "TaousdPair",
        "toAssetAmount",
        depositorSnapShot._userAssetShares,
        true,
        false
      )
    ).to.be.eq(amount);

    const taousdPairAddress = (await get("TaousdPair")).address;
    console.log(`taousd pair address: ${taousdPairAddress}`);
    const taousdPair = await ethers.getContractAt(
      "SturdyPair",
      taousdPairAddress
    );
    console.log(await read("TaousdPair", "name"));
    // prepare STAO as collateral
    console.log("getting sTAO");
    await getSTAO(borrowerSigner, sTAO, collateralAmount);
    // Approve
    console.log("approving");
    await sTAO.connect(borrowerSigner).approve(poolAddress, collateralAmount);
    let bal = await read("STAO", "balanceOf", borrower);
    console.log(`sTAO balance: ${bal}`);
    // addCollateral
    console.log("depositting STAO to TaousdPair");
    await execute(
      "TaousdPair",
      { from: borrower },
      "addCollateral",
      collateralAmount,
      borrower
    );
    console.log("depositted");

    // Borrow taousd
    const exchangeRate = (await read("TaousdSiloOracle", "getPrices"))
      ._priceHigh;
    console.log(`exchange rate: ${exchangeRate}`);
    // 50% LTV
    const borrowAmount = (await convertToCurrencyDecimals(taousd.address, 1580))
    console.log(`borrowing: ${borrowAmount}`);
    await execute(
      "TaousdPair",
      {
        from: borrower,
        gasLimit: 3000000
      },
      "borrowAsset",
      borrowAmount,
      0,
      borrower,
    );
    console.log("borrowed");
    //check borrower snapshot
    let borrowerSnapShot = await read(
      "TaousdPair",
      "getUserSnapshot",
      borrower
    );
    expect(
      await read(
        "TaousdPair",
        "toBorrowAmount",
        borrowerSnapShot._userBorrowShares,
        true,
        false
      )
    ).to.be.eq(borrowAmount);
    expect(borrowerSnapShot._userCollateralBalance).to.be.eq(collateralAmount);
    expect(await taousd.balanceOf(borrower)).to.be.eq(borrowAmount);

    // Borrow again but failed because of 50% LTV
    await expect(
      execute(
        "TaousdPair",
        { from: borrower },
        "borrowAsset",
        await convertToCurrencyDecimals(taousd.address, 1000),
        0,
        borrower
      )
    ).to.be.reverted;
    console.log("borrowed again failed");
    // Prepare more collateral
    await getSTAO(borrowerSigner, sTAO, collateralAmount);
    // Approve
    await sTAO.connect(borrowerSigner).approve(poolAddress, collateralAmount);
    // Borrow again success
    await execute(
      "TaousdPair",
      { from: borrower },
      "borrowAsset",
      borrowAmount,
      collateralAmount,
      borrower
    );
    //check final snapshot
    borrowerSnapShot = await read("TaousdPair", "getUserSnapshot", borrower);
    expect(
      await read(
        "TaousdPair",
        "toBorrowAmount",
        borrowerSnapShot._userBorrowShares,
        true,
        false
      )
    ).to.be.gt(borrowAmount.mul(2));
    expect(borrowerSnapShot._userCollateralBalance).to.be.eq(
      collateralAmount.mul(2)
    );
    expect(
      await read(
        "TaousdPair",
        "toAssetAmount",
        depositorSnapShot._userAssetShares,
        true,
        false
      )
    ).to.be.gt(amount);
    expect(await taousd.balanceOf(borrower)).to.be.eq(borrowAmount.mul(2));
    expect(await sTAO.balanceOf(borrower)).to.be.eq(0);

    // repay
    const repayAmount = await convertToCurrencyDecimals(taousd.address, 1000);
    const withdrawAmount = await convertToCurrencyDecimals(sTAO.address, 2);

    // Approve
    const repayShares = await read(
      "TaousdPair",
      "toBorrowShares",
      repayAmount,
      false,
      true
    );
    await taousd
      .connect(borrowerSigner)
      .approve(poolAddress, repayAmount.div(10).mul(11));
    expect(await taousd.balanceOf(borrower)).to.be.gt(repayAmount);
    // Repay
    await execute(
      "TaousdPair",
      { from: borrower },
      "repayAsset",
      repayShares,
      borrower
    );
    //check borrower snapshot
    borrowerSnapShot = await read("TaousdPair", "getUserSnapshot", borrower);
    console.log("toAssetAmount");
    expect(
      await read(
        "TaousdPair",
        "toAssetAmount",
        borrowerSnapShot._userBorrowShares,
        true,
        false
      )
    ).to.be.lt("6501000000000000000000");
    console.log("checking taousd balance");
    expect(await taousd.balanceOf(borrower)).to.be.lt(
      await convertToCurrencyDecimals(taousd.address, 6501)
    );
    console.log("checking sTAO balance");
    expect(await sTAO.balanceOf(borrower)).to.be.eq(0);
    console.log("checking collat balance");
    expect(borrowerSnapShot._userCollateralBalance).to.be.eq(
      collateralAmount.mul(2)
    );

    // remove collateral
    await execute(
      "TaousdPair",
      { from: borrower },
      "removeCollateral",
      withdrawAmount,
      borrower
    );
    borrowerSnapShot = await read("TaousdPair", "getUserSnapshot", borrower);
    console.log("checking collat balance again");
    expect(borrowerSnapShot._userCollateralBalance).to.be.eq(
      "18000000000000000000"
    );
    console.log("checking balance");
    expect(await sTAO.balanceOf(borrower)).to.be.eq(withdrawAmount);
  });
  beforeEach(async () => {
    setSnapshot(await evmSnapshot());
  });
});
