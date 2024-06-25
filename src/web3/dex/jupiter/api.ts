import axios from "axios"
import { getNativeCurrencyPrice } from "../../chain.parameters.js"
import { WSOL_ADDRESS, getBN } from "../../web3.operation.js"
import Logging from "../../../utils/logging.js"
import { VersionedTransaction } from "@solana/web3.js"

export async function getJupiterPrice(chain: string, token: string, decimals: number) {
	const solPrice = await getNativeCurrencyPrice(chain)

	let price
	const BN = getBN()
	try {
		if (token === WSOL_ADDRESS) {
			return solPrice
		}

		const solAmount = '1000000'
		const quoteResponse = await axios.get(`http://127.0.0.1:10115/quote?inputMint=${WSOL_ADDRESS}&outputMint=${token}&amount=${solAmount}&slippageBps=0`)
		/** quoteResponse.data
			{
				inputMint: WSOL_ADDRESS,
				inAmount: '1000000',
				outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
				outAmount: '59839',
				otherAmountThreshold: '59839',
				swapMode: 'ExactIn',
				slippageBps: 0,
				platformFee: null,
				priceImpactPct: '0',
				routePlan: [
					{ swapInfo: [Object], percent: 100 },
					{ swapInfo: [Object], percent: 100 },
					{ swapInfo: [Object], percent: 100 }
				],
				contextSlot: 231103840,
				timeTaken: 0.061438603
			}
			*/
		const tokensPerSol = BN(quoteResponse.data.outAmount).div(BN(`1e${decimals}`)).div(BN(quoteResponse.data.inAmount).div(BN('1e9'))).toString()
		price = BN(tokensPerSol || '0').eq(0) ? '0' : BN(solPrice).div(BN(tokensPerSol)).toString()
	} catch (err) {
		// Logging.error(`getJupiterPrice: ${token} not supported in Jupiter`)
		price = '0'
	}

	return price
}


export async function getBuyTransaction(token: string, amount: string, w: any, priorityFee: number, slippage?: number) {
	try {
		const quoteResponse = await axios.get(`http://127.0.0.1:10115/quote?inputMint=${WSOL_ADDRESS}&outputMint=${token}&amount=${amount}&slippageBps=${(slippage || 100) * 100.0}`)
		const swapResponse = await axios.post(`http://127.0.0.1:10115/swap`, { quoteResponse: quoteResponse.data, userPublicKey: w.address, wrapAndUnwrapSol: true, computeUnitPriceMicroLamports: priorityFee })

		const swapTransaction = swapResponse.data.swapTransaction
		const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
		return {
			transaction: VersionedTransaction.deserialize(swapTransactionBuf),
			outAmount: quoteResponse.data.outAmount
		}
	} catch (err) {
		throw new Error('[getBuyTransaction] Jupiter swap fetch error')
	}
}

export async function getBuyTransactionExactOut(token: string, amount: string, w: any, priorityFee: number, slippage?: number) {
	try {
		const quoteResponse = await axios.get(`http://127.0.0.1:10115/quote?inputMint=${WSOL_ADDRESS}&outputMint=${token}&amount=${amount}&slippageBps=${(slippage || 100) * 100.0}&swapMode=ExactOut`)
		const swapResponse = await axios.post(`http://127.0.0.1:10115/swap`, { quoteResponse: quoteResponse.data, userPublicKey: w.address, wrapAndUnwrapSol: true, computeUnitPriceMicroLamports: priorityFee })

		const swapTransaction = swapResponse.data.swapTransaction
		const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
		return {
			transaction: VersionedTransaction.deserialize(swapTransactionBuf),
			inAmount: quoteResponse.data.inAmount
		}
	} catch (err) {
		throw new Error('[getBuyTransactionExactOut] Jupiter swap fetch error')
	}
}

export async function getSellTransaction(token: string, amount: string, w: any, priorityFee: number, slippage?: number) {
	try {
		const quoteResponse = await axios.get(`http://127.0.0.1:10115/quote?inputMint=${token}&outputMint=${WSOL_ADDRESS}&amount=${amount}&slippageBps=${(slippage || 100) * 100.0}`)
		const swapResponse = await axios.post(`http://127.0.0.1:10115/swap`, { quoteResponse: quoteResponse.data, userPublicKey: w.address, wrapAndUnwrapSol: true, computeUnitPriceMicroLamports: priorityFee })

		const swapTransaction = swapResponse.data.swapTransaction
		const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
		return {
			transaction: VersionedTransaction.deserialize(swapTransactionBuf),
			outAmount: quoteResponse.data.outAmount
		}
	} catch (err) {
		throw new Error('[getSellTransaction] Jupiter swap fetch error')
	}
}

export async function getSellTransactionExactOut(token: string, amount: string, w: any, priorityFee: number, slippage?: number) {
	try {
		const quoteResponse = await axios.get(`http://127.0.0.1:10115/quote?inputMint=${token}&outputMint=${WSOL_ADDRESS}&amount=${amount}&slippageBps=${(slippage || 100) * 100.0}&swapMode=ExactOut`)
		const swapResponse = await axios.post(`http://127.0.0.1:10115/swap`, { quoteResponse: quoteResponse.data, userPublicKey: w.address, wrapAndUnwrapSol: true, computeUnitPriceMicroLamports: priorityFee })

		const swapTransaction = swapResponse.data.swapTransaction
		const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
		return {
			transaction: VersionedTransaction.deserialize(swapTransactionBuf),
			inAmount: quoteResponse.data.inAmount
		}
	} catch (err) {
		throw new Error('[getSellTransactionExactOut] Jupiter swap fetch error')
	}
}
