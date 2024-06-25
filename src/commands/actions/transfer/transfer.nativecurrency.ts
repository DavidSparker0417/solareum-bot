import { botEnum } from '../../../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../../../service/app.user.service.js';
import { getSelectedChain } from '../../../service/connected.chain.service.js';
import { processError } from '../../../service/error.js';
import { TRANSFER_NATIVE_CURRENCY_LISTENER } from '../../../utils/common.js';
import { getNativeCurrencySymbol } from '../../../web3/chain.parameters.js';
import { userETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';
import { getBN } from '../../../web3/web3.operation.js';

module.exports = (bot: any) => {
    bot.action(botEnum.transferNativeCurrency.value, async (ctx: any) => {
        const telegramId = ctx.from.id;

        try {
            await userVerboseLog(telegramId, 'transfer native currency');
            await updateChatId(telegramId, ctx.chat.id)

            const chain = await getSelectedChain(telegramId);
            const ethBal = await userETHBalance(telegramId, chain);
            const BN = getBN();

            if (BN(ethBal).eq(0)) {
                await ctx.telegram.sendMessage(ctx.chat.id, `❌ You have no ${await getNativeCurrencySymbol(chain)}`);
            } else {
                await ctx.scene.enter(TRANSFER_NATIVE_CURRENCY_LISTENER);
            }
        } catch (err) {
            await processError(ctx, telegramId, err);
        }
    });
};
