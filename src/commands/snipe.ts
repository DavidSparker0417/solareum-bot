import { botEnum } from '../constants/botEnum.js';
import { SnipeTokenModel } from '../models/snipe.godmode.token.js';
import { SolanaTokenInfoModel } from '../models/solana/solana.token.info.model.js';
import { isAlreadyStarted, updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { processError } from '../service/error.js';
import {
	getDefaultSnipeSetting,
	getSnipeTokenList,
	moveTokenSnipe,
	registerSnipeToken
} from '../service/snipe.token.service.js';
import { SNIPE_INPUT_LISTENER } from '../utils/common.js';
import { getSnipeTokenMarkup } from '../utils/inline.markups.js';
import { getSnipeTokenInfoText } from '../utils/messages.js';
import { postStartAction } from './actions/default.action.js';

const invokeSnipeLiquidity = async (ctx: any, focusedSnipe?: any) => {
	const telegramId = ctx.from.id;

	try {
		if (ctx.update?.message?.text === undefined) {
			await ctx.deleteMessage();
		}
	} catch { }

	try {
		await userVerboseLog(telegramId, '/sniper');

		await updateChatId(telegramId, ctx.chat.id)

		// { // eugeigne regarding snipe implementation
		// 	await ctx.telegram.sendMessage(ctx.chat.id, '⚠️ Under maintenance', {
		// 		parse_mode: botEnum.PARSE_MODE_V2
		// 	});
		// 	return
		// }

		if (await isAlreadyStarted(telegramId)) {
			if (focusedSnipe) {
				await ctx.telegram.sendMessage(ctx.chat.id, await getSnipeTokenInfoText(telegramId, focusedSnipe), {
					parse_mode: botEnum.PARSE_MODE_V2,
					reply_markup: await getSnipeTokenMarkup(telegramId, focusedSnipe, 'liquidity')
				});
			} else {
				const snipes = await getSnipeTokenList(telegramId)
				if (snipes.length === 0) {
					await ctx.telegram.sendMessage(ctx.chat.id, '⚠️ No tokens to snipe', {
						parse_mode: botEnum.PARSE_MODE_V2,
						reply_markup: await getSnipeTokenMarkup(telegramId, null, 'liquidity')
					});
				} else {
					await ctx.telegram.sendMessage(ctx.chat.id, await getSnipeTokenInfoText(telegramId, snipes[0]), {
						parse_mode: botEnum.PARSE_MODE_V2,
						reply_markup: await getSnipeTokenMarkup(telegramId, snipes[0], 'liquidity')
					});
				}
			}
		} else {
			postStartAction(ctx);
		}
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const reloadSnipeLiquidity = async (ctx: any, snipe: any, method: string) => {
	const telegramId = ctx.from.id;

	try {
		await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, await getSnipeTokenInfoText(telegramId, snipe), {
			parse_mode: botEnum.PARSE_MODE_V2,
			reply_markup: await getSnipeTokenMarkup(telegramId, snipe, method)
		});
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const registerSnipe = async (ctx: any, tokenInfoId: string) => {
	const telegramId = ctx.from.id;

	try {
		await userVerboseLog(telegramId, `register a new snipe - [${tokenInfoId}]`);

		await updateChatId(telegramId, ctx.chat.id)

		// { // eugeigne regarding snipe implementation
		// 	await ctx.telegram.sendMessage(ctx.chat.id, '⚠️ Under maintenance', {
        //         parse_mode: botEnum.PARSE_MODE_V2
        //     });
		// 	return
		// }

		const tokenInfo = await SolanaTokenInfoModel.findById(tokenInfoId)

		if (tokenInfo === null) {
			await ctx.telegram.sendMessage(ctx.chat.id, '❌ Invalid token to snipe', {
				parse_mode: botEnum.PARSE_MODE_V2
			});
		} else {
			await invokeSnipeLiquidity(ctx, await registerSnipeToken(telegramId, tokenInfo.chain, tokenInfo.address))
		}
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const toggleEnableSnipe = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'toggle enable snipe')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await SnipeTokenModel.findById(snipeId)

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { disabled: snipe.disabled === true ? false : true })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const toggleMulti = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'toggle multi wallet in primary snipe')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await SnipeTokenModel.findById(snipeId)

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { multi: snipe.multi === true ? false : true })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const resetToDefaultSetting = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'reset to default setting')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe: any = await SnipeTokenModel.findById(snipeId)
		await snipe.populate('token')

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, getDefaultSnipeSetting(telegramId, snipe.token.chain))
		}

		await ctx.reply('✅ Reset to <b>default snipe setting</b>', { parse_mode: botEnum.PARSE_MODE_V2 })
		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const toggleAutoMaxTx = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'toggle auto max tx in primary snipe')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await SnipeTokenModel.findById(snipeId)

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { maxTx: snipe.maxTx === true ? false : true })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const toggleSnipeLiquidity = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id;

	try {
		await userVerboseLog(telegramId, 'toggle snipe liquidity in primary snipe');

		await updateChatId(telegramId, ctx.chat.id);

		const snipe = await SnipeTokenModel.findById(snipeId)
		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { method: snipe.method === 'liquidity' ? '' : 'liquidity' })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity');
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const toggleSnipeAuto = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id;

	try {
		await userVerboseLog(telegramId, 'toggle snipe auto in primary snipe');

		await updateChatId(telegramId, ctx.chat.id);

		const snipe = await SnipeTokenModel.findById(snipeId)
		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { method: snipe.method === 'auto' ? '' : 'auto' })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'auto');
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const toggleSnipeMethod = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id;

	try {
		await userVerboseLog(telegramId, 'toggle snipe method in primary snipe');

		const snipe = await SnipeTokenModel.findById(snipeId)
		if (snipe.method !== 'method-id') {
			await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-select-method-id', msgId: ctx.update.callback_query?.message.message_id, snipeId })
		} else {
			if (snipe !== null) {
				await SnipeTokenModel.findByIdAndUpdate(snipeId, { method: '' })
			}

			await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'method-id')
		}
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const removeSnipeSlippage = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id;

	try {
		await userVerboseLog(telegramId, 'remove snipe slippage in primary snipe');

		await updateChatId(telegramId, ctx.chat.id)

		await SnipeTokenModel.findByIdAndUpdate(snipeId, { slippage: 100 })

		await ctx.telegram.sendMessage(ctx.chat.id, '✔ Removed snipe slippage', {
			parse_mode: botEnum.PARSE_MODE_V2
		});
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const prevSnipe = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id;

	try {
		await userVerboseLog(telegramId, 'go to prev snipe');

		await updateChatId(telegramId, ctx.chat.id);

		const snipe = await moveTokenSnipe(telegramId, snipeId, true)

		await reloadSnipeLiquidity(ctx, snipe, 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const nextSnipe = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'go to prev snipe')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await moveTokenSnipe(telegramId, snipeId, false)

		await reloadSnipeLiquidity(ctx, snipe, 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err)
	}
};

