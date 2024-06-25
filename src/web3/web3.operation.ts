import Logging from '../utils/logging.js';
import { getBlockExplorer, getBotInstance, getNativeCurrencyDecimal, getNativeCurrencySymbol, getRPC } from './chain.parameters.js';
import { getAppUser, userVerboseLog } from '../service/app.user.service.js';
import { getWallet } from '../service/wallet.service.js';
import { ESTIMATE_GAS_ERROR, GASPRICE_OVERLOADED, GAS_EXCEEDED, INSUFFICIENT_ETH, TX_ERROR, TX_FAILED, TX_FAILED_CONFIRM, TX_FAILED_PARSING, TX_FETCH_FAILED, sleep } from '../utils/common.js';
import { botEnum } from '../constants/botEnum.js';
import { addTxRecord, updateUserState } from '../service/stat.service.js';
import { chainConfig } from './chain.config.js';
import { getRefereeWallets } from '../service/referral.service.js';
import { Connection, Keypair, PublicKey, Signer, SystemProgram, Transaction, VersionedTransaction, TransactionMessage, ComputeBudgetProgram, SignatureResult, Context, TransactionError } from '@solana/web3.js';
import axios from 'axios'
import { sendAndConfirmJitoBundle } from './bundle/jito/bundle.js';
import { getSettings } from '../service/settings.service.js';

const BN = require('bignumber.js');
const bs58 = require('bs58')

export const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112'
export const USDC_ADDRESS = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
export const USDT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

BN.config({
	EXPONENTIAL_AT: [-40, 96],
	ROUNDING_MODE: 3
});

export function getBN() {
	return BN;
}

export function getPriorityGas(preset: string) {
	let solAmount = '0'
	if ((preset || 'fast') === 'fast') {
		solAmount = '0.005'
	} else if (preset === 'slow') {
		solAmount = '0'
	} else if (preset === 'avg') {
		solAmount = '0.001'
	} else if (preset === 'max') {
		solAmount = '0.01'
	} else {
		solAmount = preset
	}
	return solAmount
}

export async function getCUPriceByPreset(cu: number, preset: string) {
	const BN = getBN()
	const solAmount = getPriorityGas(preset)
	return BN(solAmount).div(cu).times(BN(`1e15`)).integerValue().toString()
}

export async function waitForTransaction(connection: Connection, hash: string, timeout: number = 10000) {
	let sigMonitorId
	const ret: any = await new Promise((resolve, reject) => {
		setTimeout(() => {
			resolve({ error: 'Error timeout' })
		}, timeout)
		sigMonitorId = connection.onSignature(hash, (signatureResult: SignatureResult, context: Context) => {
			resolve({ error: signatureResult.err, ...context })
		}, 'processed')
	})
	
	if (!ret.slot) {
		connection.removeSignatureListener(sigMonitorId)
		throw new Error(JSON.stringify(ret.error))
	}
	return ret.slot
}

