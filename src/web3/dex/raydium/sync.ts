import axios from 'axios'
import fs from 'fs'
import { RaydiumLPInfoModel } from '../../../models/solana/raydium/lp.info.model.js';
import { sleep } from '../../../utils/common.js';
import Logging from '../../../utils/logging.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { chainConfig } from '../../chain.config.js';
import { WSOL_ADDRESS, getSolAccount, newSolWeb3 } from '../../web3.operation.js';
import { LIQUIDITY_STATE_LAYOUT_V4, LIQUIDITY_STATE_LAYOUT_V5, Liquidity, MARKET_STATE_LAYOUT_V3, Market, getMultipleAccountsInfo } from '@raydium-io/raydium-sdk';
import { RaydiumPoolInfoModel } from '../../../models/solana/raydium/pool.info.model.js';
import { RAYDIUM_LIQUIDITY_POOL_AMM } from './trade.js';
import { createNewRedisClient } from '../../../service/multicore/ioredis.js';
import { sendIPCMessage } from '../../../service/multicore/service.js';
import { core_info } from '../../../service/multicore/config.js';
import { getTokenAddressFromPool } from '../../../service/token.service.js';

export const RAYDIUMPOOL_MAGIC = 'solareum-raydiumpoolv4'
export const RAYDIUM_TOKEN_MAGIC = 'solareum-raydium-token-pools'

async function updateRedisTokenPools(redis, poolInfo: any) {
	let tokenAddress = getTokenAddressFromPool(poolInfo)

	if (!tokenAddress) return

	const tokenMagic = `${RAYDIUM_TOKEN_MAGIC}-${tokenAddress}`
	const oldPools = JSON.parse(await redis.get(tokenMagic) || '[]')
	if (oldPools.indexOf(poolInfo.id) < 0) {
		const newSet = JSON.stringify([...oldPools, poolInfo.id])
		await redis.set(tokenMagic, newSet)
	}
}

export async function scanRaydiumProgramPools() {
	await sleep(2000)
	Logging.info(`[scanRaydiumProgramPools] started`)

	const chain = 'solana'
	const connection = await newSolWeb3('', chain)
	const redis = createNewRedisClient()
	const AUTHORITY = Liquidity.getAssociatedAuthority({ programId: RAYDIUM_LIQUIDITY_POOL_AMM }).publicKey

	const allPools: any[] = await RaydiumPoolInfoModel.find()
	const poolFlag = {}
	Logging.info(`[scanRaydiumProgramPools] syncing to redis`)

	for (const p of allPools) {
		poolFlag[p.id] = 'loaded'
		await Promise.all([redis.set(`${RAYDIUMPOOL_MAGIC}-${p.id}`, JSON.stringify(p._doc)), updateRedisTokenPools(redis, p)])
	}
	Logging.info(`[scanRaydiumProgramPools] ${allPools.length} pools were uploaded to redis`)

	{
		const tick = (new Date()).getTime()
		let newCount = 0
		try {
			const ret = await connection.getProgramAccounts(
				RAYDIUM_LIQUIDITY_POOL_AMM,
				{
					filters: [{
						dataSize: 752,
					}]
				}
			)
			const raydiumDexAccounts = ret.value || ret
			Logging.info(`[scanRaydiumProgramPools] ${raydiumDexAccounts.length} pools fetched`)
			// account data size is 752, 2208, 5680
			// size of account of LIQUIDITY_STATE_LAYOUT_V4 is 752 for raydium AMM V4

			const filteredPools = raydiumDexAccounts.filter(r => {
				return poolFlag[r.pubkey.toString()] === undefined
			})

			filteredPools.forEach(r => {
				poolFlag[r.pubkey.toString()] = r.account
			})

			let newLPArray = []

			const poolInfoArrayWithNull = filteredPools.map(pool => {
				const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(pool.account.data);
				// const poolStateV5 = LIQUIDITY_STATE_LAYOUT_V5.decode(pool.account.data);
				if (poolState.baseMint.toString() === '11111111111111111111111111111111' || poolState.quoteMint.toString() === '11111111111111111111111111111111') {
					return null
				}

				return { id: pool.pubkey, ...poolState }
			})
			const poolInfoArray = poolInfoArrayWithNull.filter(p => p !== null)

			let marketInfoArray = []
			for (let i = 0; i < poolInfoArray.length; i += 500) {
				marketInfoArray = [...marketInfoArray, ...await getMultipleAccountsInfo(connection, poolInfoArray.slice(i, i + 500).map(p => p.marketId))]
				Logging.info(`[scanRaydiumProgramPools] fetched account data of ${marketInfoArray.length}`)
			}

			let idx = 0
			let newPools = []
			for (const pool of poolInfoArray) {
				const poolId = pool.id

				try {
					const marketsInfo = marketInfoArray[idx]
					const marketInfo = { programId: marketsInfo.owner, ...MARKET_STATE_LAYOUT_V3.decode(marketsInfo.data) }
					const marketAuthority = Market.getAssociatedAuthority({ programId: pool.marketProgramId, marketId: pool.marketId }).publicKey

					const newLP: any = new RaydiumPoolInfoModel({
						id: poolId.toString(),
						baseMint: pool.baseMint.toString(),
						quoteMint: pool.quoteMint.toString(),
						lpMint: pool.lpMint.toString(),
						baseDecimals: pool.baseDecimal.toNumber(),
						quoteDecimals: pool.quoteDecimal.toNumber(),
						lpDecimals: pool.baseDecimal.toNumber(),
						version: 4,
						programId: RAYDIUM_LIQUIDITY_POOL_AMM.toString(),
						authority: AUTHORITY.toString(),
						openOrders: pool.openOrders.toString(),
						targetOrders: pool.targetOrders.toString(),
						baseVault: pool.baseVault.toString(),
						quoteVault: pool.quoteVault.toString(),
						withdrawQueue: pool.withdrawQueue.toString(),
						lpVault: pool.lpVault.toString(),
						marketProgramId: pool.marketProgramId.toString(),
						marketId: pool.marketId.toString(),
						marketAuthority: marketAuthority.toString(),
						marketBaseVault: marketInfo.baseVault.toString(),
						marketQuoteVault: marketInfo.quoteVault.toString(),
						marketBids: marketInfo.bids.toString(),
						marketAsks: marketInfo.asks.toString(),
						marketVersion: 3,
						marketEventQueue: marketInfo.eventQueue.toString(),
						lookupTableAccount: PublicKey.default.toString(),
					})
					await newLP.save()

					await Promise.all([redis.set(`${RAYDIUMPOOL_MAGIC}-${(newLP._doc || newLP).id}`, JSON.stringify(newLP._doc || newLP)), updateRedisTokenPools(redis, newLP._doc || newLP)])

					newPools = [...newPools, newLP._doc || newLP]
					if (newPools.length % 1000 === 0) {
						Logging.info(`[scanRaydiumProgramPools] saved ${newPools.length} pools in databse`)
					}

					newCount++
					newLPArray = [...newLPArray, [pool.baseMint.toString(), pool.quoteMint.toString()]]
				} catch (err) { }

				idx++
			}

			if (newLPArray.length > 0) {
				console.log(`[scanRaydiumProgramPools] Newly registered ${newLPArray.length} pools in Raydium and uploaded to redis`, newLPArray)
			}
		} catch (err) {
			console.log('[scanRaydiumProgramPools] error')
			console.error(err)
		}
		Logging.info(`[scanRaydiumProgramPools] ${((new Date()).getTime() - tick) / 1000} - ${newCount} pools registered in Raydium`)
	}

	let snipeIdx = 0
	const subscriptionId = connection.onProgramAccountChange(RAYDIUM_LIQUIDITY_POOL_AMM, async (keyedAccountInfo, context) => {
		const poolId = keyedAccountInfo.accountId.toString()
		// const t = await RaydiumPoolInfoModel.findOne({ id: poolId })
		const t = JSON.parse(await redis.get(`${RAYDIUMPOOL_MAGIC}-${poolId}`) || '{}')
		// no pool returns {}
		let processed = false
		if (t.id) {
			processed = true
		} else {
			try {
				const poolRet = await addNewRaydiumPoolInfo(connection, keyedAccountInfo.accountId, keyedAccountInfo.accountInfo.data, redis)
				if (poolRet) {
					Logging.info(`[scanRaydiumProgramPools] added a new pool ${poolRet} and uploaded to redis`)
					processed = true
				}
			} catch { }
		}
		// console.log(keyedAccountInfo, context)
	}, 'processed')

	Logging.info(`Successfully subscribed to monitor all accounts of raydium AMM v4: ${subscriptionId}`)
	while (true) {
		await sleep(1000)
	}
}

