import { botEnum } from "../../../constants/botEnum.js";
import { updateChatId } from "../../../service/app.user.service.js";
import { processError } from "../../../service/error.js";
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js"
import { getTokenInfo } from "../../../service/token.service.js";
import { MANUAL_BUY_TOKEN_LISTENER, NUMBER_REGEX, PERCENTAGE_REGEX } from "../../../utils/common.js";
import Logging from "../../../utils/logging.js"
import { getNativeCurrencySymbol } from "../../../web3/chain.parameters.js";
import { userSwapETHForTokens } from "../../../web3/dex.interaction.js";
import { isValidAddress } from "../../../web3/web3.operation.js";

export class ManualBuyAmountListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`ManualBuyAmountListener.class processing scene message [${text}]`)

        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)
        const chain = context.chain
        const label = await getNativeCurrencySymbol(chain);
        if (context.amount === null) {
            if (PERCENTAGE_REGEX.test(text) || NUMBER_REGEX.test(text)) {
                await ctx.telegram.sendMessage(ctx.chat.id, `You are buying by <b>${text} ${label}</b>\n`, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });

                await ctx.telegram.sendMessage(ctx.chat.id, `Which token do you want to buy?`, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: {
                        force_reply: true
                    }
                })
                context.amount = text;
                await new SceneStageService().saveScene(telegramId, MANUAL_BUY_TOKEN_LISTENER, JSON.stringify(context), new Date());

            } else {
                await ctx.reply(`❌ Invalid amount`);
                await new SceneStageService().deleteScene(telegramId)
            }
        } else if (context.token === null) {
            const addr = text
            if (isValidAddress(addr)) {
                let tokenInfo = await getTokenInfo(chain, addr);
                const symbol = tokenInfo.symbol;

                await ctx.telegram.sendMessage(ctx.chat.id, `You are going to buy <code>${symbol}</code> by <b>${context.amount} ${label}</b>`, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });

                try {
                    const tx = await userSwapETHForTokens(telegramId, chain, addr, context.amount);
                } catch (e) {
                    await processError(ctx, telegramId, e)
                }
            } else {
                await ctx.reply(`❌ Invalid address ${addr}`);
                await new SceneStageService().deleteScene(telegramId)
            }
        }
    }
}