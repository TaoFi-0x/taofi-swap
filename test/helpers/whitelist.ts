// import dotenv and get .env
import {config as dotenvConfig} from "dotenv";
import {resolve} from "path";
dotenvConfig({path: resolve(__dirname, "./.env")});


const BT_LOCAL_WS_URL = process.env.BT_LOCAL_WS_URL || "1";

import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";

function sendTransaction(api, call, signer) {
  return new Promise((resolve, reject) => {
    let unsubscribed = false;

    const unsubscribe = call
      .signAndSend(signer, ({ status, events, dispatchError }) => {
        const safelyUnsubscribe = () => {
          if (!unsubscribed) {
            unsubscribed = true;
            unsubscribe
              .then(() => {})
              .catch((error) => console.error("Failed to unsubscribe:", error));
          }
        };

        // Check for transaction errors
        if (dispatchError) {
          let errout = dispatchError.toString();
          if (dispatchError.isModule) {
            // for module errors, we have the section indexed, lookup
            const decoded = api.registry.findMetaError(dispatchError.asModule);
            const { docs, name, section } = decoded;
            errout = `${name}: ${docs}`;
          }
          safelyUnsubscribe();
          reject(Error(errout));
        }
        // Log and resolve when the transaction is included in a block
        if (status.isInBlock) {
          safelyUnsubscribe();
          resolve(status.asInBlock);
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
}

function getTestKeys() {
  const keyring = new Keyring({ type: "sr25519" });
  return {
    alice: keyring.addFromUri("//Alice"),
    aliceHot: keyring.addFromUri("//AliceHot"),
    bob: keyring.addFromUri("//Bob"),
    bobHot: keyring.addFromUri("//BobHot"),
    charlie: keyring.addFromUri("//Charlie"),
    charlieHot: keyring.addFromUri("//CharlieHot"),
    dave: keyring.addFromUri("//Dave"),
    daveHot: keyring.addFromUri("//DaveHot"),
    eve: keyring.addFromUri("//Eve"),
    zari: keyring.addFromUri("//Zari"),
  };
}

export async function runWhitelist(addrs: Array<string>) {
  const provider = new WsProvider(BT_LOCAL_WS_URL);

  // Create the API and wait until ready
  const api = await ApiPromise.create({ provider });

  // add deployer to whitelist
  const txSudoSetWhitelist = api.tx.sudo.sudo(api.tx.evm.setWhitelist(addrs));

  // get testkeys
  const tk = getTestKeys();

  console.log("sending whitelist transaction");
  // send transaction
  await sendTransaction(api, txSudoSetWhitelist, tk.alice);

  // log whitelisted accounts
  const whitelist = await api.query.evm.whitelistedCreators();
  console.log("whitelisted!");
}
