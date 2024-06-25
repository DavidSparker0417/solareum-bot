import { botEnum } from '../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { getSelectedChain } from '../service/connected.chain.service.js';
import { processError } from '../service/error.js';
import { getChainStatus } from '../utils/messages.js';

const invokeTrade = async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        userVerboseLog(telegramId, '/trade');

        await updateChatId(telegramId, ctx.chat.id);
        const chain = await getSelectedChain(telegramId);
        if (chain === '') {
            await ctx.telegram.sendMessage(ctx.chat.id, 'Please connect wallet to trade');
        } else {
            await ctx.telegram.sendMessage(ctx.chat.id, await getChainStatus(telegramId, chain), {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: botEnum.menu.key,
                                callback_data: botEnum.menu.value
                            },
                            {
                                text: '🤷‍♀️' + botEnum.manualBuy.key,
                                callback_data: botEnum.manualBuy.value
                            },
                            {
                                text: '🤷‍♂️' + botEnum.manualSell.key,
                                callback_data: botEnum.manualSell.value
                            }
                        ]
                    ]
                }
            });
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

module.exports = (bot: any) => {
    bot.command(botEnum.trade.value, invokeTrade);
    bot.action(botEnum.trade.value, invokeTrade);
};
