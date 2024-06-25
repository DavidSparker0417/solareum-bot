import { botEnum } from '../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { getSelectedChain } from '../service/connected.chain.service.js';
import { processError } from '../service/error.js';
import { getChainStatus } from '../utils/messages.js';
import { getNativeCurrencySymbol } from '../web3/chain.parameters.js';

const invokeTransfer = async (ctx: any) => {
    const telegramId = ctx.from.id;

	try {
		await ctx.answerCbQuery()
	} catch  { }

    try {
        await userVerboseLog(telegramId, '/transfer');

        await updateChatId(telegramId, ctx.chat.id);
        const chain = await getSelectedChain(telegramId);
        if (chain === '') {
            await ctx.telegram.sendMessage(ctx.chat.id, 'Not selected a chain');
        } else {
            const nativeSymbol = await getNativeCurrencySymbol(chain);
            await ctx.telegram.sendMessage(telegramId, await getChainStatus(telegramId, chain), {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: botEnum.menu.key,
                                callback_data: botEnum.menu.value
                            },
                            {
                                text: '💰 ' + nativeSymbol,
                                callback_data: botEnum.transferNativeCurrency.value
                            },
                            {
                                text: botEnum.transferToken.key,
                                callback_data: botEnum.transferToken.value
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
    bot.command(botEnum.transfer.value, invokeTransfer);
    bot.action(botEnum.transfer.value, invokeTransfer);
};
