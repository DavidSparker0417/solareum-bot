import { SPL_ACCOUNT_LAYOUT } from '@raydium-io/raydium-sdk';
import { AutoBuyTokenModel } from '../models/auto.buy.token.js';
import { AutoSellTokenModel } from '../models/auto.sell.token.js';
import { ChainModel } from '../models/chain.model.js';
import { TransactionHistoryModel } from '../models/transaction.history.model.js';
import { convertValue, sleep } from '../utils/common.js';
import Logging from '../utils/logging.js';
import { getErrorMessageResponse } from '../utils/messages.js';
import { swapTokenForETH } from '../web3/dex.interaction.js';
import { getTokenBalance } from '../web3/multicall.js';
import { WSOL_ADDRESS, getBN, getSolAccount, newSolWeb3 } from '../web3/web3.operation.js';
import { sendBotMessage } from './app.service.js';
import { getAppUser } from './app.user.service.js';
import { commitAutoBuy } from './autobuy.service.js';
import { getTokenPrice } from './token.service.js';
import { getMultiWallets, getWallet } from './wallet.service.js';
import { getSettings } from './settings.service.js';
import { RAYDIUMPOOL_MAGIC, RAYDIUM_TOKEN_MAGIC } from '../web3/dex/raydium/sync.js';
import { createNewRedisClient } from './multicore/ioredis.js';

export async function isTokenAutoSellSet(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);
	const sell = await AutoSellTokenModel.findOne({ user: user._id, chain: chain, token: token, state: 'pending' });
	return sell !== null;
}

export async function removeTokenAutoSell(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);
	await AutoSellTokenModel.deleteOne({ user: user._id, chain: chain, token: token, state: 'pending' });
}

export async function addTokenAutoSell(telegramId: string, chain: string, token: string, price: string) {
	const user = await getAppUser(telegramId);
	if (0 === (await AutoSellTokenModel.countDocuments({ user: user._id, chain: chain, token: token, state: 'pending' }))) {
		const newAutoSellToken = new AutoSellTokenModel({
			user: user._id,
			chain: chain,
			token: token,
			state: 'pending',
			priceStamp: price,
			lowPriceLimit: '-99%',
			highPriceLimit: '100%',
			amountAtLowPrice: '100%',
			amountAtHighPrice: '100%',
		});

		await newAutoSellToken.save();
	}
}

export async function updateTokenAutoSellContext(telegramId: string, chain: string, token: string, updateContext: any) {
	const user = await getAppUser(telegramId);

	const itemToUpdate = await AutoSellTokenModel.findOne({ user: user._id, chain: chain, token: token, state: 'pending' });

	if (itemToUpdate === null) {
		throw new Error(`Not enabled auto sell\n<code>${token}</code>`);
	}

	for (const ch in updateContext) {
		itemToUpdate[ch] = updateContext[ch];
	}

	await itemToUpdate.save();
}

export async function getTokenAutoSellContext(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);

	return await AutoSellTokenModel.findOne({ user: user._id, chain: chain, token: token, state: 'pending' });
}

export async function getAutoSellContexts(telegramId: string, chain: string) {
	const user = await getAppUser(telegramId);

	return await AutoSellTokenModel.find({ user: user._id, chain: chain, state: 'pending' });
}

