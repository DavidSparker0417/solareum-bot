import {
	Liquidity,
	LiquidityPoolKeys,
	jsonInfo2PoolKeys,
	LiquidityPoolJsonInfo,
	TokenAccount,
	TokenAmount, Token, Percent,
	SPL_ACCOUNT_LAYOUT,
	LIQUIDITY_STATE_LAYOUT_V4,
	buildSimpleTransaction,
	buildTransaction,
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
import { RaydiumPoolInfoModel } from "../../../models/solana/raydium/pool.info.model.js";
import { RAYDIUMPOOL_MAGIC, RAYDIUM_TOKEN_MAGIC } from "./sync.js";
import { createNewRedisClient } from "../../../service/multicore/ioredis.js";

const OPENBOOK_PROGRAM_ID = new PublicKey(
	"srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
);

export const RAYDIUM_LIQUIDITY_POOL_AMM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')

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
export async function calcAmountOut(connection: Connection, poolKeys: LiquidityPoolKeys, rawAmountIn: number, swapInDirection: boolean) {
	// const poolInfo = await Liquidity.fetchInfo({ connection, poolKeys });
	const BN = getBN()
	const poolId = poolKeys.id.toBase58()
	const ppi = await parsePoolInfo(connection, poolId)
	const poolInfo = {
		id: poolId,
		...ppi,
		baseReserve: new RaydiumBN(BN(ppi.poolTotalBase).times(BN(`1e${ppi.baseDecimals}`)).integerValue().toString()),
		quoteReserve: new RaydiumBN(BN(ppi.poolTotalQuote).times(BN(`1e${ppi.quoteDecimals}`)).integerValue().toString()),
		baseMint: ppi.baseMint.toBase58(),
		quoteMint: ppi.quoteMint.toBase58(),
		lpMint: ppi.lpMint.toBase58(),
		baseDecimals: ppi.baseTokenDecimals,
		quoteDecimals: ppi.quoteTokenDecimals,
		lpDecimals: ppi.lpDecimals,
		version: ppi.version,
		programId: ppi.programId.toBase58(),
		authority: ppi.authority.toBase58(),
		openOrders: ppi.openOrders.toBase58(),
		targetOrders: ppi.targetOrders.toBase58(),
		baseVault: ppi.baseVault.toBase58(),
		quoteVault: ppi.quoteVault.toBase58(),
		withdrawQueue: ppi.withdrawQueue.toBase58(),
		lpVault: ppi.lpVault.toBase58(),
		marketVersion: ppi.marketVersion,
		marketProgramId: ppi.marketProgramId.toBase58(),
		marketId: ppi.marketId.toBase58(),
		marketAuthority: ppi.marketAuthority.toBase58(),
		marketBaseVault: ppi.marketBaseVault.toBase58(),
		marketQuoteVault: ppi.marketQuoteVault.toBase58(),
		marketBids: ppi.marketBids.toBase58(),
		marketAsks: ppi.marketAsks.toBase58(),
		marketEventQueue: ppi.marketEventQueue.toBase58(),
		lookupTableAccount: ppi.lookupTableAccount.toBase58(),
		lpSupply: new RaydiumBN('0'),
		startTime: new RaydiumBN('0')
	}

	let currencyInMint = poolKeys.baseMint;
	let currencyInDecimals = poolInfo.baseDecimals;
	let currencyOutMint = poolKeys.quoteMint;
	let currencyOutDecimals = poolInfo.quoteDecimals;

	if (!swapInDirection) {
		currencyInMint = poolKeys.quoteMint;
		currencyInDecimals = poolInfo.quoteDecimals;
		currencyOutMint = poolKeys.baseMint;
		currencyOutDecimals = poolInfo.baseDecimals;
	}

	const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals);
	const amountIn = new TokenAmount(currencyIn, rawAmountIn, false);
	const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals);
	const slippage = new Percent(0, 100); // 0% slippage

	const {
		amountOut,
		minAmountOut,
		currentPrice,
		executionPrice,
		priceImpact,
		fee,
	} = Liquidity.computeAmountOut({ poolKeys, poolInfo, amountIn, currencyOut, slippage, });

	return {
		amountIn,
		amountOut,
		minAmountOut,
		currentPrice,
		executionPrice,
		priceImpact,
		fee,
	};
}

