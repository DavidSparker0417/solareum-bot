import { botEnum } from '../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { processError } from '../service/error.js';
import { REFERRAL_LISTENER } from '../utils/common.js';
import { getReferralMarkup } from '../utils/inline.markups.js';
import { getReferralMessage } from '../utils/messages.js';

const invokeReferral = async (ctx: any) => {
    // ctx.update.callback_query.from

    const telegramId = ctx.from.id;
	try {
		await ctx.answerCbQuery()
	} catch { }

    try {
        await userVerboseLog(telegramId, '/referral');

        await updateChatId(telegramId, ctx.chat.id);
        await ctx.telegram.sendMessage(ctx.chat.id, await getReferralMessage(telegramId), {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: await getReferralMarkup()
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

module.exports = (bot: any) => {
    bot.command(botEnum.referral.value, invokeReferral);
    bot.action(botEnum.referral.value, invokeReferral);

    bot.action(botEnum.referralWallet.value, async (ctx: any) => {
        await ctx.scene.enter(REFERRAL_LISTENER, { input_type: 'update-payee-wallet', msgId: ctx.update.callback_query?.message.message_id })
    })

	bot.action(botEnum.referralGenerateToken.value, async (ctx: any) => {
        await ctx.scene.enter(REFERRAL_LISTENER, { input_type: 'generate-referral-token-ca', msgId: ctx.update.callback_query?.message.message_id })
    })
};
