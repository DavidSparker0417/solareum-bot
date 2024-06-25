import Logging from '../utils/logging.js';
import { botEnum } from '../constants/botEnum.js';
import { getMenuMessage, getTokenStatusMessage, startMessage } from '../utils/messages.js';
import { getTokenPasteMarkup, markupStart } from '../utils/inline.markups.js';
import { createAppUserIfNotExist, updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { getTransactionBackupById, retryTx } from '../service/transaction.backup.service.js';
import { processError } from '../service/error.js';
import { getReferralLink, updateReferralReferee } from '../service/referral.service.js';
import { getSelectedChain, selectChain } from '../service/connected.chain.service.js';
import { getNativeCurrencySymbol } from '../web3/chain.parameters.js';
import { hitToken } from '../service/token.service.js';
import { createRandomWallet, getWallet } from '../service/wallet.service.js';

const invokeStart = async (ctx: any) => {
    const telegramId = ctx.from.id;
    // check if user exist, save if not found
    try {
        await userVerboseLog(telegramId, '/start' + ' ' + JSON.stringify(ctx.from));

        const accountExistsOrCreated = await createAppUserIfNotExist(telegramId, ctx.from.first_name, ctx.from.last_name, ctx.from.username, ctx.chat.id);
        if (accountExistsOrCreated) {
            await userVerboseLog(telegramId, 'already exists in database');
        }

		try {
			const w = await getWallet(telegramId)
		} catch (err) {
			try {
				await createRandomWallet(telegramId)
			} catch { }
		}

        await updateChatId(telegramId, ctx.chat.id);

        try {
			await getReferralLink(telegramId)
            if (ctx.update?.message?.text === undefined) {
                await ctx.deleteMessage();
            }
        } catch { }

		await selectChain(telegramId, 'solana')
        await ctx.telegram.sendMessage(ctx.chat.id, startMessage + '\n' + await getMenuMessage(telegramId), {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: markupStart(telegramId, ctx.from.first_name)
        });
    } catch (err) {
        await processError(ctx, telegramId, err)
    }


    // process start subscription
    if ((ctx.startPayload !== undefined && ctx.startPayload !== null) && ctx.startPayload.length > 0) {
		try {
			console.log('Start from other tg channel >', ctx.startPayload)

			const items = ctx.startPayload.split("_")

			const code = items[0]
			if (items.length > 1) {
				const tokenAddress = items[1]

				let w
				try {
					w = await getWallet(telegramId)
				} catch (err) {
				}

				if (!w) {
					await createRandomWallet(telegramId)
				}
				
				const chain = await getSelectedChain(telegramId)
				const nativeSymbol = await getNativeCurrencySymbol(chain)

				const t = await getTokenStatusMessage(telegramId, chain, tokenAddress)
				await hitToken(chain, tokenAddress)

				const msg = await ctx.telegram.sendMessage(ctx.chat.id, t.text, {
					parse_mode: botEnum.PARSE_MODE_V2,
					reply_markup: await getTokenPasteMarkup(telegramId, 'buy', chain, nativeSymbol, t.symbol, tokenAddress)
				})
			}
			
			await updateReferralReferee(telegramId, code)
			Logging.info(`${telegramId} referral link to ${code}`)
		} catch (err) {
			console.error(`==> ${new Date().toLocaleString()}`)
			console.error(err)
			await ctx.telegram.sendMessage(ctx.chat.id, err.message, {
				parse_mode: botEnum.PARSE_MODE_V2
			})
		}
    }
};

module.exports = (bot: any) => {
    bot.start(invokeStart);
    bot.action(botEnum.menu.value, invokeStart);

	bot.action(botEnum.dismiss.value, async (ctx: any) => {
		try {
            if (ctx.update?.message?.text === undefined) {
                await ctx.deleteMessage();
            }
        } catch { }
	})

    bot.action(RegExp('^' + botEnum.closeTxMessage + '_.+'), async (ctx: any) => {
        try {
            const tbckId = ctx.update.callback_query.data.slice(botEnum.closeTxMessage.length + 1);
            const tbck: any = await getTransactionBackupById(tbckId);
            if (tbck === null) {
                await ctx.telegram.sendMessage(ctx.chat.id, '❌ No valid action');
            } else {
                await tbck.populate('user');
                await ctx.telegram.deleteMessage(tbck.user.chatId, tbck.msgId);
            }
        } catch (err) {
            await processError(ctx, ctx.from.id, err)
        }
    });

    bot.action(RegExp('^' + botEnum.retryTxMessage + '_.+'), async (ctx: any) => {
        try {
            const tbckId = ctx.update.callback_query.data.slice(botEnum.retryTxMessage.length + 1);
            await retryTx(ctx, tbckId);
        } catch (err) {
            await processError(ctx, ctx.from.id, err)
        }
    });
};
