import { botEnum } from '../constants/botEnum.js';
import { getSelectedChain, selectChain } from '../service/connected.chain.service.js';
import { postStartAction } from './actions/default.action.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { processError } from '../service/error.js';
import { getBotGeneralConfiguration } from '../utils/messages.js';
import { getChainStateMarkup } from '../utils/inline.markups.js';

const refreshState = async (ctx: any, chainTo: string) => {
    const telegramId = ctx.from.id;

    try {
        let text = '';

        try {
            if (ctx.update?.message?.text === undefined) {
                await ctx.deleteMessage();
            }
        } catch { }

        await updateChatId(telegramId, ctx.chat.id);

        if (chainTo !== '') {
            await selectChain(telegramId, chainTo)
        }

        const chain = await getSelectedChain(telegramId);
        if (chain === '') {
            postStartAction(ctx);
            return;
        } else {
            text = await getBotGeneralConfiguration(telegramId, chain)
        }

        await ctx.telegram.sendMessage(ctx.chat.id, text, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: await getChainStateMarkup()
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
}

module.exports = (bot: any) => {
    bot.command(botEnum.state.value, async (ctx: any) => {
        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, '/state')

        await refreshState(ctx, '')
    })

    bot.action(botEnum.state.value, async (ctx: any) => {
        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, '/state')

        await refreshState(ctx, '')
    })

    bot.action(botEnum.bsc_state.value, async (ctx: any) => {
        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, 'switch to bsc state')

        await refreshState(ctx, 'bsc')
    })

    bot.action(botEnum.eth_state.value, async (ctx: any) => {
        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, 'switch to ethereum state')

        await refreshState(ctx, 'ethereum')
    })

    bot.action(botEnum.arb_state.value, async (ctx: any) => {
        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, 'switch to arbitrum state')

        await refreshState(ctx, 'arbitrum')
    })

    bot.action(botEnum.base_state.value, async (ctx: any) => {
        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, 'switch to base state')

        await refreshState(ctx, 'base')
    })
};
