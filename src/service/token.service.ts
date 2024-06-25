import { TokenSettingModel } from '../models/token.settings.model.js';
import { selectChain } from './connected.chain.service.js';
import { getWallet } from './wallet.service.js';
import { getAppUser, userVerboseLog } from './app.user.service.js';
import { getAllChains } from './chain.service.js';
import { TOKEN_NOT_FOUND } from '../utils/common.js';
import { TokenTaxModel } from '../models/token.tax.model.js';
import { prefetchTokensOnChain, queryAndSyncToken } from '../web3/multicall.js';
import { SolanaTokenInfoModel } from '../models/solana/solana.token.info.model.js';
import { WSOL_ADDRESS, getBN } from '../web3/web3.operation.js';
import { getTokenPriceOfRaydiumPool } from '../web3/dex/raydium/newpool.trade.js';
import { ChainModel } from '../models/chain.model.js';
import { chainConfig } from '../web3/chain.config.js';

export async function startToken(telegramId: string, chain: string, address: string, newChain?: string) {
    // finding valid token address
    let chainArray = [chain];
    let allChainArray = getAllChains();

    for (const t of allChainArray) {
        if (t !== chain) {
            chainArray = [...chainArray, t];
        }
    }

    if (newChain) chainArray = [newChain]

    let tFound
    for (const ch of chainArray) {
        tFound = await getTokenInfo(ch, address)
        if (tFound) {
            if (ch !== chain) {
                await userVerboseLog(telegramId, `switched to [${ch}] from [${chain}] for token ${address}`)
                await selectChain(telegramId, ch)
            }
            break
        }
    }

    if (tFound === null) {
        await userVerboseLog(telegramId, `polling chains ${chainArray}`);

        const w = await getWallet(telegramId)
        const retOnChains: any[] = await Promise.all(chainArray.map(ch => {
            try {
                return queryAndSyncToken(telegramId, ch, address, w.address)
            } catch (err) {
                return async () => { }
            }
        })
        )

        let chainFound
        for (const rr of retOnChains) {
            if (rr?.symbol?.length > 0) {
                if (rr.chain !== chain) {
                    await userVerboseLog(telegramId, `switched to [${rr.chain}] from [${chain}] for token ${address}`)
                    await selectChain(telegramId, rr.chain)
                }

                chainFound = rr.chain
                tFound = rr
                break
            }
        }

        if (chainFound === undefined) return false
    }

    const user = await getAppUser(telegramId);

    const tokenItem = await TokenSettingModel.findOne({ user: user._id });

    if (tokenItem === null) {
        const newToken = new TokenSettingModel({
            user: user._id,
            token: tFound._id
        });

        await newToken.save();
    } else {
        tokenItem.token = tFound._id;

        await tokenItem.save();
    }

    return true;
}

export async function getCurrentToken(telegramId: string, chain: string) {
    const user = await getAppUser(telegramId);

    const tFound: any = await TokenSettingModel.findOne({ user: user._id });
    if (tFound === null) {
        throw new Error(TOKEN_NOT_FOUND);
    }
    const token = await tFound.populate('token');

    if (token.token.chain !== chain) {
        await selectChain(telegramId, token.token.chain);
    }

    return token === null ? '' : token.token.address;
}

export async function getTokenPrice(chain: string, token: string) {
	const BN = getBN()
    const tokenInfo = await getTokenInfo(chain, token)

	let price
	const chainDB = await ChainModel.findOne({name: chain})
	const indexToken = chainDB.tokens.indexOf(token)
	if (indexToken >= 0) {
		price = chainDB.prices[indexToken]
	} else {
		try {
			let retry = 0
			for (;retry < 3; retry ++) {
				price = await getTokenPriceOfRaydiumPool(token)
				if (!isNaN(parseFloat(price))) break
			}
		} catch (err) {
			price = '0'
		}
	}

	if (BN(price).eq(0)) {
		price = tokenInfo.price
	} else {
		tokenInfo.price = price
		tokenInfo.marketCap = BN(tokenInfo.totalSupply).times(price).toString()
		await tokenInfo.save()
	}
	return price
}

export async function getTokenInfo(chain: string, address: string) {
    let t = await SolanaTokenInfoModel.findOne({ chain: chain, address: address });
	if (t === null) {
		await prefetchTokensOnChain(chain, JSON.stringify([address]))
		t = await SolanaTokenInfoModel.findOne({ chain: chain, address: address });
	}
    return t;
}

export async function hitToken(chain: string, address: string) {
	const t = await SolanaTokenInfoModel.findOne({ chain: chain, address: address });
	if (t) {
		t.hitCount ++
		await t.save()
	}
}

export async function getTokenTaxInfo(chain: string, address: string) {
    const f = await TokenTaxModel.findOne({ chain: chain, address: address })
    return f
}

export async function updateTokenTaxInfo(chain: string, address: string, info: any) {
    if (0 === await TokenTaxModel.countDocuments({ chain: chain, address: address })) {
        const newT = new TokenTaxModel({
            chain: chain,
            address: address
        })
        await newT.save()
    }

    const f = await TokenTaxModel.findOne({ chain: chain, address: address })
    for (const ch in info) {
        if (info[ch] !== undefined) {
            f[ch] = info[ch]
        }
    }

    await f.save()
}

export function getTokenAddressFromPool(poolInfo: any) {
	const chain = 'solana'

	const chainTokens = chainConfig[chain].tokens

	if (poolInfo.baseMint === WSOL_ADDRESS) {
		return poolInfo.quoteMint
	} else if (poolInfo.quoteMint === WSOL_ADDRESS) {
		return poolInfo.baseMint
	} else if (chainTokens.indexOf(poolInfo.baseMint) > 0) {
		return poolInfo.quoteMint
	} else if (chainTokens.indexOf(poolInfo.quoteMint) > 0) {
		return poolInfo.baseMint
	} else {
		return
	}
}
