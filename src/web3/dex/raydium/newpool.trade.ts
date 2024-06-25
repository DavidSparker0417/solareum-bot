import {
	Liquidity,
	LiquidityPoolKeys,
	LiquidityPoolInfo,
	jsonInfo2PoolKeys,
	LiquidityPoolJsonInfo,
	TokenAccount,
	TokenAmount, Token, Percent,
	SPL_ACCOUNT_LAYOUT,
	LIQUIDITY_STATE_LAYOUT_V4,
	buildSimpleTransaction,
	InnerSimpleTransaction,
	TxVersion,
	getMultipleAccountsInfo,
	MARKET_STATE_LAYOUT_V3,
	Market
} from "@raydium-io/raydium-sdk";
import { OpenOrders } from "@project-serum/serum";
import RaydiumBN from 'bn.js'

import { Connection, PublicKey, ComputeBudgetProgram, Transaction, TransactionMessage, VersionedTransaction, SystemProgram } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createAssociatedTokenAccountInstruction, createCloseAccountInstruction, createSyncNativeInstruction, getAssociatedTokenAddress } from '@solana/spl-token'
import { WSOL_ADDRESS, getBN, getCUPriceByPreset, getKeypairFromPv, getSolAccount, newSolWeb3, sendTxnAdvanced } from "../../web3.operation.js";
import { getSettings } from "../../../service/settings.service.js";
import { findBiggestLP } from "./trade.js";
import { ChainModel } from "../../../models/chain.model.js";
import { createNewRedisClient } from "../../../service/multicore/ioredis.js";

const OPENBOOK_PROGRAM_ID = new PublicKey(
	"srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
);

export async function getTokenAccountsByOwner(
	connection: Connection,
	owner: PublicKey,
) {
	const tokenResp = await connection.getTokenAccountsByOwner(
		owner,
		{
			programId: TOKEN_PROGRAM_ID
		},
	);

	const accounts: TokenAccount[] = [];

	for (const { pubkey, account } of tokenResp.value) {
		accounts.push({
			programId: TOKEN_PROGRAM_ID,
			pubkey,
			accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data)
		});
	}

	return accounts;
}

/**
 * swapInDirection: used to determine the direction of the swap
 * Eg: RAY_SOL_LP_V4_POOL_KEY is using SOL as quote token, RAY as base token
 * If the swapInDirection is true, currencyIn is RAY and currencyOut is SOL
 * vice versa
 */
async function calcPoolAmountOut(connection: Connection, fp: any, rawAmountIn: number, swapInDirection: boolean) {
	// const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
	const BN = getBN()

	const tokenAccounts = await connection.getMultipleAccountsInfo([getSolAccount(fp.baseVault), getSolAccount(fp.quoteVault)])
	const baseTokenVaultInfo = SPL_ACCOUNT_LAYOUT.decode(tokenAccounts[0].data)
	const quoteTokenVaultInfo = SPL_ACCOUNT_LAYOUT.decode(tokenAccounts[1].data)
	const baseVaultBalance = BN(baseTokenVaultInfo.amount.toString()).div(BN(`1e${fp.baseDecimals}`)).toNumber()
	const quoteVaultBalance = BN(quoteTokenVaultInfo.amount.toString()).div(BN(`1e${fp.quoteDecimals}`)).toNumber()

	let openOrdersBaseTokenTotal = 0
	let openOrdersQuoteTokenTotal = 0
	try {
		const openOrders = await OpenOrders.load(
			connection,
			getSolAccount(fp.openOrders),
			getSolAccount(fp.marketProgramId)
		);

		openOrdersBaseTokenTotal = BN(openOrders.baseTokenTotal.toString()).div(BN(`1e${fp.baseDecimals}`)).toString();
		openOrdersQuoteTokenTotal = BN(openOrders.quoteTokenTotal.toString()).div(BN(`1e${fp.quoteDecimals}`)).toString();
	} catch { }

	const baseVal = BN(baseVaultBalance).plus(BN(openOrdersBaseTokenTotal))
	const quoteVal = BN(quoteVaultBalance).plus(BN(openOrdersQuoteTokenTotal))

	const poolInfo = {
		...fp,
		status: new RaydiumBN(1),
		baseReserve: new RaydiumBN(BN(baseVal).times(BN(`1e${fp.baseDecimals}`)).integerValue().toString()),
		quoteReserve: new RaydiumBN(BN(quoteVal).times(BN(`1e${fp.quoteDecimals}`)).integerValue().toString()),
		baseMint: fp.baseMint,
		quoteMint: fp.quoteMint,
		lpMint: fp.lpMint,
		baseDecimals: fp.baseDecimals,
		quoteDecimals: fp.quoteDecimals,
		lpDecimals: fp.lpDecimals,
		version: fp.version,
		programId: fp.programId,
		authority: fp.authority,
		openOrders: fp.openOrders,
		targetOrders: fp.targetOrders,
		baseVault: fp.baseVault,
		quoteVault: fp.quoteVault,
		withdrawQueue: fp.withdrawQueue,
		lpVault: fp.lpVault,
		marketVersion: fp.marketVersion,
		marketProgramId: fp.marketProgramId,
		marketId: fp.marketId,
		marketAuthority: fp.marketAuthority,
		marketBaseVault: fp.marketBaseVault,
		marketQuoteVault: fp.marketQuoteVault,
		marketBids: fp.marketBids,
		marketAsks: fp.marketAsks,
		marketEventQueue: fp.marketEventQueue,
		lookupTableAccount: fp.lookupTableAccount,
		lpSupply: new RaydiumBN('0'),
		startTime: new RaydiumBN('0')
	}

	let currencyInMint = getSolAccount(fp.baseMint);
	let currencyInDecimals = poolInfo.baseDecimals;
	let currencyOutMint = getSolAccount(fp.quoteMint);
	let currencyOutDecimals = poolInfo.quoteDecimals;

	if (!swapInDirection) {
		currencyInMint = getSolAccount(fp.quoteMint);
		currencyInDecimals = poolInfo.quoteDecimals;
		currencyOutMint = getSolAccount(fp.baseMint);
		currencyOutDecimals = poolInfo.baseDecimals;
	}

	const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals);
	const amountIn = new TokenAmount(currencyIn, rawAmountIn, false);
	const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals);
	const slippage = new Percent(5, 100); // 5% slippage

	const poolKeys: LiquidityPoolKeys = {
		...fp,
		baseMint: getSolAccount(fp.baseMint),
		quoteMint: getSolAccount(fp.quoteMint),
		lpMint: getSolAccount(fp.lpMint),
		programId: getSolAccount(fp.programId),
		authority: getSolAccount(fp.authority),
		openOrders: getSolAccount(fp.openOrders),
		targetOrders: getSolAccount(fp.targetOrders),
		baseVault: getSolAccount(fp.baseVault),
		quoteVault: getSolAccount(fp.quoteVault),
		withdrawQueue: getSolAccount(fp.withdrawQueue),
		lpVault: getSolAccount(fp.lpVault),
		marketProgramId: getSolAccount(fp.marketProgramId),
		marketId: getSolAccount(fp.marketId),
		marketAuthority: getSolAccount(fp.marketAuthority),
		marketBaseVault: getSolAccount(fp.marketBaseVault),
		marketQuoteVault: getSolAccount(fp.marketQuoteVault),
		marketBids: getSolAccount(fp.marketBids),
		marketAsks: getSolAccount(fp.marketAsks),
		marketEventQueue: getSolAccount(fp.marketEventQueue),
		lookupTableAccount: getSolAccount(fp.lookupTableAccount),
	}

	const poolKey = poolInfo as LiquidityPoolInfo
	const {
		amountOut,
		minAmountOut,
		currentPrice,
		executionPrice,
		priceImpact,
		fee,
	} = Liquidity.computeAmountOut({ poolKeys, poolInfo: poolKey, amountIn, currencyOut, slippage, });

	return {
		amountIn,
		amountOut,
		minAmountOut,
		currentPrice,
		executionPrice,
		priceImpact,
		fee,
		raySolPoolKey: poolKeys
	};
}

