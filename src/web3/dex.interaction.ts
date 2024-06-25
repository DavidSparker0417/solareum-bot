import { WSOL_ADDRESS, getBN, newSolWeb3, sendTxnAdvanced } from './web3.operation.js';
import { getNativeCurrencyDecimal, getNativeCurrencyPrice, getNativeCurrencySymbol } from './chain.parameters.js';
import { getMultiWallets, getWallet } from '../service/wallet.service.js';
import { getTxCallback } from '../service/transaction.backup.service.js';
import { getTokenInfo, getTokenPrice } from '../service/token.service.js';
import { externalInvokeMonitor } from '../commands/monitor.js';
import { getAppUser } from '../service/app.user.service.js';
import { getSettings } from '../service/settings.service.js';
import { updateBuyMonitorInfo, updateSellMonitorInfo } from '../service/monitor.service.js';
import { updateUserState } from '../service/stat.service.js';
import { getETHBalance } from './nativecurrency/nativecurrency.query.js';
import { APE_MAX_NOT_FOUND, MAX_TX_NOT_FOUND, NOT_ENOUGH_BALANCE, TOO_MUCH_REQUESTED, convertValue } from '../utils/common.js';
import { getTokenBalance } from './multicall.js';
import { createTradeTransaction } from '../service/trade.service.js';
import { sendBotMessage } from '../service/app.service.js';
import { getBuyTransaction, getBuyTransactionExactOut, getSellTransaction, getSellTransactionExactOut } from './dex/jupiter/api.js';
import { buildSwapTokenRaydiumExactInTransaction2 } from './dex/raydium/trade.js';
import Logging from '../utils/logging.js';
import { postPnLCard } from '../service/plcard.service.js';

export async function swapETHForToken(telegramId: string, chain: string, swapParams: any, sendParams: any, customLabel?: string) {
	const tokenInfo = await getTokenInfo(chain, swapParams.token)
	const tokenPrice = await getTokenPrice(chain, swapParams.token)

	const BN = getBN();
	const nativeDecimals = await getNativeCurrencyDecimal(chain);
	const nativeSymbol = await getNativeCurrencySymbol(chain);
	const userSetting = await getSettings(telegramId, chain)

	let w = sendParams.address
	if (!w) {
		w = await getWallet(telegramId)
	}

	const tokenAmountToBuy = parseFloat(BN(sendParams.value).div(BN(`1e${nativeDecimals}`)).toFixed(4))
	const label = customLabel ? customLabel : `⚡️<b>${chain.slice(0, 3).toUpperCase()}</b>\nBuying <b>${tokenInfo.symbol}</b> at <code>${BN(tokenInfo.totalSupply).times(BN(tokenPrice)).toFixed(2)}</code>$ MC with <code>${tokenAmountToBuy}</code> <b>${nativeSymbol}</b>`;

	const callback = getTxCallback(label);
	const swapSlippage = swapParams.slippage || userSetting.slippage

	let tx
	try {
		const txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenInfo.address, parseFloat(BN(sendParams.value).div(BN('1e9')).toString()), 'buy', w, swapSlippage)
		tx = await sendTxnAdvanced(telegramId, chain, {
			...txnInfo,
			address: w
		}, {
			callback
		});
	} catch (err) {
		throw new Error(`swapETHForToken ==> Raydium swap error`)
		// Logging.error(`swapETHForToken ==> Raydium swap error`)
		// const configuredTx = await getBuyTransaction(tokenInfo.address, sendParams.value, w, parseInt(await getSolPriorityFeeByPreset(userSetting.gasPreset)), swapSlippage)

		// tx = await sendTxnAdvanced(telegramId, chain, {
		// 	transaction: configuredTx.transaction,
		// 	address: w
		// }, {
		// 	callback
		// });
	}

	if (tx?.transactionHash) {
		const tradeTx = await createTradeTransaction(telegramId, chain, tx?.transactionHash, tokenInfo.address, w.address)

		const positiveSolAmount = BN(tradeTx.solAmount).lt(0) ? BN(0).minus(BN(tradeTx.solAmount)) : BN(tradeTx.solAmount) // BN(sendParams.value).div(BN('1e9'))
		const positiveTokenAmount = BN(tradeTx.tokenAmount).lt(0) ? BN(0).minus(BN(tradeTx.tokenAmount)) : BN(tradeTx.tokenAmount)

		await updateUserState(telegramId, chain, 0, undefined, positiveSolAmount.times(BN('1e9')).integerValue().toString())
		await updateBuyMonitorInfo(chain, tokenInfo.address, w.address, positiveTokenAmount.times(BN(`1e${tokenInfo.decimals}`)).integerValue().toString(), positiveSolAmount.times(BN('1e9')).integerValue().toString()) // '0' should be substituted by token amount

		await sendBotMessage(telegramId, `✅ You have bought <code>${positiveTokenAmount.toString()}</code> <b>${tokenInfo.symbol}</b> by <code>${positiveSolAmount.toString()}</code> <b>${nativeSymbol}</b>.`)

		const user = await getAppUser(telegramId)
		await externalInvokeMonitor(telegramId, user.chatId, chain, tokenInfo.address)
	}

	return tx
}

