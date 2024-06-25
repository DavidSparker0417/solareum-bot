import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { IAddressPagination } from '../../../models/address.model.js';
import { createRandomWallet, getAdditionalWalletByName, getMultiWalletsPagination, isAdditionalWalletNameExist } from '../../../service/wallet.service.js';
import { markupMultiWalletMainPaginate } from '../../../utils/inline.markups.js';
import { multiWalletMessage } from '../../../utils/messages.js';
import { PV_KEY_MNEMONIC_MULTI_WALLET_GENERATE_LISTENER } from '../../../utils/common.js';
import { ISceneResponse, SceneStageService } from '../../../service/scene.stage.service.js';
import Logging from '../../../utils/logging.js';
import { getSettings } from '../../../service/settings.service.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { getBase58PvKey } from '../../../web3/web3.operation.js';

const listener = new Scenes.BaseScene(PV_KEY_MNEMONIC_MULTI_WALLET_GENERATE_LISTENER);

// send a prompt message when user enters scene
listener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        await updateChatId(telegramId, ctx.chat.id)

        const ret = await ctx.telegram.sendMessage(ctx.chat.id, 'what would you like to name this wallet? 8 letters max, only numbers and letters', {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: {
                force_reply: true,
                input_field_placeholder: 'Alpha'
            }
        });

        const context = {
            initiator: JSON.stringify(ctx.update.callback_query),
            chain: ctx.scene.state.chain,
            message: JSON.stringify(ret),
            name: null,
            pvKeyMnemonic: null,
            msgId: ctx.update.callback_query.message.message_id,
        };


        await new SceneStageService().saveScene(telegramId, PV_KEY_MNEMONIC_MULTI_WALLET_GENERATE_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});


export class PvKeyMnemonicMultiWalletGenerateListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`PvKeyMnemonicMultiWalletGenerateListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)
        
        const context = JSON.parse(sceneContext.scene.text)

        if (context.name == null) {
            if (text.length > 8) {
                sendError(ctx, "8 letters max, only numbers and letters. Let's try again, what would you like to name this wallet?");
                return;
            }
            if (!/^[A-Za-z0-9]*$/.test(text)) {
                sendError(ctx, "name contains special characters, only numbers and letters. Let's try again, what would you like to name this wallet?");
                return;
            }
            if (await isAdditionalWalletNameExist(telegramId, text)) {
                sendError(ctx, `a wallet with the name <code>${text}</code> already exists. Please choose another name`);
                return;
            } else {
                await generateWallet(ctx, telegramId, context.chain, text, context.msgId);
                await new SceneStageService().deleteScene(telegramId)
            }
        }
    }
}

export async function sendError(ctx: any, message: string) {
    await ctx.telegram.sendMessage(ctx.from.id, message, {
        parse_mode: botEnum.PARSE_MODE_V2
    });
}

async function generateWallet(ctx: any, telegramId: string, chain: string, name: string, msgId: string) {
    if (await createRandomWallet(telegramId, true, name)) {
        const w = await getAdditionalWalletByName(telegramId, name);

        const msg = await ctx.telegram.sendMessage(
            ctx.chat.id,
            `⚡️ Chain: <b>${chain.slice(0, 3).toUpperCase()}</b>\n${'\nAddress: <code>' + w.address + '</code>\nPrivate Key: <code>' + getBase58PvKey(w.privateKey) + '</code>\nMnemonic: <code>' + w.mnemonic + '</code>'}\n` +
            `\n<i>⚠️ Make sure to save this mnemonic phrase OR private key using pen and paper only. Do NOT copy-paste it anywhere. You could also import it to your Metamask/Trust Wallet. After you finish saving/importing the wallet credentials, delete this message. The bot will not display this information again.</i>` +
			`\n\nThis message will <b>automatically be deleted in 5 mins</b>.`,
            {
                parse_mode: botEnum.PARSE_MODE_V2
            }
        );

		setTimeout(async () => {
			try {
				await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id);
			} catch { }
		}, 5 * 60 * 1000)

        let data: IAddressPagination = await getMultiWalletsPagination(telegramId);
        if (data.metaData[0].totalPages !== data.metaData[0].pageNumber + 1) {
            data = await getMultiWalletsPagination(telegramId, data.metaData[0].totalPages, 4);
        }
        const message = await multiWalletMessage(telegramId, chain, data.data);
        const setting = await getSettings(telegramId, chain)
        await ctx.telegram.editMessageText(telegramId, msgId, 0, message, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: markupMultiWalletMainPaginate(telegramId, chain, setting.multiWallet, data)
        });
    }
}

export default listener;
