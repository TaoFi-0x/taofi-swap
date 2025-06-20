import { deployments, ethers, getNamedAccounts } from 'hardhat';
import axios from "axios";
import { SimpleTx } from 'hardhat-deploy/types';

const callURL = "https://sturdy-api.web.app/getLiFiSwapBridgeCall";
const reverseCallURL = "https://sturdy-api.web.app/getLiFiSwapBridgeReverseCall";

describe('SwapAndBridgeAndCall', () => {
  it('Swap, Bridge, Stake', async () => {
    const { deployer } = await getNamedAccounts();
    const { rawTx } = deployments;

    const postData = {
      sender: deployer,
      subnetInfo: {
        netuid: 10,
        hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
      },
      fromTokenInfo: {
        address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", //USDT (base)
        decimals: 6,  // USDT decimals
        amount: "1000000", // 1 USDT
      },
      expectedAlphaPrice: "18049631",
      slippage: 200,  // 2%
    };

    const response = await axios.post(callURL, postData);
    console.log("Response data:", response.data);

    const fromToken = await ethers.getContractAt('ERC20', postData.fromTokenInfo.address);

    if ((await fromToken.allowance(deployer, response.data.to)).lt(postData.fromTokenInfo.amount)) {
      await fromToken.approve(response.data.to, postData.fromTokenInfo.amount);
    }

    await rawTx({
      value: '2000000000000000',  //0.002ETH
      to: response.data.to,
      data: response.data.data,
      from: deployer
    } as SimpleTx)
  });
});

// describe('SwapAndBridgeAndCall', () => {
//   it('Unstake, Bridge', async () => {
//     const { deployer } = await getNamedAccounts();
//     const { rawTx } = deployments;

//     const postData = {
//       receiver: deployer,
//       subnetInfo: {
//         netuid: 10,
//         hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
//       },
//       fromAmount: "100000000", // 0.1 SN10
//       expectedAlphaPrice: "18049631",
//       slippage: 200,  // 2%
//     };

//     const response = await axios.post(reverseCallURL, postData);
//     console.log("Response data:", response.data);

//     await rawTx({
//       value: '2000000000000000',  //0.002ETH
//       to: response.data.to,
//       data: response.data.data,
//       from: deployer
//     } as SimpleTx)
//   });
// });