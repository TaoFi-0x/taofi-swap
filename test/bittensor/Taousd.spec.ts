import chai from "chai";
import { ethers } from "hardhat";
import { evmRevert, evmSnapshot } from "../helpers/make-suite";
import { Taousd } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const { expect } = chai;

describe("Taousd Contract", function () {
  let taousd: Taousd;
  let owner: SignerWithAddress;
  let operator: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let snapshotId: string;

  before(async () => {
    [owner, operator, user1, user2] = await ethers.getSigners();

    // Deploy Taousd contract directly
    const TaousdFactory = await ethers.getContractFactory("Taousd");
    taousd = await TaousdFactory.connect(owner).deploy("Tau USD", "τUSD");
    await taousd.deployed();
  });

  beforeEach(async () => {
    // Take snapshot before each test
    snapshotId = await evmSnapshot();
  });

  afterEach(async () => {
    // Revert to snapshot after each test
    await evmRevert(snapshotId);
  });

  it("Checks initial configuration", async () => {
    expect(await taousd.name()).to.be.equal("Tau USD");
    expect(await taousd.symbol()).to.be.equal("τUSD");
    expect(await taousd.decimals()).to.be.equal(6);
    expect(await taousd.owner()).to.be.equal(owner.address);
  });
});
