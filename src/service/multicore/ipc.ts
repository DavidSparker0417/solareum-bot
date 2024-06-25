import { chainConfig } from "../../web3/chain.config.js"
import fs from 'fs'

export const MAX_ICORE_COUNT = 64

export function getCoreIPCPath(chain: string, serveId: number) {
    return `/tmp/${chain}-${serveId}.sock`
}
