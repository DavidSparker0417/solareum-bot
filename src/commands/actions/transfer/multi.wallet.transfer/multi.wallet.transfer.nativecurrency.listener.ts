import { Scenes } from 'telegraf';
import { botEnum } from '../../../../constants/botEnum.js';
import { getAddressById } from '../../../../service/wallet.service.js';
import { getMultiWalletPaginationDetails, IPageAndLimit } from '../../../../utils/global.functions.js';
import Logging from '../../../../utils/logging.js';
import { getNativeCurrencySymbol } from '../../../../web3/chain.parameters.js';
import { getBN, isValidAddress } from '../../../../web3/web3.operation.js';
import { ADDRESS_PLACEHOLDER, MULTI_WALLET_TRANSFER_NATIVE_CURRENCY_LISTENER, SEND_AMOUNT_PLACEHOLDER } from '../../../../utils/common.js';
import { ISceneResponse, SceneStageService } from '../../../../service/scene.stage.service.js';
import { getETHBalance } from '../../../../web3/nativecurrency/nativecurrency.query.js';
import { userTransferETHAdditionalAddress } from '../../../../web3/nativecurrency/nativecurrency.transaction.js';
import { processError } from '../../../../service/error.js';
import { updateChatId } from '../../../../service/app.user.service.js';

const listener = new Scenes.BaseScene(MULTI_WALLET_TRANSFER_NATIVE_CURRENCY_LISTENER);

listener.enter(async (ctx: any) => {
    const telegramId = ctx.update.callback_query.from.id;
    try {
        await updateChatId(telegramId, ctx.chat.id)

        const pageLimit: IPageAndLimit = getMultiWalletPaginationDetails(ctx.match[0]);
        const address = await getAddressById(pageLimit.addressId);

        const chain = pageLimit.chain

        const bal = await getETHBalance(telegramId, chain, address.address);
        const label = await getNativeCurrencySymbol(chain);
        await ctx.telegram.sendMessage(
            ctx.chat.id,
            `How much <b>${label}</b> do you want to send? You can use <b>% notation or a regular number</b>.\n\n` +
            'If you type <code>100%</code>, it will transfer <b>the entire balance</b>.\n' +
            `You currently have <code>${bal}</code> <b>${label}</b>`,
            {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: SEND_AMOUNT_PLACEHOLDER
                }
            }
        );

        const context = {
            initiator: JSON.stringify(ctx.update.callback_query),
            balance: bal,
            address: address,
            pageLimit: pageLimit,
            to: null,
            amountPercent: null,
            amountNumber: null,
            chain: chain,
        };

        await new SceneStageService().saveScene(telegramId, MULTI_WALLET_TRANSFER_NATIVE_CURRENCY_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});


export class MultiWalletTransferNativeCurrencyListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`MultiWalletTransferNativeCurrencyListener.class processing scene message [${text}]`)
        const context = JSON.parse(sceneContext.scene.text)
        const BN = getBN();
        const percentExpression = /^\d+(\.\d+)?\%$/;
        const numberExpression = /^\d+(\.\d+)?$/;
        const spaceExpression = /^\s+|\s+$/gm;

        const chain = context.chain

        if (context.amountPercent === null && context.amountNumber === null) {
            if (percentExpression.test(text.replace(spaceExpression, ''))) {
                const percent = parseFloat(text.replace('%', ''));
                if (percent < 0.001 || percent > 100) {
                    await ctx.telegram.sendMessage(ctx.chat.id, 'you must use a valid number <b>between 0.001 and 100</b> inclusive. Please try again', { parse_mode: botEnum.PARSE_MODE_V2 });
                    await new SceneStageService().deleteScene(telegramId)
                    return;
                }

                context.amountPercent = text;

                const symbol = await getNativeCurrencySymbol(chain);
                await new SceneStageService().saveScene(telegramId, MULTI_WALLET_TRANSFER_NATIVE_CURRENCY_LISTENER, JSON.stringify(context), new Date());
                let amount = BN(context.amountPercent.replace('%', '')).div(BN(100)).times(BN(context.balance)).toString();

                await ctx.telegram.sendMessage(ctx.chat.id, `To whom do you want to send <code>${amount}</code> <b>${symbol}</b>`, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: {
                        force_reply: true,
                        input_field_placeholder: ADDRESS_PLACEHOLDER
                    }
                });
            } else if (numberExpression.test(text)) {
                if (BN(text) > BN(context.balance)) {
                    await ctx.telegram.sendMessage(ctx.chat.id, '❌ Insufficient balance to perform this transfer. Make sure your wallet owns exactly the amount you want to transfer.', {
                        parse_mode: botEnum.PARSE_MODE_V2
                    });
                    await new SceneStageService().deleteScene(telegramId)
                } else {
                    context.amountNumber = text;
                    const symbol = await getNativeCurrencySymbol(chain);
                    await new SceneStageService().saveScene(telegramId, MULTI_WALLET_TRANSFER_NATIVE_CURRENCY_LISTENER, JSON.stringify(context), new Date());

                    await ctx.telegram.sendMessage(ctx.chat.id, `To whom do you want to send <code>${context.amountNumber}</code> <b>${symbol}</b>`, {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: {
                            force_reply: true,
                            input_field_placeholder: ADDRESS_PLACEHOLDER
                        }
                    });
                    return;
                }
            }
            else if (!numberExpression.test(text)) {
                await ctx.telegram.sendMessage(ctx.chat.id, 'you must use a valid number <b>between 0.001 and 100</b> inclusive. Please try again', { parse_mode: botEnum.PARSE_MODE_V2 });
                await new SceneStageService().deleteScene(telegramId)
            }
        } else {
            try {
                const addr = text
                if (isValidAddress(addr)) {
                    let amount;
                    if (context.amountNumber != null) {
                        amount = context.amountNumber;
                    } else {
                        amount = BN(context.amountPercent.replace('%', '')).div(BN(100)).times(BN(context.balance)).toString();
                    }

                    const tx = await userTransferETHAdditionalAddress(telegramId, chain, context.address, addr, amount, {regulate: true});
                    await new SceneStageService().deleteScene(telegramId)
                } else {
                    await new SceneStageService().deleteScene(telegramId)
                }
            }
            catch (err) {
                console.error(`==> ${new Date().toLocaleString()}`)
                console.error(err)
                Logging.error(err);
            }
        }
    }
}

export default listener;
