import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { getSelectedChain } from '../../../service/connected.chain.service.js';
import { getWallet } from '../../../service/wallet.service.js';
import Logging from '../../../utils/logging.js';
import { userTransferToken } from '../../../web3/token.interaction.js';
import { ADDRESS_PLACEHOLDER, NUMBER_REGEX, PERCENTAGE_REGEX, SEND_AMOUNT_PLACEHOLDER, TRANSFER_TOKEN_TOKEN_LISTENER, convertValue } from '../../../utils/common.js';
import { ISceneResponse, SceneStageService } from '../../../service/scene.stage.service.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { getBN, isValidAddress } from '../../../web3/web3.operation.js';
import { getTokenBalance } from '../../../web3/multicall.js';

export const transferTokenTokenListener = new Scenes.BaseScene(TRANSFER_TOKEN_TOKEN_LISTENER);

// send a prompt message when user enters scene
transferTokenTokenListener.enter(async (ctx: any) => {
    const telegramId = ctx.update.callback_query.from.id;
    try {
        await updateChatId(telegramId, ctx.chat.id)

        const ret = await ctx.telegram.sendMessage(ctx.chat.id, `What token do you want to send?`, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: {
                force_reply: true,
                input_field_placeholder: ADDRESS_PLACEHOLDER,
            }
        });

        try { ctx.answerCbQuery() } catch { }

        const context = {
            msgBackupToken: JSON.stringify(ret),
            msgBackupTo: null,
            msgBackupAmount: null,
            token: null,
            to: null,
            amount: null,
            tokenSymbol: null,
            tokenBalance: null,
            chain: await getSelectedChain(telegramId),
            addressFrom: null,
        };

        await new SceneStageService().saveScene(telegramId, TRANSFER_TOKEN_TOKEN_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});

export class TransferTokenTokenListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, tt: string, ctx: any) {
        const text = tt
        Logging.info(`TransferTokenTokenListener.class processing scene message [${text}]`)
        const context = JSON.parse(sceneContext.scene.text)
        const chain = context.chain
        if (context.token == null) {
            if (isValidAddress(text)) {
                try {
                    const wallet = await getWallet(telegramId);
					const tokenInfo = await getTokenBalance(chain, text, wallet.address)
                    const symbol = tokenInfo.symbol;

					context.token = text
                    context.tokenSymbol = tokenInfo.symbol;
                    context.tokenBalance = tokenInfo.balance;
                    context.addressFrom = wallet.address;

                    await ctx.telegram.sendMessage(ctx.chat.id, `<b>${symbol}</b>\nPlease input wallet address to transfer <b>${symbol}</b> to`, {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: ADDRESS_PLACEHOLDER,
                        }
                    });

                    await new SceneStageService().saveScene(telegramId, TRANSFER_TOKEN_TOKEN_LISTENER, JSON.stringify(context), new Date());
                } catch (err) {
                    console.error(`==> ${new Date().toLocaleString()}`)
                    console.error(err)
                    Logging.error(err)
                    await new SceneStageService().deleteScene(telegramId)
                }

            } else {
                await ctx.reply(`❌ Invalid CA ${text}`);
                await new SceneStageService().deleteScene(telegramId)
            }
        }
        else if (context.to == null) {
            if (isValidAddress(text)) {
                await ctx.telegram.sendMessage(
                    ctx.chat.id,
                    `How much <b>${context.tokenSymbol}</b> do you want to send? You can use <b>% notation or a regular number</b>.\n\n` + 'If you type <code>100%</code>, it will transfer <b>the entire balance</b>.\n' + `You currently have <code>${context.tokenBalance}</code> <b>${context.tokenSymbol}</b>`,
                    {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: SEND_AMOUNT_PLACEHOLDER,
                        }
                    }
                )

                context.to = text;
                await new SceneStageService().saveScene(telegramId, TRANSFER_TOKEN_TOKEN_LISTENER, JSON.stringify(context), new Date());
            } else {
                await ctx.reply(`❌ Invalid address ${text}`);
                await new SceneStageService().deleteScene(telegramId)
            }
        }
        else if (context.amount == null) {
			const oldInfo = await getTokenBalance(chain, context.token, context.addressFrom);
			const BN = getBN()
			const val = convertValue(oldInfo.balance, text, BN)
            if (!BN(val).isNaN()) {
                const tx = await userTransferToken(telegramId, chain, context.token, context.to, text);
                const tokenInfo = await getTokenBalance(chain, context.token, context.addressFrom);

				await ctx.reply(`You have <code>${tokenInfo.balance}</code> <b>${tokenInfo.symbol}</b>`, {
					parse_mode: botEnum.PARSE_MODE_V2
				});
                await new SceneStageService().deleteScene(telegramId);
            }
            else {
                await ctx.reply(`❌ Invalid amount`);
                await new SceneStageService().deleteScene(telegramId)
            }
        }
    }
}
