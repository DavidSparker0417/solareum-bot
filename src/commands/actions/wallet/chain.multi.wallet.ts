import { botEnum } from '../../../constants/botEnum.js';
import { IAddressPagination } from '../../../models/address.model.js';
import { IPremium } from '../../../models/premium.model.js';
import { updateChatId, userVerboseLog } from '../../../service/app.user.service.js';
import { processError } from '../../../service/error.js';
import { PremiumService } from '../../../service/premium.service.js';
import { getSettings, updateSettingsInfo } from '../../../service/settings.service.js';
import { getMultiWallets, getMultiWalletsPagination } from '../../../service/wallet.service.js';
import { PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER, PV_KEY_MNEMONIC_MULTI_WALLET_GENERATE_LISTENER } from '../../../utils/common.js';
import { getMultiWalletPaginationDetails, IPageAndLimit } from '../../../utils/global.functions.js';
import { markupMultiWalletMainDefault, markupMultiWalletMainPaginate } from '../../../utils/inline.markups.js';
import { multiWalletMessage } from '../../../utils/messages.js';

module.exports = (bot: any) => {
    // main menu
    const expression = /^multi_wallet_chain(.*)$/;
    const regex = RegExp(expression);

    bot.action(regex, async (ctx: any) => {
        const telegramId = ctx.from.id

        try {
            await updateChatId(telegramId, ctx.chat.id)

            const pageLimit: IPageAndLimit = getMultiWalletPaginationDetails(ctx.match[0]);
            const chain = pageLimit.chain

            await userVerboseLog(telegramId, `multi wallet [${chain}]`);

            if (ctx.chat.type === 'private') {
                const addresses: IAddressPagination = await getMultiWalletsPagination(ctx.update.callback_query.from.id, pageLimit.page, pageLimit.limit);

                const setting = await getSettings(telegramId, chain)

                if (addresses.data != null && addresses.data.length <= 0) {
                    try {
                        ctx.answerCbQuery();
                    } catch (e) { }
                    await ctx.telegram.sendMessage(ctx.chat.id, 'No additional wallets exist. You can add some by connecting an external wallet or generating a new one (recommended).', {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: markupMultiWalletMainDefault(telegramId, chain, setting.multiWallet)
                    });

                    return true;
                } else {
                    try {
                        const message = await multiWalletMessage(ctx.update.callback_query.from.id, chain, addresses.data);
                        const msgId = ctx.update.callback_query.message.message_id;
                        await ctx.telegram.editMessageText(ctx.chat.id, msgId, 0, message, {
                            parse_mode: botEnum.PARSE_MODE_V2,
                            reply_markup: markupMultiWalletMainPaginate(telegramId, chain, setting.multiWallet, addresses)
                        });
                    } catch (e) {
                        const message = await multiWalletMessage(ctx.update.callback_query.from.id, chain, addresses.data);
                        await ctx.telegram.sendMessage(ctx.chat.id, message, {
                            parse_mode: botEnum.PARSE_MODE_V2,
                            reply_markup: markupMultiWalletMainPaginate(telegramId, chain, setting.multiWallet, addresses)
                        });
                    }
                }
            } else {
                try {
                    ctx.answerCbQuery();
                } catch (e) { }
                await ctx.telegram.sendMessage(ctx.chat.id, 'Multi Wallet is only allowed in private chat');
            }
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });

    // return to main menu
    bot.action(RegExp('^' + botEnum.multiWalletReturn.value + '_.+'), async (ctx: any) => {
        const telegramId = ctx.from.id;
        try {
            const chain = ctx.update.callback_query.data.slice(botEnum.multiWalletReturn.value.length + 1)

            await userVerboseLog(telegramId, 'multi wallet return');
            await updateChatId(telegramId, ctx.chat.id)

            if (ctx.chat.type === 'private') {
                const addresses: IAddressPagination = await getMultiWalletsPagination(ctx.update.callback_query.from.id);

                const setting = await getSettings(telegramId, chain)
                const message = await multiWalletMessage(ctx.update.callback_query.from.id, chain, addresses.data);
                const msg = ctx.update.callback_query.message;

                if (addresses.data.length <= 0) {
                    try {
                        ctx.answerCbQuery();
                    } catch (e) { }
                    await ctx.telegram.editMessageText(
                        ctx.chat.id,
                        msg.message_id,
                        0,
                        'No additional wallets exist. You can add some by connecting an external wallet or generating a new one (recommended).',
                        {
                            parse_mode: botEnum.PARSE_MODE_V2,
                            reply_markup: markupMultiWalletMainDefault(telegramId, chain, setting.multiWallet)
                        }
                    );
                    return true;
                } else {
                    try {
                        ctx.answerCbQuery();
                    } catch (e) { }
                    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, 0, message, {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: markupMultiWalletMainPaginate(telegramId, chain, setting.multiWallet, addresses)
                    });
                }
            }
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });

    // enable multi wallet
    const enableMultiWalletExpression = /^enable_mw_(.*)$/;
    const enableMultiWalletRegex = RegExp(enableMultiWalletExpression);
    bot.action(enableMultiWalletRegex, async (ctx: any) => {
        const telegramId = ctx.from.id;
        try {
            await userVerboseLog(telegramId, 'enable multi wallet');
            await updateChatId(telegramId, ctx.chat.id)

            const pageLimit: IPageAndLimit = getMultiWalletPaginationDetails(ctx.match[0]);
            const chain = pageLimit.chain

            if (ctx.chat.type === 'private') {
                await updateSettingsInfo(telegramId, chain, { multiWallet: true })
                const setting = await getSettings(telegramId, chain)
                const msg = ctx.update.callback_query.message;
                const data: IAddressPagination = await getMultiWalletsPagination(ctx.update.callback_query.from.id, pageLimit.page, pageLimit.limit);
                try {
                    ctx.answerCbQuery();
                } catch (e) { }

                if (data.data.length === 0) {
                    await ctx.telegram.sendMessage(ctx.chat.id, '⚠️ Please connect/generate one or more wallets', { parse_mode: botEnum.PARSE_MODE_V2 })
                } else {
                    const message = await multiWalletMessage(ctx.update.callback_query.from.id, chain, data.data);
                    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, 0, message, {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: markupMultiWalletMainPaginate(telegramId, chain, setting.multiWallet, data)
                    })
                }
            } else {
                await ctx.telegram.sendMessage(ctx.chat.id, 'Multi Wallet is only allowed in private chat');
            }
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });

    //disabled multi wallet

    const disableMultiWalletExpression = /^disable_mw_(.*)$/;
    const disableMultiWalletRegex = RegExp(disableMultiWalletExpression);
    bot.action(disableMultiWalletRegex, async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            await userVerboseLog(telegramId, 'disable multi wallet');
            await updateChatId(telegramId, ctx.chat.id)

            const pageLimit: IPageAndLimit = getMultiWalletPaginationDetails(ctx.match[0]);
            const chain = pageLimit.chain

            if (ctx.chat.type === 'private') {
                await updateSettingsInfo(telegramId, chain, { multiWallet: false })
                const setting = await getSettings(telegramId, chain)
                const msg = ctx.update.callback_query.message;
                const addresses: IAddressPagination = await getMultiWalletsPagination(ctx.update.callback_query.from.id, pageLimit.page, pageLimit.limit);
                try {
                    ctx.answerCbQuery();
                } catch (e) { }
                const message = await multiWalletMessage(ctx.update.callback_query.from.id, chain, addresses.data);
                await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, 0, message, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: markupMultiWalletMainPaginate(telegramId, chain, setting.multiWallet, addresses)
                });
            } else {
                try {
                    ctx.answerCbQuery();
                } catch (e) { }
                await ctx.telegram.sendMessage(ctx.chat.id, 'Multi Wallet is only allowed in private chat');
            }
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });

    // connect wallet
    bot.action(RegExp('^' + botEnum.multiWalletConnectWallet.value + '_.+'), async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            const chain = ctx.update.callback_query.data.slice(botEnum.multiWalletConnectWallet.value.length + 1)

            await userVerboseLog(telegramId, 'multi wallet connect wallet ');
            await updateChatId(telegramId, ctx.chat.id)

            const premium: IPremium = await new PremiumService().getPremium(telegramId);

            let isPremiumUser = false;

            if (premium != null && premium.endDate != null && premium.endDate > new Date()) {
                isPremiumUser = true;
            }

            let addresses = await getMultiWallets(ctx.update.callback_query.from.id, { configure: true });
            if (addresses.length == 9 && !isPremiumUser) {
                try {
                    await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, 'You have reached the maximum amount of additional wallets!', false, null, 40000);
                } catch (e) { }

                return;
            } else if (addresses.length >= 100 && isPremiumUser) {
                try {
                    await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, 'You have reached the maximum amount of additional wallets!', false, null, 40000);
                } catch (e) { }

                return;
            }
            if (ctx.chat.type === 'private') {
                try {
                    //    ctx.answerCbQuery();
                } catch (e) { }
                await ctx.scene.enter(PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER, { chain })
            } else {
                await ctx.telegram.sendMessage(ctx.chat.id, 'Connect Multi Wallet is only allowed in private chat');
            }
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });

    // generate wallet
    bot.action(RegExp('^' + botEnum.multiWalletGenerateWallet.value + '_.+'), async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            const chain = ctx.update.callback_query.data.slice(botEnum.multiWalletGenerateWallet.value.length + 1)

            await userVerboseLog(telegramId, 'multi wallet generate wallet ');
            await updateChatId(telegramId, ctx.chat.id)
            
            const premium: IPremium = await new PremiumService().getPremium(telegramId);

            let isPremiumUser = false;

            if (premium != null && premium.endDate != null && premium.endDate > new Date()) {
                isPremiumUser = true;
            }

            let addresses = await getMultiWallets(ctx.update.callback_query.from.id, { configure: true });
            if (addresses.length == 9 && !isPremiumUser) {
                try {
                    await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, 'You have reached the maximum amount of additional wallets!', false, null, 40000);
                } catch (e) { }

                return;
            } else if (addresses.length >= 100 && isPremiumUser) {
                try {
                    await ctx.telegram.answerCbQuery(ctx.callbackQuery.id, 'You have reached the maximum amount of additional wallets!', false, null, 40000);
                } catch (e) { }

                return;
            }

            if (ctx.chat.type === 'private') {
                try {
                    ctx.answerCbQuery();
                } catch (e) { }
                await ctx.scene.enter(PV_KEY_MNEMONIC_MULTI_WALLET_GENERATE_LISTENER, { chain })
            } else {
                await ctx.telegram.sendMessage(ctx.chat.id, 'Generate Multi Wallet is only allowed in private chat');
            }
        } catch (err) {
            await processError(ctx, telegramId, err)
        }
    });
};
