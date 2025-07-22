import { deployments, ethers, getNamedAccounts } from 'hardhat';
import axios from "axios";
import { SimpleTx } from 'hardhat-deploy/types';
import { impersonateAccountsHardhat } from '../helpers/misc-utils';
import { parseEther } from 'ethers/lib/utils';

const callURL = "https://taofi-api.web.app/getBuyCall";
const call2URL = "https://taofi-api.web.app/getBuyCall2";
const quoteURL = "https://taofi-api.web.app/getBuyQuote";
const reverseCallURL = "https://taofi-api.web.app/getSellCall";
const reverseCall2URL = "https://taofi-api.web.app/getSellCall2";
const reverseQuoteURL = "https://taofi-api.web.app/getSellQuote";
const refundCallURL = "https://taofi-api.web.app/getRefundCall";
const refundCall2URL = "https://taofi-api.web.app/getRefundCall2";

// describe('SwapAndBridgeAndCall', () => {
//   it('Swap, Bridge, Stake', async () => {
//     const { deployer } = await getNamedAccounts();
//     const { rawTx } = deployments;
//     const fromTokenAddress = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";  //USDT (base)
//     const fromDecimals = 6; // USDT decimals
//     const fromAmount = "1000000"  // 1 USDT

//     let response = await axios.post(
//       quoteURL, 
//       {
//         subnetuid: 10,
//         fromTokenInfo: {
//           address: fromTokenAddress,
//           decimals:fromDecimals,
//           amount: fromAmount 
//         }
//       }
//     );
//     console.log("Response data:", response.data);

//     response = await axios.post(
//       callURL, 
//       {
//         sender: deployer,
//         subnetInfo: {
//           netuid: 10,
//           hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
//         },
//         fromTokenInfo: {
//           address: fromTokenAddress,
//           decimals: fromDecimals,
//           amount: fromAmount
//         },
//         expectedAlphaAmount: response.data.expectedAlphaAmount,
//         slippage: 90,  // 0.9%
//       }
//     );
//     console.log("Response data:", response.data);

//     const fromToken = await ethers.getContractAt('ERC20', fromTokenAddress);

//     if ((await fromToken.allowance(deployer, response.data.to)).lt(fromAmount)) {
//       await fromToken.approve(response.data.to, fromAmount);
//     }

//     await rawTx({
//       value: response.data.hyperlaneFee,
//       to: response.data.to,
//       data: response.data.data,
//       from: deployer
//     } as SimpleTx)
//   });
// });

// describe('SwapAndBridgeAndCall', () => {
//   it('Swap, Bridge, Stake - 2', async () => {
//     const { deployer } = await getNamedAccounts();
//     const { rawTx } = deployments;
//     const fromTokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";  //USDC (base)
//     const fromDecimals = 6; // USDC decimals
//     const fromAmount = "1000000"  // 1 USDC

//     let response = await axios.post(
//       quoteURL, 
//       {
//         subnetuid: 10,
//         fromTokenInfo: {
//           address: fromTokenAddress,
//           decimals:fromDecimals,
//           amount: fromAmount 
//         }
//       }
//     );
//     console.log("Response data:", response.data);

//     response = await axios.post(
//       call2URL, 
//       {
//         sender: deployer,
//         subnetInfo: {
//           netuid: 10,
//           hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
//         },
//         fromTokenInfo: {
//           address: fromTokenAddress,
//           decimals: fromDecimals,
//           amount: fromAmount
//         },
//         expectedAlphaAmount: response.data.expectedAlphaAmount,
//         slippage: 90,  // 0.9%
//         referralId: deployer
//       }
//     );
//     console.log("Response data:", response.data);

//     const fromToken = await ethers.getContractAt('ERC20', fromTokenAddress);

//     if ((await fromToken.allowance(deployer, response.data.to)).lt(fromAmount)) {
//       await fromToken.approve(response.data.to, fromAmount);
//     }

//     await rawTx({
//       value: response.data.hyperlaneFee,
//       to: response.data.to,
//       data: response.data.data,
//       from: deployer
//     } as SimpleTx)
//   });
// });

// describe('SwapAndBridgeAndCall', () => {
//   it('Unstake, Bridge', async () => {
//     const { deployer } = await getNamedAccounts();
//     const { rawTx } = deployments;

//     let response = await axios.post(
//       reverseQuoteURL, 
//       {
//         subnetuid: 10, 
//         fromAmount: "200000000", // 0.2 SN10
//       }
//     );
//     console.log("Response data:", response.data);


