import { BridgeModel } from "../models/bridge.model.js";
import { convertValue, sleep } from "../utils/common.js";
import Logging from "../utils/logging.js";
import { getEvmETHBalance, transferEvmETH } from "../web3/evm.web3.operation.js";
import { userETHBalance } from "../web3/nativecurrency/nativecurrency.query.js";
import { transferETH } from "../web3/nativecurrency/nativecurrency.transaction.js";
import { getBN } from "../web3/web3.operation.js";
import { getAppUser } from "./app.user.service.js";
import { checkDepositedTransaction, createBridgeOrder, fetchDepositAddress, finalizeBridge, getOrderStatus, getWithdrawStatus } from "./cex/binance.js";
import { getEvmWallet } from "./evm.wallet.service.js";

export async function registerBridgeSOL2ETH(telegramId: string, solAmount: string, to: string) {
	const user = await getAppUser(telegramId)
	const solBal = await userETHBalance(telegramId, 'solana')
	const BN = getBN()

	const bal = convertValue(solBal, solAmount, BN)
	if (BN(bal).lte(BN('0.45'))) {
		throw new Error(`⚠️ Minimum deposit <b>SOL amount</b> is more than <code>0.45</code> <b>SOL</b>`)
	}

	const newBridge = new BridgeModel({
		user: user._id,
		fromCurrency: 'SOL',
		toCurrency: 'ETH',
		tradePair: 'SOL/ETH',
		amount: bal,
		to: to,
		state: 'pending'
	})

	await newBridge.save()

	return newBridge._id.toString()
}

export async function registerBridgeETH2SOL(telegramId: string, ethAmount: string, to: string) {
	const user = await getAppUser(telegramId)
	const w = await getEvmWallet(telegramId)
	const ethBal = await getEvmETHBalance(w.address)
	const BN = getBN()

	const bal = convertValue(ethBal, ethAmount, BN)
	if (BN(bal).lte(BN('0.01'))) {
		throw new Error(`⚠️ Minimum deposit <b>ETH amount</b> is more than <code>0.011</code> <b>ETH</b>`)
	}

	const newBridge = new BridgeModel({
		user: user._id,
		fromCurrency: 'ETH',
		toCurrency: 'SOL',
		tradePair: 'SOL/ETH',
		amount: bal,
		to: to,
		state: 'pending'
	})

	await newBridge.save()

	return newBridge._id.toString()
}

export async function processBridgeSOL2ETH(processingId: string) {
	while (true) {
		const bridgeItem: any = await BridgeModel.findById(processingId)
		await bridgeItem.populate('user')
		const telegramId = bridgeItem.user.telegramId

		const BN = getBN()
		if (bridgeItem.state === 'pending') {
			try {
				const depositAddress = await fetchDepositAddress(bridgeItem.fromCurrency)
				const tx = await transferETH(telegramId, 'solana', depositAddress, BN(bridgeItem.amount).times(BN('1e9')).integerValue().toString())
				bridgeItem.depositTransaction = tx.transactionHash
				bridgeItem.depositResult = 'pending'
				bridgeItem.state = 'depositing'
			} catch (err) {
				console.error(err)
				bridgeItem.depositError = err.message
				bridgeItem.state = 'error'
			}
			await bridgeItem.save()
		} else if (bridgeItem.state === 'depositing') {
			while (true) {
				try {
					const res = await checkDepositedTransaction(bridgeItem.fromCurrency, bridgeItem.depositTransaction, bridgeItem.amount)
					if (res !== 'pending') {
						bridgeItem.depositResult = res
						await bridgeItem.save()
						break
					}
				} catch (err) {
					console.error(err)
				}
				await sleep(5000)
			}

			if (bridgeItem.depositResult === 'ok' || bridgeItem.depositResult === 'affordable') {
				bridgeItem.state = 'bridging'
			} else {
				bridgeItem.state = 'error'
				bridgeItem.depositError = 'Binance error'
			}
			await bridgeItem.save()
		} else if (bridgeItem.state === 'bridging') {
			if (!bridgeItem.orderId) {
				const orderId = await createBridgeOrder('SOL/ETH', 'sell', BN(bridgeItem.amount).times('0.99').toString()) // bridge fee here
				if (orderId) {
					bridgeItem.orderId = orderId
				} else {
					bridgeItem.state = 'error'
					bridgeItem.orderError = 'Failed to bridge: Please check your bridge amount'
				}
				await bridgeItem.save()
			} else {
				const ret = await getOrderStatus(bridgeItem.orderId, 'SOL/ETH', 'sell')
				if (true === ret.status) {
					if (ret.error) {
						bridgeItem.orderError = ret.error
						bridgeItem.state = 'error'
					} else {
						bridgeItem.state = 'withdrawing'
						bridgeItem.withdrawAmount = BN(ret.amount).toFixed(6).toString()
					}
					await bridgeItem.save()
				}
			}
		} else if (bridgeItem.state === 'withdrawing') {
			if (!bridgeItem.withdrawId) {
				const withdrawId = await finalizeBridge('ETH', bridgeItem.to, bridgeItem.withdrawAmount, 'ERC20')
				if (withdrawId) {
					bridgeItem.withdrawId = withdrawId
				} else {
					bridgeItem.state = 'error'
					bridgeItem.withdrawError = 'Failed to withdraw: Please consider minimum withdraw amount'
				}
				await bridgeItem.save()
			} else {
				const ret = await getWithdrawStatus(bridgeItem.withdrawId, 'ETH')
				if (true === ret.status) {
					if (ret.error) {
						bridgeItem.withdrawError = ret.error
						bridgeItem.state = 'error'
					} else {
						bridgeItem.withdrawTransaction = ret.transaction
						bridgeItem.state = 'finished'
					}
					await bridgeItem.save()
				}
			}
		}

		if (bridgeItem.state === 'error' || bridgeItem.state === 'finished') {
			break
		}
		await sleep(3000)
	}
}


