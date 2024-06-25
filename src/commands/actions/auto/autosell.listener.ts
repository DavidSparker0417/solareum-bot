import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { AUTO_SELL_LISTENER } from '../../../utils/common.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';
import { AutoSellTokenModel } from '../../../models/auto.sell.token.js';
import { getTokenInfo, getTokenPrice } from '../../../service/token.service.js';
import { getBN } from '../../../web3/web3.operation.js';

export const autoSellInputListener = new Scenes.BaseScene(AUTO_SELL_LISTENER);

// send a prompt message when user enters scene
autoSellInputListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        const context = {
            inputType: ctx.scene.state.input_type,
            msgId: ctx.scene.state.msgId,
            chain: ctx.scene.state.chain,
            autoSellId: ctx.scene.state.autoSellId,
        }

        await updateChatId(telegramId, ctx.chat.id)
		const BN = getBN()

        let ret;
		const asRecord = await AutoSellTokenModel.findById(context.autoSellId)

        if (ctx.scene.state.input_type === 'auto-sell-low-price-percentage') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You already configured <code>${asRecord.lowPriceLimit}</code>.\nPlease input <b>low limit</b> of <b>stop-loss price</b> in <b>percentage</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'auto-sell-low-price-usd') {
			const tokenPrice = await getTokenPrice(asRecord.chain, asRecord.token)
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)

            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Current <b>${tokenInfo.symbol}</b> price is $<code>${tokenPrice}</code>.\nPlease input <b>low limit</b> of <b>stop-loss price</b> in <b>USD</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'auto-sell-low-price-marketcap') {
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)
			const price = await getTokenPrice(asRecord.chain, asRecord.token)

			const mc = BN(tokenInfo.totalSupply).times(BN(price)).toString();

            ret = await ctx.telegram.sendMessage(
                ctx.chat.id,
                `Current <b>${tokenInfo.symbol}</b> market cap is <code>${mc}$</code>.\nPlease input <b>market cap</b> in <b>USD</b> under which you want to sell the token automatically. The bot will automatically convert your choice to <b>percentage</b> terms.`,
                {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: {
                        force_reply: true
                    }
                }
            );

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();



        } else if (ctx.scene.state.input_type === 'auto-sell-low-price-unified') {
			const tokenPrice = await getTokenPrice(asRecord.chain, asRecord.token)
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)

			const mc = BN(tokenInfo.totalSupply).times(BN(tokenPrice)).toFixed(2);

            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You already configured <code>${asRecord.lowPriceLimit}</code>.\nPlease input <b>low limit</b> of <b>stop-loss price</b>.\n\n<b>Percentage</b> is valued in the form of "<code>-50%</code>".\n<b>Price</b> is valued in the form of "<code>0.1423$</code>".\n<b>Market Cap</b> is valued in the form of "<code>10000000</code>"\n\nCurrent <b>${tokenInfo.symbol}</b> price is <code>${tokenPrice}$</code>.\nCurrent <b>${tokenInfo.symbol}</b> market cap is <code>${mc}</code>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'auto-sell-high-price-percentage') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You already configured <code>${asRecord?.highPriceLimit || 'not defined'}</code>.\nPlease input <b>high limit</b> of <b>take-profit price</b> in <b>percentage</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });


            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'auto-sell-high-price-usd') {
			const tokenPrice = await getTokenPrice(asRecord.chain, asRecord.token)
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)

            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Current <b>${tokenInfo.symbol}</b> price is $<code>${tokenPrice}</code>.\nPlease input <b>high limit</b> of <b>take-profit price</b> in <b>USD</b>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'auto-sell-high-price-marketcap') {
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)
			const price = await getTokenPrice(asRecord.chain, asRecord.token)

			const mc = BN(tokenInfo.totalSupply).times(BN(price)).toFixed(2);

            ret = await ctx.telegram.sendMessage(
                ctx.chat.id,
                `Current <b>${tokenInfo.symbol}</b> market cap is <code>${mc}$</code>.\nPlease input <b>market cap</b> in <b>USD</b> over which you want to sell the token automatically. The bot will automatically convert your choice to <b>percentage</b> terms.`,
                {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: {
                        force_reply: true
                    }
                }
            );

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'auto-sell-high-price-unified') {
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)
			const price = await getTokenPrice(asRecord.chain, asRecord.token)

			const mc = BN(tokenInfo.totalSupply).times(BN(price)).toFixed(2);

            ret = await ctx.telegram.sendMessage(ctx.chat.id, `You already configured <code>${asRecord?.highPriceLimit || 'not defined'}</code>.\nPlease input <b>high limit</b> of <b>take-profit price</b>\n\n<b>Percentage</b> is valued in the form of "<code>-50%</code>".\n<b>Price</b> is valued in the form of "<code>0.1423$</code>".\n<b>Market Cap</b> is valued in the form of "<code>10000000</code>"\n\nCurrent <b>${tokenInfo.symbol}</b> price is <code>${price}$</code>.\nCurrent <b>${tokenInfo.symbol}</b> market cap is <code>${mc}</code>.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();


        } else if (ctx.scene.state.input_type === 'auto-sell-amount-low-price') {
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Please input <b>percentage</b> of your <b>${tokenInfo.symbol}</b> to sell at the low limit.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();

        } else if (ctx.scene.state.input_type === 'auto-sell-amount-high-price') {
			const tokenInfo = await getTokenInfo(asRecord.chain, asRecord.token)
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Please input <b>percentage</b> of your <b>${tokenInfo.symbol}</b> to sell at the high limit.`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'add-new-auto-sell-token') {
			ret = await ctx.telegram.sendMessage(ctx.chat.id, `Please input token ca to configure limit order`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, AUTO_SELL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
		}
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});
