import { botEnum } from '../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { processError } from '../service/error.js';

const invokeHelp = async (ctx: any) => {
    // ctx.update.callback_query.from

    const telegramId = ctx.from.id;

    try {
        let text = '';

        userVerboseLog(telegramId, '/help');

        await updateChatId(telegramId, ctx.chat.id);

        // <b>/condition</b> - Shows native currency balance, and chain status of current user
		// <b>/bridge</b> - Bridges SOL on solana chain to ETH on ethereum mainnet

        text += `Public Commands:
<b>/start</b> - Let's get this party started! 🎉
<b>/referral</b> - Get referral link or by token address
<b>/sniper</b> - Summons the sniperbot main panel
<b>/transfer</b> - Transfers SOL, or token to other wallet
<b>/wallets</b> - Reveals all of your connected wallets
<b>/track</b> - Spawns the trade monitor panel in case the user deletes it by accident
<b>/quick</b> - Summons the sniperbot quick panel
<b>/setting</b> - Configures buy/sell/approve settings for trades
<b>/cleartrade</b> - Clear all copytrade/snipe settings
<b>/help</b> - Prints this help message
        `;

        await ctx.telegram.sendMessage(ctx.chat.id, text, {
            parse_mode: botEnum.PARSE_MODE_V2
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

module.exports = (bot: any) => {
    bot.command(botEnum.help.value, invokeHelp);
    bot.action(botEnum.help.value, invokeHelp);
};
