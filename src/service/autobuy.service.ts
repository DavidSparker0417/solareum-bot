import { AutoBuyTokenModel } from '../models/auto.buy.token.js';
import { QuickAutoBuyModel } from '../models/quick.auto.buy.model.js';
import { TransactionHistoryModel } from '../models/transaction.history.model.js';
import { convertValue } from '../utils/common.js';
import Logging from '../utils/logging.js';
import { getErrorMessageResponse } from '../utils/messages.js';
import { chainConfig } from '../web3/chain.config.js';
import { getNativeCurrencyDecimal } from '../web3/chain.parameters.js';
import { swapETHForToken } from '../web3/dex.interaction.js';
import { getETHBalance, userETHBalance } from '../web3/nativecurrency/nativecurrency.query.js';
import { getBN } from '../web3/web3.operation.js';
import { sendBotMessage } from './app.service.js';
import { getAppUser, userVerboseLog } from './app.user.service.js';
import { processError } from './error.js';
import { getSettings } from './settings.service.js';
import { getMultiWallets, getWallet } from './wallet.service.js';

export async function isTokenAutoBuySet(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);
	const sell = await AutoBuyTokenModel.findOne({ user: user._id, chain: chain, token: token, state: 'pending' });
	return sell !== null;
}

export async function removeTokenAutoBuy(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);
	await AutoBuyTokenModel.deleteOne({ user: user._id, chain: chain, token: token, state: 'pending' });
}

export async function addTokenAutoBuy(telegramId: string, chain: string, token: string, price: string) {
	const user = await getAppUser(telegramId);
	if (0 === (await AutoBuyTokenModel.countDocuments({ user: user._id, chain: chain, token: token, state: 'pending' }))) {
		const newAutoBuyToken = new AutoBuyTokenModel({
			user: user._id,
			chain: chain,
			token: token,
			state: 'pending',
			priceStamp: price,
			priceLimit: '-50%',
			amountAtLimit: '0.1',
		});

		await newAutoBuyToken.save();
	}
}

export async function updateTokenAutoBuyContext(telegramId: string, chain: string, token: string, updateContext: any) {
	const user = await getAppUser(telegramId);

	const itemToUpdate = await AutoBuyTokenModel.findOne({ user: user._id, chain: chain, token: token, state: 'pending' });

	if (itemToUpdate === null) {
		throw new Error(`Not enabled auto buy\n<code>${token}</code>`);
	}

	for (const ch in updateContext) {
		itemToUpdate[ch] = updateContext[ch];
	}

	await itemToUpdate.save();
}

export async function getTokenAutoBuyContext(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);

	return await AutoBuyTokenModel.findOne({ user: user._id, chain: chain, token: token, state: 'pending' });
}

export async function getAutoBuyContexts(telegramId: string, chain: string) {
	const user = await getAppUser(telegramId);

	return await AutoBuyTokenModel.find({ user: user._id, chain: chain, state: 'pending' });
}

