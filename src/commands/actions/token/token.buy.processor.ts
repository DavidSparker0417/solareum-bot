import { botEnum } from "../../../constants/botEnum.js";
import { SolanaTokenInfoModel } from "../../../models/solana/solana.token.info.model.js";
import { updateChatId } from "../../../service/app.user.service.js";
import { processError } from "../../../service/error.js";
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js";
import { getWallet } from "../../../service/wallet.service.js";
import { NUMBER_REGEX, PERCENTAGE_REGEX } from "../../../utils/common.js";
import Logging from "../../../utils/logging.js";
import { getNativeCurrencySymbol } from "../../../web3/chain.parameters.js";
import { userSwapETHForTokens, userSwapETHForTokensByTokenAmount } from "../../../web3/dex.interaction.js";
import { getTokenBalance } from "../../../web3/multicall.js";

export class TokenBuyXETHAmountListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`TokenBuyXETHAmountListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)
        if (context.amount === null) {
            if (PERCENTAGE_REGEX.test(text) || NUMBER_REGEX.test(text)) {
                const tokenInfo = await SolanaTokenInfoModel.findById(context.tokenInfoId)
                const chain = tokenInfo.chain
                const token = tokenInfo.address

                const symbol = await getNativeCurrencySymbol(chain)

                await ctx.telegram.sendMessage(ctx.chat.id, `You are buying by <b>${text} ${symbol}</b>\n`, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });

                await new SceneStageService().deleteScene(telegramId);

                await buyTokenByAmount(telegramId, ctx, chain, token, text)

            } else {
                await ctx.reply(`❌ Invalid amount`);
                await new SceneStageService().deleteScene(telegramId)
            }
        }
    }
}

export class TokenBuyXTokenAmountListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`TokenBuyXTokenAmountListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)
        if (context.amount === null) {
            if (PERCENTAGE_REGEX.test(text) || NUMBER_REGEX.test(text)) {
                const tokenInfo = await SolanaTokenInfoModel.findById(context.tokenInfoId)
                const chain = tokenInfo.chain
                const token = tokenInfo.address

                let tx;
                try {
                    tx = await userSwapETHForTokensByTokenAmount(telegramId, chain, token, text);
                } catch (err) {
                    await processError(ctx, telegramId, err);
                    return;
                }
                const w = await getWallet(telegramId);
                const tInfo = await getTokenBalance(chain, token, w.address);

				await ctx.reply(`You have <code>${tInfo.balance}</code> <b>💦${tInfo.symbol}</b>`, {
					parse_mode: botEnum.PARSE_MODE_V2
				});

                await new SceneStageService().deleteScene(telegramId);

            } else {
                await ctx.reply(`❌ Invalid amount`);
                await new SceneStageService().deleteScene(telegramId)
            }
        }
    }
}

async function buyTokenByAmount(telegramId: string, ctx: any, chain: string, token: string, amount: string) {
    let tx;
    try {
        tx = await userSwapETHForTokens(telegramId, chain, token, amount);
    } catch (err) {
        await processError(ctx, telegramId, err);
        return;
    }
    // const w = await getWallet(telegramId);
    // const tokenInfo = await getTokenBalance(chain, token, w.address);
    // if (tx?.transactionHash) {
    // } else {
    //     await ctx.reply(`You have <b>${tokenInfo.balance} 💦${tokenInfo.symbol}</b>`, {
    //         parse_mode: botEnum.PARSE_MODE_V2
    //     });
    // }
}
