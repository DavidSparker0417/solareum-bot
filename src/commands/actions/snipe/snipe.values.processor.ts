import { botEnum } from "../../../constants/botEnum.js"
import { SnipeTokenModel } from "../../../models/snipe.godmode.token.js"
import { updateChatId, userVerboseLog } from "../../../service/app.user.service.js"
import { getSelectedChain } from "../../../service/connected.chain.service.js"
import { processError } from "../../../service/error.js"
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js"
import { registerSnipeToken } from "../../../service/snipe.token.service.js"
import { getCurrentToken, startToken } from "../../../service/token.service.js"
import { getWallet } from "../../../service/wallet.service.js"
import { INVALID_VALUE_SET } from "../../../utils/common.js"
import { getSnipeTokenMarkup } from "../../../utils/inline.markups.js"
import Logging from "../../../utils/logging.js"
import { getSnipeTokenInfoText } from "../../../utils/messages.js"
import { getNativeCurrencySymbol } from "../../../web3/chain.parameters.js"
import { getTokenBalance } from "../../../web3/multicall.js"
import { getETHBalance } from "../../../web3/nativecurrency/nativecurrency.query.js"
import { getBN } from "../../../web3/web3.operation.js"

export class SnipeValuesListener {
	public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
		Logging.info(`SnipeValuesListener.class processing scene message [${text}]`)
		await updateChatId(telegramId, ctx.chat.id)

		const context = JSON.parse(sceneContext.scene.text)