export async function addNewRaydiumPoolInfo(connection: Connection, poolId: PublicKey, accountData: Buffer, redis: any) {
	if (accountData.length !== 752) return

	const AUTHORITY = Liquidity.getAssociatedAuthority({ programId: RAYDIUM_LIQUIDITY_POOL_AMM }).publicKey
	const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(accountData);
	// const poolStateV5 = LIQUIDITY_STATE_LAYOUT_V5.decode(pool.account.data);
	if (poolState.baseMint.toString() === '11111111111111111111111111111111' || poolState.quoteMint.toString() === '11111111111111111111111111111111') {
		return
	}

	const m = await connection.getAccountInfo(poolState.marketId)
	const marketInfo = { programId: m.owner, ...MARKET_STATE_LAYOUT_V3.decode(m.data) }
	const marketAuthority = Market.getAssociatedAuthority({ programId: poolState.marketProgramId, marketId: poolState.marketId }).publicKey

	const newLP: any = new RaydiumPoolInfoModel({
		id: poolId.toString(),
		baseMint: poolState.baseMint.toString(),
		quoteMint: poolState.quoteMint.toString(),
		lpMint: poolState.lpMint.toString(),
		baseDecimals: poolState.baseDecimal.toNumber(),
		quoteDecimals: poolState.quoteDecimal.toNumber(),
		lpDecimals: poolState.baseDecimal.toNumber(),
		version: 4,
		programId: RAYDIUM_LIQUIDITY_POOL_AMM.toString(),
		authority: AUTHORITY.toString(),
		openOrders: poolState.openOrders.toString(),
		targetOrders: poolState.targetOrders.toString(),
		baseVault: poolState.baseVault.toString(),
		quoteVault: poolState.quoteVault.toString(),
		withdrawQueue: poolState.withdrawQueue.toString(),
		lpVault: poolState.lpVault.toString(),
		marketProgramId: poolState.marketProgramId.toString(),
		marketId: poolState.marketId.toString(),
		marketAuthority: marketAuthority.toString(),
		marketBaseVault: marketInfo.baseVault.toString(),
		marketQuoteVault: marketInfo.quoteVault.toString(),
		marketBids: marketInfo.bids.toString(),
		marketAsks: marketInfo.asks.toString(),
		marketVersion: 3,
		marketEventQueue: marketInfo.eventQueue.toString(),
		lookupTableAccount: PublicKey.default.toString(),
	})
	await newLP.save()

	await Promise.all([redis.set(`${RAYDIUMPOOL_MAGIC}-${(newLP._doc || newLP).id}`, JSON.stringify(newLP._doc || newLP)), updateRedisTokenPools(redis, newLP._doc || newLP)])

	return poolId
}