export async function swapTokenForETH(telegramId: string, chain: string, swapParams: any, sendParams: any, customLabel?: string) {
	const user = await getAppUser(telegramId)

	const tokenInfo = await getTokenInfo(chain, swapParams.token);
	const tokenPrice = await getTokenPrice(chain, swapParams.token)

	const BN = getBN();
	const nativeDecimals = await getNativeCurrencyDecimal(chain);
	const nativeSymbol = await getNativeCurrencySymbol(chain)
	const userSetting = await getSettings(telegramId, chain)

	let w = sendParams.address
	if (!w) {
		w = await getWallet(telegramId)
	}

	const tokenAmountToSell = BN(swapParams.amount).div(BN(`1e${tokenInfo.decimals}`)).toFixed(4)
	const label = customLabel ? customLabel : `⚡️<b>${chain.slice(0, 3).toUpperCase()}</b>\nSelling <code>${tokenAmountToSell}</code> <b>${tokenInfo.symbol}</b> at <b>${BN(tokenInfo.totalSupply).times(BN(tokenPrice)).toFixed(2)}$ MC</b> to <b>${nativeSymbol}</b>`;
	const successLabel = `\nSuccessfully sold <code>${parseFloat(BN(swapParams.amount).div(BN(`1e${tokenInfo.decimals}`)).toFixed(4))}</code> <b>${tokenInfo.symbol}</b> for <b>${nativeSymbol}</b>\n☑️Check your wallet!\n`

	const callback = getTxCallback(label, successLabel)

	const swapSlippage = swapParams.slippage || userSetting.slippage
	let tx

	try {
		const txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenInfo.address, parseFloat(BN(swapParams.amount).div(BN(`1e${tokenInfo.decimals}`)).toString()), 'sell', w, swapSlippage)
		tx = await sendTxnAdvanced(telegramId, chain, {
			...txnInfo,
			address: w
		}, {
			callback
		});
	} catch (err) {
		throw new Error(`swapTokenForETH ==> Raydium swap error`)
		// Logging.error(`swapTokenForETH ==> Raydium swap error`)

		// const configuredTx = await getSellTransaction(tokenInfo.address, swapParams.amount, w, parseInt(await getSolPriorityFeeByPreset(userSetting.gasPreset)), swapSlippage)

		// tx = await sendTxnAdvanced(telegramId, chain, {
		// 	transaction: configuredTx.transaction,
		// 	address: w
		// }, {
		// 	callback
		// });
	}

	if (tx?.transactionHash) {
		const tradeTx = await createTradeTransaction(telegramId, chain, tx?.transactionHash, tokenInfo.address, w.address)

		const positiveSolAmount = BN(tradeTx.solAmount).lt(0) ? BN(0).minus(BN(tradeTx.solAmount)) : BN(tradeTx.solAmount)
		const positiveTokenAmount = BN(tradeTx.tokenAmount).lt(0) ? BN(0).minus(BN(tradeTx.tokenAmount)) : BN(tradeTx.tokenAmount)

		await sendBotMessage(telegramId, `✅ You have sold <code>${positiveTokenAmount.toString()}</code> <b>${tokenInfo.symbol}</b> for <code>${positiveSolAmount.toString()}</code> <b>${nativeSymbol}</b>`)
		await updateUserState(telegramId, chain, 0, positiveSolAmount.times(BN('1e9')).integerValue().toString(), undefined)
		await updateSellMonitorInfo(chain, tokenInfo.address, w.address, positiveTokenAmount.times(BN(`1e${tokenInfo.decimals}`)).integerValue().toString(), positiveSolAmount.times(BN('1e9')).integerValue().toString())

		const tokenBal = await getTokenBalance(chain, tokenInfo.address, w.address)
		if (BN(tokenBal.balance).gt(0)) {
			await externalInvokeMonitor(telegramId, user.chatId, chain, tokenInfo.address)
		}
		await postPnLCard(telegramId, chain, tokenInfo.address)
	}

	return tx
}