const deleteSnipe = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id;

	try {
		await userVerboseLog(telegramId, `delete snipe [${snipeId}]`);

		await updateChatId(telegramId, ctx.chat.id)

		const snipes = await getSnipeTokenList(telegramId)
		const snipeFound = snipes.find(s => s._id.toString() === snipeId)
		const foundIndex = snipeFound ? snipes.indexOf(snipeFound) : -1
		const nextId = foundIndex < 0 ? null : foundIndex < snipes.length - 1 ? snipes[foundIndex + 1]._id : snipes.length > 1 ? snipes[0]._id : null

		await SnipeTokenModel.findByIdAndDelete(snipeId)

		await reloadSnipeLiquidity(ctx, nextId === null ? null : await SnipeTokenModel.findById(nextId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const setSnipeGasPresetSlow = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'snipe gas preset slow')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await SnipeTokenModel.findById(snipeId)

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { priorityFee: '0.003' })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const setSnipeGasPresetAverage = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'snipe gas preset average')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await SnipeTokenModel.findById(snipeId)

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { priorityFee: '0.006' })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const setSnipeGasPresetFast = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'snipe gas preset fast')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await SnipeTokenModel.findById(snipeId)

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { priorityFee: '0.01' })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

const setSnipeGasPresetMax = async (ctx: any, snipeId: string) => {
	const telegramId = ctx.from.id

	try {
		await userVerboseLog(telegramId, 'snipe gas preset max')

		await updateChatId(telegramId, ctx.chat.id)

		const snipe = await SnipeTokenModel.findById(snipeId)

		if (snipe !== null) {
			await SnipeTokenModel.findByIdAndUpdate(snipeId, { priorityFee: '0.02' })
		}

		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	} catch (err) {
		await processError(ctx, telegramId, err);
	}
};

