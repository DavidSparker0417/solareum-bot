import { botEnum } from '../../../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../../../service/app.user.service.js';
import { processError } from '../../../service/error.js';
import { disconnectWallet } from '../../../service/wallet.service.js';
import { getWalletInfoOfChain } from '../../../utils/messages.js';

module.exports = (bot: any) => {
    bot.action(RegExp('^' + botEnum.disconnectWallet.value + '_.+'), async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            const chain = ctx.update.callback_query.data.slice(botEnum.disconnectWallet.value.length + 1)

            await userVerboseLog(telegramId, `disconnect wallet before confirmation [${chain}]`);
            await updateChatId(telegramId, ctx.chat.id)

            const msg = ctx.update.callback_query.message;

            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, 0, await getWalletInfoOfChain(telegramId, chain), {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: botEnum.menu.key,
                                callback_data: botEnum.menu.value
                            }
                        ],
                        [
                            {
                                text: botEnum.confirmDisconnect.key,
                                callback_data: botEnum.confirmDisconnect.value + '_' + chain
                            },
                            {
                                text: '↩️',
                                callback_data: botEnum.wallets.value
                            }
                        ],
                        [
                            {
                                text: botEnum.generate_wallet.key,
                                callback_data: botEnum.generate_wallet.value + '_' + chain
                            },
                            {
                                text: botEnum.multiWallet.key,
                                callback_data: `multi_wallet_chain?${chain}_page?1_limit?4`
                            }
                        ]
                    ]
                }
            });
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });

    bot.action(RegExp('^' + botEnum.confirmDisconnect.value + '_.+'), async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            const chain = ctx.update.callback_query.data.slice(botEnum.confirmDisconnect.value.length + 1)

            await userVerboseLog(telegramId, `confirm disconnect wallet [${chain}]`);
            await updateChatId(telegramId, ctx.chat.id)

            await disconnectWallet(telegramId);

            const msg = ctx.update.callback_query.message;

            await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, 0, await getWalletInfoOfChain(telegramId, chain), {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: botEnum.menu.key,
                                callback_data: botEnum.menu.value
                            }
                        ],
                        [
                            {
                                text: botEnum.connect_wallet.key,
                                callback_data: botEnum.connect_wallet.value + '_' + chain
                            },
                            {
                                text: '↩️',
                                callback_data: botEnum.wallets.value
                            }
                        ],
                        [
                            {
                                text: botEnum.generate_wallet.key,
                                callback_data: botEnum.generate_wallet.value + '_' + chain
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
