import { botEnum } from '../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { clearAllAutobuys } from '../service/autobuy.service.js';
import { clearAllAutosells } from '../service/autosell.service.js';
import { clearCopyTrades } from '../service/copytrade.service.js';
import { processError } from '../service/error.js';
import { clearTokenSnipes } from '../service/snipe.token.service.js';

const invokeClearTrade = async (ctx: any) => {
    // ctx.update.callback_query.from

    const telegramId = ctx.from.id;

    try {
        if (ctx.update?.message?.text === undefined) {
            await ctx.deleteMessage();
        }
    } catch { }

    try {
        await userVerboseLog(telegramId, '/cleartrade');

        await updateChatId(telegramId, ctx.chat.id);
        await clearTokenSnipes(telegramId)
        await clearCopyTrades(telegramId)
		await clearAllAutobuys(telegramId)
		await clearAllAutosells(telegramId)
        await ctx.telegram.sendMessage(ctx.chat.id, `❌ All trades/snipes have been cleared`, {
            parse_mode: botEnum.PARSE_MODE_V2
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

module.exports = (bot: any) => {
    bot.command(botEnum.cleartrade.value, invokeClearTrade)
    bot.action(botEnum.cleartrade.value, invokeClearTrade)
};
