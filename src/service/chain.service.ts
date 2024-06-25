import { chainConfig } from '../web3/chain.config.js';
import { getNativeCurrencyPrice } from '../web3/chain.parameters.js';

export async function chainPrice(chain: string) {
    return await getNativeCurrencyPrice(chain);
}

export function getAllChains() {
    let ret = ['solana'];
    for (const ch in chainConfig) {
        if (ret.indexOf(ch) < 0) {
			ret = [...ret, ch];
		}
    }

    return ret;
}