export async function parsePoolInfo(connection: any, poolInfoId: string, w?: any) {
	// const owner = new PublicKey(w.address);
	// const tokenAccounts = await getTokenAccountsByOwner(connection, owner);

	// example to get pool info
	const poolIdKey = new PublicKey(poolInfoId)
	const info = await connection.getAccountInfo(poolIdKey);
	if (!info) return;

	const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(info.data);

	const baseDecimal = 10 ** poolState.baseDecimal.toNumber(); // e.g. 10 ^ 6
	const quoteDecimal = 10 ** poolState.quoteDecimal.toNumber();

	const baseTokenAmount = await connection.getTokenAccountBalance(
		poolState.baseVault
	);
	const quoteTokenAmount = await connection.getTokenAccountBalance(
		poolState.quoteVault
	);

	const basePnl = poolState.baseNeedTakePnl.toNumber() / baseDecimal;
	const quotePnl = poolState.quoteNeedTakePnl.toNumber() / quoteDecimal;

	let openOrdersBaseTokenTotal = 0
	let openOrdersQuoteTokenTotal = 0
	try {
		const openOrders = await OpenOrders.load(
			connection,
			poolState.openOrders,
			poolState.marketProgramId
		);

		openOrdersBaseTokenTotal =
			openOrders.baseTokenTotal.toNumber() / baseDecimal;
		openOrdersQuoteTokenTotal =
			openOrders.quoteTokenTotal.toNumber() / quoteDecimal;
	} catch { }

	const base =
		(baseTokenAmount.value?.uiAmount || 0) + openOrdersBaseTokenTotal - basePnl;
	const quote =
		(quoteTokenAmount.value?.uiAmount || 0) +
		openOrdersQuoteTokenTotal -
		quotePnl;

	const BN = getBN()
	const denominator = new BN(`1e${poolState.baseDecimal}`).toNumber();

	// const addedLpAccount = tokenAccounts.find((a) =>
	// 	a.accountInfo.mint.equals(poolState.lpMint)
	// );

	const marketInfo = await connection.getAccountInfo(poolState.marketId)
	const poolKey = Liquidity.getAssociatedPoolKeys({
		version: 4,
		marketVersion: 3,
		marketId: poolState.marketId,
		baseMint: poolState.baseMint,
		quoteMint: poolState.quoteMint,
		baseDecimals: poolState.baseDecimal.toNumber(),
		quoteDecimals: poolState.quoteDecimal.toNumber(),
		programId: RAYDIUM_LIQUIDITY_POOL_AMM,
		marketProgramId: poolState.marketProgramId
	})

	const marketKey = MARKET_STATE_LAYOUT_V3.decode(marketInfo.data)

	return {
		...poolState,
		programId: poolKey.programId,
		authority: poolKey.authority,
		baseDecimals: poolKey.baseDecimals,
		quoteDecimals: poolKey.quoteDecimals,
		lpDecimals: poolKey.lpDecimals,
		version: poolKey.version,
		lookupTableAccount: poolKey.lookupTableAccount,
		id: poolIdKey,
		marketBaseVault: marketKey.baseVault,
		marketQuoteVault: marketKey.quoteVault,
		marketBids: marketKey.bids,
		marketAsks: marketKey.asks,
		marketEventQueue: marketKey.eventQueue,
		marketVersion: 3,
		marketAuthority: Market.getAssociatedAuthority({ programId: poolState.marketProgramId, marketId: poolState.marketId }).publicKey,
		poolTotalBase: base,
		poolTotalQuote: quote,
		baseVaultBalance: baseTokenAmount.value.uiAmount,
		quoteVaultBalance: quoteTokenAmount.value.uiAmount,
		baseTokenOpenOrders: openOrdersBaseTokenTotal,
		quoteTokenOpenOrders: openOrdersQuoteTokenTotal,
		baseTokenDecimals: poolState.baseDecimal.toNumber(),
		quoteTokenDecimals: poolState.quoteDecimal.toNumber(),
		totalLP: poolState.lpReserve.toNumber() / denominator,
		// addedLpAmount: (addedLpAccount?.accountInfo.amount.toNumber() || 0) / baseDecimal
	}
}

