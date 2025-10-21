import { ethers } from 'hardhat';
import { APXETH, BIT_USDC, BIT_WTAO, CRV, CRVUSD0USD0PP, DAI, EBTC, EETHPendlePT, FDAI, FRAX, FUSDC, FUSDT, FXUSD, GHO, LINEA_EZETH, LINEA_USDC, LINEA_USDT, LINEA_WETH, MODE_EZETH, MODE_MODE, MODE_STONE, MODE_USDC, MODE_USDT, MODE_WEETH, MODE_WETH, MODE_WRSETH, OP_EZETH, OP_WETH, PXETH, RSETH, RSETHPendlePT, RSWETH, RSWETHPendlePT, SEI_ISEI, SEI_STONE, SEI_USDC, SEI_WETH, SEI_WSEI, SFRAX, STETH, STRDY, STTAO, SWBTC, SWETH, SWETHPendleLPT26, SWETHPendleLPT27, TBTC, TurboSTETH, TurboSWETH, USD0PP, USDC, USDE, USDT, USDY, WBTC, WEETH, WETH, YVFRAXCRVUSD, YVUSDCCRVUSD, YVUSDTCRVUSD, YieldETH, crvUSD, mkUSD } from './constants';
import { impersonateAccountsHardhat, waitForTx } from './misc-utils';
import { BigNumberish } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

const TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    "symbol": 'DAI',
    "address": DAI,
    "owner": '0x28C6c06298d514Db089934071355E5743bf21d60',
  },
  {
    "symbol": 'USDC',
    "address": USDC,
    "owner": '0x28C6c06298d514Db089934071355E5743bf21d60',
  },
  {
    "symbol": 'USDT',
    "address": USDT,
    "owner": '0x28C6c06298d514Db089934071355E5743bf21d60',
  },
  {
    "symbol": 'CRV',
    "address": CRV,
    "owner": '0xF977814e90dA44bFA03b6295A0616a897441aceC',
  },
  {
    "symbol": 'FRAX',
    "address": FRAX,
    "owner": '0x69873461B8F29F3a3D35449e2173040e0AA1571d',
  },
  {
    "symbol": 'WETH',
    "address": WETH,
    "owner": '0x8EB8a3b98659Cce290402893d0123abb75E3ab28',
  },
  {
    "symbol": 'YieldETH',
    "address": YieldETH,
    "owner": '0x6a4d361B7d0daDF8146DcfE6258A8699ea35eB81',
  },
  {
    "symbol": 'TurboSTETH',
    "address": TurboSTETH,
    "owner": '0xA937F63bA1D69fD7e022fD50628B6D8fCFbDE52d',
  },
  {
    "symbol": 'TurboSWETH',
    "address": TurboSWETH,
    "owner": '0xe6b447D7e55E800A0999d5FD752BfDeA9baF7853',
  },
  {
    "symbol": 'SWETH',
    "address": SWETH,
    "owner": '0xE8b22a88DEB45C7848d394fd039B8D811511a9F3',
  },
  {
    "symbol": 'crvUSD',
    "address": crvUSD,
    "owner": '0x0a7b9483030994016567b3B1B4bbB865578901Cb',
  },
  {
    "symbol": 'FUSDT',
    "address": FUSDT,
    "owner": '0x92285756E124f392610B15a493Fd19Ce30a379f9',
  },
  {
    "symbol": 'FUSDC',
    "address": FUSDC,
    "owner": '0x2E15D7AA0650dE1009710FDd45C3468d75AE1392',
  },
  {
    "symbol": 'FDAI',
    "address": FDAI,
    "owner": '0x5DF6a71c62895B22B73C4fd5D015526876819366',
  },
  {
    "symbol": 'SFRAX',
    "address": SFRAX,
    "owner": '0x88E863d4572d2DaE27db81E98837a9dbeb0e7a12',
  },
  {
    "symbol": 'SWETHPendleLPT26',
    "address": SWETHPendleLPT26,
    "owner": '0x9df2322bdAEC46627100C999E6dDdD27837fec6e',
  },
  {
    "symbol": 'SWETHPendleLPT27',
    "address": SWETHPendleLPT27,
    "owner": '0xB79A48cdFB85d1Ac45989f40793aBc7A1A15C5e3',
  },
  {
    "symbol": 'EETHPendlePT',
    "address": EETHPendlePT,
    "owner": '0x6e2C509D522d47F509E1a6D75682E6AbBC38B362',
  },
  {
    "symbol": 'RSWETHPendlePT',
    "address": RSWETHPendlePT,
    "owner": '0x568D0e1F84dB2EEf8578C8cEDCCF9e78A47C661C',
  },
  {
    "symbol": 'RSETHPendlePT',
    "address": RSETHPendlePT,
    "owner": '0xF01390d612C5D5001c84E3049f364Ef7f383C413',
  },
  {
    "symbol": 'YVUSDTCRVUSD',
    "address": YVUSDTCRVUSD,
    "owner": '0x79af4B03134Ff961599A4e4Ae95759c27A394502',
  },
  {
    "symbol": 'YVUSDCCRVUSD',
    "address": YVUSDCCRVUSD,
    "owner": '0xa931b486F661540c6D709aE6DfC8BcEF347ea437',
  },
  {
    "symbol": 'YVFRAXCRVUSD',
    "address": YVFRAXCRVUSD,
    "owner": '0xCA686974913389D42F3C5F61010503DAccDb487a',
  },
  {
    "symbol": 'mkUSD',
    "address": mkUSD,
    "owner": '0xa2507C9284654Df0cCc419beCD458637b3EefC80',
  },
  {
    "symbol": 'PXETH',
    "address": PXETH,
    "owner": '0xeE3d8fE52b93f31d666bbbd7E2776432f2738735',
  },
  {
    "symbol": 'STETH',
    "address": STETH,
    "owner": '0x18709E89BD403F470088aBDAcEbE86CC60dda12e',
  },
  {
    "symbol": 'RSWETH',
    "address": RSWETH,
    "owner": '0x22162DbBa43fE0477cdC5234E248264eC7C6EA7c',
  },
  {
    "symbol": 'WEETH',
    "address": WEETH,
    "owner": '0x267ed5f71EE47D3E45Bb1569Aa37889a2d10f91e',
  },
  {
    "symbol": 'RSETH',
    "address": RSETH,
    "owner": '0x267ed5f71EE47D3E45Bb1569Aa37889a2d10f91e',
  },
  {
    "symbol": 'STTAO',
    "address": STTAO,
    "owner": '0x94851518E441A52AC0AF4322AeF61548156a8Ac8',
  },
  {
    "symbol": 'GHO',
    "address": GHO,
    "owner": '0x835a3b6ba288DFB93Cfa80D30D7FC0CF81649248',
  },
  {
    "symbol": 'USDE',
    "address": USDE,
    "owner": '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
  },
  {
    "symbol": 'FXUSD',
    "address": FXUSD,
    "owner": '0x6Da6DeE37F5e218b8137192Aa6848117354fEc41',
  },
  {
    "symbol": 'APXETH',
    "address": APXETH,
    "owner": '0x605B5F6549538a94Bd2653d1EE67612a47039da0',
  },
  {
    "symbol": 'STRDY',
    "address": STRDY,
    "owner": '0xfE6DE700427cc0f964aa6cE15dF2bB56C7eFDD60'
  },
  {
    "symbol": 'USD0PP',
    "address": USD0PP,
    "owner": '0xa53A13A80D72A855481DE5211E7654fAbDFE3526'
  },
  {
    "symbol": 'CRVUSD0USD0PP',
    "address": CRVUSD0USD0PP,
    "owner": '0x5EC6abfF9BB4c673f63D077a962A29945f744857'
  },
  {
    "symbol": 'WBTC',
    "address": WBTC,
    "owner": '0xbE6d2444a717767544a8b0Ba77833AA6519D81cD'
  },
  {
    "symbol": 'SWBTC',
    "address": SWBTC,
    "owner": '0x063ADACc01dB782093d0310bf3d5755d2aDEc424'
  },
  {
    "symbol": 'TBTC',
    "address": TBTC,
    "owner": '0x84eA3907b9206427F45c7b2614925a2B86D12611'
  },
  {
    "symbol": 'EBTC',
    "address": EBTC,
    "owner": '0xe3272b584264680D3ffD44763d78Fe3B07b728D7'
  },
  {
    "symbol": 'USDY',
    "address": USDY,
    "owner": '0xf89d7b9c864f589bbF53a82105107622B35EaA40'
  }
];