export async function userSwapETHForTokens(telegramId: string, chain: string, tokenAddress: string, amount: string) {
	const BN = getBN();
	const setting = await getSettings(telegramId, chain)

	let wallets = [await getWallet(telegramId)]

	if (setting.multiWallet === true) {
		try {
			wallets = [...wallets, ...(await getMultiWallets(telegramId))]
		} catch { }
	}

	const decimals = await getNativeCurrencyDecimal(chain);
	const ethSymbol = await getNativeCurrencySymbol(chain);

	return await Promise.all(wallets.map(async w => {
		const bal = await getETHBalance(telegramId, chain, w.address);

		let amn = convertValue(bal, amount, BN)

		if (BN(bal).lt(BN(amn))) {
			await sendBotMessage(telegramId, NOT_ENOUGH_BALANCE + `\n<code>${w.address}</code> has <b>${parseFloat(BN(bal).toFixed(6))} ${ethSymbol}</b>`);
			return
		}

		return await swapETHForToken(telegramId, chain,
			{
				token: tokenAddress,
				// slippage: undefined,
				recipient: w.address
			},
			{
				address: w,
				value: BN(amn).times(BN(`1e${decimals}`)).integerValue().toString()
			});
	}))
}

export async function userSwapETHForTokensByTokenAmount(telegramId: string, chain: string, tokenAddress: string, amount: string, customLabel?: string) {
	const w = await getWallet(telegramId);
	const userSetting = await getSettings(telegramId, chain)

	const BN = getBN();
	const tokenInfo = await getTokenInfo(chain, tokenAddress)
	const tokenPrice = await getTokenPrice(chain, tokenAddress)

	const amountWithoutDecimals = BN(amount).times(BN(`1e${tokenInfo.decimals}`)).integerValue().toString()

	const label = customLabel ? customLabel : `⚡️<b>${chain.slice(0, 3).toUpperCase()}</b>\nBuying <b>${tokenInfo.symbol}</b> at <code>${BN(tokenInfo.totalSupply).times(BN(tokenPrice)).toFixed(2)}</code>$ MC for <code>${amount}<code> <b>${tokenInfo.symbol}</b>`;

	const callback = getTxCallback(label);

	let tx
	try {
		const price = await getTokenPrice(chain, tokenInfo.address)
		const nativePrice = await getNativeCurrencyPrice(chain)
		const ethAmount = BN(amount).times(price).div(nativePrice).toString()
		const txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenInfo.address, parseFloat(ethAmount), 'buy', w, userSetting.slippage)
		tx = await sendTxnAdvanced(telegramId, chain, {
			...txnInfo,
			address: w
		}, {
			callback
		});
	} catch (err) {
		throw new Error('userSwapETHForTokensByTokenAmount ==> Raydium swap error')
		// Logging.error(`userSwapETHForTokensByTokenAmount ==> Raydium swap error`)
		// // console.error(err)
		// const configuredTx = await getBuyTransactionExactOut(tokenAddress, amountWithoutDecimals, w, parseInt(await getSolPriorityFeeByPreset(userSetting.gasPreset)), userSetting.slippage)

		// tx = await sendTxnAdvanced(telegramId, chain, {
		// 	transaction: configuredTx.transaction,
		// 	address: w
		// }, {
		// 	callback
		// });
	}

	if (tx?.transactionHash) {
		const nativeSymbol = await getNativeCurrencySymbol(chain)
		const tradeTx = await createTradeTransaction(telegramId, chain, tx?.transactionHash, tokenAddress, w.address)

		const positiveSolAmount = BN(tradeTx.solAmount).lt(0) ? BN(0).minus(BN(tradeTx.solAmount)) : BN(tradeTx.solAmount)
		const positiveTokenAmount = BN(tradeTx.tokenAmount).lt(0) ? BN(0).minus(BN(tradeTx.tokenAmount)) : BN(tradeTx.tokenAmount)

		await sendBotMessage(telegramId, `✅ You have bought <code>${positiveTokenAmount.toString()}</code> <b>${tokenInfo.symbol}</b> by <code>${positiveSolAmount}</code> <b>${nativeSymbol}</b>.`)

		await updateUserState(telegramId, chain, 0, undefined, positiveSolAmount.times(BN('1e9')).integerValue().toString())
		await updateBuyMonitorInfo(chain, tokenAddress, w.address, positiveTokenAmount.times(BN(`1e${tokenInfo.decimals}`)).integerValue().toString(), positiveSolAmount.times(BN(`1e9`)).integerValue().toString())

		const user = await getAppUser(telegramId)
		await externalInvokeMonitor(telegramId, user.chatId, chain, tokenAddress)
	}

	return tx
}

