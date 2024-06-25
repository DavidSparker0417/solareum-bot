import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { getSelectedChain } from '../../../service/connected.chain.service.js';
import { getNativeCurrencySymbol } from '../../../web3/chain.parameters.js';
import { MANUAL_BUY_TOKEN_LISTENER } from '../../../utils/common.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { userETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';

export const manualBuyAmountListener = new Scenes.BaseScene(MANUAL_BUY_TOKEN_LISTENER);

// send a prompt message when user enters scene
manualBuyAmountListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;
    try {
        await updateChatId(telegramId, ctx.chat.id)

        const chain = await getSelectedChain(telegramId)
        const label = await getNativeCurrencySymbol(chain)
        const myETHBal = await userETHBalance(telegramId, chain)

        const ret = await ctx.telegram.sendMessage(
            ctx.chat.id,
            `How much ${label} do you want to buy by? You can use % notation or a regular number.\n\n` +
            'If you type 100%, it will transfer the entire balance.\n' +
            `You currently have <b>${myETHBal} ${label}</b>`,
            {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            }
        );

        const context = {
            msgBackupAmount: JSON.stringify(ret),
            msgBackupToken: null,
            token: null,
            amount: null,
            chain: chain
        };

        await new SceneStageService().saveScene(telegramId, MANUAL_BUY_TOKEN_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});
