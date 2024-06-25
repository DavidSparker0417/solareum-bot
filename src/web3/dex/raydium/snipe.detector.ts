import { struct, u8 } from '@solana/buffer-layout';
import { u64 } from '@solana/buffer-layout-utils';
import { WSOL_ADDRESS, getBN, newSolWeb3 } from '../../web3.operation.js';
import { sleep } from '../../../utils/common.js';
import { AccountInfo, Context, PublicKey, Transaction } from '@solana/web3.js'
import bs58 from 'bs58';
import { RAYDIUM_LIQUIDITY_POOL_AMM, findBiggestLP, parsePoolInfo } from './trade.js';
import { SnipeSyncModel, SnipeTokenModel } from '../../../models/snipe.godmode.token.js';
import Logging from '../../../utils/logging.js';
import { processSnipe } from './snipe.processor.js';
import { sendIPCMessage } from '../../../service/multicore/service.js';
import { core_info } from '../../../service/multicore/config.js';
import { createNewRedisClient } from '../../../service/multicore/ioredis.js';
import { RAYDIUMPOOL_MAGIC } from './sync.js';
import { getTokenAddressFromPool } from '../../../service/token.service.js';
import { sendBotMessage } from '../../../service/app.service.js';

let redisClient
let solWeb3
// https://docs.raydium.io/raydium/protocol/developers/addresses

export async function pollSnipeMinitor() {
	let snipeIdx = 0
	const chain = 'solana'

	const snipeTokenSubscribeId = {}
	const connection = await newSolWeb3('', chain)
	const redis = createNewRedisClient()

	while (true) {
		const snipes: any[] = await SnipeTokenModel.find({ state: 'pending', disabled: false }).populate('token').populate('user');
		const snipeTokens = snipes.map(sn => sn.token.address)
		const uniqueSnipeTokens = snipeTokens.filter((t, idx) => idx === snipeTokens.indexOf(t))
		const oldSubscribedTokens = Object.keys(snipeTokenSubscribeId)
		await Promise.all(uniqueSnipeTokens.map(async t => {
			if (!snipeTokenSubscribeId[t]) {
				try {
					const poolInfo = await findBiggestLP(redis, connection, t)
					const tokenVault = (poolInfo.baseMint === t) ? poolInfo.baseVault : poolInfo.quoteVault

					snipeTokenSubscribeId[t] = connection.onAccountChange(new PublicKey(tokenVault), async (accountInfo: AccountInfo<Buffer>, context: Context) => {
						snipeIdx = (snipeIdx + 1) % core_info[chain].snipes.length
						await sendIPCMessage(core_info[chain].snipes[snipeIdx], chain, JSON.stringify({
							discriminator: 'snipe-check',
							poolId: poolInfo.id,
							slot: context.slot
						}))
					}, 'processed')
				} catch { }
			}
		}))
		const subscribedTokens = Object.keys(snipeTokenSubscribeId)
		if (subscribedTokens.length > oldSubscribedTokens.length) Logging.info(`${subscribedTokens.length - oldSubscribedTokens.length} new snipes subscribed`)

		const dirtyTokens = subscribedTokens.filter(t => uniqueSnipeTokens.indexOf(t) < 0)
		for (const t of dirtyTokens) {
			connection.removeAccountChangeListener(snipeTokenSubscribeId[t])
			delete snipeTokenSubscribeId[t]
		}
		if (dirtyTokens.length > 0) Logging.info(`${dirtyTokens.length} dirty snipe subscription cleaned`)
		await sleep(1000)
	}
}

export async function checkAndGoRaydiumSnipeDynamic(poolId: any) {
	const chain = 'solana'
	if (!solWeb3) {
		solWeb3 = await newSolWeb3('', chain)
	}

	if (!redisClient) {
		redisClient = createNewRedisClient()
	}

	const connection = solWeb3
	const redis = redisClient

	const poolInfo = JSON.parse(await redis.get(`${RAYDIUMPOOL_MAGIC}-${poolId}`) || '{}')
	if (!poolInfo.id) {
		Logging.error(`Raydium pool ${poolId} not loaded or does not exist`)
		return
	}

	const tokenAddress = getTokenAddressFromPool(poolInfo)
	if (!tokenAddress || (poolInfo.baseMint !== WSOL_ADDRESS && poolInfo.quoteMint !== WSOL_ADDRESS)) {
		return
	}

	const snipes: any[] = await SnipeTokenModel.find({ state: 'pending', disabled: false }).populate({
		path: 'token',
		match: { address: tokenAddress }
	}).populate('user');
	const filteredSnipes = snipes.filter(s => s.token !== null)

	if (filteredSnipes.length === 0) return

	await Promise.all(filteredSnipes.map(async sn => {
		const newSync = new SnipeSyncModel({
			snipe: sn._id.toString()
		})

		try {
			await newSync.save()

			try {
				const txnInfo = await processSnipe(sn, connection, poolId, undefined, { simulate: true })
				const simRes = await connection.simulateTransaction(txnInfo.transaction)
				if (simRes.value.err === null) {
					try {
						sn.state = 'processing'
						await sn.save()

						await processSnipe(sn, connection, poolId)
					} catch (err) {
						sn.state = 'error'
						await sn.save()
					}
				} else {
					throw new Error(JSON.stringify(simRes.value.err))
				}
			} catch (err) {
				console.error(err)
				sn.state = 'error'
				await sn.save()
				Logging.error(`[checkAndGoRaydiumSnipeDynamic] Error token ${tokenAddress}, snipe ${sn._id.toString()}`)
				await sendBotMessage(sn.user.telegramId, `❌ Error sniping <code>${tokenAddress}</code>`)
			}

			await SnipeSyncModel.deleteOne({ snipe: sn._id.toString() })
		} catch { }
	}))
}