//     response = await axios.post(
//       reverseCallURL, 
//       {
//         receiver: deployer,
//         subnetInfo: {
//           netuid: 10,
//           hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
//         },
//         fromAmount: "200000000", // 0.2 SN10
//         expectedToAmount: response.data.expectedToAmount,
//         slippage: 90,  // 0.9%
//       }
//     );
//     console.log("Response data:", response.data);


//     await rawTx({
//       value: response.data.hyperlaneFee,
//       to: response.data.to,
//       data: response.data.data,
//       from: deployer
//     } as SimpleTx)
//   });
// });

// describe('SwapAndBridgeAndCall', () => {
//   it('Unstake, Bridge - 2', async () => {
//     const { deployer } = await getNamedAccounts();
//     const { rawTx } = deployments;

//     let response = await axios.post(
//       reverseQuoteURL, 
//       {
//         subnetuid: 10, 
//         fromAmount: "200000000", // 0.2 SN10
//       }
//     );
//     console.log("Response data:", response.data);


//     response = await axios.post(
//       reverseCall2URL, 
//       {
//         receiver: deployer,
//         subnetInfo: {
//           netuid: 10,
//           hotkey: "0xacf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339"
//         },
//         fromAmount: "200000000", // 0.2 SN10
//         expectedToAmount: response.data.expectedToAmount,
//         slippage: 1000,  // 10%
//         referralId: deployer
//       }
//     );
//     console.log("Response data:", response.data);


//     await rawTx({
//       value: response.data.hyperlaneFee,
//       to: response.data.to,
//       data: response.data.data,
//       from: deployer
//     } as SimpleTx)
//   });
// });

// describe('SwapAndBridgeAndCall', () => {
//   it('Refund', async () => {
//     const { deployer } = await getNamedAccounts();
//     const { rawTx } = deployments;

//     const postData = {
//       receiver: deployer,
//       amount: "1000649" // 1.000649 USDC
//     };

//     const response = await axios.post(refundCallURL, postData);
//     console.log("Response data:", response.data);

//     await rawTx({
//       value: response.data.hyperlaneFee,
//       to: response.data.to,
//       data: response.data.data,
//       from: deployer
//     } as SimpleTx)
// });

// describe('SwapAndBridgeAndCall', () => {
//   it('Refund2', async () => {
//     const { deployer } = await getNamedAccounts();
//     const { rawTx } = deployments;

//     const postData = {
//       receiver: deployer,
//       amount: "2000000" // 2 USDC
//     };

//     const response = await axios.post(refundCall2URL, postData);
//     console.log("Response data:", response.data);

//     await rawTx({
//       value: response.data.hyperlaneFee,
//       to: response.data.to,
//       data: response.data.data,
//       from: deployer
//     } as SimpleTx)


//     // await impersonateAccountsHardhat(["0xF767D698c510FE5E53b46BA6Fd1174F5271e390A"]);
//     // const signer = await ethers.getSigner("0xF767D698c510FE5E53b46BA6Fd1174F5271e390A");
//     // const tx = await signer.sendTransaction({
//     //   to: "0x745F399194094562d00C5eE971Cd1ef5Eb82616D",
//     //   data: "0x56d5d4750000000000000000000000000000000000000000000000000000000000002105000000000000000000000000ccb08a1a8984c210b97e81fc51c1a5f85939b51100000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000401000000000000000000000000002add3ef96cdafbc423d49cab15bb50f55956545e00000000000000000000000000000000000000000000000000000000000000000000000000000000000000002532c3d363306fa6d625e4cbad996bcf534e81540000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000120000000000000000000000000b833e8137fedf80de7e908dc6fea43a029142f20000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000044095ea7b3000000000000000000000000055085ce80fac7ca9b641be287a77c60b7d33c48ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000055085ce80fac7ca9b641be287a77c60b7d33c480000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001a412de5863000000000000000000000000b833e8137fedf80de7e908dc6fea43a029142f200000000000000000000000009dc08c6e2bf0f1eed1e00670f80df39145529f810000000000000000000000000000000000000000000000000000000000000bb8000000000000000000000000055085ce80fac7ca9b641be287a77c60b7d33c480000000000000000000000000000000000000000000000000000000068789532000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000acf34e305f1474e4817a66352af736fe6b0bcf5cdfeef18c441e24645c742339000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000b5dcf9a0000000000000000000000002532c3d363306fa6d625e4cbad996bcf534e815400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
//     //   value: '0'
//     // });
//   });
// });