export async function buildSwapRaydiumLPExactInTransaction(telegramId: string, chain: string, lpInfo: any, targetToken: string, inputNumber: number, side: string, wallet: string, slippage?: number, ex?: any) {
	const connection = await newSolWeb3('', chain)
	const BN = getBN()
	const raySolPoolKey = jsonInfo2PoolKeys(lpInfo as LiquidityPoolJsonInfo)

	let swapInDirection
	let tokenIn, tokenOut
	if (side === 'buy') {
		swapInDirection = lpInfo.baseMint === targetToken ? false : true
		tokenIn = lpInfo.baseMint === targetToken ? lpInfo.quoteMint : lpInfo.baseMint
		tokenOut = lpInfo.baseMint === targetToken ? lpInfo.baseMint : lpInfo.quoteMint
	} else if (side === 'sell') {
		swapInDirection = lpInfo.baseMint === targetToken ? true : false
		tokenIn = lpInfo.baseMint === targetToken ? lpInfo.baseMint : lpInfo.quoteMint
		tokenOut = lpInfo.baseMint === targetToken ? lpInfo.quoteMint : lpInfo.baseMint
	} else {
		throw new Error(`Unsupported trade side [${side}]`)
	}

	const calResult = await calcAmountOut(connection, raySolPoolKey as LiquidityPoolKeys, inputNumber, swapInDirection);
	const { amountIn, minAmountOut } = calResult

	const trader = getSolAccount(wallet)
	const tokenAccounts = await getTokenAccountsByOwner(connection, trader); // get all token accounts
	const tokenAccountIn = tokenAccounts.find(t => t.accountInfo.mint.toBase58() === tokenIn)?.pubkey || await getAssociatedTokenAddress(new PublicKey(tokenIn), trader, true, TOKEN_PROGRAM_ID)
	const tokenAccountOut = tokenAccounts.find(t => t.accountInfo.mint.toBase58() === tokenOut)?.pubkey || await getAssociatedTokenAddress(new PublicKey(tokenOut), trader, true, TOKEN_PROGRAM_ID)

	let slippageOut = BN(minAmountOut.numerator.toString()).times(100 - (slippage || 100)).div(100)
	if (slippageOut.lt(0)) slippageOut = BN(0)

	const txnInstruction = await Liquidity.makeSwapInstruction({
		poolKeys: raySolPoolKey as LiquidityPoolKeys,
		userKeys: {
			tokenAccountIn: tokenAccountIn,
			tokenAccountOut: tokenAccountOut,
			owner: trader,
		},
		amountIn: amountIn.numerator.toString(),
		amountOut: slippageOut.integerValue().toString(), //minAmountOut.numerator.toString(), // cryptoguy1119, slippage
		fixedSide: "in"
	});

	const userSetting = await getSettings(telegramId, chain)
	const recentBlock = await connection.getLatestBlockhash('finalized');

	const tipAmount = parseInt(await getCUPriceByPreset(1000000, ex?.priorityFee || userSetting.gasPreset))

	const cu = 300000
	const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ units: cu })
	const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 })

	let instructions = txnInstruction.innerTransaction.instructions

	if (tokenIn === WSOL_ADDRESS) {
		instructions = [
			createAssociatedTokenAccountIdempotentInstruction(
				trader, // payer
				tokenAccountIn, // ata
				trader, // owner
				NATIVE_MINT  // mint
			),
			SystemProgram.transfer({
				fromPubkey: trader,
				toPubkey: tokenAccountIn,
				lamports: parseInt(amountIn.numerator.toString()),
			}),
			createSyncNativeInstruction(tokenAccountIn),
			...instructions,
			createCloseAccountInstruction(
				tokenAccountIn, // token account which you want to close
				trader, // destination
				trader // owner of token account
			)
		]
	} else if (!tokenAccounts.find(t => t.accountInfo.mint.toBase58() === tokenIn)) {
		instructions = [
			createAssociatedTokenAccountIdempotentInstruction(
				trader, // payer
				tokenAccountIn, // ata
				trader, // owner
				new PublicKey(tokenIn)  // mint
			),
			...instructions
		]
	}

	if (!tokenAccounts.find(t => t.accountInfo.mint.toBase58() === tokenOut)) {
		instructions = [
			createAssociatedTokenAccountIdempotentInstruction(
				trader, // payer
				tokenAccountOut, // ata
				trader, // owner
				new PublicKey(tokenOut)  // mint
			),
			...instructions
		]
	}

	if (tokenOut === WSOL_ADDRESS) {
		instructions = [
			...instructions,
			createCloseAccountInstruction(
				tokenAccountOut, // token account which you want to close
				trader, // destination
				trader // owner of token account
			)
		]
	}

	instructions = [modifyComputeUnits, addPriorityFee, ...instructions] // cu calculation should be imported to the raydium swap transaction

	const txList = await buildSimpleTransaction({
		connection: connection,
		makeTxVersion: TxVersion.V0,
		payer: trader,
		innerTransactions: [{
			...txnInstruction.innerTransaction,
			instructions: instructions
		}],
		recentBlockhash: recentBlock.blockhash
	})

	return {
		transaction: txList[0],
		tipAmount
	}
}

