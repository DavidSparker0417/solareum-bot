import { externalInvokeMonitor } from "../../../commands/monitor.js"
import { SnipeTokenModel } from "../../../models/snipe.godmode.token.js"
import { TransactionHistoryModel } from "../../../models/transaction.history.model.js"
import { sendBotMessage } from "../../../service/app.service.js"
import { postPnLCard } from "../../../service/plcard.service.js"
import { updateUserState } from "../../../service/stat.service.js"
import { getTokenInfo, getTokenPrice } from "../../../service/token.service.js"
import { addTradeTransaction, createTradeTransaction, parseTradeTransaction } from "../../../service/trade.service.js"
import { getTxCallback } from "../../../service/transaction.backup.service.js"
import { getMultiWallets, getWallet } from "../../../service/wallet.service.js"
import { convertValue } from "../../../utils/common.js"
import Logging from "../../../utils/logging.js"
import { getBlockExplorer, getNativeCurrencyPrice } from "../../chain.parameters.js"
import { getTokenBalance, prefetchTokensOnChain } from "../../multicall.js"
import { getETHBalance } from "../../nativecurrency/nativecurrency.query.js"
import { WSOL_ADDRESS, getBN, getCUPriceByPreset, sendTxnAdvanced } from "../../web3.operation.js"
import { buildSwapTokenRaydiumExactInTransaction2, parsePoolInfo } from "./trade.js"