export async function userSwapTokenForETHByETHAmount(telegramId: string, chain: string, tokenAddress: string, amount: string, customLabel?: string) {
	const w = await getWallet(telegramId);
	const userSetting = await getSettings(telegramId, chain)
	const nativeSymbol = await getNativeCurrencySymbol(chain)

	const BN = getBN();
	const tokenInfo = await getTokenInfo(chain, tokenAddress)
	const tokenPrice = await getTokenPrice(chain, tokenAddress)

	const amountWithoutDecimals = BN(amount).times(BN(`1e9`)).integerValue().toString()

	const label = customLabel ? customLabel : `⚡️<b>${chain.slice(0, 3).toUpperCase()}</b>\nSelling <b>${tokenInfo.symbol}</b> at <code>${BN(tokenInfo.totalSupply).times(BN(tokenPrice)).toFixed(2)}</code>$ MC for <code>${amount}</code> <b>${nativeSymbol}</b>`;
	const successLabel = `\nSuccessfully sold <b>${tokenInfo.symbol}</b> for <code>${amount}</code> <b>${nativeSymbol}</b>\n☑️Check your wallet!\n`

	const callback = getTxCallback(label, successLabel)

	let tx
	try {
		const price = await getTokenPrice(chain, tokenInfo.address)
		const nativePrice = await getNativeCurrencyPrice(chain)
		const tokenAmount = BN(amount).times(nativePrice).div(price).toString()
		const txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenInfo.address, parseFloat(tokenAmount), 'sell', w, userSetting.slippage)

		tx = await sendTxnAdvanced(telegramId, chain, {
			...txnInfo,
			address: w
		}, {
			callback
		});
	} catch (err) {
		throw new Error(`userSwapTokenForETHByETHAmount ==> Raydium swap error`)
		// Logging.error(`userSwapTokenForETHByETHAmount ==> Raydium swap error`)
		// // console.error(err)
		// const configuredTx = await getSellTransactionExactOut(tokenAddress, amountWithoutDecimals, w, parseInt(await getSolPriorityFeeByPreset(userSetting.gasPreset)), userSetting.slippage)

		// tx = await sendTxnAdvanced(telegramId, chain, {
		// 	transaction: configuredTx.transaction,
		// 	address: w
		// }, {
		// 	callback
		// });
	}

	if (tx?.transactionHash) {
		const tradeTx = await createTradeTransaction(telegramId, chain, tx?.transactionHash, tokenAddress, w.address)

		const positiveSolAmount = BN(tradeTx.solAmount).lt(0) ? BN(0).minus(BN(tradeTx.solAmount)) : BN(tradeTx.solAmount)
		const positiveTokenAmount = BN(tradeTx.tokenAmount).lt(0) ? BN(0).minus(BN(tradeTx.tokenAmount)) : BN(tradeTx.tokenAmount)

		await sendBotMessage(telegramId, `✅ You have sold <code>${positiveTokenAmount.toString()}</code> <b>${tokenInfo.symbol}</b> for <code>${positiveSolAmount.toString()}</code> <b>${nativeSymbol}</b>`)

		await updateUserState(telegramId, chain, 0, positiveSolAmount.times(BN('1e9')).integerValue().toString(), undefined)
		await updateSellMonitorInfo(chain, tokenAddress, w.address, positiveTokenAmount.times(BN(`1e${tokenInfo.decimals}`)).integerValue().toString(), amountWithoutDecimals)

		const user = await getAppUser(telegramId)
		const tokenBal = await getTokenBalance(chain, tokenInfo.address, w.address)
		if (BN(tokenBal.balance).gt(0)) {
			await externalInvokeMonitor(telegramId, user.chatId, chain, tokenInfo.address)
		}
		await postPnLCard(telegramId, chain, tokenInfo.address)
	}

	return tx
}