const MODE_TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    "symbol": 'WETH',
    "address": MODE_WETH,
    "owner": '0xD746A2a6048C5D3AFF5766a8c4A0C8cFD2311745',
  },
  {
    "symbol": 'USDC',
    "address": MODE_USDC,
    "owner": '0x54DF9eEdD4BCa708C98a4b2f35E979AF9452CfCc',
  },
  {
    "symbol": 'USDT',
    "address": MODE_USDT,
    "owner": '0x975a1370aF7c0561d5377ed5d8b37f31fccAb847',
  },
  {
    "symbol": 'EZETH',
    "address": MODE_EZETH,
    "owner": '0x2344F131B07E6AFd943b0901C55898573F0d1561',
  },
  {
    "symbol": 'WEETH',
    "address": MODE_WEETH,
    "owner": '', //'0xd5B12178161244cD1ac9EE4857B53f0B6e7c5a46',
  },
  {
    "symbol": 'WRSETH',
    "address": MODE_WRSETH,
    "owner": '0x76686847A10A6D88f3BC890b4F7AB3dFAd2E57d5'
  },
  {
    "symbol": 'STONE',
    "address": MODE_STONE,
    "owner": '0x058B10CbE1872ad139b00326686EE8CCef274C58'
  },
  {
    "symbol": 'MODE',
    "address": MODE_MODE,
    "owner": '0xb4E38F1A3Bf250144364CF29076Ecd2D1f8C2329'
  },
]

const LINEA_TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    "symbol": 'WETH',
    "address": LINEA_WETH,
    "owner": '0xe7fbEad25803a32593a22a9284896D36e0Cd4a34',
  },
  {
    "symbol": 'EZETH',
    "address": LINEA_EZETH,
    "owner": '0x3A0ee670EE34D889B52963bD20728dEcE4D9f8FE',
  },
  {
    "symbol": 'USDT',
    "address": LINEA_USDT,
    "owner": '0x6cd9506fDd4007AB98EF70EdD6bC4D9f2B919C4d',
  },
  {
    "symbol": 'USDC',
    "address": LINEA_USDC,
    "owner": '0x428AB2BA90Eba0a4Be7aF34C9Ac451ab061AC010',
  }
]

const SEI_TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    "symbol": 'WSEI',
    "address": SEI_WSEI,
    "owner": '0x06b49C508f278a9219a6e45A7bcEbBC0aA1E2e7b',
  },
  {
    "symbol": 'ISEI',
    "address": SEI_ISEI,
    "owner": '0x89Ce5DDae42c53E71dC9d85d492c5213Dd87227D',
  },
  {
    "symbol": 'USDC',
    "address": SEI_USDC,
    "owner": '0x946a1a3Dacbc7A7Bb2C7dF0b87195d6092f7238B',
  },
  {
    "symbol": 'WETH',
    "address": SEI_WETH,
    "owner": '0x98F0f120de21a90f220B0027a9c70029Df9BBde4',
  },
  {
    "symbol": 'STONE',
    "address": SEI_STONE,
    "owner": '0xa9B3cBcF3668e819bd35ba308dECb640DF143394',
  }
]

const OP_TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    "symbol": 'WETH',
    "address": OP_WETH,
    "owner": '0x86Bb63148d17d445Ed5398ef26Aa05Bf76dD5b59',
  },
  {
    "symbol": 'EZETH',
    "address": OP_EZETH,
    "owner": '0xb497070466Dc15FA6420b4781bB0352257146495',
  },
]

const BIT_TOKEN_INFO: {
  symbol: string;
  address: string;
  owner: string;
}[] = [
  {
    "symbol": 'WTAO',
    "address": BIT_WTAO,
    "owner": '0xd5B27C42f74518635AE29b16ea488aD4fdb9bE24',
  },
  {
    "symbol": 'USDC',
    "address": BIT_USDC,
    "owner": '0xefC662Fe5c73E58BdDfD97015a21726D6423b088',
  },
]

export async function mint(reserveSymbol: string, amount: BigNumberish, user: string, network: string = 'main') {
  let token;

  if (network === 'main') {
    token = TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  } else if (network === 'mode') {
    token = MODE_TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  } else if (network === 'linea') {
    token = LINEA_TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  } else if (network === 'sei') {
    token = SEI_TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  } else if (network === 'op') {
    token = OP_TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  } else if (network === 'bittensor') {
    token = BIT_TOKEN_INFO.find((ele) => ele.symbol.toUpperCase() === reserveSymbol.toUpperCase());
  }

  if (token) {
    const asset = await ethers.getContractAt('IERC20', token.address);
    await impersonateAccountsHardhat([token.owner]);
    const signer = await ethers.provider.getSigner(token.owner);
    const ethBalance = await ethers.provider.getBalance(token.owner);
    if (ethBalance.lt(parseEther("1"))) {
      const [deployer ] = await ethers.getSigners();
      await deployer.sendTransaction({ value: parseEther('1'), to: token.owner });
    }
    await waitForTx(await asset.connect(signer).transfer(user, amount));
  }
}
