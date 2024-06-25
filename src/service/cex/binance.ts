import { getBN } from "../../web3/web3.operation.js"
import ccxt from 'ccxt'

const binanceCEXInst = new ccxt.binance({
	apiKey: process.env.BINANCE_API_KEY,
	secret: process.env.BINANCE_SECRET,
})

export async function fetchDepositAddress(currency: string) {
	const ret = await binanceCEXInst.fetchDepositAddress(currency)
	return ret.address
}

export async function checkDepositedTransaction(currency: string, transaction: string, amount: string) {
	const BN = getBN()
	const keepingBalance = await getAvailableBalance(currency)
	if (BN(keepingBalance).gte(BN(amount))) return 'affordable'

	const depositHistory = await binanceCEXInst.fetchDeposits(currency)
	const f = depositHistory.find(d => d.txid === transaction)
	if (!f) return 'pending'

	return f.status // 'pending', 'ok', 'failed', 'canceled'
}

export async function createBridgeOrder(tradePair: string, side: string, amount: string) {
	try {
		const BN = getBN()
		const tickerInfo = await binanceCEXInst.fetchTicker(tradePair)
		const price = side === 'buy'? tickerInfo.ask: tickerInfo.bid
		const baseCurrencyAmount = side === 'buy'? BN(amount).div(price).toFixed(6).toString(): BN(amount).toFixed(6).toString()
		const order = await binanceCEXInst.createOrder(tradePair, 'limit', side, baseCurrencyAmount, price)
		return order.id
	} catch (err) {
		console.error(err)
	}
}

export async function getOrderStatus(orderId: string, tradePair: string, side: string) {
	try {
		const BN = getBN()
		const orderInfo = await binanceCEXInst.fetchOrder(orderId, tradePair)
		return {
			status: orderInfo.status !== 'open',
			error: orderInfo.status === 'closed'? undefined: 'Partially filled',
			amount: side === 'buy'? BN(orderInfo.filled).times('0.999').toString() : BN(orderInfo.filled).times(BN(orderInfo.price)).times('0.999').toString()
		}
	} catch (err) {
		console.error(err)
	}
}

export async function finalizeBridge(toCurrency: string, toAddress: string, amount: string, network?: string) {
	try {
		const withdrawInfo = await binanceCEXInst.withdraw(toCurrency, amount, toAddress, undefined, { 'network': network}) // 'SOL'
		return withdrawInfo.id
	} catch (err) {
		console.error(err)
	}
}

export async function getWithdrawStatus(withdrawId: string, currency: string) {
	try {
		const withdrawals = await binanceCEXInst.fetchWithdrawals(currency)
		const withdrawInfo = withdrawals.find(w => w.id === withdrawId)
		return {
			status: withdrawInfo.status !== 'pending',
			error: withdrawInfo.status === 'ok'? undefined: 'Failed to withdraw',
			transaction: withdrawInfo.txid
		}
	} catch (err) {
		console.error(err)
	}
}

export async function getAvailableBalance(currency: string) {
	try {
		const bals = await binanceCEXInst.fetchBalance()
		return bals['free'][currency]
	} catch(err) {
		console.error(err)
	}
}
