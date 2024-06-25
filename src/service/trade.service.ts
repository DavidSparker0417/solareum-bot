import { getMinimumBalanceForRentExemptAccount } from "@solana/spl-token"
import { TradeTransactionModel } from "../models/trade.transaction.model.js"
import { TransactionHistoryModel } from "../models/transaction.history.model.js"
import { sleep } from "../utils/common.js"
import { getNativeCurrencyPrice } from "../web3/chain.parameters.js"
import { getBN, newSolWeb3 } from "../web3/web3.operation.js"
import { getAppUser } from "./app.user.service.js"
import { getTokenInfo, getTokenPrice } from "./token.service.js"

export async function parseTradeTransaction(chain: string, hash: string, token: string, wallet: string) {
	const BN = getBN()

	const connection = await newSolWeb3('', chain)
	let txRet = null
	const tick = (new Date()).getTime()
	while (txRet === null && (new Date()).getTime() < tick + 10000) {
		await sleep(100)
		txRet = await connection.getParsedTransaction(hash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
	}
	const accountIndex = txRet.transaction.message.accountKeys.indexOf(txRet.transaction.message.accountKeys.find(a => a.pubkey.toBase58() === wallet))
	const preBal = txRet.meta.preTokenBalances.find(a => a.owner === wallet && a.mint === token)
	const postBal = txRet.meta.postTokenBalances.find(a => a.owner === wallet && a.mint === token)

	let countCreateTokenAccount = 0
	const ret = await getMinimumBalanceForRentExemptAccount(connection)
	txRet.transaction.message.instructions.forEach(ins => {
		if (ins.parsed?.type === 'createIdempotent' || ins.parsed?.type === 'createAccount') countCreateTokenAccount ++
		if (ins.parsed?.type === 'closeAccount') countCreateTokenAccount --
	})
	const accountCreateFee = BN(countCreateTokenAccount).times(ret).div(BN('1e9'))

	const tokenAmount = BN(postBal.uiTokenAmount.uiAmountString).minus(BN(preBal?.uiTokenAmount?.uiAmountString || '0')).toString()
	const solAmount = BN(txRet.meta.postBalances[accountIndex]).minus(BN(txRet.meta.preBalances[accountIndex] || '0')).plus(txRet.meta.fee).plus(accountCreateFee).div(BN('1e9')).toString()
	return {
		accountIndex,
		tokenAmount,
		solAmount
	}
}

export async function addTradeTransaction(telegramId: string, chain: string, token: string, wallet: string, hash: string, solAmount: string, tokenAmount: string) {
	const user = await getAppUser(telegramId)
	const tr = await TransactionHistoryModel.findOne({transactionHash: hash})
	const BN = getBN()

	try {
		const newItem = new TradeTransactionModel({
			user: user._id,
			chain: chain,
			transactionHash: hash,
			transaction: tr?._id,
			from: wallet,
			tokenAddress: token,
			side: BN(tokenAmount).gt(0)? 'buy': 'sell',
			solAmount: solAmount,
			tokenAmount: tokenAmount
		})
		await newItem.save()
	} catch {  }

	return await TradeTransactionModel.findOne({transactionHash: hash})
}

export async function createTradeTransaction(telegramId: string, chain: string, hash: string, token: string, wallet: string) {
	const parsedInfo = await parseTradeTransaction(chain, hash, token, wallet)
	return await addTradeTransaction(telegramId, chain, token, wallet, hash, parsedInfo.solAmount, parsedInfo.tokenAmount)
}

export async function getPnL(telegramId: string, chain: string, token: string) {
	const BN = getBN()
	const user = await getAppUser(telegramId)
	const txAll = await TradeTransactionModel.find({user: user._id, chain: chain, tokenAddress: token})
	if (txAll.length === 0) {
		throw new Error('No trade history found')
	}

	const price = await getTokenPrice(chain, token)
	const tokenInfo = await getTokenInfo(chain, token)
	const solPrice = await getNativeCurrencyPrice(chain)
	
	if (BN(price).eq(0)) {
		throw new Error(`${tokenInfo.symbol} can't be traded`)
	}

	const boughtToken = txAll.filter(t => t.side === 'buy').reduce((prev, cur) => {
		return prev.plus(BN(cur.tokenAmount))
	}, BN(0))
	const boughtSOL = txAll.filter(t => t.side === 'buy').reduce((prev, cur) => {
		return prev.plus(BN(cur.solAmount).lt(0)? BN(0).minus(BN(cur.solAmount)): BN(cur.solAmount))
	}, BN(0))

	const soldToken = txAll.filter(t => t.side === 'sell').reduce((prev, cur) => {
		return prev.plus(BN(cur.tokenAmount).lt(0)? BN(0).minus(BN(cur.tokenAmount)): BN(cur.tokenAmount))
	}, BN(0))
	const soldSOL = txAll.filter(t => t.side === 'sell').reduce((prev, cur) => {
		return prev.plus(BN(cur.solAmount))
	}, BN(0))

	// console.log(boughtToken.toString(), boughtSOL.toString(), soldToken.toString(), soldSOL.toString())
	const initial = boughtSOL.toString()
	const worth = boughtToken.minus(soldToken).times(price).div(solPrice).plus(soldSOL).toString()

	const avgPrice = boughtToken.eq(0)? BN('0'): boughtSOL.div(boughtToken)

	return {
		initial: initial.toString(),
		worth: worth.toString(),
		averagePrice: avgPrice.toString()
	}
}