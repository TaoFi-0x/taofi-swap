import { deployments, ethers, getNamedAccounts } from 'hardhat';
import axios from "axios";
import { SimpleTx } from 'hardhat-deploy/types';
import { impersonateAccountsHardhat } from '../helpers/misc-utils';
import { parseEther } from 'ethers/lib/utils';

const callURL = "https://taofi-api.web.app/getBuyCall";
const quoteURL = "https://taofi-api.web.app/getBuyQuote";
const reverseCallURL = "https://taofi-api.web.app/getSellCall";
const reverseQuoteURL = "https://taofi-api.web.app/getSellQuote";
const refundCallURL = "https://taofi-api.web.app/getRefundCall";

describe('SwapAndBridgeAndCall', () => {
  it('Swap, Bridge, Stake', async () => {
    const { deployer } = await getNamedAccounts();
    const { rawTx } = deployments;
    const fromTokenAddress = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";  //USDT (base)
    const fromDecimals = 6; // USDT decimals
    const fromAmount = "1000000"  // 1 USDT

    let response = await axios.post(
      quoteURL, 
      {
        subnetuid: 10,
        fromTokenInfo: {
          address: fromTokenAddress,
          decimals:fromDecimals,
          amount: fromAmount 
        }
      }
    );
    console.log("Response data:", response.data);

    response = await axios.post(
      callURL, 
      {
        sender: deployer,
        subnetInfo: {
          netuid: 10,
          hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
        },
        fromTokenInfo: {
          address: fromTokenAddress,
          decimals: fromDecimals,
          amount: fromAmount
        },
        expectedAlphaAmount: response.data.expectedAlphaAmount,
        slippage: 90,  // 0.09%
      }
    );
    console.log("Response data:", response.data);

    const fromToken = await ethers.getContractAt('ERC20', fromTokenAddress);

    if ((await fromToken.allowance(deployer, response.data.to)).lt(fromAmount)) {
      await fromToken.approve(response.data.to, fromAmount);
    }

    await rawTx({
      value: '2200000000000000',  //0.0022ETH
      to: response.data.to,
      data: response.data.data,
      from: deployer
    } as SimpleTx)
  });
});

describe('SwapAndBridgeAndCall', () => {
  it('Unstake, Bridge', async () => {
    const { deployer } = await getNamedAccounts();
    const { rawTx } = deployments;

    let response = await axios.post(
      reverseQuoteURL, 
      {
        subnetuid: 10, 
        fromAmount: "100000000", // 0.1 SN10
      }
    );
    console.log("Response data:", response.data);


    response = await axios.post(
      reverseCallURL, 
      {
        receiver: deployer,
        subnetInfo: {
          netuid: 10,
          hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
        },
        fromAmount: "100000000", // 0.1 SN10
        expectedToAmount: response.data.expectedToAmount,
        slippage: 90,  // 0.09%
      }
    );
    console.log("Response data:", response.data);


    await rawTx({
      value: '1900000000000000',  //0.0019ETH
      to: response.data.to,
      data: response.data.data,
      from: deployer
    } as SimpleTx)
  });
});

describe('SwapAndBridgeAndCall', () => {
  it('Refund', async () => {
    const { deployer } = await getNamedAccounts();
    const { rawTx } = deployments;

    const postData = {
      receiver: deployer,
      amount: "1000649" // 1.000649 USDC
    };

    const response = await axios.post(refundCallURL, postData);
    console.log("Response data:", response.data);

    await rawTx({
      value: '1900000000000000',  //0.0019ETH
      to: response.data.to,
      data: response.data.data,
      from: deployer
    } as SimpleTx)


    // await impersonateAccountsHardhat(["0xF767D698c510FE5E53b46BA6Fd1174F5271e390A"]);
    // const signer = await ethers.getSigner("0xF767D698c510FE5E53b46BA6Fd1174F5271e390A");
    // const tx = await signer.sendTransaction({
    //   to: "0x745F399194094562d00C5eE971Cd1ef5Eb82616D",
    //   data: "0x56d5d4750000000000000000000000000000000000000000000000000000000000002105000000000000000000000000ccb08a1a8984c210b97e81fc51c1a5f85939b51100000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000421000000000000000000000000002add3ef96cdafbc423d49cab15bb50f55956545e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000002532c3d363306fa6d625e4cbad996bcf534e81540000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000120000000000000000000000000d5850afbbf6b9a8b9422e93e2e4fabb55377d20d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000055085cE80fac7CA9B641Be287A77C60b7d33C480000000000000000000000000000000000000000000000000000000005f5e10000000000000000000000000000000000000000000000000000000000000000000000000000000000055085cE80fac7CA9B641Be287A77C60b7d33C480000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001c48f1d4fc57e58acb69a0d56dbca120b30f1b743f3f68920cbd97acef18fa085897d384f73000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000005f5e10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009dc08c6e2bf0f1eed1e00670f80df39145529f81000000000000000000000000b833e8137fedf80de7e908dc6fea43a029142f200000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000055085cE80fac7CA9B641Be287A77C60b7d33C4800000000000000000000000000000000000000000000000000000000685d031b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008fd80000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000021050000000000000000000000002532c3d363306fa6d625e4cbad996bcf534e81540000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    //   value: '0'
    // });
  });
});