import { botEnum } from "../../../constants/botEnum.js"
import { AutoBuyTokenModel } from "../../../models/auto.buy.token.js"
import { updateChatId, userVerboseLog } from "../../../service/app.user.service.js"
import { addTokenAutoBuy, getTokenAutoBuyContext, isTokenAutoBuySet, updateQuickAutoBuyParam, updateTokenAutoBuyContext } from "../../../service/autobuy.service.js"
import { processError } from "../../../service/error.js"
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js"
import { getTokenInfo, getTokenPrice } from "../../../service/token.service.js"
import { INVALID_VALUE_SET } from "../../../utils/common.js"
import { getQuickMarkup, getTrackMarkup } from "../../../utils/inline.markups.js"
import Logging from "../../../utils/logging.js"
import { getQuickMessage } from "../../../utils/messages.js"
import { getNativeCurrencySymbol } from "../../../web3/chain.parameters.js"
import { userETHBalance } from "../../../web3/nativecurrency/nativecurrency.query.js"
import { getBN } from "../../../web3/web3.operation.js"
const { revokeAutoTrade, refreshAutoTrade } = require('../../auto.js')

export class AutoBuyListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`AutoBuyListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)

        try {
            if (context.inputType === 'auto-buy-price-percentage') {
                await processAutoBuyPricePercentage(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-buy-price-usd') {
                await processAutoBuyPriceUsd(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-buy-price-marketcap') {
                await processAutoBuyPriceMarketCap(telegramId, text, ctx, context)
            }
			else if (context.inputType === 'auto-buy-price-unified') {
                await processAutoBuyPriceUnified(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-buy-amount') {
                await processAutoBuyAmount(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'quick-auto-buy-amount') {
                await processQuickAutoBuyAmount(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'quick-auto-buy-gas-amount') {
                await processQuickAutoBuyGasAmount(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'quick-auto-buy-slippage') {
                await processQuickAutoBuySlippage(telegramId, text, ctx, context)
            }
			else if (context.inputType === 'add-new-auto-buy-token') {
				await processAddNewAutoBuy(telegramId, text, ctx, context)
			}
        }
        catch (err) {
            await processError(ctx, telegramId, err)
        }
    }
}

async function processAutoBuyPricePercentage(telegramId: string, text: string, ctx: any, context: any) {
    const idx = text.indexOf('%');
    if (idx < 0) throw new Error(INVALID_VALUE_SET + '\nNot %');

    const p = text.slice(0, idx);
    const percentage = parseFloat(p);

    if (isNaN(percentage) || percentage < -100 || percentage > 0) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET +
            '\nThe value you entered resulted in an unsuitable buy percentage. The percentage needs to be between <b>-100%</b> and <b>0.00%</b>. Please input again.'
        );
    }

    const autoBuyCtx = await AutoBuyTokenModel.findById(context.autoBuyId)
    const chain = autoBuyCtx.chain

    await updateTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token, {
        priceLimit: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoBuyCtx.token} auto buy price set to ${percentage.toString() + '%'}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoBuyCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoBuyPriceUsd(telegramId: string, text: string, ctx: any, context: any) {
    const autoBuyCtx = await AutoBuyTokenModel.findById(context.autoBuyId)
    const chain = autoBuyCtx.chain

    const info = await getTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token)

    const value = parseFloat(text);

    if (isNaN(value) || value <= 0 || value >= parseFloat(info.priceStamp)) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>${parseFloat(info.priceStamp)}</b>`)
    }

    await updateTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token, {
        priceLimit: value.toString()
    });

    await userVerboseLog(telegramId, `${autoBuyCtx.token} auto buy price set to ${value.toString() + '$'}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoBuyCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoBuyPriceMarketCap(telegramId: string, text: string, ctx: any, context: any) {
    const autoBuyCtx = await AutoBuyTokenModel.findById(context.autoBuyId)
    const chain = autoBuyCtx.chain

	const tokenInfo = await getTokenInfo(chain, autoBuyCtx.token)

    const info = await getTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token)

    const value = parseFloat(text);
    const priceString = await getTokenPrice(chain, autoBuyCtx.token)
	const price = parseFloat(priceString)
    if (isNaN(price) || price === 0) throw new Error(INVALID_VALUE_SET + '\nInvalid auto buy reference price');

    const mc = parseFloat(tokenInfo.totalSupply) * price;

    if (isNaN(value) || value <= 0 || value >= mc) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>${mc}</b>`)
    }

    const percentage = Math.floor(((value - mc) * 10000) / mc) / 100;

    await updateTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token, {
		priceStamp: price,
        priceLimit: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoBuyCtx.token} auto buy price set to ${percentage.toString() + '%'} by marketcap`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoBuyCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoBuyPriceUnified(telegramId: string, text: string, ctx: any, context: any) {
    const percentageIdx = text.indexOf('%');
	const priceIdx = text.indexOf('$');
	if (percentageIdx >= 0) {
		if (percentageIdx < 0) throw new Error(INVALID_VALUE_SET + '\nNot %');

		const p = text.slice(0, percentageIdx);
		const percentage = parseFloat(p);

		if (isNaN(percentage) || percentage < -100 || percentage > 0) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET +
				'\nThe value you entered resulted in an unsuitable buy percentage. The percentage needs to be between <b>-100%</b> and <b>0.00%</b>. Please input again.'
			);
		}

		const autoBuyCtx = await AutoBuyTokenModel.findById(context.autoBuyId)
		const chain = autoBuyCtx.chain

		await updateTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token, {
			priceLimit: percentage.toString() + '%'
		});

		await userVerboseLog(telegramId, `${autoBuyCtx.token} auto buy price set to ${percentage.toString() + '%'}`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoBuyCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>percentage</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	} else if (priceIdx >= 0) {
		const p = text.slice(0, priceIdx);
		const value = parseFloat(p);

		const autoBuyCtx = await AutoBuyTokenModel.findById(context.autoBuyId)
		const chain = autoBuyCtx.chain

		const info = await getTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token)

		if (isNaN(value) || value <= 0 || value >= parseFloat(info.priceStamp)) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>${parseFloat(info.priceStamp)}</b>`)
		}

		await updateTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token, {
			priceLimit: value.toString()
		});

		await userVerboseLog(telegramId, `${autoBuyCtx.token} auto buy price set to ${value.toString() + '$'}`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoBuyCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>USD</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	} else {
		const value = parseFloat(text);

		const autoBuyCtx = await AutoBuyTokenModel.findById(context.autoBuyId)
		const chain = autoBuyCtx.chain

		const tokenInfo = await getTokenInfo(chain, autoBuyCtx.token)

		const priceString = await getTokenPrice(chain, autoBuyCtx.token)
		const price = parseFloat(priceString)
		if (isNaN(price) || price === 0) throw new Error(INVALID_VALUE_SET + '\nInvalid auto buy reference price');

		const mc = parseFloat(tokenInfo.totalSupply) * price;

		if (isNaN(value) || value <= 0 || value >= mc) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>${mc}</b>`)
		}

		const percentage = Math.floor(((value - mc) * 10000) / mc) / 100;

		await updateTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token, {
			priceStamp: price,
			priceLimit: percentage.toString() + '%'
		});

		await userVerboseLog(telegramId, `${autoBuyCtx.token} auto buy price set to ${percentage.toString() + '%'} by marketcap`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoBuyCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>percentage</b> by <b>market cap</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	}
}

async function processAutoBuyAmount(telegramId: string, text: string, ctx: any, context: any) {
    const idx = text.indexOf('%')

    const autoBuyCtx = await AutoBuyTokenModel.findById(context.autoBuyId)
    const chain = autoBuyCtx.chain

    let amountAtLimit;
    if (idx >= 0) {
        const p = text.slice(0, idx);
        const percentage = parseFloat(p);

        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            await new SceneStageService().deleteScene(telegramId)
            throw new Error(INVALID_VALUE_SET +
                '\nThe value you entered resulted in an unsuitable buy percentage. The percentage needs to be between <b>0%</b> and <b>100%</b>. Please input again.'
            );
        }


        amountAtLimit = percentage.toString() + '%';
    } else {
        const value = parseFloat(text)
        const ethBal = await userETHBalance(telegramId, chain)

        if (isNaN(value) || value <= 0 || value >= ethBal) throw new Error(INVALID_VALUE_SET + `\nPlease input lower than or equal to <b>${ethBal}</b>`);

        amountAtLimit = value.toString();
    }

    await updateTokenAutoBuyContext(telegramId, chain, autoBuyCtx.token, {
        amountAtLimit: amountAtLimit
    });

    await userVerboseLog(telegramId, `${autoBuyCtx.token} auto buy amount set to ${amountAtLimit}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoBuyCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processQuickAutoBuyAmount(telegramId: string, text: string, ctx: any, context: any) {
    const idx = text.indexOf('%');

    const chain = context.chain

    let amountSet;
    if (idx >= 0) {
        const p = text.slice(0, idx);
        const percentage = parseFloat(p);

        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            await new SceneStageService().deleteScene(telegramId)
            throw new Error(INVALID_VALUE_SET +
                '\nThe value you entered resulted in an unsuitable buy percentage. The percentage needs to be between <b>0%</b> and <b>100%</b> (your P/L). Please choose another value.'
            );
        }


        amountSet = percentage.toString() + '%';
    } else {
        const value = parseFloat(text);
        const ethBal = await userETHBalance(telegramId, chain);
		const nativeSymbol = await getNativeCurrencySymbol(chain)

        if (isNaN(value) || value <= 0 || value >= ethBal) throw new Error(INVALID_VALUE_SET + `\nYou have <code>${ethBal}</code> <b>${nativeSymbol}</b>\nPlease input lower than or equal to <b>${ethBal}</b>`);

        amountSet = value.toString();
    }

    await updateQuickAutoBuyParam(telegramId, chain, { amount: amountSet });

    await userVerboseLog(telegramId, `[${chain}] quick auto buy amount set to ${amountSet}`);

    const tMsg = await getQuickMessage(telegramId, chain)
    await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, tMsg, {
        parse_mode: botEnum.PARSE_MODE_V2,
        reply_markup: await getQuickMarkup(telegramId, chain)
    });

	const nativeSymbol = await getNativeCurrencySymbol(chain)
	await ctx.telegram.sendMessage(ctx.chat.id, `✅ Set quick autobuy <b>${nativeSymbol}</b> amount to <b>${amountSet.toString()} ${amountSet.includes("%")? '': nativeSymbol}</b>`, { parse_mode: botEnum.PARSE_MODE_V2 })

    await new SceneStageService().deleteScene(telegramId)
}

