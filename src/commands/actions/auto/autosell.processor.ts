import { botEnum } from "../../../constants/botEnum.js"
import { AutoSellTokenModel } from "../../../models/auto.sell.token.js"
import { updateChatId, userVerboseLog } from "../../../service/app.user.service.js"
import { addTokenAutoSell, getTokenAutoSellContext, isTokenAutoSellSet, updateTokenAutoSellContext } from "../../../service/autosell.service.js"
import { processError } from "../../../service/error.js"
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js"
import { getTokenInfo, getTokenPrice } from "../../../service/token.service.js"
import { getTrackText } from "../../../service/track.service.js"
import { INVALID_VALUE_SET } from "../../../utils/common.js"
import { getTrackMarkup } from "../../../utils/inline.markups.js"
import Logging from "../../../utils/logging.js"
const { revokeAutoTrade, refreshAutoTrade } = require('../../auto.js')

export class AutoSellListener {
    public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
        Logging.info(`AutoSellListener.class processing scene message [${text}]`)
        await updateChatId(telegramId, ctx.chat.id)

        const context = JSON.parse(sceneContext.scene.text)

        try {
            if (context.inputType === 'auto-sell-low-price-percentage') {
                await processAutoSellLowPricePercentage(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-sell-low-price-usd') {
                await processAutoSellLowPriceUsd(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-sell-low-price-marketcap') {
                await processAutoSellLowPriceMarketCap(telegramId, text, ctx, context)
            }
			else if (context.inputType === 'auto-sell-low-price-unified') {
                await processAutoSellLowPriceUnified(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-sell-high-price-percentage') {
                await processAutoSellHighPricePercentage(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-sell-high-price-usd') {
                await processAutoSellHighPriceUsd(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-sell-high-price-marketcap') {
                await processAutoSellHighPriceMarketCap(telegramId, text, ctx, context)
            }
			else if (context.inputType === 'auto-sell-high-price-unified') {
                await processAutoSellHighPriceUnified(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-sell-amount-low-price') {
                await processAutoSellAmountLowPrice(telegramId, text, ctx, context)
            }
            else if (context.inputType === 'auto-sell-amount-high-price') {
                await processAutoSellAmountHighPrice(telegramId, text, ctx, context)
            } else if (context.inputType === 'add-new-auto-sell-token') {
				await processAddNewAutoSell(telegramId, text, ctx, context)
			}
        }
        catch (err) {
            await processError(ctx, telegramId, err)
        }
    }
}

async function processAutoSellLowPricePercentage(telegramId: string, text: string, ctx: any, context: any) {
    const idx = text.indexOf('%');
    if (idx < 0) throw new Error(INVALID_VALUE_SET + '\nNot %');

    const p = text.slice(0, idx);
    const percentage = parseFloat(p);

    if (isNaN(percentage) || percentage < -100 || percentage > 0) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET +
            '\nThe value you entered resulted in an unsuitable percentage. The percentage should be between <b>-100%</b> and <b>0.00%</b>. Please input again.'
        );
    }

    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
        lowPriceLimit: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto-sell low price set to ${percentage.toString() + '%'}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoSellLowPriceUsd(telegramId: string, text: string, ctx: any, context: any) {
    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain

    const info = await getTokenAutoSellContext(telegramId, chain, autoSellCtx.token)

    const value = parseFloat(text)

    if (isNaN(value) || value <= 0 || value >= parseFloat(info.priceStamp)) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>${parseFloat(info.priceStamp)}</b>`);
    }

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
        lowPriceLimit: value.toString()
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell low price set to ${value.toString()}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoSellLowPriceMarketCap(telegramId: string, text: string, ctx: any, context: any) {
    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain

	const tokenInfo = await getTokenInfo(chain, autoSellCtx.token)

    const value = parseFloat(text);
    const priceString = await getTokenPrice(chain, autoSellCtx.token)
	const price = parseFloat(priceString)
    if (isNaN(price) || price === 0) throw new Error(INVALID_VALUE_SET + '\nInvalid auto sell reference price');

    const mc = parseFloat(tokenInfo.totalSupply) * price;

    if (isNaN(value) || value <= 0 || value >= mc) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>$${mc}</b>`);
    }

    const percentage = Math.floor(((value - mc) * 10000) / mc) / 100;

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
		priceStamp: price,
        lowPriceLimit: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell low price set to ${percentage.toString() + '%'} by marketcap`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoSellLowPriceUnified(telegramId: string, text: string, ctx: any, context: any) {
    const percentageIdx = text.indexOf('%');
	const priceIdx = text.indexOf('$');
    if (percentageIdx >= 0) {
		const p = text.slice(0, percentageIdx);
		const percentage = parseFloat(p);

		if (isNaN(percentage) || percentage < -100 || percentage > 0) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET +
				'\nThe value you entered resulted in an unsuitable percentage. The percentage should be between <b>-100%</b> and <b>0.00%</b>. Please input again.'
			);
		}

		const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
		const chain = autoSellCtx.chain

		await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
			lowPriceLimit: percentage.toString() + '%'
		});

		await userVerboseLog(telegramId, `${autoSellCtx.token} auto-sell low price set to ${percentage.toString() + '%'}`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>percentage</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	} else if (priceIdx >= 0) {
		const p = text.slice(0, priceIdx);
		const value = parseFloat(p);

		const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
		const chain = autoSellCtx.chain

		const info = await getTokenAutoSellContext(telegramId, chain, autoSellCtx.token)

		if (isNaN(value) || value <= 0 || value >= parseFloat(info.priceStamp)) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>${parseFloat(info.priceStamp)}</b>`);
		}

