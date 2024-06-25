import { botEnum } from '../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { processError } from '../service/error.js';
import { createRandomEvmWallet } from '../service/evm.wallet.service.js';
import { BRIDGE_LISTENER } from '../utils/common.js';
import { getBridgeEth2SolMarkup, getBridgeMarkup, getBridgeSol2EthMarkup } from '../utils/inline.markups.js';
import { getBridgeSol2EthMessage, getBridgeMessage, getBridgeEth2SolMessage } from '../utils/messages.js';

const invokeBridge = async (ctx: any) => {
	const telegramId = ctx.from.id;

	try {
		await ctx.answerCbQuery()
	} catch { }

	try {
		if (ctx.update?.message?.text === undefined) {
			await ctx.deleteMessage();
		}
	} catch { }

	try {
		userVerboseLog(telegramId, '/bridge');

		await updateChatId(telegramId, ctx.chat.id);

		await createRandomEvmWallet(telegramId)

		await ctx.telegram.sendMessage(ctx.chat.id, '<b>Bridge</b> is temperarily disabled', {
			parse_mode: botEnum.PARSE_MODE_V2
		});
		// await ctx.telegram.sendMessage(ctx.chat.id, await getBridgeMessage(telegramId), {
		// 	parse_mode: botEnum.PARSE_MODE_V2,
		// 	reply_markup: await getBridgeMarkup()
		// });
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

module.exports = (bot: any) => {
	bot.command(botEnum.bridge.value, invokeBridge);
	bot.action(botEnum.bridge.value, invokeBridge);

	bot.action(botEnum.bridge_sol2eth.value, async (ctx: any) => {
		try {
			await ctx.answerCbQuery()
		} catch { }
		await ctx.scene.enter(BRIDGE_LISTENER, { input_type: 'solana-to-ethereum', msgId: ctx.update.callback_query?.message.message_id })
	})

	bot.action(botEnum.bridge_eth2sol.value, async (ctx: any) => {
		try {
			await ctx.answerCbQuery()
		} catch { }
		await ctx.scene.enter(BRIDGE_LISTENER, { input_type: 'ethereum-to-solana', msgId: ctx.update.callback_query?.message.message_id })
	})

	bot.action(RegExp('^' + botEnum.bridge_sol2eth_refresh.value + '_.+'), async (ctx: any) => {
		const telegramId = ctx.from.id
		const processingId = ctx.update.callback_query.data.slice(botEnum.bridge_sol2eth_refresh.value.length + 1);

		try {
			await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getBridgeSol2EthMessage(telegramId, processingId), {
				parse_mode: botEnum.PARSE_MODE_V2,
				reply_markup: await getBridgeSol2EthMarkup(telegramId, processingId)
			})
		} catch (err) {
			await processError(ctx, telegramId, err)
		}
	})

	bot.action(RegExp('^' + botEnum.bridge_eth2sol_refresh.value + '_.+'), async (ctx: any) => {
		const telegramId = ctx.from.id
		const processingId = ctx.update.callback_query.data.slice(botEnum.bridge_eth2sol_refresh.value.length + 1);

		try {
			await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getBridgeEth2SolMessage(telegramId, processingId), {
				parse_mode: botEnum.PARSE_MODE_V2,
				reply_markup: await getBridgeEth2SolMarkup(telegramId, processingId)
			})
		} catch (err) {
			await processError(ctx, telegramId, err)
		}
	})
};