module.exports = (bot: any) => {
	bot.command(botEnum.snipe.keys, async (ctx: any) => { await invokeSnipeLiquidity(ctx) })
	bot.action(botEnum.snipe.value, async (ctx: any) => { await invokeSnipeLiquidity(ctx) })

	bot.action(RegExp('^' + botEnum.registerSnipe.value + '_.+'), async (ctx: any) => {
		const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.registerSnipe.value.length + 1)
		await registerSnipe(ctx, tokenInfoId)
	})

	bot.action(RegExp('^' + botEnum.deleteSnipe.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.deleteSnipe.value.length + 1)
		await deleteSnipe(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.enableSnipe.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.enableSnipe.value.length + 1)
		await toggleEnableSnipe(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.prevSnipe.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.prevSnipe.value.length + 1)
		await prevSnipe(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.nextSnipe.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.nextSnipe.value.length + 1)
		await nextSnipe(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.refreshSnipe.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.refreshSnipe.value.length + 1)
		await reloadSnipeLiquidity(ctx, await SnipeTokenModel.findById(snipeId), 'liquidity')
	})

	bot.action(RegExp('^' + botEnum.snipeDefaultSetting.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeDefaultSetting.value.length + 1)
		await resetToDefaultSetting(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.snipeMulti.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeMulti.value.length + 1)
		await toggleMulti(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.toggleAutoMaxTx.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.toggleAutoMaxTx.value.length + 1)
		await toggleAutoMaxTx(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.snipeBlockDelay.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeBlockDelay.value.length + 1)
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-block-delay', msgId: ctx.update.callback_query?.message.message_id, snipeId });
	})

	bot.action(RegExp('^' + botEnum.snipeETHAmount.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeETHAmount.value.length + 1)
		try {
			await ctx.answerCbQuery()
		} catch { }
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-eth-amount', msgId: ctx.update.callback_query?.message.message_id, snipeId });
	})

	bot.action(RegExp('^' + botEnum.snipeTokenAmount.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeTokenAmount.value.length + 1)
		try {
			await ctx.answerCbQuery()
		} catch { }
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-token-amount', msgId: ctx.update.callback_query?.message.message_id, snipeId });
	})

	bot.action(RegExp('^' + botEnum.snipeSlippage.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeSlippage.value.length + 1)
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-slippage-amount', msgId: ctx.update.callback_query?.message.message_id, snipeId })
	})

	bot.action(RegExp('^' + botEnum.snipeRemoveSlippage.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeRemoveSlippage.value.length + 1)
		await removeSnipeSlippage(ctx, snipeId)
	})

	bot.action(botEnum.addSnipe.value, async (ctx: any) => {
		try {
			await ctx.answerCbQuery()
		} catch { }
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'add-snipe-token', msgId: ctx.update.callback_query?.message.message_id });
	});

	bot.action(RegExp('^' + botEnum.snipeMaxComputeUnits.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeMaxComputeUnits.value.length + 1)
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-max-compute-units', msgId: ctx.update.callback_query?.message.message_id, snipeId })
	})

	bot.action(RegExp('^' + botEnum.snipeComputeUnitPrice.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeComputeUnitPrice.value.length + 1)
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-compute-unit-price', msgId: ctx.update.callback_query?.message.message_id, snipeId })
	})

	bot.action(RegExp('^' + botEnum.snipePriorityFee.value + '_.+'), async (ctx: any) => {
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipePriorityFee.value.length + 1)
		await ctx.scene.enter(SNIPE_INPUT_LISTENER, { input_type: 'snipe-priority-fee', msgId: ctx.update.callback_query?.message.message_id, snipeId })
	})

	bot.action(RegExp('^' + botEnum.snipeGasPresetSlow.value + '_.+'), async (ctx: any) => {
		try {
			await ctx.answerCbQuery()
		} catch { }
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeGasPresetSlow.value.length + 1)
		await setSnipeGasPresetSlow(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.snipeGasPresetAverage.value + '_.+'), async (ctx: any) => {
		try {
			await ctx.answerCbQuery()
		} catch { }
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeGasPresetAverage.value.length + 1)
		await setSnipeGasPresetAverage(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.snipeGasPresetFast.value + '_.+'), async (ctx: any) => {
		try {
			await ctx.answerCbQuery()
		} catch { }
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeGasPresetFast.value.length + 1)
		await setSnipeGasPresetFast(ctx, snipeId)
	})

	bot.action(RegExp('^' + botEnum.snipeGasPresetMaxSpeed.value + '_.+'), async (ctx: any) => {
		try {
			await ctx.answerCbQuery()
		} catch { }
		const snipeId = ctx.update.callback_query.data.slice(botEnum.snipeGasPresetMaxSpeed.value.length + 1)
		await setSnipeGasPresetMax(ctx, snipeId)
	})
};