export async function amountSwapTokenMaxTxForETH(telegramId: string, chain: string, tokenAddress: string, wallet: any) {
	const BN = getBN();

	const tokenInfo = await getTokenBalance(chain, tokenAddress, wallet.address);

	const connection = await newSolWeb3(telegramId, chain)
	const userSetting = await getSettings(telegramId, chain)

	let count = 0;
	let upperAmount = BN(tokenInfo.balance)
		.times(BN(`1e${tokenInfo.decimals}`))
		.integerValue();
	let lowerAmount = BN(0);
	let unitsConsumed

	// approve

	let availableAmount;

	while (count < 8) {
		if (count === 0) {
			availableAmount = BN(upperAmount);
		} else {
			availableAmount = upperAmount.plus(lowerAmount).div(2);
		}

		try {
			// try sell
			let txnInfo
			try {
				txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenInfo.address, parseFloat(BN(availableAmount).div(BN(`1e${tokenInfo.decimals}`)).toString()), 'sell', wallet)
			} catch (err) {
				// const configuredTx = await getSellTransaction(tokenAddress, availableAmount, wallet, priorityFee)
				// transaction = configuredTx.transaction
				throw new Error('[amountSwapTokenMaxTxForETH] Raydium swap error')
			}
			const res = await connection.simulateTransaction(txnInfo.transaction)
			if (res.value.err !== null) {
				throw new Error('transaction error')
			}
			unitsConsumed = res.value.unitsConsumed

			lowerAmount = availableAmount;
			if (lowerAmount.eq(upperAmount)) {
				break;
			}
		} catch (err) {
			upperAmount = availableAmount;
		}
		count++;
	}

	return lowerAmount;
}

export async function userSwapTokenMaxTxForETH(telegramId: string, chain: string, tokenAddress: string) {
	const setting = await getSettings(telegramId, chain)
	let wallets = [await getWallet(telegramId)]

	if (setting.multiWallet === true) {
		try {
			wallets = [...wallets, ...(await getMultiWallets(telegramId))]
		} catch { }
	}
	return await Promise.all(wallets.map(async w => {
		const amn = await amountSwapTokenMaxTxForETH(telegramId, chain, tokenAddress, w);

		if (amn === undefined || amn.integerValue().toString() === '0') {
			await sendBotMessage(telegramId, MAX_TX_NOT_FOUND + `\n<code>${w.address}</code>`);
			return
		}

		return await swapTokenForETH(telegramId, chain,
			{
				token: tokenAddress,
				amount: amn.integerValue().toString(),
				recipient: w.address,
				// slippage: undefined
			},
			{
				address: w
			});
	}))
}

