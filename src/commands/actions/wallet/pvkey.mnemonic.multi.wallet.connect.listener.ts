import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { IAddressPagination } from '../../../models/address.model.js';
import { getAdditionalWalletByName, getMultiWalletsPagination, importWallet, isAdditionalWalletNameExist, isAdditionalWalletPrivateKeyExist } from '../../../service/wallet.service.js';
import { markupMultiWalletMainPaginate } from '../../../utils/inline.markups.js';
import { multiWalletMessage } from '../../../utils/messages.js';
import { PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER } from '../../../utils/common.js';
import { ISceneResponse, SceneStageService } from '../../../service/scene.stage.service.js';
import Logging from '../../../utils/logging.js';
import { getSettings } from '../../../service/settings.service.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { getBase58PvKey } from '../../../web3/web3.operation.js';

const listener = new Scenes.BaseScene(PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER);

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


        // try { ctx.answerCbQuery() } catch { }

        const context = {
            initiator: JSON.stringify(ctx.update.callback_query),
            chain: ctx.scene.state.chain,
            message: JSON.stringify(ret),
            name: null,
            pvKeyMnemonic: null,
            msgId: ctx.update.callback_query.message.message_id,
        };

        await new SceneStageService().saveScene(telegramId, PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});


export class PvKeyMnemonicMultiWalletConnectListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`PvKeyMnemonicMultiWalletConnectListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)
        
        const context = JSON.parse(sceneContext.scene.text)
        if (context.name === null) {
            if (text.length > 8) {
                sendError(ctx, "8 letters max, only numbers and letters.");
                await new SceneStageService().deleteScene(telegramId)
                return
            }
            if (!/^[A-Za-z0-9]*$/.test(text)) {
                sendError(ctx, "name contains special characters, only numbers and letters.");
                await new SceneStageService().deleteScene(telegramId)
                return
            }
            if (await isAdditionalWalletNameExist(telegramId, text)) {
                sendError(ctx, `a wallet with the name <code>${text}</code> already exists. Please choose another name`);
                await new SceneStageService().deleteScene(telegramId)
                return
            } else {
                await ctx.telegram.sendMessage(ctx.from.id, "What's the private key of this wallet? You may also use a 12-word mnemonic phrase.", {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: '4ccee444e88dfc7....'
                    }
                });

                context.name = text;
                await new SceneStageService().saveScene(telegramId, PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER, JSON.stringify(context), new Date());
            }
        } else if (context.pvKeyMnemonic == null) {
            if (await isAdditionalWalletPrivateKeyExist(telegramId, text)) {
                sendError(ctx, `The wallet with the private key provided already exists. Please choose another private key`);
                await new SceneStageService().deleteScene(telegramId)
                return
            }
            await receivePvKeyOrMnemonic(ctx, text, telegramId, context.chain, context.name, context.msgId);
        }
    }
}

async function sendError(ctx: any, message: string) {
    await ctx.telegram.sendMessage(ctx.from.id, message, {
        parse_mode: botEnum.PARSE_MODE_V2
    });
}

async function receivePvKeyOrMnemonic(ctx: any, pvKeyMnemonic: string, telegramId: string, chain: string, name: string, callbackMessageId: any) {
    try {
        if (await importWallet(telegramId, pvKeyMnemonic, true, name)) {
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
            await ctx.telegram.editMessageText(telegramId, callbackMessageId, 0, message, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: markupMultiWalletMainPaginate(telegramId, chain, setting.multiWallet, data)
            });

            await new SceneStageService().deleteScene(telegramId)
            return true;
        } else {
			await ctx.telegram.sendMessage(
                ctx.chat.id,
                `❌ Not recognized as a wallet mnemonic phrase or private key`,
                {
                    parse_mode: botEnum.PARSE_MODE_V2
                }
            );
		}
    } catch (e) {
		console.error(e)
        Logging.info(`ops`)
    }
}

export default listener;