export async function commitAutoBuy(currentPrice: string, context: any) {
	let telegramId
	try {
		context.state = 'processing'
		await context.save()

		const c = await context.populate('user');
		telegramId = c.user.telegramId

		const BN = getBN()
		const setting = await getSettings(telegramId, c.chain)

		let wallets = [await getWallet(telegramId)]

		if (setting.multiWallet === true) {
			try {
				wallets = [...wallets, ...(await getMultiWallets(telegramId))]
			} catch { }
		}

		await Promise.all(wallets.map(async (w, idx) => {
			try {
				const t = await getETHBalance(telegramId, c.chain, w.address)
				const nativeDecimal = await getNativeCurrencyDecimal(c.chain)

				if (BN(t).eq(BN(0)) || c.amountAtLimit === undefined) {
					return
				}

				let amount = convertValue(t, c.amountAtLimit, BN);

				let tr = null;

				try {
					if (BN(amount).gt(BN(0))) {
						const receipt = await swapETHForToken(
							telegramId,
							c.chain,
							{
								token: c.token,
							},
							{
								address: w,
								value: BN(amount).times(BN(`1e${nativeDecimal}`)).integerValue().toString()
							}
						);
						tr = await TransactionHistoryModel.findOne({ transactionHash: receipt.transactionHash });
					}
				} catch (err) {
					console.error(err);
				}

				if (idx === 0) {
					c.priceCommitted = currentPrice
					c.state = 'completed';
					if (tr !== null) c.transaction = tr._id;
					await c.save()
				}
			} catch (err) {
				console.error(`[commitAutoBuy] ${w.address} ==> ${new Date().toLocaleString()}`)
				console.error(err)
				Logging.error(`[commitAutoBuy] ${err.message}`);
				const errMsg = await getErrorMessageResponse(telegramId, err.message);
				if (errMsg !== null) {
					await sendBotMessage(telegramId, errMsg)
					if (idx === 0) {
						await AutoBuyTokenModel.findByIdAndDelete(context._id)
					}
				}
			}
		}))
	} catch (err) {
		console.error(`[commitAutoBuy] ==> ${new Date().toLocaleString()}`)
		console.error(err)
		Logging.error(`[commitAutoBuy] ${err.message}`);
		const errMsg = await getErrorMessageResponse(telegramId, err.message);
		if (errMsg !== null) {
			await sendBotMessage(telegramId, errMsg)
			await AutoBuyTokenModel.findByIdAndDelete(context._id)
		}
	}
}

export async function updateQuickAutoBuyParam(telegramId: string, chain: string, info: any) {
	const user = await getAppUser(telegramId);

	let itemToUpdate = await QuickAutoBuyModel.findOne({ user: user._id, chain: chain });

	if (itemToUpdate === null) {
		itemToUpdate = new QuickAutoBuyModel({
			user: user._id,
			chain: chain,
			amount: '50%'
		});

		await itemToUpdate.save();
	}

	itemToUpdate = await QuickAutoBuyModel.findOne({ user: user._id, chain: chain });
	for (const ch in info) {
		itemToUpdate[ch] = info[ch];
	}

	await itemToUpdate.save();
}

export async function getQuickAutoBuyContext(telegramId: string, chain: string) {
	const user = await getAppUser(telegramId);

	const item = await QuickAutoBuyModel.findOne({ user: user._id, chain: chain });
	if (item !== null) return item;

	const t = new QuickAutoBuyModel({
		user: user._id,
		chain: chain,
		amount: '50%'
	});

	await t.save();

	return t;
}

export async function processQuickAutoBuy(ctx: any, telegramId: string, chain: string, tokenAddress: string) {
	try {
		const BN = getBN()
		const user = await getAppUser(telegramId);
		const nativeDecimals = chainConfig[chain].nativeCurrency.decimals

		const item = await QuickAutoBuyModel.findOne({ user: user._id, chain: chain, enabled: true });
		if (item !== null) {
			await userVerboseLog(telegramId, `processing quick auto buy for token ${tokenAddress} on [${chain}]`);

			let wallets = [await getWallet(telegramId)]
			if (item.multi === true) {
				try {
					wallets = [...wallets, ...(await getMultiWallets(telegramId))]
				} catch { }
			}

			return await Promise.all(wallets.map(async w => {
				const bal = await getETHBalance(telegramId, chain, w.address)
				const amn = convertValue(bal, item.amount || '50%', BN)
				return await swapETHForToken(telegramId, chain,
					{
						token: tokenAddress,
						slippage: item.slippage,
						recipient: w.address
					},
					{
						address: w,
						value: BN(amn).times(BN(`1e${nativeDecimals}`)).integerValue().toString()
					});
			}))
		}
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
}

export async function clearAllAutobuys(telegramId: string) {
	const user = await getAppUser(telegramId)
	await AutoBuyTokenModel.deleteMany({ user: user._id })
}
