const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { upgrades } = require("hardhat");

describe("SwapBridgeAndCallFromMain", function () {
    async function deployFixture() {
        const [owner, user] = await ethers.getSigners();
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const bridgeToken = await MockERC20.deploy("BridgeToken", "BT", 6);
        const fromToken = await MockERC20.deploy("FromToken", "FT", 18);
        const MockBridge = await ethers.getContractFactory("MockBridge");
        const bridge = await MockBridge.deploy(bridgeToken.address);
        const MockICA = await ethers.getContractFactory("MockInterchainAccountRouter");
        const interchainAccountRouter = await MockICA.deploy();
        const SwapBridgeAndCallFromMain = await ethers.getContractFactory("SwapBridgeAndCallFromMain");
        const swapBridgeCall = await upgrades.deployProxy(SwapBridgeAndCallFromMain, [], { initializer: 'initialize', kind: 'uups' });
        
        await swapBridgeCall.setBridgeToken(bridgeToken.address);
        await swapBridgeCall.setBridge(bridge.address);
        await swapBridgeCall.setInterchainAccountRouter(interchainAccountRouter.address);
        await swapBridgeCall.setFee(100);
        await fromToken.mint(user.address, ethers.utils.parseEther("1000"));
        return { swapBridgeCall, owner, user, bridgeToken, fromToken, bridge, interchainAccountRouter };
    }

    it("Should handle a bridge-and-call without a swap (fromToken == bridgeToken)", async function () {
        const { swapBridgeCall, user, bridgeToken, bridge, interchainAccountRouter } = await loadFixture(deployFixture);
        const amount = ethers.utils.parseUnits("100", 6);
        await bridgeToken.mint(user.address, amount);
        await bridgeToken.connect(user).approve(swapBridgeCall.address, amount);
        const remoteCallsParams = {
            router: ethers.utils.formatBytes32String(""),
            ism: ethers.utils.formatBytes32String(""),
            calls: [{ to: user.address, value: 0, data: "0x" }],
            hookMetadata: "0x",
        };
        const remoteIcaAddress = "0x1111111111111111111111111111111111111111";
        await interchainAccountRouter.setRemoteAccount(remoteIcaAddress);
        const bridgeFee = ethers.utils.parseEther("0.01");

        await expect(swapBridgeCall.connect(user).lifiSwapBridgeAndCall(bridgeToken.address, amount, ethers.constants.AddressZero, ethers.constants.AddressZero, "0x", remoteCallsParams, { value: bridgeFee })).to.not.be.reverted;

        const fee = await swapBridgeCall.fee();
        const expectedBridgeAmount = amount.mul(10000 - fee).div(10000);
        const lastBridgeTx = await bridge.lastTx();
        expect(lastBridgeTx.receiver).to.equal(ethers.utils.hexZeroPad(remoteIcaAddress, 32));
        expect(lastBridgeTx.amount).to.equal(expectedBridgeAmount);
        const feeAmount = amount.sub(expectedBridgeAmount);
        expect(await swapBridgeCall.feeAmount()).to.equal(feeAmount);
    });

    it("Should handle a LiFi swap, bridge, and call", async function() {
        const { swapBridgeCall, user, fromToken, bridgeToken, bridge, interchainAccountRouter } = await loadFixture(deployFixture);

        // This test requires mocking the external call to LiFi. We'll create a mock LiFi contract.
        const MockLiFi = await ethers.getContractFactory("MockLiFi");
        const lifi = await MockLiFi.deploy(fromToken.address, bridgeToken.address);
        
        // The contract has a hardcoded LiFi target address, so we need to inject our mock's code there.
        const LIFI_TARGET_ADDRESS = "0xc0b8d3f2b1c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8";
        await setCode(LIFI_TARGET_ADDRESS, await ethers.provider.getCode(lifi.address));

        const fromAmount = ethers.utils.parseEther("100");
        const expectedBridgeAmountAfterSwap = ethers.utils.parseUnits("95", 6); // LiFi mock will give us 95 bridge tokens
        await fromToken.connect(user).approve(swapBridgeCall.address, fromAmount);
        await bridgeToken.mint(LIFI_TARGET_ADDRESS, expectedBridgeAmountAfterSwap); // Fund the mock LiFi with output tokens

        // Prepare LiFi call data
        const lifiCalldata = lifi.interface.encodeFunctionData("swap", [fromAmount]);

        const remoteCallsParams = {
            router: ethers.utils.formatBytes32String(""),
            ism: ethers.utils.formatBytes32String(""),
            calls: [],
            hookMetadata: "0x",
        };
        const remoteIcaAddress = "0x1111111111111111111111111111111111111111";
        await interchainAccountRouter.setRemoteAccount(remoteIcaAddress);

        await expect(swapBridgeCall.connect(user).lifiSwapBridgeAndCall(
            fromToken.address,
            fromAmount,
            LIFI_TARGET_ADDRESS, // approvalAddress
            LIFI_TARGET_ADDRESS, // target
            lifiCalldata,
            remoteCallsParams,
            { value: ethers.utils.parseEther("0.1") }
        )).to.emit(swapBridgeCall, "SwapAndBridgeExecuted");

        // Check that the bridge received the correct amount after the swap and fees
        const fee = await swapBridgeCall.fee();
        const expectedBridgeAmount = expectedBridgeAmountAfterSwap.mul(10000 - fee).div(10000);
        const lastBridgeTx = await bridge.lastTx();
        expect(lastBridgeTx.amount).to.equal(expectedBridgeAmount);
    });

    it("Should be upgradeable", async function() {
        const { swapBridgeCall } = await loadFixture(deployFixture);
        const V2_Contract = await ethers.getContractFactory("SwapBridgeAndCallFromMainV2"); // A new version of the contract
        
        const upgraded = await upgrades.upgradeProxy(swapBridgeCall.address, V2_Contract);
        expect(upgraded.address).to.equal(swapBridgeCall.address);
        
        // Check if a new function from V2 exists
        expect(await upgraded.version()).to.equal("V2");
    });
});