		try {
			if (context.inputType === 'snipe-gas-price-delta') {
				await processSnipeGasPriceDelta(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'snipe-block-delay') {
				await processSnipeBlockDelay(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'snipe-eth-amount') {
				await processSnipeEthAmount(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'snipe-token-amount') {
				await processSnipeTokenAmount(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'snipe-slippage-amount') {
				await processSnipeSlippageAmount(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'add-snipe-token') {
				await processAddSnipeToken(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'snipe-max-compute-units') {
				await processSnipeMaxComputeUnits(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'snipe-compute-unit-price') {
				await processSnipeComputeUnitPrice(telegramId, text, ctx, context)
			}
			else if (context.inputType === 'snipe-priority-fee') {
				await processSnipePriorityFee(telegramId, text, ctx, context)
			}
		}
		catch (err) {
			await processError(ctx, telegramId, err)
		}
	}
}


async function processSnipeGasPriceDelta(telegramId: string, text: string, ctx: any, context: any) {
	const gasPrice = parseFloat(text)
	const s = await SnipeTokenModel.findById(context.snipeId)
	const snipe: any = await s.populate('token')
	const chainGas = undefined //parseFloat((snipe.token.chain === 'ethereum') ? '0' : await chainGasPrice(snipe.token.chain))

	if (isNaN(gasPrice) || gasPrice < chainGas) {
		await new SceneStageService().deleteScene(telegramId)
		throw new Error(INVALID_VALUE_SET + `\nYou must use a valid number greater than ${chainGas}. Please try again.`);
	}

	snipe.gasDeltaPrice = gasPrice
	await snipe.save()

	await userVerboseLog(telegramId, `${snipe.token.address} snipe gas ${snipe.token.chain === 'ethereum' ? 'delta' : 'price'} set to ${gasPrice}`);

	await ctx.telegram.sendMessage(ctx.chat.id, `Gas ${snipe.token.chain === 'ethereum' ? 'delta' : 'price'} set to ${gasPrice}`, {
		parse_mode: botEnum.PARSE_MODE_V2
	});

	await new SceneStageService().deleteScene(telegramId)
}

async function processSnipeBlockDelay(telegramId: string, text: string, ctx: any, context: any) {
	const delayBlocks = parseInt(text);
	if (isNaN(delayBlocks) || delayBlocks < 0 || delayBlocks > 100) {
		await new SceneStageService().deleteScene(telegramId)
		throw new Error(INVALID_VALUE_SET + '\nYou must use a valid number <b>between 0 and 100</b> inclusive. Please try again.')
	}

	const snipe = await SnipeTokenModel.findById(context.snipeId)
	snipe.blockDelay = delayBlocks
	await snipe.save()

	const s: any = await snipe.populate('token');

	await userVerboseLog(telegramId, `${s.token.address} snipe block delay set to ${delayBlocks}`);

	await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getSnipeTokenInfoText(telegramId, snipe), {
		parse_mode: botEnum.PARSE_MODE_V2,
		reply_markup: await getSnipeTokenMarkup(telegramId, snipe, 'liquidity')
	});

	await new SceneStageService().deleteScene(telegramId)
}

async function processSnipeEthAmount(telegramId: string, text: string, ctx: any, context: any) {
	const snipe = await SnipeTokenModel.findById(context.snipeId)
	const s: any = await snipe.populate('token')

	let targetValue;
	const percentageFlag = text.indexOf('%');
	if (percentageFlag < 0) {
		const BN = getBN()
		const ethAmount = parseFloat(text);
		const w = await getWallet(telegramId);
		const nativeSymbol = await getNativeCurrencySymbol(s.token.chain)

		const ethBal = await getETHBalance(telegramId, s.token.chain, w.address);
		const myETHBal = parseFloat(ethBal);

		if (BN(ethBal).eq(BN(0))) {
			throw new Error(`You don't have any ${nativeSymbol}`);
		}

		if (isNaN(ethAmount) || ethAmount < 0 || ethAmount > myETHBal) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nYou must use a valid number <b>between 0 and ${myETHBal}</b>. Please try again.`);
		}

		snipe.nativeCurrencyAmount = ethAmount.toString()
		await snipe.save()

		await ctx.reply(`✅ Success set to <code>${ethAmount.toString()}</code>`, { parse_mode: botEnum.PARSE_MODE_V2 })

		targetValue = ethAmount.toString();
	} else {
		const percentage = parseFloat(text.slice(0, percentageFlag));
		if (isNaN(percentage) || percentage < 0 || percentage > 100) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nYou must use a valid percentage <b>between 0 and 100</b>. Please try again.`);
		}

		snipe.nativeCurrencyAmount = percentage.toString() + '%'
		await snipe.save()

		await ctx.reply(`✅ Success set to <code>${percentage.toString()}%</code>`, { parse_mode: botEnum.PARSE_MODE_V2 })

		targetValue = percentage.toString() + '%';
	}

	await userVerboseLog(telegramId, `${s.token.address} snipe native currency amount set to ${targetValue}`);

	await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getSnipeTokenInfoText(telegramId, snipe), {
		parse_mode: botEnum.PARSE_MODE_V2,
		reply_markup: await getSnipeTokenMarkup(telegramId, snipe, 'liquidity')
	});

	await new SceneStageService().deleteScene(telegramId)
}

async function processSnipeTokenAmount(telegramId: string, text: string, ctx: any, context: any) {
	const snipe: any = await SnipeTokenModel.findById(context.snipeId)
	const s: any = await snipe.populate('token')
	// const percentageFlag = text.indexOf('%')
	// if (percentageFlag < 0) {
	const tokenAmount = parseFloat(text);
	const w = await getWallet(telegramId);

	const myToken = await getTokenBalance(snipe.token.chain, snipe.token.address, w.address)
	const myTokenBal = parseFloat(myToken.balance)

	if (isNaN(tokenAmount) || tokenAmount < 0) {
		await new SceneStageService().deleteScene(telegramId)
		throw new Error(INVALID_VALUE_SET + `\nYou must use a valid number <b>greater than or equal to 0</b>. Please try again.`);
	}

	snipe.tokenAmount = tokenAmount.toString()
	await snipe.save()

	await userVerboseLog(telegramId, `${s.token.address} snipe token amount set to ${tokenAmount.toString()}`);

	await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getSnipeTokenInfoText(telegramId, snipe), {
		parse_mode: botEnum.PARSE_MODE_V2,
		reply_markup: await getSnipeTokenMarkup(telegramId, snipe, 'liquidity')
	});

	await ctx.telegram.sendMessage(ctx.chat.id, `✅ Set <code>${snipe.tokenAmount}</code> <b>${snipe.token.symbol}</b> to snipe`, {
		parse_mode: botEnum.PARSE_MODE_V2
	});

	await new SceneStageService().deleteScene(telegramId)
}

async function processSnipeSlippageAmount(telegramId: string, text: string, ctx: any, context: any) {
	const snipe = await SnipeTokenModel.findById(context.snipeId)
	const s: any = await snipe.populate('token');

	let targetValue;
	const percentageFlag = text.indexOf('%');
	if (percentageFlag < 0) {
		throw new Error(INVALID_VALUE_SET + '\nNot %');
	} else {
		const percentage = parseFloat(text.slice(0, percentageFlag));
		if (isNaN(percentage) || percentage < 0 || percentage > 100) {
			await new SceneStageService().deleteScene(telegramId)
			throw new Error(INVALID_VALUE_SET + `\nYou must use a valid percentage <b>between 0 and 100</b>. Please try again.`);
		}

		snipe.slippage = percentage
		await snipe.save()

		targetValue = percentage.toString();
	}

	await userVerboseLog(telegramId, `${s.token.address} snipe slippage percentage set to ${targetValue}%`);

	await ctx.telegram.sendMessage(ctx.chat.id, `✅ Set slippage to <b>${targetValue}%</b>`, {
		parse_mode: botEnum.PARSE_MODE_V2
	});

	await new SceneStageService().deleteScene(telegramId)
}

async function processAddSnipeToken(telegramId: string, text: string, ctx: any, context: any) {
	const chain = await getSelectedChain(telegramId);
	if (true === (await startToken(telegramId, chain, text))) {
		const newChain = await getSelectedChain(telegramId)
		const newToken = await getCurrentToken(telegramId, newChain)
		const newChain2 = await getSelectedChain(telegramId)

		const snipe = await registerSnipeToken(telegramId, newChain2, newToken);

		await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getSnipeTokenInfoText(telegramId, snipe), {
			parse_mode: botEnum.PARSE_MODE_V2,
			reply_markup: await getSnipeTokenMarkup(telegramId, snipe, 'liquidity')
		});
		await ctx.reply("✅ Success", {
			parse_mode: botEnum.PARSE_MODE_V2
		});

		await new SceneStageService().deleteScene(telegramId)
	} else {
		await ctx.reply("❌ Not valid token address", {
			parse_mode: botEnum.PARSE_MODE_V2
		});
	}
}

