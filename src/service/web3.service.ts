import { RaydiumPoolInfoModel } from "../models/solana/raydium/pool.info.model";
import { getChainTokens } from "../web3/chain.parameters";
import { WSOL_ADDRESS } from "../web3/web3.operation";
import { FilteredPairInfo } from "./name.filter.service";

export async function getTokenCaFromPair(info: FilteredPairInfo): Promise<string | unknown> {
	try {
		let poolInfo
		poolInfo = await RaydiumPoolInfoModel.findOne({ id: info.pairAddress })
		if (!poolInfo) {
			poolInfo = await RaydiumPoolInfoModel.findOne({ id: { $regex: new RegExp(info.pairAddress, 'i')} })
		}
		const chains = await getChainTokens(info.chain)
		if (poolInfo.baseMint === WSOL_ADDRESS) return poolInfo.quoteMint
		else if (poolInfo.quoteMint === WSOL_ADDRESS) return poolInfo.baseMint
		else if (chains.indexOf(poolInfo.baseMint) > 0) return poolInfo.quoteMint
		else if (chains.indexOf(poolInfo.quoteMint) > 0) return poolInfo.baseMint
	} catch { }
}
