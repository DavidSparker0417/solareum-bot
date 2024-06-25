import { TransactionHistoryModel } from "../models/transaction.history.model.js";
import { UserStatModel } from "../models/user.stat.model.js";
import { NOT_CONNECTED_WALLET, TX_FAILED, sleep } from "../utils/common.js";
import Logging from "../utils/logging.js";
import { getBlockExplorer, getNativeCurrencyDecimal, getNativeCurrencySymbol } from "../web3/chain.parameters.js";
import { userETHBalance } from "../web3/nativecurrency/nativecurrency.query.js";
import { getBN, payFee } from "../web3/web3.operation.js";
import { getAppUser, userVerboseLog } from "./app.user.service.js";

export async function updateUserState(telegramId: string, chain: string, transactionFee: number, sellVol?: string, buyVol?: string) {
	const BN = getBN()

	try {
		const user = await getAppUser(telegramId);
		const decimals = await getNativeCurrencyDecimal(chain);
		const fee = BN(transactionFee).div(BN(`1e${decimals}`));

		if (0 === (await UserStatModel.countDocuments({ user: user._id, chain: chain }))) {
			const newStat = new UserStatModel({
				user: user._id,
				chain: chain,
				txCount: 0,
				txMaxFee: fee.toString(),
				txMinFee: fee.toString(),
				txAvgFee: fee.toString(),
				txFee: '0',
				txPaid: '0',
				sellVolume: '0',
				buyVolume: '0'
			});

			await newStat.save();
		}

		const stat = await UserStatModel.findOne({ user: user._id, chain: chain });

		let txPaid = stat.txPaid

		stat.txFee = fee.plus(BN(stat.txFee)).toString();
		stat.sellVolume = BN(stat.sellVolume || '0').plus(BN(sellVol || '0').div(BN(`1e${decimals}`))).toString()
		stat.buyVolume = BN(stat.buyVolume || '0').plus(BN(buyVol || '0').div(BN(`1e${decimals}`))).toString()

		if (sellVol || buyVol) stat.txCount = stat.txCount + 1

		stat.txMaxFee = fee.gt(stat.txMaxFee) ? fee.toString() : stat.txMaxFee
		stat.txMinFee = fee.lt(stat.txMinFee) ? fee.toString() : stat.txMinFee
		stat.txAvgFee = BN(stat.txFee).div(stat.txCount).toString()

		await stat.save()

		// // commented because payment is done in pollFeeCollection()
		// const feeThreshold = BN('1.0')
		// const feePercentage = BN('0.0125')

		// const totalExpense = BN(stat.txFee).plus(BN(stat.sellVolume)).plus(BN(stat.buyVolume)).minus(BN(txPaid))

		// if (
		//     totalExpense.gte(feeThreshold) // deduct after 1 ETH tx fee
		//     // totalExpense.gte(BN(txPaid)) // deduct before 1 ETH tx fee
		// ) {
		//     // pay fee percentage 1% to feeRx
		//     const count = Math.floor(parseFloat(totalExpense.div(feeThreshold).toString()))
		//     const payAmount = feeThreshold.times(BN(count))
		//     const valueToSend = payAmount.times(feePercentage).times(BN(`1e${decimals}`)).integerValue().toString()

		//     await payFee(telegramId, chain, valueToSend)
		//     txPaid = BN(txPaid).plus(payAmount).toString()
		// }

		// stat.txPaid = txPaid

		// await stat.save()
	} catch (err) {
		console.error(`==> ${new Date().toLocaleString()}`)
		console.error(err)
		Logging.error('[updateUserState] - Error updating user stat');
	}
}

export async function addTxRecord(telegramId: string, transaction: any, chain: string, wallet: any) {
	const explorer = await getBlockExplorer(chain);
	const user = await getAppUser(telegramId);
	const newTransactionHistory = new TransactionHistoryModel({
		user: user._id,
		chain: chain,
		from: wallet.address,
		explorer: explorer,
		blockTime: transaction.blockTime,
		blockNumber: transaction.blockNumber,
		fee: transaction.fee,
		transactionHash: transaction.transactionHash
	});

	await newTransactionHistory.save();
	await userVerboseLog(telegramId, `${transaction.transactionHash} recorded on ${chain}`);
}

export async function pollFeeCollection() {
	const BN = getBN()
	const chain = 'solana'
	const symbol = await getNativeCurrencySymbol(chain)
	const decimals = await getNativeCurrencyDecimal(chain)

	await sleep(2000)
	Logging.info('[pollFeeCollection] started')

	while (true) {
		const stats: any[] = await UserStatModel.find().populate('user');

		let sum = BN(0)

		for (const stat of stats) {
			let txPaid = stat.txPaid

			const feeThreshold = BN('1.0')
			const feePercentage = BN('0.0125')

			const totalExpense = BN(stat.txFee || '0').plus(BN(stat.sellVolume || '0')).plus(BN(stat.buyVolume || '0')).minus(BN(txPaid || '0'))

			if (
				totalExpense.gte(feeThreshold) // deduct after 1 ETH tx fee
				// totalExpense.gte(BN(txPaid)) // deduct before 1 ETH tx fee
			) {
				try {
					const telegramId = stat.user.telegramId
					let count = Math.floor(parseFloat(totalExpense.div(feeThreshold).toString()))
					sum = sum.plus(feeThreshold.times(BN(count)))

					const bal = await userETHBalance(telegramId, chain)

					// const gas = await payFee(telegramId, chain, feeThreshold.times(feePercentage).times(BN(`1e${decimals}`)).integerValue().toString(), { estimateGas: true })

					const payGasFee = '0.01'
					let leftCount = Math.floor(parseFloat(BN(bal).minus(payGasFee).div(feePercentage).div(feeThreshold).toString()))
					if (leftCount < 0) leftCount = 0
					if (count > leftCount) count = leftCount

					if (count > 0) {
						const payAmount = feeThreshold.times(BN(count))
						const valueToSend = payAmount.times(feePercentage).times(BN(`1e${decimals}`)).integerValue().toString()

						await payFee(telegramId, chain, valueToSend)

						stat.txPaid = BN(txPaid).plus(payAmount).toString()
						await stat.save()
					}

					// console.log(stat.user.telegramId, stat.user.userName, bal, count, feeThreshold.times(feePercentage).times(BN(count)).toString(), payGasFee)
				} catch (err) {
					if (!err.message.startsWith(NOT_CONNECTED_WALLET) && !err.message.startsWith(TX_FAILED)) {
						console.error(`[pollFeeCollection] ==> ${new Date().toLocaleString()}`)
						console.error(err)
						Logging.error('[pollFeeCollection] - Error while paying');
					}
				}
			}
		}

		Logging.info(`[pollFeeCollection] unpaid trade volume ${sum.toString()} ${symbol}`)
		await sleep(5000)
	}
}
