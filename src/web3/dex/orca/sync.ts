import axios from 'axios'
import fs from 'fs'
import { sleep } from '../../../utils/common.js';
import Logging from '../../../utils/logging.js';
import { OrcaWhirlPoolInfoModel } from '../../../models/solana/orca/whirlpool.model.js';

export const ORCA_WHIRLPOOLS_JSON = 'https://api.mainnet.orca.so/v1/whirlpool/list/';

export async function pollSyncOrcaWhirlpools() {
	while (true) {
		const resp = await axios.get(ORCA_WHIRLPOOLS_JSON)
		const liquidityJson = resp.data
		const tick = (new Date()).getTime()
		let newCount = 0
		let newLPArray = []
		for (const lp of liquidityJson.whirlpools) {
			try {
				const newLP = new OrcaWhirlPoolInfoModel({
					address: lp.address,
					tokenA: lp.tokenA.mint,
					tokenB: lp.tokenB.mint,
					whitelisted: lp.whitelisted,
					tickSpacing: lp.tickSpacing,
					price: lp.price,
					lpFeeRate: lp.lpFeeRate,
					protocolFeeRate: lp.protocolFeeRate,
					whirlpoolsConfig: lp.whirlpoolsConfig
				})
				await newLP.save()
				newCount ++
				newLPArray = [...newLPArray, [lp.tokenA.mint, lp.tokenB.mint]]
			} catch { }
		}
		Logging.info(`${((new Date()).getTime() - tick) / 1000} - ${newCount} registered in Orca`)
		if (newLPArray.length > 0) {
			console.log('Newly registered in Orca', newLPArray)
		}

		await sleep(30000)
	}
}
