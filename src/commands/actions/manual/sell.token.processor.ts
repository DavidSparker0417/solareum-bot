import { botEnum } from "../../../constants/botEnum.js"
import { updateChatId } from "../../../service/app.user.service.js"
import { processError } from "../../../service/error.js"
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js"
import { getWallet } from "../../../service/wallet.service.js"
import { MANUAL_SELL_TOKEN_LISTENER } from "../../../utils/common.js"
import Logging from "../../../utils/logging.js"
import { userSwapTokenForETH } from "../../../web3/dex.interaction.js"
import { getTokenBalance } from "../../../web3/multicall.js"
import { isValidAddress } from "../../../web3/web3.operation.js"

export class ManualSellTokenListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`ManualSellTokenListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)
        const w = await getWallet(telegramId);
        const chain = context.chain
        if (context.token === null) {
            const addr = text
            if (isValidAddress(addr)) {

                const tokenInfo = await getTokenBalance(chain, addr, w.address);
                const symbol = tokenInfo.symbol;

                ctx.telegram.sendMessage(
                    ctx.chat.id,
                    `How much ${symbol} do you want to sell? You can use % notation or a regular number.\n\n` +
                    'If you type 100%, it will transfer the entire balance.\n' +
                    `You currently have <b>${tokenInfo.balance} ${symbol}</b>`,
                    {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: {
                            force_reply: true
                        }
                    }
                );

                context.token = addr;
                await new SceneStageService().saveScene(telegramId, MANUAL_SELL_TOKEN_LISTENER, JSON.stringify(context), new Date());

            } else {
                await ctx.reply(`❌ Invalid address ${addr}`);
                await new SceneStageService().deleteScene(telegramId)
            }
        } else if (context.amount === null) {
            try {
                const tx = await userSwapTokenForETH(telegramId, chain, context.token, text);
            } catch (err) {
                await processError(ctx, telegramId, err);
                return;
            }
        }
    }
}