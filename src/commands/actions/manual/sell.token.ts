import { botEnum } from '../../../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../../../service/app.user.service.js';
import { processError } from '../../../service/error.js';
import { MANUAL_SELL_TOKEN_LISTENER } from '../../../utils/common.js';

module.exports = (bot: any) => {
    bot.action(botEnum.manualSell.value, async (ctx: any) => {
        const telegramId = ctx.from.id;
        try {
            await userVerboseLog(telegramId, 'manual sell');
            await updateChatId(telegramId, ctx.chat.id)

            await ctx.scene.enter(MANUAL_SELL_TOKEN_LISTENER);
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });
};
