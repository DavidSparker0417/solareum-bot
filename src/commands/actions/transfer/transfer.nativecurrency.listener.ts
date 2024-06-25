import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { getSelectedChain } from '../../../service/connected.chain.service.js';
import { processError } from '../../../service/error.js';
import Logging from '../../../utils/logging.js';
import { getNativeCurrencySymbol } from '../../../web3/chain.parameters.js';
import { ADDRESS_PLACEHOLDER, NUMBER_REGEX, PERCENTAGE_REGEX, SEND_AMOUNT_PLACEHOLDER, TRANSFER_NATIVE_CURRENCY_LISTENER, convertValue } from '../../../utils/common.js';
import { ISceneResponse, SceneStageService } from '../../../service/scene.stage.service.js';
import { userETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';
import { userTransferETH } from '../../../web3/nativecurrency/nativecurrency.transaction.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { getBN, isValidAddress } from '../../../web3/web3.operation.js';

export const transferNativeCurrencyToListener = new Scenes.BaseScene(TRANSFER_NATIVE_CURRENCY_LISTENER);

// send a prompt message when user enters scene
transferNativeCurrencyToListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;
    try {
        await updateChatId(telegramId, ctx.chat.id)

        let chain = await getSelectedChain(telegramId);
        let label = await getNativeCurrencySymbol(chain);

        const ret = await ctx.telegram.sendMessage(ctx.chat.id, `What address do you want to send <b>${label}</b> to?`, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: {
                force_reply: true,
                input_field_placeholder: ADDRESS_PLACEHOLDER,
            }
        });

        try { ctx.answerCbQuery() } catch { }


        const context = {
            msgBackupTo: JSON.stringify(ret),
            msgBackupAmount: null,
            to: null,
            amount: null,
            chain: chain,
            label: label,
            lastMessage: ctx.update.callback_query.message.message_id,

        };

        await new SceneStageService().saveScene(telegramId, TRANSFER_NATIVE_CURRENCY_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});


export class TransferNativeCurrencyToListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`TransferNativeCurrencyToListener.class processing scene message [${text}]`)
        const context = JSON.parse(sceneContext.scene.text)
        if (context.to === null) {
            const addr = text
            if (isValidAddress(addr)) {
                let label;
                let myETHBal;

                const multiResponse = await Promise.all([
                    await getNativeCurrencySymbol(context.chain),
                    await userETHBalance(telegramId, context.chain),
                ]);

                label = multiResponse[0]
                myETHBal = multiResponse[1]

                await ctx.telegram.sendMessage(
                    ctx.chat.id,
                    `How much <b>${label}</b> do you want to send? You can use <b>% notation or a regular number</b>.\n\n` +
                    'If you type <b>100%</b>, it will transfer <b>the entire balance</b>.\n' +
                    `You currently have <code>${myETHBal}</code> <b>${label}</b>`,
                    {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: SEND_AMOUNT_PLACEHOLDER,
                        }
                    }
                );
                context.to = addr;

                await new SceneStageService().saveScene(telegramId, TRANSFER_NATIVE_CURRENCY_LISTENER, JSON.stringify(context), new Date());

            } else {
                await ctx.reply(`❌ Invalid address ${addr}`);
                await new SceneStageService().deleteScene(telegramId)
            }
        } else if (context.amount == null) {
            try {
				const BN = getBN()
				const oldBal = await userETHBalance(telegramId, context.chain);
				const amountDecimal = convertValue(oldBal, text, BN)
                if (!BN(amountDecimal).isNaN()) {
                    const tx = await userTransferETH(telegramId, context.chain, context.to, amountDecimal, {regulate: true});
                    
                    const symbol = await getNativeCurrencySymbol(context.chain);
					const bal = await userETHBalance(telegramId, context.chain);
                    if (tx?.transactionHash) {
                    } else {
                        await ctx.reply(`You have <b>${bal} ${symbol}</b>`, {
                            parse_mode: botEnum.PARSE_MODE_V2
                        });
                    }

                    await new SceneStageService().deleteScene(telegramId);
                } else {
                    await ctx.reply(`❌ Invalid amount`);
                    await new SceneStageService().deleteScene(telegramId)
                }
            }
            catch (err) {
                await new SceneStageService().deleteScene(telegramId)
                await processError(ctx, telegramId, err);
                return;
            }
        }
    }
}

