const ipc = require('node-ipc').default;
import { handleBotHookMessage } from "../../hook.js";
import { getBotInstance } from "../../web3/chain.parameters.js";
import { checkAndGoRaydiumSnipeDynamic, pollSnipeMinitor } from "../../web3/dex/raydium/snipe.detector.js";
import { scanRaydiumProgramPools } from "../../web3/dex/raydium/sync.js";
import { core_info, getAllCores } from "./config.js";
import { createNewRedisClient, createNewSubscribedClient } from "./ioredis.js";
import { getCoreIPCPath } from "./ipc.js";

export const IPC_MESSAGE_DISC = 'ipc-message-discriminator'
export const SOCKET_DISC = 'core-socket'
const STARTUP_MAGIC = 'solareum-startup'

let ipcReceiverInst
let ipcSenderInst

function createIPCMessageReceiver(coreId: number, chain: string) {
    const socketPath = getCoreIPCPath(chain, coreId)

	if (false) {
		ipc.serve(
			socketPath,
			function () {
				ipc.server.on(
					IPC_MESSAGE_DISC,
					function (data, socket) {
						const obj = JSON.parse(data)

						processIPCMessage(coreId, {
							chain: chain,
							...obj
						})

						// fs.appendFileSync(`./debug/${chain}-${serveId}.json`, data + ',')

						// const logMsg = `core-handler: ${chain}-${serveId}-${obj.blocks.length} blocks, ${obj.transactions.length} transactions, ${obj.receipts.length} receipts`
						// console.log(logMsg)
						// sendBotMessage('2068377064', logMsg)
					}
				);
			}
		)

		ipc.server.start()
		ipc.server.log = () => { }
	} else {
		ipcReceiverInst = createNewSubscribedClient([socketPath], (channel: string, message: string) => {
			// console.log('<<<<', new Date().getTime() / 1000, channel, message)
			try {
				const obj = JSON.parse(message)
				processIPCMessage(coreId, {
					chain: chain,
					...obj
				})
			} catch {}
		})
	}

    console.log(`pid ${process.pid} listening on ${socketPath}`);
}

function createIPCMessageSender(coreId: number, chain: string) {
	ipcSenderInst = createNewRedisClient()
}

export const sendIPCMessage = async (coreId: number, chain: string, data: string) => {
	if (false) {
		const ipcHandler = ipc.of[SOCKET_DISC + `-${coreId}-${chain}`]
		ipcHandler.emit(IPC_MESSAGE_DISC, data)
	} else {
		const socketPath = await getCoreIPCPath(chain, coreId)
		// console.log('>>>>', new Date().getTime() / 1000, socketPath, data)
		await ipcSenderInst.publish(socketPath, data);
	}
}

export const sendCopytradeMessage = async (chain: string, data: string) => {
    const coreId = core_info[chain].copytrade
    await sendIPCMessage(coreId, chain, data)
}

async function processIPCMessage(coreId: number, data: any) {
    if (data.discriminator === 'sync-data') {
    } else if (data.discriminator === 'bot-action-data') {
    } else if (data.discriminator === 'snipe-check') {
		await checkAndGoRaydiumSnipeDynamic(data.poolId)
    } else if (data.discriminator === 'snipe-bulk') {
		const snipes = data.snipes
    } else if (data.discriminator === 'bot-webhook') {
		await handleBotHookMessage(getBotInstance(), data.content)
	} else {
        console.log('>>> unknown data found', coreId, data)
    }
}

export async function createBackgroundService(coreId: number, chain: string) {
    createIPCMessageReceiver(coreId, chain)
	createIPCMessageSender(coreId, chain)

	ipcSenderInst.set(`${STARTUP_MAGIC}-${coreId}`, 'started')

    const serveIdArray = getAllCores(chain)

	while (true) {
		let startedCount = 0
		for (const id of serveIdArray) {
			if ('started' === await ipcSenderInst.get(`${STARTUP_MAGIC}-${id}`))  {
				startedCount ++
			}
		}
		if (startedCount === serveIdArray.length) break
	}

	if (coreId === core_info[chain].sync) {
		// pollSyncOrcaWhirlpools()
		scanRaydiumProgramPools()
		// scanFromChain(chain)
		// scanPendingTransactions(chain)
	} else if (coreId === core_info[chain].snipe) {
		// pollRaydiumSnipe()
		pollSnipeMinitor()
	}
}

export async function resetIPC(chain: string) {
	createIPCMessageSender(0, chain)

    const serveIdArray = getAllCores(chain)
	await Promise.all(serveIdArray.map(async coreId => {
		await ipcSenderInst.set(`${STARTUP_MAGIC}-${coreId}`, '')
	}))
}

