import BigNumber from 'bignumber.js';
import HRE, { ethers } from 'hardhat';
import { ContractTransaction } from 'ethers';

export const impersonateAccountsHardhat = async (accounts: string[]) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const account of accounts) {
    // eslint-disable-next-line no-await-in-loop
    await HRE.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [account],
    });
  }
};

export const waitForTx = async (tx: ContractTransaction) => await tx.wait(1)

export const convertToCurrencyDecimals = async (tokenAddress, amount) => {
  const token = await ethers.getContractAt('ERC20', tokenAddress);
  let decimals = (await token.decimals()).toString();
  return ethers.utils.parseUnits(new BigNumber(amount).toFixed(Number(decimals)), decimals);
};