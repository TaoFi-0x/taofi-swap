const { setCode, impersonateAccount, setBalance } = require("@nomicfoundation/hardhat-network-helpers");

describe("TaoSwapAndBridgeToMain", function () {
    let taoSwapBridge, router, owner, user;
    const WTAO_ADDRESS = "0x9Dc08C6e2BF0F1eeD1E00670f80Df39145529F81";
    const USDC_ADDRESS = "0xB833E8137FEDf80de7E908dc6fea43a029142F20";
    const UNISWAP_ROUTER_ADDRESS_MAIN = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
    const SUBTENSOR_STAKING_ADDRESS = "0x0000000000000000000000000000000000000001";
    let wtao, usdc, stakingContract;

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();
        const MockWTAO = await ethers.getContractFactory("MockWTAO");
        const wtaoMock = await MockWTAO.deploy();
        const MockUsdcWithBridge = await ethers.getContractFactory("MockUsdcWithBridge");
        const usdcMock = await MockUsdcWithBridge.deploy();
        const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
        const routerMock = await MockUniswapRouter.deploy();
        const MockStaking = await ethers.getContractFactory("MockStaking");
        const stakingMock = await MockStaking.deploy();

        await setCode(WTAO_ADDRESS, await ethers.provider.getCode(wtaoMock.address));
        await setCode(USDC_ADDRESS, await ethers.provider.getCode(usdcMock.address));
        await setCode(UNISWAP_ROUTER_ADDRESS_MAIN, await ethers.provider.getCode(routerMock.address));
        await setCode(SUBTENSOR_STAKING_ADDRESS, await ethers.provider.getCode(stakingMock.address));

        wtao = await ethers.getContractAt("MockWTAO", WTAO_ADDRESS);
        usdc = await ethers.getContractAt("MockUsdcWithBridge", USDC_ADDRESS);
        router = await ethers.getContractAt("MockUniswapRouter", UNISWAP_ROUTER_ADDRESS_MAIN);
        stakingContract = await ethers.getContractAt("MockStaking", SUBTENSOR_STAKING_ADDRESS);
        
        const TaoSwapAndBridgeToMain = await ethers.getContractFactory("TaoSwapAndBridgeToMain");
        taoSwapBridge = await TaoSwapAndBridgeToMain.deploy(router.address);
    });

    it("Should unstake, swap, and bridge successfully", async function () {
        const alphaAmount = ethers.utils.parseEther("10");
        const taoFromUnstake = ethers.utils.parseEther("1");
        const usdcFromSwap = ethers.utils.parseUnits("500", 6);

        await usdc.mint(router.address, usdcFromSwap);
        await impersonateAccount(SUBTENSOR_STAKING_ADDRESS);
        const stakingSigner = await ethers.getSigner(SUBTENSOR_STAKING_ADDRESS);
        await setBalance(stakingSigner.address, ethers.utils.parseEther("100"));
        await stakingContract.setUnstakeAmount(taoFromUnstake);

        const hotkey = ethers.utils.formatBytes32String("hotkey");
        const netuid = 1;
        const destinationChainId = 42161;
        const receiver = user.address;
        
        await expect(
            taoSwapBridge.connect(user).unStakeSwapAndBridging(hotkey, netuid, alphaAmount, 0, destinationChainId, receiver, { value: ethers.utils.parseEther("0.1") })
        ).to.emit(taoSwapBridge, "SwapAndBridgeExecuted").withArgs(alphaAmount, usdcFromSwap);

        const lastBridgeTx = await usdc.lastTx();
        expect(lastBridgeTx.destinationChainId).to.equal(destinationChainId);
        expect(lastBridgeTx.receiver).to.equal(ethers.utils.hexZeroPad(receiver, 32));
        expect(lastBridgeTx.amount).to.equal(usdcFromSwap);
    });

    describe("Fee Management", function() {
        it("Should allow owner to set the fee", async function() {
            const newFee = 500; // 5%
            await expect(taoSwapBridge.connect(owner).setFee(newFee))
                .to.emit(taoSwapBridge, "FeeUpdated").withArgs(newFee);
            expect(await taoSwapBridge.fee()).to.equal(newFee);
        });

        it("Should prevent non-owner from setting the fee", async function() {
            await expect(taoSwapBridge.connect(user).setFee(500)).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should revert if fee is set too high", async function() {
            await expect(taoSwapBridge.connect(owner).setFee(10001)).to.be.revertedWithCustomError(taoSwapBridge, "INVALID_FEE_VALUE");
        });

        it("Should correctly calculate and store fees, and allow owner to withdraw them", async function() {
            const alphaAmount = ethers.utils.parseEther("10");
            const taoFromUnstake = ethers.utils.parseEther("1");
            const usdcFromSwap = ethers.utils.parseUnits("500", 6);
            const feePercent = 200; // 2%
            await taoSwapBridge.connect(owner).setFee(feePercent);

            await usdc.mint(router.address, usdcFromSwap);
            await stakingContract.setUnstakeAmount(taoFromUnstake);

            await taoSwapBridge.unStakeSwapAndBridging(
                ethers.utils.formatBytes32String("hotkey"), 1, alphaAmount, 0, 1, user.address, { value: ethers.utils.parseEther("0.1") }
            );

            const expectedFee = usdcFromSwap.mul(feePercent).div(10000);
            expect(await taoSwapBridge.feeAmount()).to.equal(expectedFee);

            // Withdraw fees
            await expect(taoSwapBridge.connect(owner).withdrawFee(expectedFee, owner.address))
                .to.changeTokenBalance(usdc, owner, expectedFee);
            expect(await taoSwapBridge.feeAmount()).to.equal(0);
        });

        it("Should prevent non-owner from withdrawing fees", async function() {
            await expect(taoSwapBridge.connect(user).withdrawFee(1, user.address)).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });
});