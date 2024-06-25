import { MonitorInfoModel } from "../models/monitor.info.model.js";
import { getBN } from "../web3/web3.operation.js";

export async function updateSellMonitorInfo(chain: string, token: string, user: string, tokenSold: string, ethAmount: string) {
}

export async function updateBuyMonitorInfo(chain: string, token: string, user: string, tokenBought: string, ethAmount: string) {
}

export async function getPriceImpact(chain: string, token: string, user: string) {
    const BN = getBN()
    const mArray = await MonitorInfoModel.find({ chain: chain, token: token, user: user })
    if (mArray.length === 0) return '0.00'

    const totalPriceImpactCount = mArray.reduce((prev, cur) => prev.plus(cur.priceImpactCount || 0), BN(0))
    const totalPriceImpactSum = mArray.reduce((prev, cur) => prev.plus(cur.priceImpactSum || 0), BN(0))

    if (totalPriceImpactCount.eq(0)) return '0.00'

    return totalPriceImpactSum.times(100).div(totalPriceImpactCount).toString()
}
