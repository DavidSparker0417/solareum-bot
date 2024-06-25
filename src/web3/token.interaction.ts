import { getBN, getCUPriceByPreset, getKeypairFromPv, newSolWeb3, sendTxnAdvanced } from './web3.operation.js';
import { IAddress } from '../models/address.model.js';
import { getTxCallback } from '../service/transaction.backup.service.js';
import { getTokenInfo } from '../service/token.service.js';
import { getWallet } from '../service/wallet.service.js';
import { convertValue } from '../utils/common.js';
import { DexInfoModel } from '../models/dex.info.model.js';
import { getSettings } from '../service/settings.service.js';
import { chainConfig } from './chain.config.js';
import { getTokenBalance } from './multicall.js';
import { ComputeBudgetProgram, Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TokenAccountNotFoundError, TokenInvalidAccountOwnerError, TokenInvalidMintError, TokenInvalidOwnerError } from '@solana/spl-token';

const solWeb3 = require('@solana/web3.js')
const splToken = require('@solana/spl-token')
// const ERC20 = JSON.parse(fs.readFileSync('./src/web3/abi/ERC20.json').toString().trim())

async function getTokenTransferAccountAndTransaction(connection: Connection, payerPubKey: PublicKey, mint: PublicKey, owner: PublicKey, allowOwnerOffCurve = false, programId = splToken.TOKEN_PROGRAM_ID,
	associatedTokenProgramId = splToken.ASSOCIATED_TOKEN_PROGRAM_ID) {
	const associatedToken = splToken.getAssociatedTokenAddressSync(
		mint,
		owner,
		allowOwnerOffCurve,
		programId,
		associatedTokenProgramId
	);

	// This is the optimal logic, considering TX fee, client-side computation, RPC roundtrips and guaranteed idempotent.
	// Sadly we can't do this atomically.
	const commitment = 'finalized'
	let account
	let transactionInstruction
	try {
		account = await splToken.getAccount(connection, associatedToken, commitment, programId);
	} catch (error: unknown) {
		// TokenAccountNotFoundError can be possible if the associated address has already received some lamports,
		// becoming a system account. Assuming program derived addressing is safe, this is the only case for the
		// TokenInvalidAccountOwnerError in this code path.
		if (error instanceof TokenAccountNotFoundError || error instanceof TokenInvalidAccountOwnerError) {
			// As this isn't atomic, it's possible others can create associated accounts meanwhile.
			try {
				transactionInstruction = splToken.createAssociatedTokenAccountInstruction(
					payerPubKey,
					associatedToken,
					owner,
					mint,
					programId,
					associatedTokenProgramId
				)
			} catch (error: unknown) {
				// Ignore all errors; for now there is no API-compatible way to selectively ignore the expected
				// instruction error if the associated account exists already.
			}
		} else {
			throw error;
		}
	}

	return { ata: associatedToken, transactionInstruction };
}

export async function transferToken(telegramId: string, chain: string, tokenAddress: string, addressTo: string, amount: string, address?: IAddress) {
	const tokenInfo = await getTokenInfo(chain, tokenAddress);

	const BN = getBN();
	const label = `⚡️<b>${chain.slice(0, 3).toUpperCase()}</b>\nTransferring <b>${BN(amount).div(BN(`1e${tokenInfo.decimals}`).toString())} ${tokenInfo.symbol}</b> to <b>${addressTo}</b>`;

	let w = address
	if (w === undefined) {
		w = await getWallet(telegramId)
	}
	const userSetting = await getSettings(telegramId, chain)

	const connection = await newSolWeb3(telegramId, chain)
	const recentBlockhash = await connection.getLatestBlockhash('finalized');

	const fromKeypair = getKeypairFromPv(w.privateKey)
	const tokenMint = new PublicKey(tokenAddress)
	const addressToKey = new PublicKey(addressTo)

	const src = await getTokenTransferAccountAndTransaction(connection, fromKeypair.publicKey, tokenMint, fromKeypair.publicKey)
	const dst = await getTokenTransferAccountAndTransaction(connection, fromKeypair.publicKey, tokenMint, addressToKey)

	const tipAmount = parseInt(await getCUPriceByPreset(1000000, userSetting.gasPreset)) // 1 lamport

	const sourceAccount = src.ata
	const destinationAccount = dst.ata

	const cu = 200000
	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: cu })
	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 })

	let instructions = [modifyComputeUnits, addPriorityFee]
	if (dst.transactionInstruction) {
		instructions = [...instructions, dst.transactionInstruction, splToken.createTransferInstruction(sourceAccount, destinationAccount, fromKeypair.publicKey, amount)]
	} else {
		instructions = [...instructions, splToken.createTransferInstruction(sourceAccount, destinationAccount, fromKeypair.publicKey, amount)]
	}

	const message = new TransactionMessage({
		payerKey: new PublicKey(w.address), 
		recentBlockhash: recentBlockhash.blockhash, 
		instructions: instructions
	}).compileToV0Message();

	const updatedTransaction = new VersionedTransaction(message);

	const callback = getTxCallback(label)
	const tx = await sendTxnAdvanced(telegramId, chain, {
		transaction: updatedTransaction,
		address: w,
		tipAmount: tipAmount
	}, {
		callback
	});

	return tx
}

export async function userTransferToken(telegramId: string, chain: string, tokenAddress: string, addressTo: string, amount: string) {
	const w = await getWallet(telegramId);
	const tokenInfo = await getTokenBalance(chain, tokenAddress, w.address);
	const bal = tokenInfo.balance;
	const decimals = tokenInfo.decimals;
	const BN = getBN();
	const amn = BN(convertValue(bal, amount, BN)).times(BN(`1e${decimals.toString()}`)).integerValue().toString()

	return await transferToken(telegramId, chain, tokenAddress, addressTo, amn);
}

export async function userTransferAdditional(telegramId: string, chain: string, tokenAddress: string, addressTo: string, amount: string, address: IAddress, tokenInfo: any) {
	const BN = getBN();
	const amn = BN(convertValue(tokenInfo.balance, amount, BN)).times(BN(`1e${tokenInfo.decimals.toString()}`)).integerValue().toString();

	return await transferToken(telegramId, chain, tokenAddress, addressTo, amn, address);
}

export async function getApprovalAddress(telegramId: string, chain: string, token: string, factory: string) {
	const dexInfo = await DexInfoModel.findOne({ chain: chain, factory: factory })
	const setting = await getSettings(telegramId, chain)
	const approvalAddress = setting.antiMEV === true ? chainConfig[chain].antimevSwapper : dexInfo.router

	return approvalAddress
}
