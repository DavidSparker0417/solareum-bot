import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { BRIDGE_LISTENER, SEND_AMOUNT_PLACEHOLDER } from '../../../utils/common.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { userETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';
import { getEvmWallet } from '../../../service/evm.wallet.service.js';
import { getEvmETHBalance } from '../../../web3/evm.web3.operation.js';

export const bridgeListener = new Scenes.BaseScene(BRIDGE_LISTENER);

// send a prompt message when user enters scene
bridgeListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        const context = {
            inputType: ctx.scene.state.input_type,
            msgId: ctx.scene.state.msgId,
        }
        let ret;

        await updateChatId(telegramId, ctx.chat.id)

        if (ctx.scene.state.input_type === 'solana-to-ethereum') {
			const solBalance = await userETHBalance(telegramId, 'solana')
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You have <code>${solBalance}</code> <b>SOL</b>.\nPlease input <b>SOL</b> amount to bridge to <b>ETH</b>`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
					input_field_placeholder: SEND_AMOUNT_PLACEHOLDER
                }
            });

            await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'ethereum-to-solana') {
			const w = await getEvmWallet(telegramId)
			const ethBalance = await getEvmETHBalance(w.address)
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You have <code>${ethBalance}</code> <b>ETH</b>.\nPlease input <b>ETH</b> amount to bridge to <b>SOL</b>`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
					input_field_placeholder: SEND_AMOUNT_PLACEHOLDER
                }
            });

            await new SceneStageService().saveScene(telegramId, BRIDGE_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        }
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});