export async function userSwapTokenForETH(telegramId: string, chain: string, tokenAddress: string, amount: string) {
	const setting = await getSettings(telegramId, chain)
	let wallets = [await getWallet(telegramId)]

	if (setting.multiWallet === true) {
		try {
			wallets = [...wallets, ...(await getMultiWallets(telegramId))]
		} catch { }
	}

	return await Promise.all(wallets.map(async w => {
		const tokenInfo: any = await getTokenBalance(chain, tokenAddress, w.address);
		const bal = tokenInfo.balance;
		const decimals = tokenInfo.decimals;
		const BN = getBN();
		const amn = convertValue(bal, amount, BN)

		if (BN(bal).lt(BN(amn))) {
			await sendBotMessage(telegramId, TOO_MUCH_REQUESTED + `\n<code>${w.address}</code> has <code>${parseFloat(BN(bal).toFixed(6))}</code> <b>${tokenInfo.symbol}</b>`);
			return
		}

		return await swapTokenForETH(telegramId, chain,
			{
				token: tokenAddress,
				recipient: w.address,
				amount: BN(amn).times(BN(`1e${decimals}`)).integerValue().toString()
			},
			{
				address: w,
			});
	}))
}

export async function amountSwapETHForTokenApeMax(telegramId: string, chain: string, tokenAddress: string, wallet: any) {
	const BN = getBN();

	const connection = await newSolWeb3(telegramId, chain)
	const userSetting = await getSettings(telegramId, chain)
	const myETHBal = BN(await getETHBalance(telegramId, chain, wallet.address)).times(BN('1e9')).integerValue().toString()

	let count = 0;
	let upperAmount = BN(myETHBal.toString());
	let lowerAmount = BN(0);

	let availableAmount;
	let unitsConsumed

	while (count < 8) {
		if (count === 0) {
			availableAmount = BN(upperAmount);
		} else {
			availableAmount = upperAmount.plus(lowerAmount).div(2);
		}

		try {
			// try buy
			let txnInfo
			try {
				txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenAddress, parseFloat(BN(availableAmount).div(BN('1e9')).toString()), 'buy', wallet)
			} catch (err) {
				throw new Error('[amountSwapETHForTokenApeMax] Raydium swap error')
				// const configuredTx = await getBuyTransaction(tokenAddress, availableAmount, wallet, priorityFee)
				// transaction = configuredTx.transaction
			}
			const res = await connection.simulateTransaction(txnInfo.transaction)
			if (res.value.err !== null) {
				throw new Error('transaction error')
			}
			unitsConsumed = res.value.unitsConsumed

			lowerAmount = availableAmount;
			if (lowerAmount.eq(upperAmount)) {
				break;
			}
		} catch (err) {
			upperAmount = availableAmount;
		}
		count++;
	}

	return lowerAmount
}

export async function userSwapETHForTokensApeMax(telegramId: string, chain: string, tokenAddress: string) {
	const setting = await getSettings(telegramId, chain)

	let wallets = [await getWallet(telegramId)]

	if (setting.multiWallet === true) {
		try {
			wallets = [...wallets, ...(await getMultiWallets(telegramId))]
		} catch { }
	}

	return Promise.all(wallets.map(async w => {
		const amn = await amountSwapETHForTokenApeMax(telegramId, chain, tokenAddress, w);

		if (amn === undefined || amn.integerValue().toString() === '0') {
			await sendBotMessage(telegramId, APE_MAX_NOT_FOUND + `\n<code>${w.address}</code>`);
			return
		}

		return await swapETHForToken(telegramId, chain,
			{
				token: tokenAddress,
				recipient: w.address,
				// slippage: undefined
			},
			{
				address: w,
				value: amn.integerValue().toString()
			}
		);
	}))
}
