import { connect } from "./utils/connect.js";
import { getBN, getKeypairFromPv, newSolWeb3, waitForTransaction } from "./web3/web3.operation.js";

import bs58 from 'bs58';
import solWeb3, { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import { Telegraf } from "telegraf";
import { getNativeCurrencyDecimal, setBotInstance } from "./web3/chain.parameters.js";
import { TX_FAILED_PARSING, TX_FETCH_FAILED, sleep } from "./utils/common.js";

import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();
if (process.env.NODE_ENV == ('development' || 'development ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else if (process.env.NODE_ENV == ('production' || 'production ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env') });
} else if (process.env.NODE_ENV == ('staging' || 'staging ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.staging') });
}

const bot = new Telegraf(process.env.TELEGRAM_API_KEY, { handlerTimeout: 9_000_000 });
console.log(`configured bot [${process.env.TELEGRAM_API_KEY}]`);
setBotInstance(bot)

async function distributeFee() {
	const BN = getBN()

	const chain = 'solana'
	const connection = await newSolWeb3('', chain)
	const recentBlockhash = await connection.getLatestBlockhash('finalized');

	let keypair
	const pvKeyOrMnemonics = process.env.SOLFEESTORE
	try {
		keypair = Keypair.fromSecretKey(bs58.decode(pvKeyOrMnemonics));
	} catch (err) {
		console.error(err)
		const pvKey = Uint8Array.from(Buffer.from(pvKeyOrMnemonics, 'hex'))
		keypair = solWeb3.Keypair.fromSecretKey(pvKey);
	}

	const wallet = {
		address: keypair.publicKey.toBase58(),
		privateKey: Buffer.from(keypair.secretKey).toString('hex')
	}

	const orgBal = await connection.getBalance(new solWeb3.PublicKey(wallet.address))

	const decimals = await getNativeCurrencyDecimal(chain)
	const bal = BN(orgBal.toString())
		.div(BN(`1e${decimals}`))
		.toString();

	if (BN(bal).lt('0.1')) {
		throw new Error('Not enough distribution')
	}

	const cu = 200000
	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: cu })
	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })

	let transaction = new Transaction({
		recentBlockhash: recentBlockhash.blockhash,
	})
	.add(modifyComputeUnits)
	.add(addPriorityFee)

	const balToDistribute = BN(bal).minus('0.01').times(BN(`1e${decimals}`))
	const toArray = [
		{
			address: process.env.FEE_TO_DEV,
			share: '0.4'
		},
		{
			address: process.env.FEE_TO_COMMUNITY,
			share: '0.25'
		},
		{
			address: process.env.FEE_TO_CEO,
			share: '0.35'
		}
	]

	toArray.forEach(a => {
		const amount = balToDistribute.times(BN(a.share)).integerValue().toString()
		console.log(a.address, BN(amount).div(BN(`1e${decimals}`)).toString())
		transaction = transaction.add(
			SystemProgram.transfer({
				fromPubkey: new PublicKey(wallet.address),
				toPubkey: new PublicKey(a.address),
				lamports: parseInt(amount)
			})
		)
	})

	const fromKeypair = getKeypairFromPv(wallet.privateKey)
	transaction.sign(fromKeypair)

	const rawTransaction = transaction.serialize()
	const expectedTransactionHash = bs58.encode(transaction.signatures[0].signature || transaction.signatures[0])

	const vD = balToDistribute.div(BN(`1e${decimals}`)).toString()
	console.log(`[${(new Date()).toLocaleString()}] Distributing ${vD}`)

	let receipt
	let count = 512
	let retryCount = 0

	while (count > 0) {
		count--
		retryCount++

		const hash = await connection.sendRawTransaction(rawTransaction, {
			// preflightCommitment: 'processed',
			skipPreflight: true,
			maxRetries: 0
		})
		console.log('Transaction sent', retryCount, hash)
		// const result = await connection.confirmTransaction(hash)
		// if (result.value.err) {
		// 	if (count === 0) throw new Error(TX_FAILED_CONFIRM)
		// 	continue
		// }

		let slot
		try {
			slot = await waitForTransaction(connection, hash, 3000)
		} catch { }

		if (!slot) {
			if (count === 0) throw new Error(TX_FETCH_FAILED)
			continue
		}

		receipt = {
			transactionHash: hash,
			blockNumber: slot
		}
		count = 0
	}

	console.log(`[${(new Date()).toLocaleString()}] Distributed ${vD}`)
}

connect()
	.then(async () => {
		while (true) {
			try {
				await distributeFee()
			} catch (err) {
				console.error(err)
				await sleep(1000 * 3600 * 4)
			}
		}

		process.exit(0)
	})
	.catch((err) => { console.error(err); process.exit(1) })
