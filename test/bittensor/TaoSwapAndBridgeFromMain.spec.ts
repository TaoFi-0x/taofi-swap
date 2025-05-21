import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { makeSuite } from '../helpers/make-suite';
import { USDC, USDT, TAO, ETH_ADDRESS } from '../helpers/constants';
import { convertToCurrencyDecimals } from '../helpers/misc-utils';
import { mint } from '../helpers/mint';
import { findDefaultToken } from '@lifi/data-types'
import type { QuoteRequest } from '@lifi/sdk'
import { ChainId, CoinKey, getQuote } from '@lifi/sdk'
import { SimpleTx } from 'hardhat-deploy/types';

const chai = require('chai');
const { expect } = chai;

makeSuite('SwapBridgeAndCallFromMain', () => {
  it('Use LiFi Swap Directly Without Fee', async () => {

    const [depositor] = await getUnnamedAccounts();
    const [,depositorSigner] = await ethers.getSigners();
    const { rawTx } = deployments;
    const amount = await convertToCurrencyDecimals(USDC, '1000')

    const quoteRequest: QuoteRequest = {
      fromChain: ChainId.ETH, // Ethereum
      fromToken: findDefaultToken(CoinKey.USDC, ChainId.ETH).address, // USDC ETH
      fromAmount: amount.toString(), // USDC
      toChain: ChainId.ETH, // Ethereum
      toToken: findDefaultToken(CoinKey.USDT, ChainId.ETH).address, // USDT ETH
      fromAddress: depositor,
      // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
      maxPriceImpact: 0.4,
    }

    const quote = await getQuote(quoteRequest)
    console.info('>> got quote', quote)

    // prepare USDC
    const usdc = await ethers.getContractAt('ERC20', USDC);
    const usdt = await ethers.getContractAt('ERC20', USDT);
    await mint('USDC', amount, depositor);
    expect(await usdc.balanceOf(depositor)).to.be.eq(amount);
    expect(await usdt.balanceOf(depositor)).to.be.eq(0);

    // Approve
    await usdc.connect(depositorSigner).approve(quote.estimate.approvalAddress, amount);
  
    await rawTx(quote.transactionRequest as SimpleTx)
    expect(await usdc.balanceOf(depositor)).to.be.eq(0);
    expect(await usdt.balanceOf(depositor)).to.be.gt(amount.div(10).mul(9));
  });
});

// makeSuite('SwapBridgeAndCallFromMain', () => {
//   it('Use Wrapper contract to swap with fee from ETH', async () => {
//     const { deployer } = await getNamedAccounts();
//     const [depositor] = await getUnnamedAccounts();
//     const [,depositorSigner] = await ethers.getSigners();
//     const { get, execute } = deployments;
//     const amount = await ethers.utils.parseEther('10');
//     const SwapBridgeAndCallFromMainAddress = (await get('SwapBridgeAndCallFromMain')).address;
//     const fee = 200;  //2%

//     // prepare ETH
//     const usdt = await ethers.getContractAt('ERC20', USDT);
//     const prevBalance = await ethers.provider.getBalance(depositor);
//     expect(prevBalance).to.be.gte(amount);
//     expect(await usdt.balanceOf(depositor)).to.be.eq(0);

//     // set fee
//     await execute('SwapBridgeAndCallFromMain', { from: deployer }, 'setFee', fee);

//     // set tao token
//     await execute('SwapBridgeAndCallFromMain', { from: deployer }, 'setBridgeToken', TAO);

//     //without fee, it would be failed.
//     let quoteRequest: QuoteRequest = {
//       fromChain: ChainId.ETH, // Ethereum
//       fromToken: findDefaultToken(CoinKey.ETH, ChainId.ETH).address, // ETH
//       fromAmount: amount.toString(), // ETH
//       toChain: ChainId.ETH, // Ethereum
//       toToken: findDefaultToken(CoinKey.USDT, ChainId.ETH).address, // USDT ETH
//       fromAddress: depositor,
//       toAddress: SwapBridgeAndCallFromMainAddress,
//       // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
//       maxPriceImpact: 0.4,
//     }

//     let quote = await getQuote(quoteRequest)
//     console.info('>> got quote', quote)

//     // swap and bridge via lifi
//     await expect(
//       execute(
//         'SwapBridgeAndCallFromMain', 
//         { from: depositor, value: amount }, 
//         'lifiSwapBridgeAndStaking', 
//         quoteRequest.fromToken, 
//         amount, 
//         0,
//         quoteRequest.toToken, 
//         quote.estimate.approvalAddress, 
//         quote.transactionRequest?.to, 
//         quote.transactionRequest?.data
//       )
//     ).to.be.reverted;