export async function sendTxnAdvanced(
	telegramId: string,
	chain: string,
	sendParams: any,
	// to: string,
	// abi: any[] | undefined,
	// fn: string,
	// args: any[],
	// value?: any,
	// address?: IAddress,
	// gasPrice?: string,
	feedback: any,
	// callback?: any,
	// exInfo?: any
) {
	let w;

	const awaitRet = await Promise.all([
		getWallet(telegramId),
		getAppUser(telegramId),
		getNativeCurrencyDecimal(chain),
		getNativeCurrencySymbol(chain),
		getBlockExplorer(chain),
		newSolWeb3(telegramId, chain, true),
	])

	if (sendParams.address === null || sendParams.address === undefined || typeof sendParams.address === undefined) {
		w = awaitRet[0];
	} else {
		w = sendParams.address;
	}

	const user = awaitRet[1];
	const decimals = awaitRet[2];
	const symbol = awaitRet[3];
	const exp = awaitRet[4]

	const bot = getBotInstance();
	let msg;

	try {
		const connection = awaitRet[5]

		const tx = sendParams.transaction

		const fromKeypair = getKeypairFromPv(w.privateKey)
		try {
			tx.sign([fromKeypair])
		} catch (err) {
			tx.sign(fromKeypair)
		}

		const rawTransaction = tx.serialize()
		let txMsg = {}
		try {
			txMsg = tx.compileMessage()
		} catch { }
		const expectedTransactionHash = bs58.encode(tx.signatures[0].signature || tx.signatures[0])

		try {
			if (feedback.callback) {
				msg = await feedback.callback(bot, { telegramId, chain, transactionMessage: JSON.stringify(txMsg), rawTransaction: rawTransaction.toString('hex'), tx: expectedTransactionHash, address: w.address, exInfo: feedback.exInfo }, 'pending');
			} else {
				msg = await bot.telegram.sendMessage(user.chatId, '⌛ Committing transaction...');
			}
		} catch (err) {
			console.error(`==> ${new Date().toLocaleString()}`)
			console.error(err)
			Logging.error('[sendTxnAdvanced - 1]')
		}

		let receipt

		const simRes = await connection.simulateTransaction(tx)
		if (simRes.value.err !== null) {
			console.log(simRes)
			throw new Error(TX_FAILED)
		}
		console.log('simulated transaction', expectedTransactionHash)

		try {
			if (BN(sendParams.tipAmount).lt('10000')) {
				throw new Error('Insufficient tip amount to bundle by jito service')
			}

			const bundleResult = await sendAndConfirmJitoBundle(connection, [sendParams.transaction], fromKeypair, sendParams.tipAmount)
			// if (bundleResult && !bundleResult.accepted) {
			// 	console.log(bundleResult)
			// 	throw new Error(bundleResult.rejected?.stateAuctionBidRejected?.msg || 'Not accepted by bundle')
			// }

			const slot = await waitForTransaction(connection, expectedTransactionHash)

			receipt = {
				transactionHash: expectedTransactionHash,
				blockNumber: slot
			}
		} catch (err) {
			console.error(err)
			console.log('pending transaction', expectedTransactionHash)

			let count = 50
			let retryCount = 0

			while (count > 0) {
				count--
				retryCount++

				for (let retryTxSend = 0; retryTxSend < 10; retryTxSend++) {
					try {
						await connection.sendRawTransaction(rawTransaction, {
							// preflightCommitment: 'processed',
							// skipPreflight: true,
							maxRetries: 0
						})
					} catch (err) { }
				}
				console.log('Transaction sent', retryCount, expectedTransactionHash)
				// const result = await connection.confirmTransaction(hash)
				// if (result.value.err) {
				// 	if (count === 0) throw new Error(TX_FAILED_CONFIRM)
				// 	continue
				// }

				let slot
				try {
					slot = await waitForTransaction(connection, expectedTransactionHash, 3000)
				} catch { }

				if (!slot) {
					if (count === 0) throw new Error(TX_FETCH_FAILED)
					continue
				}

				receipt = {
					transactionHash: expectedTransactionHash,
					blockNumber: slot
				}
				count = 0
			}
		}

		// console.log(txRet)
		console.log(`\n************* Transaction:`, (new Date()).getTime(), receipt.transactionHash, '\n');
		await updateUserState(telegramId, chain, receipt.fee || '0');
		await addTxRecord(telegramId, receipt, chain, w);

		if (msg) {
			try {
				if (feedback.callback) {
					await feedback.callback(bot, { telegramId, chain, msgId: msg.message_id, tx: receipt.transactionHash }, 'finished');
				} else {
					await bot.telegram.editMessageText(user.chatId, msg.message_id, 0, `🎁 This message will be removed automatically in 60 seconds.\n${exp}/tx/${receipt.transactionHash}`, {
						parse_mode: botEnum.PARSE_MODE_V2
					});

					// setTimeout(() => {
					//     bot.telegram.deleteMessage(user.chatId, msg.message_id)
					//         .then(() => { })
					//         .catch(() => { })
					//         .finally(() => { })
					// }, 60000)
				}
			} catch (err) {
				console.error(`==> ${new Date().toLocaleString()}`)
				console.error(err)
				Logging.error('[sendTxnAdvanced - 3]')
			}
		}

		return receipt;
	} catch (err) {
		console.error(err)
		if (err.message.startsWith(INSUFFICIENT_ETH)) {
			throw new Error(err.message);
		} else if (err.message.startsWith(GASPRICE_OVERLOADED)) {
			throw new Error(err.message);
		} else if (err.message.startsWith(GAS_EXCEEDED)) {
			throw new Error(err.message);
		} else if (err.message.startsWith(ESTIMATE_GAS_ERROR)) {
			throw new Error(err.message);
		}

		if (msg) {
			try {
				if (feedback.callback) {
					await feedback.callback(bot, { telegramId, chain, ...sendParams, msgId: msg.message_id, error: err }, 'error');
				} else {
					await bot.telegram.editMessageText(user.chatId, msg.message_id, 0, `${err.message}\n\n<i>This message will be removed automatically in 30 seconds.</i>`, { parse_mode: botEnum.PARSE_MODE_V2 });

					setTimeout(() => {
						bot.telegram
							.deleteMessage(user.chatId, msg.message_id)
							.then(() => { })
							.catch(() => { })
							.finally(() => { });
					}, 30000);
				}
			} catch (err) {
				console.error(`==> ${new Date().toLocaleString()}`)
				console.error(err)
				Logging.error('[sendTxnAdvanced - 4]')
			}
		}

		throw err
	}
}

