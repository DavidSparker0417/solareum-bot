import { botEnum } from '../../constants/botEnum.js';
import { linkAccountMessage } from '../../utils/messages.js';
import { updateChatId, userVerboseLog } from '../../service/app.user.service.js';
import { processError } from '../../service/error.js';

module.exports = (bot: any) => {
    bot.action(botEnum.markupStart, async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            await userVerboseLog(telegramId, 'link account');
            await updateChatId(telegramId, ctx.chat.id)

            try {
                await ctx.deleteMessage();
            } catch { }

            await bot.telegram.sendMessage(ctx.chat.id, linkAccountMessage(telegramId), {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: botEnum.menu.key,
                                callback_data: botEnum.menu.value
                            }
                        ]
                    ]
                }
            });
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });
};
