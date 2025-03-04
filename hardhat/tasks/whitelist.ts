import { runWhitelist } from "../../test/helpers/whitelist";
import { task } from "hardhat/config";
import { exit } from "process";

task("whitelist", "whitelists deployer in bittensor localnet evm").setAction(
  async ({}, { getNamedAccounts }) => {
    try {
      const { deployer } = await getNamedAccounts();
      await runWhitelist([deployer]);
    } catch (err) {
      console.log("ERROR");
      console.error(err);
      exit(1);
    }
  },
);