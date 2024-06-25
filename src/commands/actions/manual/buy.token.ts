import { botEnum } from '../../../constants/botEnum.js';
import { getBN } from '../../../web3/web3.operation.js';
import { getNativeCurrencySymbol } from '../../../web3/chain.parameters.js';
import { updateChatId, userVerboseLog } from '../../../service/app.user.service.js';
import { processError } from '../../../service/error.js';
import { getSelectedChain } from '../../../service/connected.chain.service.js';
import { MANUAL_BUY_TOKEN_LISTENER } from '../../../utils/common.js';
import { userETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';

module.exports = (bot: any) => {
    bot.action(botEnum.manualBuy.value, async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            await userVerboseLog(telegramId, 'manual buy');
            await updateChatId(telegramId, ctx.chat.id)

            const chain = await getSelectedChain(telegramId);
            const ethBal = await userETHBalance(telegramId, chain);
            const BN = getBN();

            if (BN(ethBal).eq(0)) {
                await ctx.telegram.sendMessage(ctx.chat.id, `❌ You have no ${await getNativeCurrencySymbol(chain)}`);
            } else {
                await ctx.scene.enter(MANUAL_BUY_TOKEN_LISTENER)
            }
        } catch (err) {
            await processError(ctx, telegramId, err);
        }
    });
};
