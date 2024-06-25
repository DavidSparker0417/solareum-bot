import { message } from 'telegraf/filters';
import { botEnum } from '../../constants/botEnum.js';
import { getSelectedChain } from '../../service/connected.chain.service.js';
import { hitToken, startToken } from '../../service/token.service.js';
import { getTokenStatusMessage } from '../../utils/messages.js';
import { postStartAction } from './default.action.js';
import { getAppUser, updateChatId, userVerboseLog } from '../../service/app.user.service.js';
import { processError } from '../../service/error.js';
import { getTokenPasteMarkup } from '../../utils/inline.markups.js';
import Logging from '../../utils/logging.js';
import { getNativeCurrencySymbol } from '../../web3/chain.parameters.js';
import { processQuickAutoBuy } from '../../service/autobuy.service.js';
import { ISceneResponse, SceneStageService } from '../../service/scene.stage.service.js';
import { DEFAULT_SCENE_TIMEOUT } from '../../utils/common.js';
import { SolanaTokenInfoModel } from '../../models/solana/solana.token.info.model.js';
import { getTokenCaFromPair } from '../../service/web3.service.js';
import { filterPairCa } from '../../service/name.filter.service.js';

module.exports = (bot: any) => {
	bot.on(message('text'), async (ctx: any) => {
		const telegramId = ctx.from.id

		try {
			await userVerboseLog(telegramId, `processing text message: ${ctx.message.text}`)
			await updateChatId(telegramId, ctx.chat.id)

			const tickStart = (new Date()).getTime()

			let processedByScene = false;
			const scene: ISceneResponse = await new SceneStageService().getSceneStage(telegramId);
			if (scene != null && scene.appUser != null && scene.scene != null) {
				const sceneStageCreatedDate = scene.scene.date.setSeconds(scene.scene.date.getSeconds() + DEFAULT_SCENE_TIMEOUT) // add 15 secs
				const createdDate = new Date(sceneStageCreatedDate)
				if (createdDate >= new Date()) {
					processedByScene = true;
					await new SceneStageService().processSceneStage(telegramId, ctx.message.text, scene, ctx)
				} else {
					await new SceneStageService().deleteScene(telegramId)
				}
			}

			let chain = await getSelectedChain(telegramId)
			if (chain === '') {
				// milk casual oyster clay spice give device salmon luggage elder inspire drink
				postStartAction(ctx)
				return
			}

			try {
				const chain = 'solana'
				const textWith = ctx.message.text
				const tokenCaExtracted = await getTokenCaFromPair(filterPairCa(textWith))
				const tokenAddress = tokenCaExtracted ?? textWith

				if (!processedByScene) {
					processContractAddress(ctx, telegramId, chain, tokenAddress, chain, tickStart)
				}
			} catch (err) {
				await ctx.telegram.sendMessage(ctx.chat.id, '❌ Invalid link pasted. Please input corect URL, pair ca or token ca', {
				    parse_mode: botEnum.PARSE_MODE_V2
				})
				return
			}
		} catch (err) {
			await processError(ctx, telegramId, err)
			await new SceneStageService().deleteScene(telegramId);
		}
	})

	bot.action(RegExp('^' + botEnum.switch_to_sell.value + '_.+'), async (ctx: any) => {
		const telegramId = ctx.from.id

		try {
			await userVerboseLog(telegramId, 'switching to sell mode')
			const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.switch_to_sell.value.length + 1)

			const tokenDB = await SolanaTokenInfoModel.findById(tokenInfoId)
			const chain = tokenDB.chain
			const symbol = await getNativeCurrencySymbol(chain)

			const msg = ctx.update.callback_query.message

			// const regex = /CA: (.*)\n/;
			// const match = msg.text.match(regex);

			await ctx.telegram.editMessageReplyMarkup(
				msg.chat.id, msg.message_id, undefined,
				await getTokenPasteMarkup(telegramId, 'sell', chain, symbol, tokenDB.symbol, tokenDB.address)
			)
		} catch (err) {
			await processError(ctx, telegramId, err)
		}
	})

	bot.action(RegExp('^' + botEnum.switch_to_buy.value + '_.+'), async (ctx: any) => {
		const telegramId = ctx.from.id

		try {
			await userVerboseLog(telegramId, 'switching to buy mode')
			const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.switch_to_buy.value.length + 1)

			const tokenDB = await SolanaTokenInfoModel.findById(tokenInfoId)
			const chain = tokenDB.chain
			const symbol = await getNativeCurrencySymbol(chain)

			const msg = ctx.update.callback_query.message

			// const regex = /CA: (.*)\n/;
			// const match = msg.text.match(regex);

			await ctx.telegram.editMessageReplyMarkup(
				msg.chat.id, msg.message_id, undefined,
				await getTokenPasteMarkup(telegramId, 'buy', chain, symbol, tokenDB.symbol, tokenDB.address)
			)
		} catch (err) {
			await processError(ctx, telegramId, err)
		}
	})
}

const printTickElapsed = (tickStart: any) => {
	const tickEnd = (new Date()).getTime()
	Logging.info(`token ca paste - tick elapsed ${((tickEnd - tickStart) / 1000).toString()}`)
}


async function processContractAddress(ctx: any, telegramId: string, chain: string, tokenAddress: string, newChain: any, tickStart: any) {
	try {
		if (true === await startToken(telegramId, chain, tokenAddress, newChain)) {
			chain = await getSelectedChain(telegramId)
			const nativeSymbol = await getNativeCurrencySymbol(chain)

			await userVerboseLog(telegramId, `fetching token ${tokenAddress}`)

			const t = await getTokenStatusMessage(telegramId, chain, tokenAddress)
			await hitToken(chain, tokenAddress)

			processQuickAutoBuy(ctx, telegramId, chain, tokenAddress)
			printTickElapsed(tickStart)

			const msg = await ctx.telegram.sendMessage(ctx.chat.id, t.text, {
				parse_mode: botEnum.PARSE_MODE_V2,
				reply_markup: await getTokenPasteMarkup(telegramId, 'buy', chain, nativeSymbol, t.symbol, tokenAddress)
			})

			// setTimeout(() => {
			//     const reloadTokenInfo = async () => {
			//         try {
			//             const t = await getTokenStatusMessage(telegramId, chain, tokenAddress)

			//             await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, 0, t.text, {
			//                 parse_mode: botEnum.PARSE_MODE_V2,
			//                 reply_markup: await getTokenPasteMarkup(telegramId, 'buy', chain, symbol, t.symbol, tokenAddress)
			//             })
			//         } catch (err) {
			//             await processError(ctx, telegramId, err)
			//         }
			//     }

			//     reloadTokenInfo()
			// }, 2000)
		} else {
			await ctx.telegram.sendMessage(ctx.chat.id, '❌ Not a valid token', {
				parse_mode: botEnum.PARSE_MODE_V2
			})
		}
	} catch (err) {
		if ( true !== await processError(ctx, telegramId, err)) {
			await ctx.telegram.sendMessage(ctx.chat.id, '❌ Pasted invalid text. Please input corect dextools/dexscreener URL, pair ca or token ca', {
				parse_mode: botEnum.PARSE_MODE_V2
			})
		}
		await new SceneStageService().deleteScene(telegramId);
	}
}