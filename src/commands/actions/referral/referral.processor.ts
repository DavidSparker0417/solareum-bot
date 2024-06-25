import { botEnum } from "../../../constants/botEnum.js"
import { updateChatId, userVerboseLog } from "../../../service/app.user.service.js"
import { getSelectedChain } from "../../../service/connected.chain.service.js"
import { processError } from "../../../service/error.js"
import { getReferralLink, updateReferralWallet } from "../../../service/referral.service.js"
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js"
import { getTokenInfo } from "../../../service/token.service.js"
import { INVALID_WALLET_ADDRESS } from "../../../utils/common.js"
import { getReferralMarkup } from "../../../utils/inline.markups.js"
import Logging from "../../../utils/logging.js"
import { getReferralMessage } from "../../../utils/messages.js"
import { prefetchTokensOnChain } from "../../../web3/multicall.js"
import { isValidAddress } from "../../../web3/web3.operation.js"

export class ReferralListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`ReferralListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)

        try {
            if (context.inputType === 'update-payee-wallet') {
                await processReferralWallet(telegramId, text, ctx, context)
            } else if (context.inputType === 'generate-referral-token-ca') {
                await processReferralByTokenCa(telegramId, text, ctx, context)
            }
        }
        catch (err) {
            await processError(ctx, telegramId, err)
        }
    }
}

async function processReferralWallet(telegramId: string, text: string, ctx: any, context: any) {
    if (true !== isValidAddress(text)) {
        throw new Error(INVALID_WALLET_ADDRESS);
    }

    await updateReferralWallet(telegramId, text);

    await userVerboseLog(telegramId, `/referral update-payee-wallet`)

    await ctx.telegram.sendMessage(ctx.chat.id, `✅ Successfully set referral payee wallet address`, {
        parse_mode: botEnum.PARSE_MODE_V2
    })

    await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getReferralMessage(telegramId), {
        parse_mode: botEnum.PARSE_MODE_V2,
        reply_markup: await getReferralMarkup()
    });

    await new SceneStageService().deleteScene(telegramId)
}

async function processReferralByTokenCa(telegramId: string, text: string, ctx: any, context: any) {
	const chain = await getSelectedChain(telegramId)

	await userVerboseLog(telegramId, `/referral generate by token ca`)

    let tokenInfo = await getTokenInfo(chain, text)
	if (tokenInfo === null) {
		await prefetchTokensOnChain(chain, JSON.stringify([text]))
		tokenInfo = await getTokenInfo(chain, text)
	}

	if (tokenInfo === null) {
		await ctx.reply(`❌ Invalid token address`, {
			parse_mode: botEnum.PARSE_MODE_V2
		})
		return
	}

	const link = await getReferralLink(telegramId)
    await ctx.telegram.sendMessage(ctx.chat.id, `✅ Successfully generated referral link\n${link}_${tokenInfo.address}`, {
        parse_mode: botEnum.PARSE_MODE_V2
    })

    await new SceneStageService().deleteScene(telegramId)
}