async function processQuickAutoBuyGasAmount(telegramId: string, text: string, ctx: any, context: any) {
    const chain = context.chain
    const gasPrice = undefined //chain === 'ethereum' ? '0' : await chainGasPrice(chain);

    const value = parseFloat(text);
    const BN = getBN();

    if (isNaN(value) || BN(value).lt(BN(gasPrice))) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + `\nPlease input greater than or equal to <b>${gasPrice}</b>`)
    }

    await updateQuickAutoBuyParam(telegramId, chain, { gasPrice: value });

    await userVerboseLog(telegramId, `[${chain}] quick auto buy gas price set to ${value}`);

    const tMsg = await getQuickMessage(telegramId, chain)
    await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, tMsg, {
        parse_mode: botEnum.PARSE_MODE_V2,
        reply_markup: await getQuickMarkup(telegramId, chain)
    });

    await new SceneStageService().deleteScene(telegramId)
}

async function processQuickAutoBuySlippage(telegramId: string, text: string, ctx: any, context: any) {
    const chain = context.chain
    const value = parseFloat(text);
    if (isNaN(value) || value < 0 || value > 100) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + `\nPlease input between <b>0</b> and <b>100</b>`)
    }

    await updateQuickAutoBuyParam(telegramId, chain, { slippage: value });

    await userVerboseLog(telegramId, `[${chain}] quick auto buy slippage set to ${value}%`);

    const tMsg = await getQuickMessage(telegramId, chain)
    await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, tMsg, {
        parse_mode: botEnum.PARSE_MODE_V2,
        reply_markup: await getQuickMarkup(telegramId, chain)
    });

	await ctx.telegram.sendMessage(ctx.chat.id, `✅ Set quick autobuy slippage to <b>${value.toString()}%</b>`, { parse_mode: botEnum.PARSE_MODE_V2 })

    await new SceneStageService().deleteScene(telegramId)
}

async function processAddNewAutoBuy(telegramId: string, text: string, ctx: any, context: any) {
	const tokenDB = await getTokenInfo(context.chain, text)
	const chain = tokenDB.chain

	const isAS = await isTokenAutoBuySet(telegramId, tokenDB.chain, tokenDB.address);
	if (isAS === true) {
	} else {
		const tokenPrice = await getTokenPrice(chain, tokenDB.address)
		if (tokenPrice === undefined) {
			throw new Error(`processAddNewAutoBuy: unresolvable token price [${chain}] ${tokenDB.address}`)
		}
		await addTokenAutoBuy(telegramId, chain, tokenDB.address, tokenPrice)
		await userVerboseLog(telegramId, `added ${tokenDB.address} to auto buy`);
	}

	await revokeAutoTrade(ctx, tokenDB.address)

	if (ctx.update.callback_query?.message.message_id) {
		await ctx.telegram.editMessageReplyMarkup(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getTrackMarkup(telegramId, chain, tokenDB.address))
	}
}
