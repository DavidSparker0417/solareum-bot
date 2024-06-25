import { botEnum } from '../constants/botEnum.js';
import { SolanaTokenInfoModel } from '../models/solana/solana.token.info.model.js';
import { getAppUser, updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { addTokenAutoBuy, isTokenAutoBuySet, removeTokenAutoBuy } from '../service/autobuy.service.js';
import { addTokenAutoSell, isTokenAutoSellSet, removeTokenAutoSell } from '../service/autosell.service.js';
import { getSelectedChain } from '../service/connected.chain.service.js';
import { processError } from '../service/error.js';
import { getTokenPrice } from '../service/token.service.js';
import { AUTO_BUY_LISTENER, AUTO_SELL_LISTENER } from '../utils/common.js';
import { getAutoTradeMarkup } from '../utils/inline.markups.js';
import { getAutoTradeText } from '../utils/messages.js';
import { externalInvokeMonitor } from './monitor.js';

const invokeAutoTrade = async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        userVerboseLog(telegramId, '/autotrade');

        await updateChatId(telegramId, ctx.chat.id);
        const chain = await getSelectedChain(telegramId);
        
		await ctx.telegram.sendMessage(ctx.chat.id, await getAutoTradeText(telegramId, chain), {
			parse_mode: botEnum.PARSE_MODE_V2,
			reply_markup: await getAutoTradeMarkup(telegramId, chain)
		});
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const revokeAutoTrade = async (ctx: any, tokenToFocus: string, deleteMsg?: boolean) => {
    const telegramId = ctx.from.id;

	if (deleteMsg === true) {
		try {
			await ctx.deleteMessage()
		} catch { }
	}

    try {
        userVerboseLog(telegramId, '/autotrade by force');

        await updateChatId(telegramId, ctx.chat.id);
        const chain = await getSelectedChain(telegramId);

		await ctx.telegram.sendMessage(ctx.chat.id, await getAutoTradeText(telegramId, chain, tokenToFocus), {
			parse_mode: botEnum.PARSE_MODE_V2,
			reply_markup: await getAutoTradeMarkup(telegramId, chain, tokenToFocus)
		});
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const refreshAutoTrade = async (ctx: any, tokenToFocus: string, msgId: number) => {
    const telegramId = ctx.from.id;

    try {
        userVerboseLog(telegramId, '/autotrade refresh');

        await updateChatId(telegramId, ctx.chat.id);
        const chain = await getSelectedChain(telegramId);

		await ctx.telegram.editMessageText(ctx.chat.id, msgId, 0, await getAutoTradeText(telegramId, chain, tokenToFocus), {
			parse_mode: botEnum.PARSE_MODE_V2,
			reply_markup: await getAutoTradeMarkup(telegramId, chain, tokenToFocus)
		});
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAddAutoTrade = async (ctx: any) => {
	try {
		await ctx.answerCbQuery()
	} catch { }

	const telegramId = ctx.from.id
	try {
		await ctx.scene.enter(AUTO_BUY_LISTENER, { input_type: 'add-new-auto-buy-token', msgId: ctx.update.callback_query?.message.message_id, chain: await getSelectedChain(telegramId) })
	} catch (err) {
		await processError(ctx, telegramId, err)
	}
}

const toggleAutoSell = async (ctx: any, tokenInfoId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'auto trade sell toggle');

        await updateChatId(telegramId, ctx.chat.id);

        const tokenDB = await SolanaTokenInfoModel.findById(tokenInfoId)
        const chain = tokenDB.chain

        const isAS = await isTokenAutoSellSet(telegramId, tokenDB.chain, tokenDB.address);
        if (isAS === true) {
            await removeTokenAutoSell(telegramId, tokenDB.chain, tokenDB.address);
            await userVerboseLog(telegramId, `removed ${tokenDB.address} from auto sell`);
        } else {
            const tokenPrice = await getTokenPrice(chain, tokenDB.address)
            if (tokenPrice === undefined) {
                throw new Error(`invokeAutoSellTrack: unresolvable token price [${chain}] ${tokenDB.address}`)
            }
            await addTokenAutoSell(telegramId, chain, tokenDB.address, tokenPrice)
            await userVerboseLog(telegramId, `added ${tokenDB.address} to auto buy`);
        }

        if (ctx.update.callback_query?.message.message_id) {
			const valid = (await isTokenAutoSellSet(telegramId, tokenDB.chain, tokenDB.address)) || (await isTokenAutoBuySet(telegramId, chain, tokenDB.address))
			if (valid === true) {
				await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getAutoTradeText(telegramId, chain, valid? tokenDB.address: undefined), {
					parse_mode: botEnum.PARSE_MODE_V2,
					reply_markup: await getAutoTradeMarkup(telegramId, chain, valid? tokenDB.address: undefined)
				})
			} else {
				try {
					await ctx.deleteMessage(ctx.update.callback_query?.message.message_id)
				} catch { }
				const user = await getAppUser(telegramId)
				await externalInvokeMonitor(telegramId, user.chatId, chain, tokenDB.address)
			}
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const toggleAutoBuy = async (ctx: any, tokenInfoId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'auto buy track');

        await updateChatId(telegramId, ctx.chat.id)

        const tokenDB = await SolanaTokenInfoModel.findById(tokenInfoId)

        const chain = tokenDB.chain

        const isAS = await isTokenAutoBuySet(telegramId, chain, tokenDB.address)
        if (isAS === true) {
            await removeTokenAutoBuy(telegramId, chain, tokenDB.address)
            await userVerboseLog(telegramId, `removed ${tokenDB.address} from auto buy`);
        } else {
            const tokenPrice = await getTokenPrice(chain, tokenDB.address)
            if (tokenPrice === undefined) {
                throw new Error(`invokeAutoBuyTrack: unresolvable token price [${chain}] ${tokenDB.address}`)
            }
            await addTokenAutoBuy(telegramId, chain, tokenDB.address, tokenPrice);
            await userVerboseLog(telegramId, `added ${tokenDB.address} to auto buy`);
        }

        if (ctx.update.callback_query?.message.message_id) {
			const valid = (await isTokenAutoSellSet(telegramId, tokenDB.chain, tokenDB.address)) || (await isTokenAutoBuySet(telegramId, chain, tokenDB.address))
			if (valid === true) {
				await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getAutoTradeText(telegramId, chain, valid? tokenDB.address: undefined), {
					parse_mode: botEnum.PARSE_MODE_V2,
					reply_markup: await getAutoTradeMarkup(telegramId, chain, valid? tokenDB.address: undefined)
				})
			} else {
				try {
					await ctx.deleteMessage(ctx.update.callback_query?.message.message_id)
				} catch { }
				
				const user = await getAppUser(telegramId)
				await externalInvokeMonitor(telegramId, user.chatId, chain, tokenDB.address)
			}
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

module.exports = (bot: any) => {
    bot.command(botEnum.auto_trade.value, invokeAutoTrade);
    bot.action(botEnum.auto_trade.value, invokeAutoTrade);

	bot.action(botEnum.addAutoTrade.value, invokeAddAutoTrade)

	bot.action(RegExp('^' + botEnum.addAutoTradeReturn.value + '_.+'), async (ctx: any) => {
		const telegramId = ctx.from.id;
        const tokenAddress = ctx.update.callback_query.data.slice(botEnum.addAutoTradeReturn.value.length + 1)
		try {
			await ctx.answerCbQuery()
			const user = await getAppUser(telegramId)

			await externalInvokeMonitor(telegramId, user.chatId, 'solana', tokenAddress, ctx.update.callback_query?.message.message_id)
		} catch { }
    })

	bot.action(RegExp('^' + botEnum.prevAutoTradeToken.value + '_.+'), async (ctx: any) => {
        const tokenAddress = ctx.update.callback_query.data.slice(botEnum.prevAutoTradeToken.value.length + 1)

		try {
			await ctx.answerCbQuery()
		} catch { }
        await revokeAutoTrade(ctx, tokenAddress, true)
    })

	bot.action(RegExp('^' + botEnum.nextAutoTradeToken.value + '_.+'), async (ctx: any) => {
        const tokenAddress = ctx.update.callback_query.data.slice(botEnum.nextAutoTradeToken.value.length + 1)

		try {
			await ctx.answerCbQuery()
		} catch { }
        await revokeAutoTrade(ctx, tokenAddress, true)
    })

	bot.action(RegExp('^' + botEnum.autoTradeSell.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.autoTradeSell.value.length + 1)

		try {
			await ctx.answerCbQuery()
		} catch { }

        await toggleAutoSell(ctx, tokenInfoId)
    })

	bot.action(RegExp('^' + botEnum.autoTradeBuy.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.autoTradeBuy.value.length + 1)

		try {
			await ctx.answerCbQuery()
		} catch { }

        await toggleAutoBuy(ctx, tokenInfoId)
    })
};

module.exports.revokeAutoTrade = revokeAutoTrade
module.exports.refreshAutoTrade = refreshAutoTrade