export async function processSnipe(sn: any, connection: any, poolId: string, decoded?: any, ex?: any) {
	const BN = getBN()
	try {
		const chain = 'solana'
		const tt1 = await Promise.all([getNativeCurrencyPrice(chain), getBlockExplorer(chain), parsePoolInfo(connection, poolId)])

		const nativePrice = tt1[0]
		const blockExplorer = tt1[1]
		const poolInfo = tt1[2]

		const fp = {
			id: poolId,
			baseMint: poolInfo.baseMint.toBase58(),
			quoteMint: poolInfo.quoteMint.toBase58(),
			lpMint: poolInfo.lpMint.toBase58(),
			baseDecimals: poolInfo.baseTokenDecimals,
			quoteDecimals: poolInfo.quoteTokenDecimals,
			lpDecimals: poolInfo.lpDecimals,
			version: poolInfo.version,
			programId: poolInfo.programId.toBase58(),
			authority: poolInfo.authority.toBase58(),
			openOrders: poolInfo.openOrders.toBase58(),
			targetOrders: poolInfo.targetOrders.toBase58(),
			baseVault: poolInfo.baseVault.toBase58(),
			quoteVault: poolInfo.quoteVault.toBase58(),
			withdrawQueue: poolInfo.withdrawQueue.toBase58(),
			lpVault: poolInfo.lpVault.toBase58(),
			marketVersion: poolInfo.marketVersion,
			marketProgramId: poolInfo.marketProgramId.toBase58(),
			marketId: poolInfo.marketId.toBase58(),
			marketAuthority: poolInfo.marketAuthority.toBase58(),
			marketBaseVault: poolInfo.marketBaseVault.toBase58(),
			marketQuoteVault: poolInfo.marketQuoteVault.toBase58(),
			marketBids: poolInfo.marketBids.toBase58(),
			marketAsks: poolInfo.marketAsks.toBase58(),
			marketEventQueue: poolInfo.marketEventQueue.toBase58(),
			lookupTableAccount: poolInfo.lookupTableAccount.toBase58(),
		}

		const baseTokenAddress = fp.baseMint
		const quoteTokenAddress = fp.quoteMint

		const tokenInfoArray = await Promise.all([getTokenInfo(chain, baseTokenAddress), getTokenInfo(chain, quoteTokenAddress)])
		let baseTokenInfo = tokenInfoArray[0]
		let quoteTokenInfo = tokenInfoArray[1]

		let tokensToFetch = []
		if (baseTokenInfo === null) {
			tokensToFetch = [...tokensToFetch, baseTokenAddress]
		}

		if (quoteTokenInfo === null) {
			tokensToFetch = [...tokensToFetch, quoteTokenAddress]
		}

		if (tokensToFetch.length > 0) {
			await prefetchTokensOnChain(chain, JSON.stringify(tokensToFetch))
		}

		if (baseTokenInfo === null) baseTokenInfo = await getTokenInfo(chain, baseTokenAddress)
		if (quoteTokenInfo === null) quoteTokenInfo = await getTokenInfo(chain, quoteTokenAddress)

		const telegramId = sn.user.telegramId
		const tokenAddress = sn.token.address
		const tokenInfo = tokenAddress === baseTokenAddress ? baseTokenInfo : quoteTokenInfo
		const otherTokenInfo = tokenAddress === baseTokenAddress ? quoteTokenInfo : baseTokenInfo

		const baseAmountDecimal = decoded? BN(decoded.baseAmountIn.toString()).div(BN(`1e${baseTokenInfo.decimals}`)): BN(poolInfo.poolTotalBase)
		const quoteAmountDecimal = decoded? BN(decoded.quoteAmountIn.toString()).div(BN(`1e${quoteTokenInfo.decimals}`)): BN(poolInfo.poolTotalQuote)

		const tplist = await Promise.all([getTokenPrice(chain, baseTokenAddress), getTokenPrice(chain, quoteTokenAddress)])
		const baseTokenPrice = tplist[0]
		const quoteTokenPrice = tplist[1]

		const tokenPrice =
			tokenAddress === quoteTokenAddress
			? quoteTokenPrice
			: baseTokenPrice

		const otherTokenPrice =
			tokenAddress === baseTokenAddress
			? quoteTokenPrice
			: baseTokenPrice

		let wallets = []
		try {
			wallets = [...wallets, await getWallet(telegramId)]
		} catch { }

		if (sn.multi === true) {
			try {
				wallets = [...wallets, ...(await getMultiWallets(telegramId))]
			} catch { }
		}

		const swapSlippage = sn.slippage
		if (ex?.simulate) {
			if (wallets.length === 0) return
			
			const w = wallets[0]
			const coinBal = otherTokenInfo.address === WSOL_ADDRESS ? await getETHBalance(telegramId, chain, w.address) : (await getTokenBalance(chain, otherTokenInfo.address, w.address)).balance

			const rVal = convertValue(coinBal, sn.nativeCurrencyAmount, BN)
			const inputNumber = parseFloat(rVal)

			const txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenInfo.address, inputNumber, 'buy', w, swapSlippage)
			return txnInfo
		}

		Logging.info(`Snipe ${sn._id.toString()} is being processed`)
		await SnipeTokenModel.findByIdAndUpdate(sn._id, { state: 'processing' })

		const transactionIds = await Promise.all(wallets.map(async w => {
			try {
				const coinBal = otherTokenInfo.address === WSOL_ADDRESS ? await getETHBalance(telegramId, chain, w.address) : (await getTokenBalance(chain, otherTokenInfo.address, w.address)).balance
				const rVal = convertValue(coinBal, sn.nativeCurrencyAmount, BN)
				const inputNumber = parseFloat(rVal)

				const label = `⚡️<b>${chain.slice(0, 3).toUpperCase()}</b>\nSniping <b>${tokenInfo.symbol}</b> at <code>$${BN(tokenInfo.totalSupply).times(tokenPrice).toFixed(0)}</code> MC with <code>${inputNumber}</code> <b>${otherTokenInfo.symbol}</b>\n${decoded?.transactionHash? `${blockExplorer}/tx/${decoded.transactionHash}\n`: ''}`;

				const callback = getTxCallback(label);

				const txnInfo = await buildSwapTokenRaydiumExactInTransaction2(telegramId, chain, tokenInfo.address, inputNumber, 'buy', w, swapSlippage, { priorityFee: sn.priorityFee })

				const tx = await sendTxnAdvanced(telegramId, chain, {
					...txnInfo,
					address: w
				}, {
					callback
				});
				const trFound = await TransactionHistoryModel.findOne({ transactionHash: tx?.transactionHash })
				if (trFound) {
					const tradeParsed = await parseTradeTransaction(chain, trFound.transactionHash, tokenAddress, w.address)

					const solAmount = BN(tradeParsed.solAmount).lt(0)? BN(0).minus(tradeParsed.solAmount).toString(): tradeParsed.solAmount
					const tokenAmount = BN(tradeParsed.tokenAmount).lt(0)? BN(0).minus(tradeParsed.tokenAmount).toString(): tradeParsed.tokenAmount
					await updateUserState(telegramId, chain, 0, undefined, BN(solAmount).times(BN('1e9')).integerValue().toString())
					await addTradeTransaction(telegramId, chain, tokenAddress, w.address, trFound.transactionHash, BN(0).minus(BN(solAmount)).toString(), tokenAmount.toString())
				}
				return trFound?._id
			} catch (err) {
				console.error(`processSnipe.oneSnipe ==> ${new Date().toLocaleString()}`)
				console.error(err)
				Logging.error(`[processSnipe.oneSnipe] ${sn.token.chain} - ${decoded?.transactionHash || '## dynamic snipe ##'}, ${w.address}`)
			}
		}))
		
		const isOk = transactionIds.filter(tr => tr !== undefined).length > 0
		await SnipeTokenModel.findByIdAndUpdate(sn._id, { transactions: transactionIds, state: isOk ? 'completed': 'error' })

		if (isOk) {
			await externalInvokeMonitor(telegramId, sn.user.chatId, chain, tokenInfo.address)
			await postPnLCard(telegramId, chain, tokenInfo.address)
		} else {
			await sendBotMessage(sn.user.telegramId, `❌ Failed to snipe <b>${tokenInfo.symbol}</b> on ${chain.toUpperCase()}`)
		}
	} catch (err) {
		console.error(`processSnipe ==> ${new Date().toLocaleString()}`)
		console.error(err)
		Logging.error(`[processSnipe] ${sn.token.chain} - ${decoded?.transactionHash || '## dynamic snipe ##'}`)
	}
}