//     //with fee, it would be success.
//     quoteRequest = {
//       fromChain: ChainId.ETH, // Ethereum
//       fromToken: findDefaultToken(CoinKey.ETH, ChainId.ETH).address, // ETH
//       fromAmount: amount.mul(10000 - fee).div(10000).toString(), // ETH
//       toChain: ChainId.ETH, // Ethereum
//       toToken: findDefaultToken(CoinKey.USDT, ChainId.ETH).address, // USDT ETH
//       fromAddress: depositor,
//       toAddress: SwapBridgeAndCallFromMainAddress,
//       // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
//       maxPriceImpact: 0.4,
//     }

//     quote = await getQuote(quoteRequest)
//     console.info('>> got quote', quote)

//     await execute(
//       'SwapBridgeAndCallFromMain', 
//       { from: depositor, value: amount }, 
//       'lifiSwapBridgeAndStaking', 
//       quoteRequest.fromToken, 
//       amount, 
//       0,
//       quoteRequest.toToken, 
//       quote.estimate.approvalAddress, 
//       quote.transactionRequest?.to, 
//       quote.transactionRequest?.data
//     );
  
//     expect(prevBalance.sub(await ethers.provider.getBalance(depositor))).to.be.gte(amount);
//     expect(await usdt.balanceOf(depositor)).to.be.gt(quote.estimate.toAmountMin);

//     // withdraw fee
//     const deployerBalance = await ethers.provider.getBalance(deployer)

//     await execute(
//       'SwapBridgeAndCallFromMain', 
//       { from: deployer }, 
//       'withdrawFee', 
//       quoteRequest.fromToken, 
//       amount.mul(fee).div(10000),
//       deployer
//     )

//     expect((await ethers.provider.getBalance(deployer)).sub(deployerBalance)).to.be.gt(amount.mul(fee).div(10000).div(100).mul(99));
//   });
// });

// makeSuite('SwapBridgeAndCallFromMain', () => {
//   it('Use Wrapper contract to swap with fee from ERC20 Token', async () => {
//     const { deployer } = await getNamedAccounts();
//     const [depositor] = await getUnnamedAccounts();
//     const [,depositorSigner] = await ethers.getSigners();
//     const { get, execute } = deployments;
//     const amount = await convertToCurrencyDecimals(USDC, '1000')
//     const SwapBridgeAndCallFromMainAddress = (await get('SwapBridgeAndCallFromMain')).address;
//     const fee = 200;  //2%

//     // prepare USDC
//     const usdc = await ethers.getContractAt('ERC20', USDC);
//     const usdt = await ethers.getContractAt('ERC20', USDT);
//     await mint('USDC', amount, depositor);
//     expect(await usdc.balanceOf(depositor)).to.be.eq(amount);
//     expect(await usdt.balanceOf(depositor)).to.be.eq(0);

//     // set fee
//     await execute('SwapBridgeAndCallFromMain', { from: deployer }, 'setFee', fee);

//     // set tao token
//     await execute('SwapBridgeAndCallFromMain', { from: deployer }, 'setBridgeToken', TAO);

//     //without fee, it would be failed.
//     let quoteRequest: QuoteRequest = {
//       fromChain: ChainId.ETH, // Ethereum
//       fromToken: findDefaultToken(CoinKey.USDC, ChainId.ETH).address, // USDC ETH
//       fromAmount: amount.toString(), // USDC
//       toChain: ChainId.ETH, // Ethereum
//       toToken: findDefaultToken(CoinKey.USDT, ChainId.ETH).address, // USDT ETH
//       fromAddress: depositor,
//       toAddress: SwapBridgeAndCallFromMainAddress,
//       // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
//       maxPriceImpact: 0.4,
//     }

//     let quote = await getQuote(quoteRequest)
//     console.info('>> got quote', quote)

//     // swap and bridge via lifi
//     await expect(
//       execute(
//         'SwapBridgeAndCallFromMain', 
//         { from: depositor }, 
//         'lifiSwapBridgeAndStaking', 
//         quoteRequest.fromToken, 
//         amount, 
//         0,
//         quoteRequest.toToken, 
//         quote.estimate.approvalAddress, 
//         quote.transactionRequest?.to, 
//         quote.transactionRequest?.data
//       )
//     ).to.be.reverted;

//     // Approve
//     await usdc.connect(depositorSigner).approve(SwapBridgeAndCallFromMainAddress, amount);

//     await expect(
//       execute(
//         'SwapBridgeAndCallFromMain', 
//         { from: depositor }, 
//         'lifiSwapBridgeAndStaking', 
//         quoteRequest.fromToken, 
//         amount, 
//         0,
//         quoteRequest.toToken, 
//         quote.estimate.approvalAddress, 
//         quote.transactionRequest?.to, 
//         quote.transactionRequest?.data
//       )
//     ).to.be.reverted;

