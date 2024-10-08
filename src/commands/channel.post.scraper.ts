import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { processError } from '../service/error.js';
import Logging from '../utils/logging.js';

module.exports = (bot: any) => {
    bot.on('channel_post', async (ctx: any, next: any) => {
        const telegramId = ctx.from.id
        try {
            await userVerboseLog('', `processing channel [${ctx.update.channel_post.sender_chat.username}] message: [${ctx.update.channel_post.text}]`);
            await updateChatId(telegramId, ctx.chat.id)

            ctx.update.message = ctx.update.channel_post;
            const text = ctx.update.channel_post.text;

            const regex = /(?:0x)?[0-9a-fA-F]{2-40}/g;
            const possibleAddresses = text.match(regex);

            try {
                const result = possibleAddresses.flatMap((v: any, i: any) => possibleAddresses.slice(i + 1).map((w: any) => v + ' ' + w));

                Logging.info(result);
            } catch { }

            return next();
        } catch (err) {
            await processError(ctx, ctx.from.id, err)
        }
    });
};
