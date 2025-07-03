const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SwapAndStake", function () {
    let swapAndStake, usdc, wtao, router, stakingManager, bridge, alphaToken;
    let owner, user, otherUser;
    const hotkey = ethers.utils.formatBytes32String("hotkey");
    const netuid = 1;

    beforeEach(async function () {
        [owner, user, otherUser] = await ethers.getSigners();

        // Deploy Mock Contracts from `contracts/mocks/`
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        wtao = await (await ethers.getContractFactory("MockWTAO")).deploy();
        alphaToken = await MockERC20.deploy("AlphaToken", "ALPHA", 18);

        const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
        router = await MockUniswapRouter.deploy();

        const MockStakingManager = await ethers.getContractFactory("MockStakingManager");
        stakingManager = await MockStakingManager.deploy();
        
        const MockBridge = await ethers.getContractFactory("MockBridge");
        bridge = await MockBridge.deploy(usdc.address);

        // Deploy SwapAndStake with mock addresses
        const SwapAndStake = await ethers.getContractFactory("SwapAndStake");
        swapAndStake = await SwapAndStake.deploy(
            usdc.address,
            wtao.address,
            router.address,
            ethers.constants.AddressZero, // stakingPrecompile (not directly used)
            bridge.address,
            stakingManager.address
        );

        // Fund user and set up initial mock conditions
        await usdc.mint(user.address, ethers.utils.parseUnits("1000", 6));
    });

    describe("swapAndStake", function () {
        it("Should swap USDC for TAO and stake it successfully", async function () {
            const swapAmountIn = ethers.utils.parseUnits("100", 6);
            const expectedTaoOut = ethers.utils.parseEther("5");

            await wtao.mint(router.address, expectedTaoOut);
            await usdc.connect(user).approve(swapAndStake.address, swapAmountIn);

            const swapParams = {
                tokenIn: usdc.address,
                tokenOut: wtao.address,
                fee: 3000,
                recipient: swapAndStake.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: swapAmountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            const stakeParams = { hotkey, netuid, minAlphaToReceive: 0 };
            
            await expect(swapAndStake.connect(user).swapAndStake(swapParams, stakeParams))
                .to.emit(swapAndStake, "Stake")
                .withArgs(user.address, hotkey, netuid, expectedTaoOut)
                .and.to.changeEtherBalance(stakingManager, expectedTaoOut);
            
            expect(await usdc.balanceOf(user.address)).to.equal(ethers.utils.parseUnits("900", 6));
            expect(await ethers.provider.getBalance(swapAndStake.address)).to.equal(0);
        });

        it("Should fail if tokenIn is not USDC", async function () {
            const swapParams = {
                tokenIn: wtao.address,
                tokenOut: usdc.address,
                fee: 3000,
                recipient: swapAndStake.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: 100,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            const stakeParams = { hotkey, netuid, minAlphaToReceive: 0 };

            await expect(
                swapAndStake.connect(user).swapAndStake(swapParams, stakeParams)
            ).to.be.revertedWith("Invalid tokenIn: must be USDC");
        });

        it("Should swap the user's entire USDC balance and stake it", async function () {
            const initialUserBalance = await usdc.balanceOf(user.address);
            const expectedTaoOut = ethers.utils.parseEther("50");

            await wtao.mint(router.address, expectedTaoOut);
            await usdc.connect(user).approve(swapAndStake.address, initialUserBalance);

            const swapParams = {
                tokenIn: usdc.address,
                tokenOut: wtao.address,
                fee: 3000,
                recipient: swapAndStake.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: 0, // This is ignored and recalculated by the contract
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            const stakeParams = { hotkey, netuid, minAlphaToReceive: 0 };

            await expect(swapAndStake.connect(user).swapAndStakeWithTransfer(swapParams, stakeParams))
                .to.emit(swapAndStake, "Stake")
                .withArgs(user.address, hotkey, netuid, expectedTaoOut);

            expect(await usdc.balanceOf(user.address)).to.equal(0);
        });
    });

    describe("unstakeSwapAndBridge", function () {
        it("Should unstake, swap TAO for USDC, and bridge successfully", async function () {
            const unstakeAmount = ethers.utils.parseEther("100");
            const taoFromUnstake = ethers.utils.parseEther("10");
            const usdcFromSwap = ethers.utils.parseUnits("5000", 6);

            await alphaToken.mint(user.address, unstakeAmount);
            await alphaToken.connect(user).approve(swapAndStake.address, unstakeAmount);
            await stakingManager.setAlphaToken(netuid, alphaToken.address);
            await stakingManager.setUnstakeAmount(taoFromUnstake);
            await usdc.mint(router.address, usdcFromSwap);

            const unstakeParams = { hotkey, netuid, amount: unstakeAmount, minTaoToReceive: 0 };
            const swapParams = {
                tokenIn: wtao.address,
                tokenOut: usdc.address,
                fee: 3000,
                recipient: swapAndStake.address,
                deadline: Math.floor(Date.now() / 1000) + 60,
                amountIn: taoFromUnstake,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0,
            };
            const bridgeParams = {
                destinationChainId: 1,
                receiver: ethers.utils.formatBytes32String("receiver_on_other_chain"),
            };

            await swapAndStake.connect(user).unstakeSwapAndBridge(unstakeParams, swapParams, bridgeParams, { value: ethers.utils.parseEther("0.1") });
            
            expect(await alphaToken.balanceOf(user.address)).to.equal(0);
            expect(await usdc.balanceOf(bridge.address)).to.equal(usdcFromSwap); 
            const lastBridgeTx = await bridge.lastTx();
            expect(lastBridgeTx.amount).to.equal(usdcFromSwap);
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to set the pubkey", async function () {
            const newPubKey = ethers.utils.formatBytes32String("new-pubkey");
            await expect(swapAndStake.connect(owner).setPubKey(newPubKey))
                .to.not.be.reverted;
            expect(await swapAndStake.pubkey()).to.equal(newPubKey);
        });

        it("Should prevent non-owner from setting the pubkey", async function () {
            const newPubKey = ethers.utils.formatBytes32String("new-pubkey");
            await expect(swapAndStake.connect(user).setPubKey(newPubKey))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should allow owner to withdraw ETH from the contract", async function () {
            const amountToSend = ethers.utils.parseEther("2.0");
            await owner.sendTransaction({ to: swapAndStake.address, value: amountToSend });
            
            expect(await ethers.provider.getBalance(swapAndStake.address)).to.equal(amountToSend);

            await expect(swapAndStake.connect(owner).getEth())
                .to.changeEtherBalance(owner, amountToSend);
            
            expect(await ethers.provider.getBalance(swapAndStake.address)).to.equal(0);
        });

        it("Should prevent non-owner from withdrawing ETH", async function () {
            await expect(swapAndStake.connect(user).getEth())
                .to.be.revertedWith("Ownable: caller is not the owner");
        });
    });
});