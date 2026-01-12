const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("UniV3PoolFeeClaimer (Mainnet Fork)", function () {
    const FACTORY = "0x20D0Cdf9004bf56BCa52A25C9288AAd0EbB97D59";
    const factoryOwner = "0x2532C3D363306fA6d625e4cBAD996bcf534E8154"

    let deployer, nonOwner, claimer, factory;

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();

        // Attach real factory
        factory = await ethers.getContractAt(
            "IUniswapV3Factory",
            FACTORY
        );

        const Claimer = await ethers.getContractFactory("UniV3PoolFeeClaimer");
        claimer = await Claimer.deploy();
        await claimer.deployed();
    });

    it("can set Uniswap factory owner via impersonation", async () => {
        // Impersonate factory owner
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [factoryOwner],
        });

        const ownerSigner = await ethers.getSigner(factoryOwner);

        // Fund impersonated account
        await deployer.sendTransaction({
            to: factoryOwner,
            value: ethers.utils.parseEther("1"),
        });

        const newOwner = claimer.address;

        await expect(
            factory.connect(ownerSigner).setOwner(newOwner)
        ).to.not.be.reverted;

        // Stop impersonation
        await network.provider.request({
            method: "hardhat_stopImpersonatingAccount",
            params: [factoryOwner],
        });

        // reverts if non-owner tries to set factory owner
        await expect(
            claimer.connect(nonOwner).setFactoryOwner(factoryOwner)
        ).to.be.reverted;

        // Call through your contract
        await expect(
            claimer.connect(deployer).setFactoryOwner(factoryOwner)
        ).to.not.be.reverted;
    });
});
