import { botEnum } from '../../../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../../../service/app.user.service.js';
import { processError } from '../../../service/error.js';
import { WALLET_KEY_LISTENER } from '../../../utils/common.js';

module.exports = (bot: any) => {
    bot.action(RegExp('^' + botEnum.connect_wallet.value + '_.+'), async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            const chain = ctx.update.callback_query.data.slice(botEnum.connect_wallet.value.length + 1)

            await userVerboseLog(telegramId, 'connect wallet');
            await updateChatId(telegramId, ctx.chat.id)

            if (ctx.chat.type === 'private') {
                await ctx.scene.enter(WALLET_KEY_LISTENER, { chain })
            } else {
                await ctx.telegram.sendMessage(ctx.chat.id, 'Connect Wallet is only allowed in private chat');
            }
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });
};