export async function buildSwapTokenRaydiumExactInTransaction2(telegramId: string, chain: string, token: string, inputNumber: number, side: string, w: any, slippage?: number, ex?: any) {
	const connection = await newSolWeb3(telegramId, chain)
	const redis = createNewRedisClient()
	const solLP = await findBiggestLP(redis, connection, token)

	if (solLP === null) {
		throw new Error(`${token} not listed with SOL on Raydium`)
	}

	const fp = JSON.parse(JSON.stringify(solLP))
	delete fp['_id']
	delete fp['createdAt']
	delete fp['updatedAt']
	delete fp['__v']
	return await buildSwapRaydiumLPExactInTransaction(telegramId, chain, fp, token, inputNumber, side, w.address, slippage, ex)
}

export async function findBiggestOfPools(connection: any, token: string, pools: any[]) {
	const solLP = pools
	if (solLP.length === 0) return null
	else if (solLP.length === 1) return solLP[0]
	else {
		const BN = getBN()
		let oppositeTokenVaults = []
		solLP.forEach(p => {
			oppositeTokenVaults = [...oppositeTokenVaults, p.baseMint === token? p.quoteVault: p.baseVault]
		})

		const tokenAccounts = await connection.getMultipleAccountsInfo(oppositeTokenVaults.map(u => getSolAccount(u)))
		const tArray = tokenAccounts.map(t => {
			return {
				token: t,
				...SPL_ACCOUNT_LAYOUT.decode(t.data)
			}
		})

		let maxVault = BN(tArray[0].amount.toString())
		let maxIndex = 0
		for (let i = 1; i < tArray.length; i ++) {
			if (maxVault.lt(tArray[i].amount.toString())) {
				maxVault = BN(tArray[i].amount.toString())
				maxIndex = i
			}
		}
		return solLP[maxIndex]
	}
}

export async function findBiggestLP(redis: any, connection: any, token: string) {
	const r1 = await redis.get(`${RAYDIUM_TOKEN_MAGIC}-${token}`) || '[]'
	const pools = JSON.parse(r1)
	const r2 = await Promise.all(pools.map(async p => {
		const poolInfoJson = await redis.get(`${RAYDIUMPOOL_MAGIC}-${p}`)
		return poolInfoJson? JSON.parse(poolInfoJson): null
	}))

	const poolInfos = r2.filter(p => p !== null)
	const solLPArray = poolInfos.filter(lp => lp.baseMint === WSOL_ADDRESS || lp.quoteMint === WSOL_ADDRESS)
	return await findBiggestOfPools(connection, token, solLPArray)
}