export async function commitAutoSell(currentPrice: string, context: any, lowReach: boolean) {
	let telegramId
	try {
		context.state = 'processing'
		await context.save()

		const c = await context.populate('user');
		telegramId = c.user.telegramId

		const BN = getBN();
		const setting = await getSettings(telegramId, c.chain)

		let wallets = [await getWallet(telegramId)]

		if (setting.multiWallet === true) {
			try {
				wallets = [...wallets, ...(await getMultiWallets(telegramId))]
			} catch { }
		}

		await Promise.all(wallets.map(async (w, idx) => {
			try {
				const t = await getTokenBalance(c.chain, c.token, w.address);

				let amount;
				if (true === lowReach) {
					amount = convertValue(t.balance, c.amountAtLowPrice, BN);
				} else {
					amount = convertValue(t.balance, c.amountAtHighPrice, BN);
				}

				let tr = null;

				try {
					if (BN(amount).gt(BN(0))) {
						const receipt = await swapTokenForETH(
							telegramId,
							c.chain,
							{
								token: c.token,
								amount: BN(amount).times(BN(`1e${t.decimals}`)).integerValue().toString()
							},
							{
								address: w
							}
						);
						tr = await TransactionHistoryModel.findOne({ transactionHash: receipt.transactionHash });
					}
				} catch { }

				if (idx === 0) {
					c.priceCommitted = currentPrice
					c.state = 'completed';
					if (tr !== null) c.transaction = tr._id;

					await c.save();
				}
			} catch (err) {
				console.error(`[commitAutoSell] ${w.address} ==> ${new Date().toLocaleString()}`)
				console.error(err)
				Logging.error(`[commitAutoSell] ${err.message}`);
				const errMsg = await getErrorMessageResponse(telegramId, err.message);
				if (errMsg !== null) {
					await sendBotMessage(telegramId, errMsg)
					if (idx === 0) {
						await AutoSellTokenModel.findByIdAndDelete(context._id)
					}
				}
			}
		}))
	} catch (err) {
		console.error(`[commitAutoSell] ==> ${new Date().toLocaleString()}`)
		console.error(err)
		Logging.error(`[commitAutoSell] ${err.message}`);
		const errMsg = await getErrorMessageResponse(telegramId, err.message);
		if (errMsg !== null) {
			await sendBotMessage(telegramId, errMsg)
			await AutoSellTokenModel.findByIdAndDelete(context._id)
		}
	}
}

export async function pollAutoSellBuyOld(bot: any) {
	const BN = getBN();
	Logging.info('polling autosell/autobuy...')

	while (true) {
		const tick = (new Date()).getTime()

		const chains = await ChainModel.find();
		for (const chain of chains) {
			const autoSellRecords = await AutoSellTokenModel.find({ chain: chain.name, state: 'pending' });
			const autoBuyRecords = await AutoBuyTokenModel.find({ chain: chain.name, state: 'pending' });

			for (const as of autoSellRecords) {
				try {
					const asUser: any = await as.populate('user')
					let tokenPrice = await getTokenPrice(as.chain, as.token)

					if (BN(as.priceStamp).eq(BN(0)) || as.lowPriceLimit === undefined || as.highPriceLimit === undefined) {
						Logging.error(`[pollAutoSellBuyOld] autosell: chain ${as.chain}, token ${as.token}, price ${as.priceStamp} cancelled`)
						await AutoSellTokenModel.findByIdAndDelete(as._id)
						continue
					}

					if (tokenPrice && BN(tokenPrice).gt(0)) {
						const lv = convertValue(as.priceStamp, as.lowPriceLimit, BN);
						const hv = convertValue(as.priceStamp, as.highPriceLimit, BN);

						const lowLimitedPrice = BN(as.lowPriceLimit).eq(BN(lv)) ? lv : BN(as.priceStamp).plus(BN(lv)).toString()
						const highLimitedPrice = BN(as.highPriceLimit).eq(BN(hv)) ? hv : BN(as.priceStamp).plus(BN(hv)).toString()

						if (true === BN(tokenPrice).lte(BN(lowLimitedPrice))) {
							await commitAutoSell(tokenPrice, as, true);
						} else if (true === BN(tokenPrice).gte(BN(highLimitedPrice))) {
							await commitAutoSell(tokenPrice, as, false);
						}
					}
				} catch (err) {
					console.error(`==> ${new Date().toLocaleString()}`)
					console.error(err)
					Logging.error('[pollAutoSellBuyOld] autosell ' + as.token + ':' + chain.name + ' --> ' + err);
					await AutoSellTokenModel.findByIdAndDelete(as._id)
				}
			}

			for (const ab of autoBuyRecords) {
				try {
					const abUser: any = await ab.populate('user')
					let tokenPrice = await getTokenPrice(ab.chain, ab.token)

					if (BN(ab.priceStamp).eq(BN(0)) || ab.priceLimit === undefined) {
						Logging.error(`[pollAutoSellBuyOld] autobuy: chain ${ab.chain}, token ${ab.token}, price ${ab.priceStamp} cancelled`)
						await AutoBuyTokenModel.findByIdAndDelete(ab._id)
						continue
					}

					if (tokenPrice && BN(tokenPrice).gt(0)) {
						const lv = convertValue(ab.priceStamp, ab.priceLimit, BN);
						const lowLimitedPrice = BN(ab.priceLimit).eq(BN(lv)) ? lv : BN(ab.priceStamp).plus(BN(lv)).toString()

						if (true === BN(tokenPrice).lte(BN(lowLimitedPrice))) {
							await commitAutoBuy(tokenPrice, ab);
						}
					}
				} catch (err) {
					console.error(`==> ${new Date().toLocaleString()}`)
					console.error(err)
					Logging.error('[pollAutoSellBuyOld] autosell ' + ab.token + ':' + chain.name + ' --> ' + err);
					await AutoBuyTokenModel.findByIdAndDelete(ab._id)
				}
			}
		}

		Logging.info(`[pollAutoSellBuyOld] ${((new Date()).getTime() - tick) / 1000} elapsed`)
		await sleep(1000)
	}
}

