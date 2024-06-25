import { botEnum } from "../../../constants/botEnum.js";
import { SolanaTokenInfoModel } from "../../../models/solana/solana.token.info.model.js";
import { updateChatId } from "../../../service/app.user.service.js";
import { processError } from "../../../service/error.js";
import { ISceneResponse, SceneStageService } from "../../../service/scene.stage.service.js";
import { getWallet } from "../../../service/wallet.service.js";
import { NUMBER_REGEX, PERCENTAGE_REGEX } from "../../../utils/common.js";
import Logging from "../../../utils/logging.js";
import { userSwapTokenForETH, userSwapTokenForETHByETHAmount } from "../../../web3/dex.interaction.js";
import { getTokenBalance } from "../../../web3/multicall.js";

export class TokenSellXEthAmountListener {
	public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
		Logging.info(`TokenSellXEthAmountListener.class processing scene message [${text}]`)
		await updateChatId(telegramId, ctx.chat.id)

		const context = JSON.parse(sceneContext.scene.text)
		if (context.amount === null) {
			if (PERCENTAGE_REGEX.test(text) || NUMBER_REGEX.test(text)) {
				try {
					const tInfo = await SolanaTokenInfoModel.findById(context.tokenInfoId)
					const chain = tInfo.chain
					const token = tInfo.address

					let tx;
					try {
						tx = await userSwapTokenForETHByETHAmount(telegramId, chain, token, text);
					} catch (err) {
						await processError(ctx, telegramId, err);
						return;
					}
					const w = await getWallet(telegramId);
					const tokenInfo = await getTokenBalance(chain, token, w.address);
					if (tx?.transactionHash) {
					} else {
						await ctx.reply(`You have <b>${tokenInfo.balance} ${tokenInfo.symbol}</b>`, {
							parse_mode: botEnum.PARSE_MODE_V2
						});
					}
					await new SceneStageService().deleteScene(telegramId);
				} catch (err) {
					await processError(ctx, telegramId, err)
				}
			}
			else {
				await ctx.reply(`❌ Invalid amount`);
				await new SceneStageService().deleteScene(telegramId)
			}
		}
	}
}

export class TokenSellXTokenAmountListener {
	public async processMessage(telegramId: string, sceneContext: ISceneResponse, text: string, ctx: any) {
		Logging.info(`TokenSellXTokenAmountListener.class processing scene message [${text}]`)
		await updateChatId(telegramId, ctx.chat.id)

		const context = JSON.parse(sceneContext.scene.text)
		if (context.amount === null) {
			if (PERCENTAGE_REGEX.test(text) || NUMBER_REGEX.test(text)) {
				try {
					const tInfo = await SolanaTokenInfoModel.findById(context.tokenInfoId)
					const chain = tInfo.chain
					const token = tInfo.address

					let tx;
					try {
						tx = await userSwapTokenForETH(telegramId, chain, token, text);
					} catch (err) {
						await processError(ctx, telegramId, err);
						return;
					}
					// const w = await getWallet(telegramId);
					// const tokenInfo = await getTokenBalance(chain, token, w.address);
					// if (tx?.transactionHash) {
					// } else {
					// 	await ctx.reply(`You have <b>${tokenInfo.balance} 💦${tokenInfo.symbol}</b>`, {
					// 		parse_mode: botEnum.PARSE_MODE_V2
					// 	});
					// }
					await new SceneStageService().deleteScene(telegramId);
				} catch (err) {
					await processError(ctx, telegramId, err)
				}
			}
			else {
				await ctx.reply(`❌ Invalid amount`);
				await new SceneStageService().deleteScene(telegramId)
			}
		}
	}
}