		await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
			lowPriceLimit: value.toString()
		});

		await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell low price set to ${value.toString()}`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>USD</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	} else {
		const value = parseFloat(text)

		const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
		const chain = autoSellCtx.chain

		const tokenInfo = await getTokenInfo(chain, autoSellCtx.token)

		const priceString = await getTokenPrice(chain, autoSellCtx.token)
		const price = parseFloat(priceString)
		if (isNaN(price) || price === 0) throw new Error(INVALID_VALUE_SET + '\nInvalid auto sell reference price');

		const mc = parseFloat(tokenInfo.totalSupply) * price;

		if (isNaN(value) || value <= 0 || value >= mc) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nPlease input lower than <b>$${mc}</b>`);
		}

		const percentage = Math.floor(((value - mc) * 10000) / mc) / 100;

		await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
			priceStamp: price,
			lowPriceLimit: percentage.toString() + '%'
		});

		await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell low price set to ${percentage.toString() + '%'} by marketcap`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>percentage</b> by <b>market cap</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	}
}

async function processAutoSellHighPricePercentage(telegramId: string, text: string, ctx: any, context: any) {
    const idx = text.indexOf('%');
    if (idx < 0) throw new Error(INVALID_VALUE_SET + '\nNot %');

    const p = text.slice(0, idx);
    const percentage = parseFloat(p);

    if (isNaN(percentage) || percentage < 0) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET +
            '\nThe value you entered resulted in an unsuitable percentage. The percentage should be greater than or equal to <b>0%</b>. Please input again.'
        );
    }

    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
        highPriceLimit: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell high price set to ${percentage.toString() + '%'}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoSellHighPriceUsd(telegramId: string, text: string, ctx: any, context: any) {
    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain
    const t = await getTrackText(telegramId, chain, autoSellCtx.token)

    const info = await getTokenAutoSellContext(telegramId, chain, autoSellCtx.token)

    const value = parseFloat(text);

    if (value < parseFloat(info.priceStamp)) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + `\nPlease input greater than or equal to <b>$${parseFloat(info.priceStamp)}</b>`);
    }

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
        highPriceLimit: value.toString()
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell high price set to ${value.toString()}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoSellHighPriceMarketCap(telegramId: string, text: string, ctx: any, context: any) {
    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain

	const tokenInfo = await getTokenInfo(chain, autoSellCtx.token)

    const value = parseFloat(text);
	const priceString = await getTokenPrice(chain, autoSellCtx.token)
	const price = parseFloat(priceString)

    if (isNaN(price) || price === 0) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + '\nInvalid auto sell reference price');
    }

    const mc = parseFloat(tokenInfo.totalSupply) * price;

    if (value < mc) throw new Error(INVALID_VALUE_SET + `\nPlease input greater than or equal to <b>${mc}</b>`);

    const percentage = Math.floor(((value - mc) * 10000) / mc) / 100;

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
		priceStamp: price,
        highPriceLimit: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell high price set to ${percentage.toString() + '%'} by marketcap`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoSellHighPriceUnified(telegramId: string, text: string, ctx: any, context: any) {
    const percentageIdx = text.indexOf('%');
	const priceIdx = text.indexOf('$');
	if (percentageIdx >= 0) {
		if (percentageIdx < 0) throw new Error(INVALID_VALUE_SET + '\nNot %');

		const p = text.slice(0, percentageIdx);
		const percentage = parseFloat(p);

		if (isNaN(percentage) || percentage < 0) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET +
				'\nThe value you entered resulted in an unsuitable percentage. The percentage should be greater than or equal to <b>0%</b>. Please input again.'
			);
		}

		const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
		const chain = autoSellCtx.chain

		await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
			highPriceLimit: percentage.toString() + '%'
		});

		await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell high price set to ${percentage.toString() + '%'}`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>percentage</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	} else if (priceIdx >= 0) {
		const p = text.slice(0, priceIdx);
		const value = parseFloat(p);

		const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
		const chain = autoSellCtx.chain
		const info = await getTokenAutoSellContext(telegramId, chain, autoSellCtx.token)

		if (isNaN(value) || value < parseFloat(info.priceStamp)) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nPlease input greater than or equal to <b>$${parseFloat(info.priceStamp)}</b>`);
		}

		await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
			highPriceLimit: value.toString()
		});

		await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell high price set to ${value.toString()}`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>USD</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	} else {
		const value = parseFloat(text);

		const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
		const chain = autoSellCtx.chain

		const tokenInfo = await getTokenInfo(chain, autoSellCtx.token)

		const priceString = await getTokenPrice(chain, autoSellCtx.token)
		const price = parseFloat(priceString)

		if (isNaN(price) || price === 0) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + '\nInvalid auto sell reference price');
		}

		const mc = parseFloat(tokenInfo.totalSupply) * price;

		if (value < mc) throw new Error(INVALID_VALUE_SET + `\nPlease input greater than or equal to <b>${mc}</b>`);

		const percentage = Math.floor(((value - mc) * 10000) / mc) / 100;

		await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
			priceStamp: price,
			highPriceLimit: percentage.toString() + '%'
		});

		await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell high price set to ${percentage.toString() + '%'} by marketcap`);

		await new SceneStageService().deleteScene(telegramId)

		await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
		await ctx.reply('✅ Success in <b>percentage</b> by <b>market cap</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
	}
}

