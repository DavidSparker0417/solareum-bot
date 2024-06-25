import { botEnum } from "../../../constants/botEnum.js"
import { updateChatId, userVerboseLog } from "../../../service/app.user.service.js"
import { processBridgeETH2SOL, processBridgeSOL2ETH, registerBridgeETH2SOL, registerBridgeSOL2ETH } from "../../../service/bridge.service.js"
import { processError } from "../../../service/error.js"
import { getEvmWallet } from "../../../service/evm.wallet.service.js"
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js"
import { ADDRESS_PLACEHOLDER, BRIDGE_LISTENER, convertValue } from "../../../utils/common.js"
import { getBridgeEth2SolMarkup, getBridgeSol2EthMarkup } from "../../../utils/inline.markups.js"
import Logging from "../../../utils/logging.js"
import { getBridgeEth2SolMessage, getBridgeSol2EthMessage } from "../../../utils/messages.js"
import { getEvmETHBalance, isValidEvmAddress } from "../../../web3/evm.web3.operation.js"
import { userETHBalance } from "../../../web3/nativecurrency/nativecurrency.query.js"
import { getBN, isValidAddress } from "../../../web3/web3.operation.js"

export class BridgeListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`BridgeListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)

        try {
            if (context.inputType === 'solana-to-ethereum') {
                await processBridgeSol2Eth(telegramId, text, ctx, context)
            } else if (context.inputType === 'ethereum-to-solana') {
                await processBridgeEth2Sol(telegramId, text, ctx, context)
            }
        }
        catch (err) {
            await processError(ctx, telegramId, err, true)
			await new SceneStageService().deleteScene(telegramId)
        }
    }
}

async function processBridgeSol2Eth(telegramId: string, text: string, ctx: any, context: any) {
    await userVerboseLog(telegramId, `/bridge solana-to-ethereum`)

	if (!context.solAmount) {
		const BN = getBN()
		const solBal = await userETHBalance(telegramId, 'solana')
		const bal = convertValue(solBal, text, BN)
		if (BN(bal).isNaN() || BN(text).lte(0)) {
			await ctx.reply('❌ Please input correct value.')
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());
		} else {
			context.solAmount = text
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());

			await ctx.telegram.sendMessage(ctx.chat.id, `Please input <b>destination ethereum address</b> to transfer <b>ETH</b> to`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
					input_field_placeholder: '0x1234....abcdef'
                }
            });
		}
	} else if (!context.to) {
		if (true === isValidEvmAddress(text)) {
			context.to = text
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());

			const processingId = await registerBridgeSOL2ETH(telegramId, context.solAmount, context.to)

			await ctx.telegram.sendMessage(ctx.chat.id, await getBridgeSol2EthMessage(telegramId, processingId), {
				parse_mode: botEnum.PARSE_MODE_V2,
				reply_markup: await getBridgeSol2EthMarkup(telegramId, processingId)
			})

			processBridgeSOL2ETH(processingId)
		} else {
			await ctx.reply('❌ Please input valid ethereum address')
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());
		}
	} else {
		await new SceneStageService().deleteScene(telegramId)
	}
}

async function processBridgeEth2Sol(telegramId: string, text: string, ctx: any, context: any) {
    await userVerboseLog(telegramId, `/bridge ethereum-to-solana`)

	if (!context.ethAmount) {
		const BN = getBN()
		const w = await getEvmWallet(telegramId)
		const ethBal = await getEvmETHBalance(w.address)
		const bal = convertValue(ethBal, text, BN)
		if (BN(bal).isNaN() || BN(text).lte(0)) {
			await ctx.reply('❌ Please input correct value.')
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());
		} else {
			context.ethAmount = text
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());

			await ctx.telegram.sendMessage(ctx.chat.id, `Please input <b>destination solana address</b> to transfer <b>SOL</b> to`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
					input_field_placeholder: ADDRESS_PLACEHOLDER
                }
            });
		}
	} else if (!context.to) {
		if (true === isValidAddress(text)) {
			context.to = text
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());

			const processingId = await registerBridgeETH2SOL(telegramId, context.ethAmount, context.to)

			await ctx.telegram.sendMessage(ctx.chat.id, await getBridgeEth2SolMessage(telegramId, processingId), {
				parse_mode: botEnum.PARSE_MODE_V2,
				reply_markup: await getBridgeEth2SolMarkup(telegramId, processingId)
			})

			processBridgeETH2SOL(processingId)
		} else {
			await ctx.reply('❌ Please input valid ethereum address')
			await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());
		}
	} else {
		await new SceneStageService().deleteScene(telegramId)
	}
}