export async function getTokenPriceOfRaydiumPool(token: string) {
	const connection = await newSolWeb3('', 'solana')
	const redis = createNewRedisClient()
	const solLP = await findBiggestLP(redis, connection, token)

	if (solLP === null) {
		throw new Error(`${token} not listed on Raydium`)
	}

	const fp = JSON.parse(JSON.stringify(solLP))
	delete fp['_id']
	delete fp['createdAt']
	delete fp['updatedAt']
	delete fp['__v']

	const BN = getBN()

	const tokenAccounts = await connection.getMultipleAccountsInfo([getSolAccount(fp.baseVault), getSolAccount(fp.quoteVault)])
	const baseTokenVaultInfo = SPL_ACCOUNT_LAYOUT.decode(tokenAccounts[0].data)
	const quoteTokenVaultInfo = SPL_ACCOUNT_LAYOUT.decode(tokenAccounts[1].data)
	const baseVaultBalance = BN(baseTokenVaultInfo.amount.toString()).div(BN(`1e${fp.baseDecimals}`)).toNumber()
	const quoteVaultBalance = BN(quoteTokenVaultInfo.amount.toString()).div(BN(`1e${fp.quoteDecimals}`)).toNumber()

	let openOrdersBaseTokenTotal = 0
	let openOrdersQuoteTokenTotal = 0
	try {
		const openOrders = await OpenOrders.load(
			connection,
			getSolAccount(fp.openOrders),
			getSolAccount(fp.marketProgramId)
		);

		openOrdersBaseTokenTotal = BN(openOrders.baseTokenTotal.toString()).div(BN(`1e${fp.baseDecimals}`)).toString();
		openOrdersQuoteTokenTotal = BN(openOrders.quoteTokenTotal.toString()).div(BN(`1e${fp.quoteDecimals}`)).toString();
	} catch { }

	const baseVal = BN(baseVaultBalance).plus(BN(openOrdersBaseTokenTotal))
	const quoteVal = BN(quoteVaultBalance).plus(BN(openOrdersQuoteTokenTotal))

	if (fp.baseMint === token) {
		const chainDB = await ChainModel.findOne({name: 'solana'})
		const index = chainDB.tokens.indexOf(fp.quoteMint)
		if (index > -1) {
			return BN(chainDB.prices[index]).times(quoteVal).div(baseVal).toString()
		} else {
			throw new Error('[getTokenPriceOfRaydiumPool 1]')
		}
	} else if (fp.quoteMint === token) {
		const chainDB = await ChainModel.findOne({name: 'solana'})
		const index = chainDB.tokens.indexOf(fp.baseMint)
		if (index > -1) {
			return BN(chainDB.prices[index]).times(baseVal).div(quoteVal).toString()
		} else {
			throw new Error('[getTokenPriceOfRaydiumPool]')
		}
	} else {
		throw new Error(`getTokenPriceOfRaydiumPool: ${token} does not have valid pool in Raydium`)
	}
}