async function processSnipeMaxComputeUnits(telegramId: string, text: string, ctx: any, context: any) {
	const snipe = await SnipeTokenModel.findById(context.snipeId)
	const s: any = await snipe.populate('token');

	const maxComputeUnits = parseInt(text)
	if (isNaN(maxComputeUnits) || maxComputeUnits <= 0) {
		await new SceneStageService().deleteScene(telegramId)
		throw new Error(INVALID_VALUE_SET + `\nYou must use a valid units <b>greater than 0</b>. Please try again.`);
	}

	snipe.maxComputeUnits = maxComputeUnits
	await snipe.save()

	await userVerboseLog(telegramId, `${s.token.address} snipe max compute units set to ${maxComputeUnits}`);

	await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getSnipeTokenInfoText(telegramId, snipe), {
		parse_mode: botEnum.PARSE_MODE_V2,
		reply_markup: await getSnipeTokenMarkup(telegramId, snipe, 'liquidity')
	});

	await ctx.telegram.sendMessage(ctx.chat.id, `✅ Set max compute units to <code>${maxComputeUnits}</code>`, {
		parse_mode: botEnum.PARSE_MODE_V2
	});

	await new SceneStageService().deleteScene(telegramId)
}

async function processSnipeComputeUnitPrice(telegramId: string, text: string, ctx: any, context: any) {
	const snipe = await SnipeTokenModel.findById(context.snipeId)
	const s: any = await snipe.populate('token');

	const computeUnitPrice = parseFloat(text)
	if (isNaN(computeUnitPrice) || computeUnitPrice <= 0) {
		await new SceneStageService().deleteScene(telegramId)
		throw new Error(INVALID_VALUE_SET + `\nYou must use a valid price in lamports <b>greater than 0</b>. Please try again.`);
	}

	snipe.computeUnitPrice = Math.floor(computeUnitPrice * 1000000)
	await snipe.save()

	await userVerboseLog(telegramId, `${s.token.address} snipe compute unit price set to ${computeUnitPrice} lamports`);

	await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getSnipeTokenInfoText(telegramId, snipe), {
		parse_mode: botEnum.PARSE_MODE_V2,
		reply_markup: await getSnipeTokenMarkup(telegramId, snipe, 'liquidity')
	});

	await ctx.telegram.sendMessage(ctx.chat.id, `✅ Set compute unit price to <code>${computeUnitPrice}</code> <b>lamports</b>`, {
		parse_mode: botEnum.PARSE_MODE_V2
	});

	await new SceneStageService().deleteScene(telegramId)
}

async function processSnipePriorityFee(telegramId: string, text: string, ctx: any, context: any) {
	const snipe = await SnipeTokenModel.findById(context.snipeId)
	const s: any = await snipe.populate('token');

	const BN = getBN()
	if (BN(text).lte(0)) {
		await new SceneStageService().deleteScene(telegramId)
		throw new Error(INVALID_VALUE_SET + `\nYou must use a valid priority fee in SOL <b>greater than 0</b>. Please try again.`);
	}

	snipe.priorityFee = text
	await snipe.save()

	await userVerboseLog(telegramId, `${s.token.address} snipe priority fee set to ${text} SOL`);

	await ctx.telegram.editMessageText(ctx.chat.id, context.msgId, 0, await getSnipeTokenInfoText(telegramId, snipe), {
		parse_mode: botEnum.PARSE_MODE_V2,
		reply_markup: await getSnipeTokenMarkup(telegramId, snipe, 'liquidity')
	});

	await ctx.telegram.sendMessage(ctx.chat.id, `✅ Set snipe priority fee to <code>${text}</code> <b>SOL</b>`, {
		parse_mode: botEnum.PARSE_MODE_V2
	});

	await new SceneStageService().deleteScene(telegramId)
}