async function processAutoSellAmountLowPrice(telegramId: string, text: string, ctx: any, context: any) {
    const idx = text.indexOf('%');
    if (idx < 0) throw new Error(INVALID_VALUE_SET + '\nNot %');

    const p = text.slice(0, idx);
    const percentage = parseFloat(p);

    if (percentage < 0 || percentage > 100) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + '\nValue needs to be between <b>0% and 100%</b>.');
    }

    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
        amountAtLowPrice: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell amount at low price set to ${percentage.toString() + '%'}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAutoSellAmountHighPrice(telegramId: string, text: string, ctx: any, context: any) {
    const idx = text.indexOf('%');
    if (idx < 0) throw new Error(INVALID_VALUE_SET + '\nNot %');

    const p = text.slice(0, idx);
    const percentage = parseFloat(p);

    if (percentage < 0 || percentage > 100) {
        await new SceneStageService().deleteScene(telegramId)
        throw new Error(INVALID_VALUE_SET + '\nValue needs to be between <b>0% and 100%</b>.');
    }

    const autoSellCtx = await AutoSellTokenModel.findById(context.autoSellId)
    const chain = autoSellCtx.chain

    await updateTokenAutoSellContext(telegramId, chain, autoSellCtx.token, {
        amountAtHighPrice: percentage.toString() + '%'
    });

    await userVerboseLog(telegramId, `${autoSellCtx.token} auto sell amount at high price set to ${percentage.toString() + '%'}`);

    await new SceneStageService().deleteScene(telegramId)

	await refreshAutoTrade(ctx, autoSellCtx.token, context.msgId)
	await ctx.reply('✅ Success', { parse_mode: botEnum.PARSE_MODE_V2 })
}

async function processAddNewAutoSell(telegramId: string, text: string, ctx: any, context: any) {
	const tokenDB = await getTokenInfo(context.chain, text)
	const chain = tokenDB.chain

	const isAS = await isTokenAutoSellSet(telegramId, tokenDB.chain, tokenDB.address);
	if (isAS === true) {
	} else {
		const tokenPrice = await getTokenPrice(chain, tokenDB.address)
		if (tokenPrice === undefined) {
			throw new Error(`invokeAutoSellTrack: unresolvable token price [${chain}] ${tokenDB.address}`)
		}
		await addTokenAutoSell(telegramId, chain, tokenDB.address, tokenPrice)
		await userVerboseLog(telegramId, `added ${tokenDB.address} to auto sell`);
	}

	await revokeAutoTrade(ctx, tokenDB.address)

	if (ctx.update.callback_query?.message.message_id) {
		await ctx.telegram.editMessageReplyMarkup(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getTrackMarkup(telegramId, chain, tokenDB.address))
	}
}