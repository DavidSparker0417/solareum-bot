import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { getNativeCurrencySymbol } from '../../../web3/chain.parameters.js';
import { SNIPE_INPUT_LISTENER } from '../../../utils/common.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { SnipeTokenModel } from '../../../models/snipe.godmode.token.js';
import { getBN } from '../../../web3/web3.operation.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { getETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';
import { getWallet } from '../../../service/wallet.service.js';

export const snipeInputListener = new Scenes.BaseScene(SNIPE_INPUT_LISTENER);

// send a prompt message when user enters scene
snipeInputListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        const context = {
            inputType: ctx.scene.state.input_type,
            msgId: ctx.scene.state.msgId,
            snipeId: ctx.scene.state.snipeId,
        }

        let ret;

        await updateChatId(telegramId, ctx.chat.id)

        if (ctx.scene.state.input_type === 'snipe-gas-price-delta') {
            const s1: any = await SnipeTokenModel.findById(context.snipeId)
            const s = await s1.populate('token');

            const gasPrice = undefined//await chainGasPrice(s.token.chain);
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired gas price (in GWEI). 1 GWEI = 10 ^ 9 wei. Minimum is <b>${gasPrice}</b>!`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'snipe-block-delay') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired block delay.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'snipe-eth-amount') {
            const s1: any = await SnipeTokenModel.findById(context.snipeId)
            const s = await s1.populate('token');

			const nativeSymbol = await getNativeCurrencySymbol(s.token.chain);

			const w = await getWallet(telegramId)
			const ethBal = await getETHBalance(telegramId, s.token.chain, w.address);
			const myETHBal = parseFloat(ethBal);
			const BN = getBN()

			if (BN(ethBal).eq(BN(0))) {
				throw new Error(`You don't have any ${nativeSymbol}`);
			}

            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You have <code>${myETHBal}</code> <b>${nativeSymbol}</b>.\nReply to this message with your desired buy amount in <b>${nativeSymbol} or percentage</b> to snipe by`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'snipe-token-amount') {
            const s1: any = await SnipeTokenModel.findById(context.snipeId)
            const s = await s1.populate('token');

            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired buy amount <b>${s.token.symbol}</b> to snipe for`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'snipe-slippage-amount') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired slippage percentage.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'add-snipe-token') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `What's the token address to snipe?`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'snipe-select-method-id') {
            const s1: any = await SnipeTokenModel.findById(context.snipeId)
            await s1.populate('token')

            
            const camelcaseToStrings = (str: string) => {
                str = str.charAt(0).toUpperCase() + str.slice(1); // Capitalize the first letter
                return str.replace(/([0-9A-Z])/g, ' $&')
            }
            const methods = [] //abis.reduce((prev, cur) => prev + `<b><i>${camelcaseToStrings(cur.name)}</i></b> | <code>${cur.method}</code>\n`, '')
            ret = await ctx.telegram.sendMessage(
                ctx.chat.id,
                `
Reply to this message with the method ID that you'd like the snipe.

A unique method ID looks like this: 0x03c9ef12

Just ran a scan on this contract and found this for you:
${methods}
You can find any unidentified methods by visiting the contract on its corresponding block explorer.
        `,
                {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: {
                        force_reply: true
                    }
                }
            );

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'snipe-max-compute-units') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired <b>maximum compute units</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'snipe-compute-unit-price') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired <b>compute unit price</b> in <b>lamports</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
					input_field_placeholder: '0.02'
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'snipe-priority-fee') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired <b>priority fee</b> in <b>SOL</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
					input_field_placeholder: '0.0000326'
                }
            });

            await new SceneStageService().saveScene(telegramId, SNIPE_INPUT_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        }
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});
