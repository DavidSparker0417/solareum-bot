import cluster from 'cluster'
import {
	Connection,
    PublicKey,
} from "@solana/web3.js";
import { SearcherClient } from "./src/sdk/block-engine/searcher.js";
import { Bundle } from "./src/sdk/block-engine/types.js";
import { isError } from "./src/sdk/block-engine/utils.js";
import { BundleResult } from "./src/gen/block-engine/bundle.js";
import { searcherClient } from './src/sdk/block-engine/searcher.js';
import {
    BLOCK_ENGINE_URL, 
    jito_auth_keypairs, 
} from './config.js';
import Logging from "../../../utils/logging.js";

export async function buildAndSendJitoBundle(
	connection: Connection,
    search: SearcherClient, 
    txns: any[],
	payerKeypair: any,
	tipAmount: number
) {
    const _tipAccount = (await search.getTipAccounts())[0];
    const tipAccount = new PublicKey(_tipAccount);

    const bund = new Bundle([], txns.length + 1);
    const resp = await connection.getLatestBlockhash("finalized");

    for (let i = 0; i < txns.length; i++) {
        bund.addTransactions(txns[i]);
    }

    let maybeBundle = bund.addTipTx(
        payerKeypair, 
		tipAmount,
        tipAccount, 
        resp.blockhash
    );

    if (isError(maybeBundle)) {
		console.log(maybeBundle)
        throw new Error('Bundle tipping error');
    }

    try {
        const response_bund = await search.sendBundle(maybeBundle);
        // console.log("response_bund:", response_bund);
    } catch (err) {
        console.error("error sending bundle:", err);
    }

    return maybeBundle;
}


function onJitoBundleResultProc(c: SearcherClient): Promise<BundleResult | undefined> {
    return new Promise((resolve) => {
        // Set a timeout to reject the promise if no bundle is accepted within 5 seconds
        setTimeout(() => {
            resolve(undefined);
        }, 1000);

        c.onBundleResult(
            (result) => {
				resolve(result)
            },
            (err) => {
				console.error('[onJitoBundleResultProc]')
                console.error(err);
				resolve(undefined)
                // Do not reject the promise here
            }
        );
    });
}

let keypair_idx
export async function sendAndConfirmJitoBundle(connection: Connection, txs: any[], payerKeypair: any, tipAmount: number) {
	if (!keypair_idx) {
		keypair_idx = ((cluster.worker?.id || 0) % jito_auth_keypairs.length)
	}
	keypair_idx = (keypair_idx + 1) % jito_auth_keypairs.length
	Logging.info(`Bundling by Jito signer [${keypair_idx}.${jito_auth_keypairs[keypair_idx].publicKey.toBase58()}]`)
    const search = searcherClient(BLOCK_ENGINE_URL, jito_auth_keypairs[keypair_idx]);

    await buildAndSendJitoBundle(connection, search, txs, payerKeypair, tipAmount);

    // const bundle_result = await onJitoBundleResultProc(search);

    // return bundle_result;
}
