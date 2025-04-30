import { deployments, ethers, getNamedAccounts, getUnnamedAccounts } from 'hardhat';
import { makeSuite } from '../helpers/make-suite';
import { USDC, USDT, TAO } from '../helpers/constants';
import { convertToCurrencyDecimals } from '../helpers/misc-utils';
import { mint } from '../helpers/mint';
import { findDefaultToken } from '@lifi/data-types'
import type { QuoteRequest } from '@lifi/sdk'
import { ChainId, CoinKey, getQuote } from '@lifi/sdk'
import { SimpleTx } from 'hardhat-deploy/types';

const chai = require('chai');
const { expect } = chai;

makeSuite('TaoSwapAndBridge', () => {
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

makeSuite('TaoSwapAndBridge', () => {
  it('Use Wrapper contract to swap wiht fee', async () => {
    const { deployer } = await getNamedAccounts();
    const [depositor] = await getUnnamedAccounts();
    const [,depositorSigner] = await ethers.getSigners();
    const { get, execute } = deployments;
    const amount = await convertToCurrencyDecimals(USDC, '1000')
    const taoSwapAndBridgeAddress = (await get('TaoSwapAndBridge')).address;
    const fee = 200;  //2%

    // prepare USDC
    const usdc = await ethers.getContractAt('ERC20', USDC);
    const usdt = await ethers.getContractAt('ERC20', USDT);
    await mint('USDC', amount, depositor);
    expect(await usdc.balanceOf(depositor)).to.be.eq(amount);
    expect(await usdt.balanceOf(depositor)).to.be.eq(0);

    // set fee
    await execute('TaoSwapAndBridge', { from: deployer }, 'setFee', fee);

    // set tao token
    await execute('TaoSwapAndBridge', { from: deployer }, 'setTaoToken', TAO);

    //without fee, it would be failed.
    let quoteRequest: QuoteRequest = {
      fromChain: ChainId.ETH, // Ethereum
      fromToken: findDefaultToken(CoinKey.USDC, ChainId.ETH).address, // USDC ETH
      fromAmount: amount.toString(), // USDC
      toChain: ChainId.ETH, // Ethereum
      toToken: findDefaultToken(CoinKey.USDT, ChainId.ETH).address, // USDT ETH
      fromAddress: depositor,
      toAddress: taoSwapAndBridgeAddress,
      // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
      maxPriceImpact: 0.4,
    }

    let quote = await getQuote(quoteRequest)
    console.info('>> got quote', quote)

    // swap and bridge via lifi
    await expect(
      execute(
        'TaoSwapAndBridge', 
        { from: depositor }, 
        'lifiSwapAndBridge', 
        quoteRequest.fromToken, 
        amount, 
        quoteRequest.toToken, 
        quote.estimate.approvalAddress, 
        quote.transactionRequest?.to, 
        quote.transactionRequest?.data
      )
    ).to.be.reverted;

    // Approve
    await usdc.connect(depositorSigner).approve(taoSwapAndBridgeAddress, amount);

    await expect(
      execute(
        'TaoSwapAndBridge', 
        { from: depositor }, 
        'lifiSwapAndBridge', 
        quoteRequest.fromToken, 
        amount, 
        quoteRequest.toToken, 
        quote.estimate.approvalAddress, 
        quote.transactionRequest?.to, 
        quote.transactionRequest?.data
      )
    ).to.be.reverted;

    //with fee, it would be success.
    quoteRequest = {
      fromChain: ChainId.ETH, // Ethereum
      fromToken: findDefaultToken(CoinKey.USDC, ChainId.ETH).address, // USDC ETH
      fromAmount: amount.mul(10000 - fee).div(10000).toString(), // USDC
      toChain: ChainId.ETH, // Ethereum
      toToken: findDefaultToken(CoinKey.USDT, ChainId.ETH).address, // USDT ETH
      fromAddress: depositor,
      toAddress: taoSwapAndBridgeAddress,
      // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
      maxPriceImpact: 0.4,
    }

    quote = await getQuote(quoteRequest)
    console.info('>> got quote', quote)

    await execute(
      'TaoSwapAndBridge', 
      { from: depositor }, 
      'lifiSwapAndBridge', 
      quoteRequest.fromToken, 
      amount, 
      quoteRequest.toToken, 
      quote.estimate.approvalAddress, 
      quote.transactionRequest?.to, 
      quote.transactionRequest?.data
    );
  
    expect(await usdc.balanceOf(depositor)).to.be.eq(0);
    expect(await usdt.balanceOf(depositor)).to.be.gt(amount.div(10).mul(9));
  });
});

makeSuite('TaoSwapAndBridge', () => {
  it('Use Wrapper contract to swap and bridge', async () => {
    // const { deployer } = await getNamedAccounts();
    // const [depositor] = await getUnnamedAccounts();
    // const [,depositorSigner] = await ethers.getSigners();
    // const { get, execute } = deployments;
    // const amount = await convertToCurrencyDecimals(USDC, '1000')
    // const taoSwapAndBridgeAddress = (await get('TaoSwapAndBridge')).address;

    // const quoteRequest: QuoteRequest = {
    //   fromChain: ChainId.ETH, // Ethereum
    //   fromToken: findDefaultToken(CoinKey.USDC, ChainId.ETH).address, // USDC ETH
    //   fromAmount: amount.toString(), // USDC
    //   toChain: ChainId.ETH, // Ethereum
    //   toToken: TAO, // TAO ETH
    //   fromAddress: depositor,
    //   toAddress: taoSwapAndBridgeAddress,
    //   // allowBridges: ['hop', 'stargate', 'across', 'amarok'],
    //   maxPriceImpact: 0.4,
    // }

    // const quote = await getQuote(quoteRequest)
    // console.info('>> got quote', quote)

    // // prepare USDC
    // const usdc = await ethers.getContractAt('ERC20', USDC);
    // const tao = await ethers.getContractAt('ERC20', TAO);
    // await mint('USDC', amount, depositor);
    // expect(await usdc.balanceOf(depositor)).to.be.eq(amount);

    // // set tao token
    // await execute('TaoSwapAndBridge', { from: deployer }, 'setTaoToken', TAO);

    // // swap and bridge via lifi
    // await expect(
    //   execute(
    //     'TaoSwapAndBridge', 
    //     { from: depositor }, 
    //     'lifiSwapAndBridge', 
    //     quoteRequest.fromToken, 
    //     amount, 
    //     quoteRequest.toToken, 
    //     quote.estimate.approvalAddress, 
    //     quote.transactionRequest?.to, 
    //     quote.transactionRequest?.data
    //   )
    // ).to.be.reverted;

    // // Approve
    // await usdc.connect(depositorSigner).approve(taoSwapAndBridgeAddress, amount);

    // await execute(
    //   'TaoSwapAndBridge', 
    //   { from: depositor }, 
    //   'lifiSwapAndBridge', 
    //   quoteRequest.fromToken, 
    //   amount, 
    //   quoteRequest.toToken, 
    //   quote.estimate.approvalAddress, 
    //   quote.transactionRequest?.to, 
    //   quote.transactionRequest?.data
    // );
  
    // expect(await usdc.balanceOf(depositor)).to.be.eq(0);
    // expect(await tao.balanceOf(depositor)).to.be.eq(0);
  });
});