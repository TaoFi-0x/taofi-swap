import * as fs from "fs";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
dotenvConfig({ path: resolve(__dirname, "./.env") });

import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "hardhat-gas-reporter";
import "@nomicfoundation/hardhat-verify";
import "hardhat-contract-sizer";
import "hardhat-deploy";
import "hardhat-preprocessor";
import "solidity-coverage";
import "@openzeppelin/hardhat-upgrades";

import "./hardhat/tasks";

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const LINEASCAN_API_KEY = process.env.LINEASCAN_API_KEY || "";
const PK = process.env.PK;
const MNEMONIC = process.env.MNEMONIC;
const FORK = process.env.FORK || "main";
const BTLOCAL_RPC_URL = process.env.BTLOCAL_RPC_URL || "1";

// import "./hardhat/tasks";

function getRemappings() {
  return fs
    .readFileSync("remappings.txt", "utf8")
    .split("\n")
    .map((line) => line.trim().split("="));
}

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const BLOCK_TO_FORK = {
  main: 21181130,
  bittensor: 4600000,
  btlocal: parseInt(BTLOCAL_RPC_URL),
  mode: 7464010,
  linea: 4579590,
  sei: 98568033,
  op: 122257950,
};

const NETWORKS_RPC_URL = {
  main: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
  btlocal: process.env.BTLOCAL_RPC_URL || `http://localhost:9944/`,
  bittensor: `https://entrypoint-finney.opentensor.ai`,
  bittensor_test: `https://test.chain.opentensor.ai`,
  mode: "https://mainnet.mode.network/",
  linea: `https://linea-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
  sei: "https://evm-rpc.sei-apis.com",
  op: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
};

module.exports = {
  paths: {
    sources: "./contracts",
  },
  mocha: {
    timeout: 1200000,
  },
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: true,
    excludeContracts: [],
    src: "./contracts",
    gasPrice: 100,
  },
  networks: {
    hardhat: {
      // Main network
      hardfork: "shanghai",
      chainId: 31337,
      saveDeployments: true,
      blockGasLimit: 30000000,
      initialBaseFeePerGas: "10000000",
      gas: 30000000,
      allowUnlimitedContractSize: true,
      timeout: 1200000,
      forking: {
        url: NETWORKS_RPC_URL[FORK],
        blockNumber: BLOCK_TO_FORK[FORK],
      },
      accounts: { mnemonic: MNEMONIC },
    },
    btlocal: {
      url: process.env.BTLOCAL_RPC_URL || `http://localhost:9944/`,
      gas: "auto",
      chainId: 42,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
    main: {
      url: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_KEY}`,
      gas: "auto",
      chainId: 1,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
    bittensor: {
      url: `https://lite.chain.opentensor.ai`,
      gas: "auto",
      chainId: 964,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
    bittensor_test: {
      url: `https://test.chain.opentensor.ai`,
      gas: "auto",
      chainId: 945,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
    mode: {
      url: "https://mainnet.mode.network/",
      gas: "auto",
      gasPrice: 2000000,
      chainId: 34443,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
    linea: {
      url: `https://linea-mainnet.infura.io/v3/${process.env.INFURA_KEY}`,
      gas: "auto",
      gasPrice: 200000000,
      chainId: 59144,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
    sei: {
      url: "https://evm-rpc.sei-apis.com",
      gas: "auto",
      gasPrice: 100000000000,
      chainId: 1329,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
    op: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`,
      gas: "auto",
      gasPrice: 200000000,
      chainId: 10,
      accounts: PK ? [PK] : { mnemonic: MNEMONIC },
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.21",
        settings: {
          // viaIR: true,
          optimizer: { enabled: true, runs: 1 },
          evmVersion: "paris",
        },
      },
    ],
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY ? ETHERSCAN_API_KEY : "",
      mode: ETHERSCAN_API_KEY ? ETHERSCAN_API_KEY : "",
      linea: LINEASCAN_API_KEY ? LINEASCAN_API_KEY : "",
    },
    customChains: [
      {
        network: "mode",
        chainId: 34443,
        urls: {
          apiURL: "https://eth-goerli.blockscout.com/api",
          browserURL: "https://explorer.mode.network/",
        },
      },
      {
        network: "linea",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build/",
        },
      },
    ],
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
};