export async function processBridgeETH2SOL(processingId: string) {
	while (true) {
		const bridgeItem: any = await BridgeModel.findById(processingId)
		await bridgeItem.populate('user')
		const telegramId = bridgeItem.user.telegramId

		const BN = getBN()
		if (bridgeItem.state === 'pending') {
			try {
				const depositAddress = await fetchDepositAddress(bridgeItem.fromCurrency)
				const tx = await transferEvmETH(telegramId, depositAddress, BN(bridgeItem.amount).times(BN('1e18')).integerValue().toString())
				bridgeItem.depositTransaction = tx
				bridgeItem.depositResult = 'pending'
				bridgeItem.state = 'depositing'
			} catch (err) {
				console.error(err)
				bridgeItem.depositError = err.message
				bridgeItem.state = 'error'
			}
			await bridgeItem.save()
		} else if (bridgeItem.state === 'depositing') {
			while (true) {
				try {
					const res = await checkDepositedTransaction(bridgeItem.fromCurrency, bridgeItem.depositTransaction, bridgeItem.amount)
					if (res !== 'pending') {
						bridgeItem.depositResult = res
						await bridgeItem.save()
						break
					}
				} catch (err) {
					console.error(err)
				}
				await sleep(5000)
			}

			if (bridgeItem.depositResult === 'ok' || bridgeItem.depositResult === 'affordable') {
				bridgeItem.state = 'bridging'
			} else {
				bridgeItem.state = 'error'
				bridgeItem.depositError = 'Binance error'
			}
			await bridgeItem.save()
		} else if (bridgeItem.state === 'bridging') {
			if (!bridgeItem.orderId) {
				const orderId = await createBridgeOrder('SOL/ETH', 'buy', BN(bridgeItem.amount).times('0.99').toString()) // bridge fee here
				if (orderId) {
					bridgeItem.orderId = orderId
				} else {
					bridgeItem.state = 'error'
					bridgeItem.orderError = 'Failed to bridge: Please check your bridge amount'
				}
				await bridgeItem.save()
			} else {
				const ret = await getOrderStatus(bridgeItem.orderId, 'SOL/ETH', 'buy')
				if (true === ret.status) {
					if (ret.error) {
						bridgeItem.orderError = ret.error
						bridgeItem.state = 'error'
					} else {
						bridgeItem.state = 'withdrawing'
						bridgeItem.withdrawAmount = BN(ret.amount).toFixed(6).toString()
					}
					await bridgeItem.save()
				}
			}
		} else if (bridgeItem.state === 'withdrawing') {
			if (!bridgeItem.withdrawId) {
				const withdrawId = await finalizeBridge('SOL', bridgeItem.to, bridgeItem.withdrawAmount)
				if (withdrawId) {
					bridgeItem.withdrawId = withdrawId
				} else {
					bridgeItem.state = 'error'
					bridgeItem.withdrawError = 'Failed to withdraw: Please consider minimum withdraw amount'
				}
				await bridgeItem.save()
			} else {
				const ret = await getWithdrawStatus(bridgeItem.withdrawId, 'SOL')
				if (true === ret.status) {
					if (ret.error) {
						bridgeItem.withdrawError = ret.error
						bridgeItem.state = 'error'
					} else {
						bridgeItem.withdrawTransaction = ret.transaction
						bridgeItem.state = 'finished'
					}
					await bridgeItem.save()
				}
			}
		}

		if (bridgeItem.state === 'error' || bridgeItem.state === 'finished') {
			break
		}
		await sleep(3000)
	}
}

export async function pushUnfinishedBridges() {
	const bridges = await BridgeModel.find({
		$and: [
			{ state: { $ne: 'error' } },
			{ state: { $ne: 'finished' } },
		]
	})

	if (bridges.length > 0) {
		await sleep(2000)
		Logging.info(`Pushing unfinished ${bridges.length} bridges`)
		await Promise.all(bridges.map(b => b.fromCurrency === 'SOL'? processBridgeSOL2ETH(b._id.toString()): processBridgeETH2SOL(b._id.toString())))
	}
}
