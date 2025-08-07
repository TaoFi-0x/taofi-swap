# TaoFi Contracts

A DeFi protocol built on the Bittensor network, enabling staking, swapping, and cross-chain operations with TAO tokens. With this protocol, users can buy Bittensor's alpha tokens from any origin chain by staking them on the StakingManager.

## Overview

This repository contains the core smart contracts for the TaoFi ecosystem, which provides:

- **Staking Management**: Direct staking to Bittensor validators with AlphaToken representation
- **Swap & Stake**: Zapping functionality which help users to deposit USDC but receive Alpha tokens at the end
- **Cross-Chain Bridge**: Bridge operations from any EVM chain to Bittensor EVM powered by Hyperlane
- **AlphaToken System**: ERC20 tokens representing staked positions in specific subnets (not 1:1 exchange rate)

## Core Contracts

### StakingManager

The central contract for managing staking operations on the Bittensor network.

**Key Features:**

- Stake TAO tokens to validators and receive AlphaTokens
- Unstake AlphaTokens to receive TAO back
- Automatic AlphaToken deployment for new subnet/hotkey combinations
- Configurable staking and unstaking fees
- Slippage protection for all operations

**Main Functions:**

- `stake()`: Stake TAO and receive AlphaTokens
- `unstake()`: Burn AlphaTokens and receive TAO
- `setFees()`: Configure staking/unstaking fees
- `claimAccruedFees()`: Withdraw accumulated fees

### SwapAndStake

Enables users to swap ERC20 tokens (like USDC) for TAO and stake them in a single transaction.

**Key Features:**

- Swap USDC → WTAO → TAO → Stake
- Unstake → TAO → WTAO → USDC → Bridge
- Configurable UI fees
- Emergency refund functionality

**Main Functions:**

- `swapAndStake()`: Complete swap and stake operation
- `unstakeSwapAndBridge()`: Unstake, swap, and bridge to another chain
- `refund()`: Emergency refund functionality

**Supported Operations:**

- USDC → TAO → Stake to validator
- Unstake → TAO → USDC → Bridge to Ethereum
- Emergency refunds with bridge fee coverage

### SwapBridgeAndCallFromMain

Enables cross-chain operations from Ethereum to Bittensor EVM with remote contract calls.

**Key Features:**

- LiFi integration for token swaps
- Cross-chain bridging with remote function calls
- Whitelisted target address system
- Allowed function selector management

**Main Functions:**

- `lifiSwapBridgeAndCall()`: Swap, bridge, and execute remote calls
- `remoteCall()`: Execute remote calls on Bittensor EVM
- `setAllowedRemoteCall()`: Configure allowed function selectors

### AlphaToken

ERC20 tokens representing staked positions in specific Bittensor subnets.

**Key Features:**

- Upgradeable ERC20 with permit functionality
- 9 decimal precision
- Mint/burn restricted to owner (StakingManager)
- ERC20Permit for gasless approvals

**Token Details:**

- Name: "SN-{netuid}" (e.g., "SN-1")
- Symbol: "SN-{netuid}"
- Decimals: 9
- Total Supply: Managed by StakingManager

### AlphaTokenFactory

Factory contract for deploying new AlphaToken instances using the beacon proxy pattern.

**Key Features:**

- Create2 deployment for deterministic addresses
- Beacon proxy pattern for upgradeability
- Automatic ownership transfer to deployer
- Salt-based address generation

**Deployment Process:**

1. Generates unique salt from deployer, netuid, and hotkey
2. Creates BeaconProxy pointing to AlphaToken implementation
3. Initializes token with subnet-specific name/symbol
4. Transfers ownership to deployer

## Architecture

### Staking Flow

```
User → SwapAndStake → StakingManager → Bittensor Precompile
     ↓
AlphaToken (minted to user)
```

### Unstaking Flow

```
User → AlphaToken (burned) → StakingManager → Bittensor Precompile
     ↓
TAO returned to user
```

### Complete Cross-Chain User Journey

The TaoFi protocol makes it super easy for anyone to jump into Bittensor staking from their favorite EVM-compatible blockchain, like Base, Ethereum, Polygon, or others. It all starts with a simple transaction from your chosen chain.

### How It Works

1. Swap to USDC: You swap your native tokens for USDC using LiFi’s aggregators, which swaps around multiple DEXs to get you the best price with minimal slippage.

2. Bridge to Bittensor: TaoFi uses Hyperlane’s cross-chain tech to move your USDC to the Bittensor network. Hyperlane’s interchain account (ICA) system creates a smart account that acts as your personal assistant on Bittensor, while you keep full control of your funds.

3. Automated Staking: Once on Bittensor, your ICA handles everything:

   - Swaps USDC for TAO.

   - Stakes your TAO with your chosen validator or subnet via the StakingManager contract.

4. Receive AlphaTokens: You get AlphaTokens (ERC20 tokens) that represent your staked position in the Bittensor subnet.

### User's Control, User's Freedom

User's AlphaTokens are held by your ICA, meaning you have complete custody. TaoFi just simplifies the process. User can transfer, trade, or use your AlphaTokens in other DeFi protocols without any restrictions from TaoFi.

## Deployed Contracts

### Mainnet

| Contract               | Address                                      |
| ---------------------- | -------------------------------------------- |
| HyperERC4626Collateral | `0xFdf0cE858765429A63119b4aBf5AA05e893e34c5` |
| YearnUSDCVault         | `0x46e9893422B9aE9246793489433F72c548CB2455` |

### Subtensor

| Contract              | Address                                      |
| --------------------- | -------------------------------------------- |
| taoUSD                | `0x9bB4FC27453e04318bf968f2E994B47eDa8F724D` |
| HypeXERC20            | `0x8f9864c1f79eBC8aEc0949671aC0463bf40E5933` |
| TempStakingPrecompile | `0xDD3AB9Ed63F54B90C8fFB0FB4005BDEEf19BdCc7` |
| ProxyAdmin            | `0xA3c92e5cbb6146384Aa5A41540EC3fc6a184139C` |
| STAO                  | `0xf4E83cBF44415a9e677310950e250E2167842c7D` |
| UniswapV2Factory      | `0x524753f3ba40639dd970CC1cE940867afCC6c622` |
| UniswapV2Router02     | `0x86fe181fBEa665e52226b2981Df83a89b6edE822` |
| WTAO(3rd party)       | `0x272b921417197905B5A2736CADADBd842586AC6B` |
| STAO_taoUSD_Poolv2    | `0x4825Ccc5D3869995FaFA81FDE15E3705E12cACb5` |
