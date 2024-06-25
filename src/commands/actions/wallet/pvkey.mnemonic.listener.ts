import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { getWallet, importWallet } from '../../../service/wallet.service.js';
import { markupWalletConnected } from '../../../utils/inline.markups.js';
import Logging from '../../../utils/logging.js';
import { getWalletInfoOfChain } from '../../../utils/messages.js';
import { MNEMONIC_PLACEHOLDER, WALLET_KEY_LISTENER } from '../../../utils/common.js';
import { ISceneResponse, SceneStageService } from '../../../service/scene.stage.service.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { getBase58PvKey } from '../../../web3/web3.operation.js';

const listener = new Scenes.BaseScene(WALLET_KEY_LISTENER);

// send a prompt message when user enters scene
listener.enter(async (ctx: any) => {
    const telegramId = ctx.update.callback_query.from.id;

    try {
        await updateChatId(telegramId, ctx.chat.id)

        const ret = await ctx.telegram.sendMessage(ctx.chat.id, "What's the private key of this wallet? You may also use a 12-word mnemonic phrase.", {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: {
                force_reply: true,
                input_field_placeholder: MNEMONIC_PLACEHOLDER,
            }
        });

        try { ctx.answerCbQuery() } catch { }


        const context = {
            initiator: JSON.stringify(ctx.update.callback_query),
            chain: ctx.scene.state.chain,
            message: JSON.stringify(ret),
            lastMessage: ctx.update.callback_query.message.message_id
        };

        await new SceneStageService().saveScene(telegramId, WALLET_KEY_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
})


export class PvKeyMnemonicListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`PvKeyMnemonicListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)
        
        const context = JSON.parse(sceneContext.scene.text);

        if (await importWallet(telegramId, text)) {
            const w = await getWallet(telegramId)
            const chain = context.chain
            const msg1 = await ctx.telegram.sendMessage(
                ctx.chat.id,
                `⚡️ Chain: <b>${chain.slice(0, 3).toUpperCase()}</b>\n${'\nAddress: <code>' + w.address + '</code>\nPrivate Key: <code>' + getBase58PvKey(w.privateKey) + '</code>\nMnemonic: <code>' + w.mnemonic + '</code>'}\n` +
                `\n<i>⚠️Make sure to save this mnemonic phrase OR private key using pen and paper only. Do NOT copy-paste it anywhere. You could also import it to your Metamask/Trust Wallet. After you finish saving/importing the wallet credentials, delete this message. The bot will not display this information again.</i>` + 
				`\n\nThis message will <b>automatically be deleted in 5 mins</b>.`,
                {
                    parse_mode: botEnum.PARSE_MODE_V2
                }
            );
			setTimeout(async () => {
				try {
					await ctx.telegram.deleteMessage(ctx.chat.id, msg1.message_id);
				} catch { }
			}, 5 * 60 * 1000)

            await ctx.telegram.editMessageText(ctx.chat.id, context.lastMessage, 0, await getWalletInfoOfChain(telegramId, chain), {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: markupWalletConnected(telegramId, chain)
            });

            await new SceneStageService().deleteScene(telegramId);
        } else {
			await ctx.telegram.sendMessage(
                ctx.chat.id,
                `❌ Not recognized as a wallet mnemonic phrase or private key`,
                {
                    parse_mode: botEnum.PARSE_MODE_V2
                }
            );
		}
    }
}

// reply to all other types of messages
listener.on('message', async (ctx: any) => {
    try {
        await ctx.reply('Please input private key or mnemonic for ethereum wallet')
    } catch (err) {
        await processError(ctx, ctx.from.id, err)
    }
});

export default listener;