export async function clearAllAutosells(telegramId: string) {
	const user = await getAppUser(telegramId)
	await AutoSellTokenModel.deleteMany({ user: user._id })
}

export async function pollAutoSellBuy(bot: any) {
	const BN = getBN();
	Logging.info('polling autosell/autobuy...')
	const connection = await newSolWeb3('', 'solana')
	const redis = createNewRedisClient()

	while (true) {
		const tick = (new Date()).getTime()

		const chains = await ChainModel.find();
		for (const chain of chains) {
			if (chain.name === 'solana') {
				try {
					const tickStart = (new Date()).getTime()
					const printTick = (text) => {
						console.log(((new Date()).getTime() - tickStart) / 1000, text)
					}

					const autoSellRecords = await AutoSellTokenModel.find({ chain: chain.name, state: 'pending' });
					const autoBuyRecords = await AutoBuyTokenModel.find({ chain: chain.name, state: 'pending' });

					const allTokens = [...autoSellRecords.map(s => s.token), ...autoBuyRecords.map(s => s.token)]
					const uniqueTokens = allTokens.filter((t, idx) => allTokens.indexOf(t) === idx)
					const totalPools = await Promise.all(uniqueTokens.map(async t => {
						const r1 = await redis.get(`${RAYDIUM_TOKEN_MAGIC}-${t}`) || '[]'
						const pools = JSON.parse(r1)
						const r2 = await Promise.all(pools.map(async p => {
							const poolInfoJson = await redis.get(`${RAYDIUMPOOL_MAGIC}-${p}`)
							return poolInfoJson? JSON.parse(poolInfoJson): null
						}))
						const poolInfos = r2.filter(p => p !== null)

						if (poolInfos && poolInfos.length > 0) {
							return poolInfos.find(p => p.baseMint === WSOL_ADDRESS || p.quoteMint === WSOL_ADDRESS) || poolInfos[0]
						}
					}))

					const allPools = totalPools.filter(p => p !== undefined && ((p.baseMint === WSOL_ADDRESS && uniqueTokens.indexOf(p.quoteMint) >= 0) || (p.quoteMint === WSOL_ADDRESS && uniqueTokens.indexOf(p.baseMint) >= 0)))

					const tokenPriceTree = {}
					const tokenPooledAmount = {}

					for (let slice = 0; slice < allPools.length; slice += 100) {
						const pools = allPools.slice(slice, slice + 100)
						const baseVaultAccounts = await connection.getMultipleAccountsInfo(pools.map(p => getSolAccount(p.baseVault)))
						const quoteVaultAccounts = await connection.getMultipleAccountsInfo(pools.map(p => getSolAccount(p.quoteVault)))
						const baseTokenVaultInfos = baseVaultAccounts.map(b => SPL_ACCOUNT_LAYOUT.decode(b.data))
						const quoteTokenVaultInfos = quoteVaultAccounts.map(q => SPL_ACCOUNT_LAYOUT.decode(q.data))
						// const poolReservedArray = pools.map((p, idx) => {
						// 	return {
						// 		...p._doc,
						// 		baseReserved: BN(baseTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.baseDecimals}`)).toNumber(),
						// 		quoteReserved: BN(quoteTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.quoteDecimals}`)).toNumber(),
						// 		tokenAddress: p.baseMint === WSOL_ADDRESS? p.quoteMint: p.baseMint,
						// 		price:
						// 			p.baseMint === WSOL_ADDRESS
						// 			? BN(baseTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.baseDecimals}`)).div(BN(quoteTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.quoteDecimals}`))).times(chain.prices[0]).toString()
						// 			: BN(quoteTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.quoteDecimals}`)).div(BN(baseTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.baseDecimals}`))).times(chain.prices[0]).toString()
						// 	}
						// })

						// poolReservedArray.forEach(p => {
						// 	tokenPriceTree[p.tokenAddress] = p.price
						// })

						pools.forEach((p, idx) => {
							const tokenAddress = p.baseMint === WSOL_ADDRESS ? p.quoteMint : p.baseMint
							const tokenPooled = p.baseMint === WSOL_ADDRESS ? quoteTokenVaultInfos[idx].amount.toString() : baseTokenVaultInfos[idx].amount.toString()
							const price = p.baseMint === WSOL_ADDRESS
								? BN(baseTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.baseDecimals}`)).div(BN(quoteTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.quoteDecimals}`))).times(chain.prices[0]).toString()
								: BN(quoteTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.quoteDecimals}`)).div(BN(baseTokenVaultInfos[idx].amount.toString()).div(BN(`1e${p.baseDecimals}`))).times(chain.prices[0]).toString()
							if (BN(tokenPooledAmount[tokenAddress] || '0').lt(BN(tokenPooled))) {
								tokenPooledAmount[tokenAddress] = tokenPooled
								tokenPriceTree[tokenAddress] = price
							}
						})
					}

					for (const as of autoSellRecords) {
						try {
							const asUser: any = await as.populate('user')
							let tokenPrice = tokenPriceTree[as.token]

							if (BN(as.priceStamp).eq(BN(0)) || as.lowPriceLimit === undefined || as.highPriceLimit === undefined) {
								Logging.error(`[pollAutoSellBuy] autosell: chain ${as.chain}, token ${as.token}, price ${as.priceStamp} cancelled`)
								await AutoSellTokenModel.findByIdAndDelete(as._id)
								continue
							}

							if (tokenPrice && BN(tokenPrice).gt(0)) {
								const lv = convertValue(as.priceStamp, as.lowPriceLimit, BN);
								const hv = convertValue(as.priceStamp, as.highPriceLimit, BN);

								const lowLimitedPrice = BN(as.lowPriceLimit).eq(BN(lv)) ? lv : BN(as.priceStamp).plus(BN(lv)).toString()
								const highLimitedPrice = BN(as.highPriceLimit).eq(BN(hv)) ? hv : BN(as.priceStamp).plus(BN(hv)).toString()

								if (true === BN(tokenPrice).lte(BN(lowLimitedPrice))) {
									commitAutoSell(tokenPrice, as, true);
								} else if (true === BN(tokenPrice).gte(BN(highLimitedPrice))) {
									commitAutoSell(tokenPrice, as, false);
								}
							}
						} catch (err) {
							console.error(`==> ${new Date().toLocaleString()}`)
							console.error(err)
							Logging.error('[pollAutoSellBuy] autosell ' + as.token + ':' + chain.name + ' --> ' + err);
							await AutoSellTokenModel.findByIdAndDelete(as._id)
						}
					}

					for (const ab of autoBuyRecords) {
						try {
							const abUser: any = await ab.populate('user')
							let tokenPrice = tokenPriceTree[ab.token]

							if (BN(ab.priceStamp).eq(BN(0)) || ab.priceLimit === undefined) {
								Logging.error(`[pollAutoSellBuy] autobuy: chain ${ab.chain}, token ${ab.token}, price ${ab.priceStamp} cancelled`)
								await AutoBuyTokenModel.findByIdAndDelete(ab._id)
								continue
							}

							if (tokenPrice && BN(tokenPrice).gt(0)) {
								const lv = convertValue(ab.priceStamp, ab.priceLimit, BN);
								const lowLimitedPrice = BN(ab.priceLimit).eq(BN(lv)) ? lv : BN(ab.priceStamp).plus(BN(lv)).toString()

								if (true === BN(tokenPrice).lte(BN(lowLimitedPrice))) {
									commitAutoBuy(tokenPrice, ab);
								}
							}
						} catch (err) {
							console.error(`==> ${new Date().toLocaleString()}`)
							console.error(err)
							Logging.error('[pollAutoSellBuy] autosell ' + ab.token + ':' + chain.name + ' --> ' + err);
							await AutoBuyTokenModel.findByIdAndDelete(ab._id)
						}
					}
				} catch (err) {
					console.error(`[pollAutoSellBuy] ==> ${new Date().toLocaleString()}`)
					console.error(err)
				}
			}
		}

		Logging.info(`[pollAutoSellBuy] ${((new Date()).getTime() - tick) / 1000} elapsed`)
		await sleep(1000)
	}
}
