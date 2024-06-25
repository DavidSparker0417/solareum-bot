import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { getSelectedChain } from '../../../service/connected.chain.service.js';
import { MANUAL_SELL_TOKEN_LISTENER } from '../../../utils/common.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';

export const manualSellTokenListener = new Scenes.BaseScene(MANUAL_SELL_TOKEN_LISTENER);

// send a prompt message when user enters scene
manualSellTokenListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id
    try {
        await updateChatId(telegramId, ctx.chat.id)

        const chain = await getSelectedChain(telegramId)
        const ret = await ctx.telegram.sendMessage(ctx.chat.id, `Which token do you want to sell?`, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: {
                force_reply: true
            }
        });

        const context = {
            msgBackupToken: JSON.stringify(ret),
            msgBackupAmount: null,
            token: null,
            amount: null,
            chain: chain
        };

        await new SceneStageService().saveScene(telegramId, MANUAL_SELL_TOKEN_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});
