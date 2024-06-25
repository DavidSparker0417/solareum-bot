import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { getNativeCurrencySymbol } from '../../../web3/chain.parameters.js';
import { AUTO_BUY_LISTENER, SEND_AMOUNT_PLACEHOLDER } from '../../../utils/common.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { AutoBuyTokenModel } from '../../../models/auto.buy.token.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { getTokenInfo, getTokenPrice } from '../../../service/token.service.js';
import { userETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';
import { getBN } from '../../../web3/web3.operation.js';

export const autoBuyInputListener = new Scenes.BaseScene(AUTO_BUY_LISTENER);

// send a prompt message when user enters scene
autoBuyInputListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        const context = {
            inputType: ctx.scene.state.input_type,
            msgId: ctx.scene.state.msgId,
            chain: ctx.scene.state.chain,
            autoBuyId: ctx.scene.state.autoBuyId
        }

        const chain = ctx.scene.state.chain
		const BN = getBN()

        await updateChatId(telegramId, ctx.chat.id)
		const abRecord = await AutoBuyTokenModel.findById(context.autoBuyId)

        let ret;
        if (ctx.scene.state.input_type === 'auto-buy-price-percentage') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You already configured <code>${abRecord?.priceLimit || 'not defined'}</code>.\nPlease input <b>low limit</b> of <b>limit buy price</b> in <b>percentage</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'auto-buy-price-usd') {
			const tokenPrice = await getTokenPrice(abRecord.chain, abRecord.token)
			const tokenInfo = await getTokenInfo(abRecord.chain, abRecord.token)

            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Current <b>${tokenInfo.symbol}</b> price is $<code>${tokenPrice}</code>.\nPlease input <b>low limit</b> of <b>limit buy price</b> in <b>USD</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'auto-buy-price-marketcap') {
			const tokenInfo = await getTokenInfo(abRecord.chain, abRecord.token)
			const price = await getTokenPrice(abRecord.chain, abRecord.token)

			const mc = BN(tokenInfo.totalSupply).times(BN(price)).toFixed(2);

            ret = await ctx.telegram.sendMessage(
                ctx.chat.id,
                `Current <b>${tokenInfo.symbol}</b> market cap is <code>${mc}$</code>.\nPlease input <b>market cap</b> in <b>USD</b> under which you want to buy the token automatically. The bot will automatically convert your choice to <b>percentage</b> terms.`,
                {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: {
                        force_reply: true
                    }
                }
            );

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'auto-buy-price-unified') {
			const tokenInfo = await getTokenInfo(abRecord.chain, abRecord.token)
			const price = await getTokenPrice(abRecord.chain, abRecord.token)

			const mc = BN(tokenInfo.totalSupply).times(BN(price)).toFixed(2);
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You already configured <code>${abRecord?.priceLimit || 'not defined'}</code>.\nPlease input <b>low limit</b> of <b>limit buy price</b>.\n\n<b>Percentage</b> is valued in the form of "<code>-50%</code>".\n<b>Price</b> is valued in the form of "<code>0.1423$</code>".\n<b>Market Cap</b> is valued in the form of "<code>10000000</code>"\n\nCurrent <b>${tokenInfo.symbol}</b> price is <code>${price}$</code>.\nCurrent <b>${tokenInfo.symbol}</b> market cap is <code>${mc}</code>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'auto-buy-amount') {
            const autoBuyCtx = await AutoBuyTokenModel.findById(ctx.scene.state.autoBuyId)
            const nativeSymbol = await getNativeCurrencySymbol(autoBuyCtx.chain)
			const bal = await userETHBalance(telegramId, autoBuyCtx.chain)
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You have <code>${bal}</code> <b>${nativeSymbol}</b>.\nPlease input <b>${nativeSymbol}</b> amount or <b>percentage</b> to buy at the dip.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'quick-auto-buy-amount') {
            const nativeSymbol = await getNativeCurrencySymbol(chain)
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You are setting the <b>${nativeSymbol}</b> amount or percentage to buy automatically when pasting contract address.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
					input_field_placeholder: SEND_AMOUNT_PLACEHOLDER
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'quick-auto-buy-gas-amount') {
            const gasPrice = undefined //chain === 'ethereum' ? '0' : await chainGasPrice(chain)
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired <b>buy</b> gas ${chain === 'ethereum' ? 'delta' : 'price'} (in GWEI). 1 GWEI = 10 ^ 9 wei. <b>Minimum</b> is <b>${gasPrice}</b>!`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'quick-auto-buy-slippage') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Reply to this message with your desired slippage percentage. <b>Minimum</b> is <b>0</b>%. <b>Max</b> is <b>100</b>%!`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'add-new-auto-buy-token') {
			ret = await ctx.telegram.sendMessage(ctx.chat.id, `Please input token ca to configure limit order`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_BUY_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
		}
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});