export async function payToMultiWallets(connection: any, pvKey: string, toArray: string[], amountArray: string[]) {
	const BN = getBN()
	const recentBlockhash = await connection.getLatestBlockhash('finalized');

	const keyPair = getKeypairFromPv(pvKey)

	let instructions = toArray.map((to, idx) => 
		SystemProgram.transfer({
			fromPubkey: keyPair.publicKey,
			toPubkey: new PublicKey(to),
			lamports: parseInt(amountArray[idx])
		})
	)

	const cu = 10000
	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: cu })
	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })

	const message = new TransactionMessage({
		payerKey: keyPair.publicKey,
		recentBlockhash: recentBlockhash.blockhash,
		instructions: [modifyComputeUnits, addPriorityFee, ...instructions]
	}).compileToV0Message();

	const newTransaction = new VersionedTransaction(message);

	newTransaction.sign([keyPair])

	const rawTransaction = newTransaction.serialize()
	const expectedTransactionHash = bs58.encode(newTransaction.signatures[0])

	let receipt
	const simRes = await connection.simulateTransaction(newTransaction)
	if (simRes.value.err !== null) {
		console.error(simRes.value.err)
		throw new Error(TX_FAILED + " - " + keyPair.publicKey.toString())
	}

	let count = 50
	let retryCount = 0

	while (count > 0) {
		count--
		retryCount++

		for (let i = 0; i < 5; i ++) {
			await connection.sendRawTransaction(rawTransaction, {
				// preflightCommitment: 'processed',
				skipPreflight: true,
				maxRetries: 0
			})
		}
		console.log('Transaction sent', retryCount, expectedTransactionHash)
		// const result = await connection.confirmTransaction(hash)
		// if (result.value.err) {
		// 	if (count === 0) throw new Error(TX_FAILED_CONFIRM)
		// 	continue
		// }

		let slot
		try {
			slot = await waitForTransaction(connection, expectedTransactionHash, 1000)
		} catch { }

		if (!slot) {
			if (count === 0) throw new Error(TX_FETCH_FAILED)
			continue
		}

		receipt = {
			transactionHash: expectedTransactionHash,
			blockNumber: slot
		}
		count = 0
	}
	// }

	return receipt.transactionHash
}

export async function payFee(telegramId: string, chain: string, valueToSend: string) {
	const BN = getBN()
	const vD = BN(valueToSend).div(BN(`1e9`)).toString()

	const w = await getWallet(telegramId);
	const wList = await getRefereeWallets(telegramId)

	const connection = await newSolWeb3(telegramId, chain)
	const rentFee = await connection.getMinimumBalanceForRentExemption(0)
	const validWallets = await Promise.all(wList.map(async w1 => {
		const b = await connection.getBalance(new PublicKey(w1))
		if (BN(b).lt(rentFee)) return null
		else return w1
	}))
	const wallets = validWallets.filter(vw => vw !== null)

	const recentBlockhash = await connection.getLatestBlockhash('finalized');

	const feeMain = BN(valueToSend).times(BN('0.9')).integerValue().toString()
	let instructions = [
		SystemProgram.transfer({
			fromPubkey: new PublicKey(w.address),
			toPubkey: new PublicKey(chainConfig[chain].feeDistributor),
			lamports: parseInt(feeMain)
		})
	]

	valueToSend = BN(valueToSend).minus(BN(feeMain)).toString()

	if (wallets.length > 0) {
		const feeFrag = BN(valueToSend).div(wallets.length).integerValue().toString()
		wallets.forEach((to, idx) => {
			try {
				instructions = [...instructions,
				SystemProgram.transfer({
					fromPubkey: new PublicKey(w.address),
					toPubkey: new PublicKey(to),
					lamports: parseInt(feeFrag)
				})
				]
				valueToSend = BN(valueToSend).minus(BN(feeFrag)).toString()
			} catch { }
		})
	}

	if (BN(valueToSend).gt(0)) {
		instructions = [...instructions,
		SystemProgram.transfer({
			fromPubkey: new PublicKey(w.address),
			toPubkey: new PublicKey(chainConfig[chain].feeDistributor),
			lamports: parseInt(valueToSend)
		})
		]
		valueToSend = '0'
	}

	const cu = 200000
	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: cu })
	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })

	const message = new TransactionMessage({
		payerKey: new PublicKey(w.address),
		recentBlockhash: recentBlockhash.blockhash,
		instructions: [modifyComputeUnits, addPriorityFee, ...instructions]
	}).compileToV0Message();

	const newTransaction = new VersionedTransaction(message);

	const fromKeypair = getKeypairFromPv(w.privateKey)
	newTransaction.sign([fromKeypair])

	await userVerboseLog(telegramId, `Paying bot usage fee ${vD}`)

	const rawTransaction = newTransaction.serialize()
	const expectedTransactionHash = bs58.encode(newTransaction.signatures[0])

	let receipt
	// try {
	// const userSetting = await getSettings(telegramId, chain)
	// const tipAmount = parseInt(await getCUPriceByPreset(1000000, userSetting.gasPreset)) // 1 lamport
	// const bundleResult = await sendAndConfirmJitoBundle(connection, [newTransaction], fromKeypair, tipAmount)
	// if (!bundleResult.accepted) {
	// 	console.log(bundleResult)
	// 	throw new Error(bundleResult.rejected?.stateAuctionBidRejected?.msg || 'Not accepted by bundle')
	// }

	// receipt = {
	// 	transactionHash: expectedTransactionHash,
	// 	blockNumber: bundleResult.accepted?.slot || 0
	// }
	// } catch (err) {
	const simRes = await connection.simulateTransaction(newTransaction)
	if (simRes.value.err !== null) {
		console.error(simRes.value.err)
		throw new Error(TX_FAILED + " - " + w.address + ' - ' + vD)
	}

	let count = 50
	let retryCount = 0

	while (count > 0) {
		count--
		retryCount++

		await connection.sendRawTransaction(rawTransaction, {
			// preflightCommitment: 'processed',
			skipPreflight: true,
			maxRetries: 1
		})
		console.log('Transaction sent', retryCount, expectedTransactionHash)
		// const result = await connection.confirmTransaction(hash)
		// if (result.value.err) {
		// 	if (count === 0) throw new Error(TX_FAILED_CONFIRM)
		// 	continue
		// }

		let slot
		try {
			slot = await waitForTransaction(connection, expectedTransactionHash, 3000)
		} catch { }

		if (!slot) {
			if (count === 0) throw new Error(TX_FETCH_FAILED)
			continue
		}

		receipt = {
			transactionHash: expectedTransactionHash,
			blockNumber: slot
		}
		count = 0
	}
	// }

	const exp = await getBlockExplorer(chain)
	await userVerboseLog(telegramId, `Paid bot usage fee ${vD}, ${exp}/tx/${receipt.transactionHash}`)
}

