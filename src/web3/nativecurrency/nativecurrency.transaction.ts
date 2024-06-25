import { IAddress } from "../../models/address.model.js";
import { getSettings } from "../../service/settings.service.js";
import { getTxCallback } from "../../service/transaction.backup.service.js";
import { getMultiWallets, getWallet } from "../../service/wallet.service.js";
import { convertValue } from "../../utils/common.js";
import { getNativeCurrencyDecimal, getNativeCurrencySymbol } from "../chain.parameters.js";
import { getBN, getCUPriceByPreset, newSolWeb3, sendTxnAdvanced } from "../web3.operation.js";
import { getETHBalance } from "./nativecurrency.query.js";
import { ComputeBudgetProgram, Transaction, TransactionMessage, VersionedTransaction, SystemProgram, PublicKey } from '@solana/web3.js'

export async function transferETH(telegramId: string, chain: string, addressTo: string, amount: string, address?: IAddress, ex?: any) {
    const BN = getBN();
    const nativeSymbol = await getNativeCurrencySymbol(chain);
    const nativeDecimal = await getNativeCurrencyDecimal(chain);

    const userSetting = await getSettings(telegramId, chain)

	let w = address
	if (w === undefined) {
		w = await getWallet(telegramId)
	}

	const connection = await newSolWeb3(telegramId, chain)
	const recentBlockhash = await connection.getLatestBlockhash('finalized');

	const tipAmount = parseInt(await getCUPriceByPreset(1000000, userSetting.gasPreset)) // 1 lamport

	const cu = 200000
	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: cu })
	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })
	const totalCUFee = BN(cu).times(100000).div(BN('1e6')).integerValue().toString()

	const transaction = new Transaction({
		recentBlockhash: recentBlockhash.blockhash,
	  })
	  .add(modifyComputeUnits)
	  .add(addPriorityFee)
	  .add(
		SystemProgram.transfer({
			fromPubkey: new PublicKey(w.address),
			toPubkey: new PublicKey(addressTo),
			lamports: parseInt(amount)
		})
	)

	transaction.feePayer = new PublicKey(w.address)

	const txFee = await transaction.getEstimatedFee(connection)

	let realAmount = amount

	if (ex?.regulate === true) {
		const myETHBal = await connection.getBalance(new PublicKey(w.address))

		if (BN(amount.toString()).plus(txFee).plus(tipAmount).plus(totalCUFee).gt(BN(myETHBal.toString()))) {
			realAmount = BN(myETHBal.toString()).minus(BN(txFee.toString())).minus(tipAmount).minus(totalCUFee).toString()
		}

		if (!BN(realAmount).gt(0)) {
			throw new Error(`❌ Insufficient ${nativeSymbol} balance`)
		}
	}

	const message = new TransactionMessage({
        payerKey: new PublicKey(w.address), 
        recentBlockhash: recentBlockhash.blockhash, 
        instructions: [
			SystemProgram.transfer({
				fromPubkey: new PublicKey(w.address),
				toPubkey: new PublicKey(addressTo),
				lamports: parseInt(realAmount)
			})
		]
    }).compileToV0Message();

    const updatedTransaction = new VersionedTransaction(message);

    const label = `⚡️<b>${chain.slice(0, 3).toUpperCase()}</b>\nTransferring <b>${BN(realAmount).div(BN(`1e${nativeDecimal}`).toString())} ${nativeSymbol}</b> to <code>${addressTo}</code>`;

    const callback = getTxCallback(label)
    const tx = await sendTxnAdvanced(telegramId, chain, {
        transaction: updatedTransaction,
        address: address,
		tipAmount: tipAmount
    }, {
        callback
    });

    // await updateUserState(telegramId, chain, 0, realAmount, undefined)

    return tx
}

export async function userTransferETH(telegramId: string, chain: string, addressTo: string, amount: string, ex?: any) {
    const w = await getWallet(telegramId);
    const bal = await getETHBalance(telegramId, chain, w.address);
    const BN = getBN();
    const ethDecimals = await getNativeCurrencyDecimal(chain);
    let amn = BN(convertValue(bal, amount, BN)).times(BN(`1e${ethDecimals}`)).integerValue().toString()

    return await transferETH(telegramId, chain, addressTo, amn, undefined, ex);
}

export async function userTransferETHAdditionalAddress(telegramId: string, chain: string, addressFrom: IAddress, addressTo: string, amount: string, ex?: any) {
    const wallets = await getMultiWallets(telegramId, { configure: true });

    if (wallets === null || typeof wallets === undefined) {
        return null;
    }

    let address;

    for (let temp of wallets) {
        if (temp.address === addressFrom.address && temp._id.toString() === addressFrom._id.toString()) {
            address = temp;
        }
    }

    if (address === null || typeof address === undefined) {
        return null;
    }

    const bal = await getETHBalance(telegramId, chain, address.address);
    const BN = getBN();
    const ethDecimals = await getNativeCurrencyDecimal(chain);
    const amn = BN(convertValue(bal, amount, BN)).times(BN(`1e${ethDecimals}`)).integerValue().toString();

    return await transferETH(telegramId, chain, addressTo, amn, addressFrom, ex);
}