//     //with fee, it would be success.
//     quoteRequest = {
//       fromChain: ChainId.ETH, // Ethereum
//       fromToken: findDefaultToken(CoinKey.USDC, ChainId.ETH).address, // USDC ETH
//       fromAmount: amount.mul(10000 - fee).div(10000).toString(), // USDC
//       toChain: ChainId.ETH, // Ethereum
//       toToken: findDefaultToken(CoinKey.USDT, ChainId.ETH).address, // USDT ETH
//       fromAddress: depositor,
//       toAddress: SwapBridgeAndCallFromMainAddress,
//       // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
//       maxPriceImpact: 0.4,
//     }

//     quote = await getQuote(quoteRequest)
//     console.info('>> got quote', quote)

//     await execute(
//       'SwapBridgeAndCallFromMain', 
//       { from: depositor }, 
//       'lifiSwapBridgeAndStaking', 
//       quoteRequest.fromToken, 
//       amount, 
//       0,
//       quoteRequest.toToken, 
//       quote.estimate.approvalAddress, 
//       quote.transactionRequest?.to, 
//       quote.transactionRequest?.data
//     );
  
//     expect(await usdc.balanceOf(depositor)).to.be.eq(0);
//     expect(await usdt.balanceOf(depositor)).to.be.gt(quote.estimate.toAmountMin);

//     // withdraw fee
//     expect(await usdc.balanceOf(deployer)).to.be.eq(0);

//     await execute(
//       'SwapBridgeAndCallFromMain', 
//       { from: deployer }, 
//       'withdrawFee', 
//       quoteRequest.fromToken, 
//       amount.mul(fee).div(10000),
//       deployer
//     )

//     expect(await usdc.balanceOf(deployer)).to.be.eq(amount.mul(fee).div(10000));
//   });
// });

// makeSuite('SwapBridgeAndCallFromMain', () => {
//   it('Use Wrapper contract to swap and bridge', async () => {
//     const { deployer } = await getNamedAccounts();
//     const [depositor] = await getUnnamedAccounts();
//     const [,depositorSigner] = await ethers.getSigners();
//     const { get, execute } = deployments;
//     const amount = await convertToCurrencyDecimals(USDC, '1000')
//     const SwapBridgeAndCallFromMainAddress = (await get('SwapBridgeAndCallFromMain')).address;

//     const quoteRequest: QuoteRequest = {
//       fromChain: ChainId.ETH, // Ethereum
//       fromToken: findDefaultToken(CoinKey.USDC, ChainId.ETH).address, // USDC ETH
//       fromAmount: amount.toString(), // USDC
//       toChain: ChainId.ETH, // Ethereum
//       toToken: TAO, // TAO ETH
//       fromAddress: depositor,
//       toAddress: SwapBridgeAndCallFromMainAddress,
//       // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
//       maxPriceImpact: 0.4,
//     }

//     const quote = await getQuote(quoteRequest)
//     console.info('>> got quote', quote)

//     // prepare USDC
//     const usdc = await ethers.getContractAt('ERC20', USDC);
//     const tao = await ethers.getContractAt('ERC20', TAO);
//     await mint('USDC', amount, depositor);
//     expect(await usdc.balanceOf(depositor)).to.be.eq(amount);

//     // set tao token
//     await execute('SwapBridgeAndCallFromMain', { from: deployer }, 'setTaoToken', TAO);

//     // swap and bridge via lifi
//     await expect(
//       execute(
//         'SwapBridgeAndCallFromMain', 
//         { from: depositor }, 
//         'lifiSwapBridgeAndStaking', 
//         quoteRequest.fromToken, 
//         amount, 
//         0,
//         quoteRequest.toToken, 
//         quote.estimate.approvalAddress, 
//         quote.transactionRequest?.to, 
//         quote.transactionRequest?.data
//       )
//     ).to.be.reverted;

//     // Approve
//     await usdc.connect(depositorSigner).approve(SwapBridgeAndCallFromMainAddress, amount);

//     await execute(
//       'SwapBridgeAndCallFromMain', 
//       { from: depositor }, 
//       'lifiSwapBridgeAndStaking', 
//       quoteRequest.fromToken, 
//       amount, 
//       0,
//       quoteRequest.toToken, 
//       quote.estimate.approvalAddress, 
//       quote.transactionRequest?.to, 
//       quote.transactionRequest?.data
//     );
  
//     expect(await usdc.balanceOf(depositor)).to.be.eq(0);
//     expect(await tao.balanceOf(depositor)).to.be.eq(0);
//   });
// });