const solanaWeb3Connection = {}

export async function newSolWeb3(telegramId: string, chain: string, transactionRpc?: boolean) {
	const rpc = transactionRpc === true ?
		// 'https://solana-mainnet.core.chainstack.com/aa771decf557aac180029c47fa19e739'
		chainConfig[chain].rpcUrls[1] : chainConfig[chain].rpcUrls[0]

	const confirmation = 'processed'
	if (solanaWeb3Connection[`${rpc}-${confirmation}`]) {
		return solanaWeb3Connection[`${rpc}-${confirmation}`]
	}
	const connection = new Connection(rpc, {
		commitment: confirmation,
	})

	solanaWeb3Connection[`${rpc}-${confirmation}`] = connection
	return connection
}

export function getSolAccount(address: string): PublicKey {
	return new PublicKey(address)
}

export function getSolAccounts(addresses: string[]) {
	return addresses.map(a => new PublicKey(a))
}

export function isValidAddress(addr: string) {
	return /[a-zA-Z1-9].+/g.test(addr)
	// try {
	// 	const publicKey = new PublicKey(addr)
	// 	return PublicKey.isOnCurve(publicKey.toBytes())
	// } catch (err) {
	// 	return false
	// }
}

export function getKeypairFromPv(privateKey: string) {
	const pvKey = Uint8Array.from(Buffer.from(privateKey, 'hex'))
	return Keypair.fromSecretKey(pvKey);
}

export function getBase58PvKey(privateKey: string) {
	const keyPair = getKeypairFromPv(privateKey)
	return bs58.encode(keyPair.secretKey)
}

export function getPvKeyFromBase58(bs58PvKey: string) {
	const keyPair = Keypair.fromSecretKey(bs58.decode(bs58PvKey));
	return Buffer.from(keyPair.secretKey).toString('hex')
}

export async function testTransaction(hash: string) {
	const connection = await newSolWeb3('', 'solana')
	// const hash = '59CeN7EBDonwGmQkEsMyJ7PecxdjVo2xbvQX2jewWiPvUPtp1mJFFMJAdSS6PnAfehEfVTiyL35mpmQzi9nXXetM'//'MEotC8iYodbDPhvFeLcFpeGdBaFaFXZkreftYnpWhTPYKWxuDr7xQfnzVqWJrwdvgLdPhRQ9s5BEghHodALUrmW'
	const txret = await connection.getParsedTransaction(hash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 })
	if (txret.meta.err) {
		console.log('Error occured')
	} else {
		console.log('Good')
	}
	// const result = await connection.confirmTransaction(hash)
	// console.log(result.value.err)
}