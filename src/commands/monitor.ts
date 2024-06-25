import { botEnum } from '../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../service/app.user.service.js';
import { processError } from '../service/error.js';
import { getTrackText, moveTokenTrack, resetTokenTracks, enableTokenTrack, stopTokenTrack, deleteTokenTrack, startTokenTrack, getFirstTrack } from '../service/track.service.js';
import { getBotInstance } from '../web3/chain.parameters.js';
import { getTrackMarkup } from '../utils/inline.markups.js';
import { isTokenAutoSellSet, removeTokenAutoSell, addTokenAutoSell } from '../service/autosell.service.js';
import { getTokenPrice } from '../service/token.service.js';
import { AUTO_BUY_LISTENER, AUTO_SELL_LISTENER, sleep } from '../utils/common.js';
import { addTokenAutoBuy, isTokenAutoBuySet, removeTokenAutoBuy } from '../service/autobuy.service.js';
import { TokenTrackModel } from '../models/token.track.model.js';
import { AutoSellTokenModel } from '../models/auto.sell.token.js';
import { AutoBuyTokenModel } from '../models/auto.buy.token.js';
import { emptyActiveTradesMessage } from '../utils/messages.js';
import { SolanaTokenInfoModel } from '../models/solana/solana.token.info.model.js';
const { revokeAutoTrade } = require('../commands/auto.js')

export async function externalInvokeMonitor(telegramId: string, chatId: number, chain: string, token: string, replaceMsgId?: number) {
    try {
        await userVerboseLog(telegramId, `/monitor ${token} from external command ${replaceMsgId? `for message ${replaceMsgId}`: ''}`);

        const track = await startTokenTrack(telegramId, chain, token)
        const t = await getTrackText(telegramId, track.chain, track.address)

        const bot = getBotInstance()
		let msg
		if (replaceMsgId) {
			msg = await bot.telegram.editMessageText(chatId, replaceMsgId, undefined, t.text, {
				parse_mode: botEnum.PARSE_MODE_V2,
				reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
			});
			track.msgId = replaceMsgId
		} else {
        	msg = await bot.telegram.sendMessage(chatId, t.text, {
				parse_mode: botEnum.PARSE_MODE_V2,
				reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
			});
		}
		track.msgId = msg.message_id
        await track.save()
    } catch (err) {
        await processError(getBotInstance(), telegramId, err)
    }
}

const invokeMonitor = async (ctx: any) => {
    const telegramId = ctx.from.id;

	try {
		await ctx.answerCbQuery()
	} catch { }

    try {
        await userVerboseLog(telegramId, '/monitor');

        await updateChatId(telegramId, ctx.chat.id)
        const track = await getFirstTrack(telegramId)

        if (track === null) {
            await ctx.telegram.sendMessage(ctx.chat.id, emptyActiveTradesMessage, {
                parse_mode: botEnum.PARSE_MODE_V2
            })
            return
        }

        const t = await getTrackText(telegramId, track.chain, track.address)

        const msg = await ctx.telegram.sendMessage(ctx.chat.id, t.text, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
        });

        track.msgId = msg.message_id
        await track.save()

        if (ctx.update.callback_query?.message.message_id) {
            await ctx.telegram.pinChatMessage(ctx.chat.id, ctx.update.callback_query.message.message_id);
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
}

const gotoPrevTrack = async (ctx: any, trackId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'go to prev track');

		const msgId = ctx.update.callback_query.message.message_id;

        const prevTrack = await moveTokenTrack(telegramId, trackId, true, msgId)
        if (prevTrack === null) return

        const t = await getTrackText(telegramId, prevTrack.chain, prevTrack.address)

        await ctx.telegram.editMessageText(ctx.chat.id, msgId, 0, t.text, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: await getTrackMarkup(telegramId, prevTrack.chain, prevTrack.address)
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const gotoNextTrack = async (ctx: any, trackId: string) => {
    const telegramId = ctx.from.id

    try {
        await userVerboseLog(telegramId, 'go to next track')

		const msgId = ctx.update.callback_query.message.message_id;
        const nextTrack = await moveTokenTrack(telegramId, trackId, false, msgId)
        if (nextTrack === null) return

        const t = await getTrackText(telegramId, nextTrack.chain, nextTrack.address)

        await ctx.telegram.editMessageText(ctx.chat.id, msgId, 0, t.text, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: await getTrackMarkup(telegramId, nextTrack.chain, nextTrack.address)
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeRefreshTrack = async (ctx: any, trackId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'refresh track');

        const track = await TokenTrackModel.findById(trackId)
        if (track === null) return

        const t = await getTrackText(telegramId, track.chain, track.address)

        const msgId = ctx.update.callback_query.message.message_id;

        await ctx.telegram.editMessageText(ctx.chat.id, msgId, 0, t.text, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const switchBuySell = async (ctx: any, trackId: string, buy?: boolean) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'switch buy/sell track');

        const track = await TokenTrackModel.findById(trackId)
        if (track === null) return

        const t = await getTrackText(telegramId, track.chain, track.address)

        const msgId = ctx.update.callback_query.message.message_id;

        await ctx.telegram.editMessageText(ctx.chat.id, msgId, 0, t.text, {
            parse_mode: botEnum.PARSE_MODE_V2,
            reply_markup: await getTrackMarkup(telegramId, track.chain, track.address, buy === true? 'buy': undefined)
        });
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeEnableTrack = async (ctx: any, trackId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'enable track');

        await updateChatId(telegramId, ctx.chat.id);

        const track = await enableTokenTrack(telegramId, trackId)
        if (track !== null) {
            const t = await getTrackText(telegramId, track.chain, track.address)

            if (ctx.update.callback_query?.message.message_id) {
                if (t.tokenInfo) {
                    await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
                    });
                } else {
                    await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                        parse_mode: botEnum.PARSE_MODE_V2
                    });
                }
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeResetTracks = async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'reset tracks');

        await updateChatId(telegramId, ctx.chat.id)
        await resetTokenTracks(telegramId)

        if (ctx.update.callback_query?.message.message_id !== undefined) {
            try {
                await ctx.deleteMessage();
            } catch { }
        }

        await ctx.telegram.sendMessage(ctx.chat.id, emptyActiveTradesMessage, {
            parse_mode: botEnum.PARSE_MODE_V2
        })
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeStopTrack = async (ctx: any, trackId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'stop track');

        await updateChatId(telegramId, ctx.chat.id);
        const track = await stopTokenTrack(telegramId, trackId)

        if (track !== null) {
            const t = await getTrackText(telegramId, track.chain, track.address)

            if (ctx.update.callback_query?.message.message_id) {
                if (t.tokenInfo) {
                    await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                        parse_mode: botEnum.PARSE_MODE_V2,
                        reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
                    });
                } else {
                    await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                        parse_mode: botEnum.PARSE_MODE_V2
                    });
                }
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeDeleteTrack = async (ctx: any, trackId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'delete track');

        await updateChatId(telegramId, ctx.chat.id);
        const track = await deleteTokenTrack(telegramId, trackId)

        if (ctx.update.callback_query?.message.message_id !== undefined) {
            try {
                await ctx.deleteMessage();
            } catch { }
        }

        if (track !== null) {
            const t = await getTrackText(telegramId, track.chain, track.address)

            await ctx.telegram.sendMessage(ctx.chat.id, t.text, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
            });
        } else {
            await ctx.telegram.sendMessage(ctx.chat.id, emptyActiveTradesMessage, {
                parse_mode: botEnum.PARSE_MODE_V2
            });
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoSellTrack = async (ctx: any, tokenInfoId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'auto sell track');

        await updateChatId(telegramId, ctx.chat.id);

        const tokenDB = await SolanaTokenInfoModel.findById(tokenInfoId)
        const chain = tokenDB.chain

        const isAS = await isTokenAutoSellSet(telegramId, tokenDB.chain, tokenDB.address);
        if (isAS === true) {
            await removeTokenAutoSell(telegramId, tokenDB.chain, tokenDB.address);
            await userVerboseLog(telegramId, `removed ${tokenDB.address} from auto sell`);
        } else {
            const tokenPrice = await getTokenPrice(chain, tokenDB.address)
            if (tokenPrice === undefined) {
                throw new Error(`invokeAutoSellTrack: unresolvable token price [${chain}] ${tokenDB.address}`)
            }
            await addTokenAutoSell(telegramId, chain, tokenDB.address, tokenPrice)
            await userVerboseLog(telegramId, `added ${tokenDB.address} to auto buy`);

			await revokeAutoTrade(ctx, tokenDB.address)
        }

        if (ctx.update.callback_query?.message.message_id) {
            await ctx.telegram.editMessageReplyMarkup(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getTrackMarkup(telegramId, chain, tokenDB.address))
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

async function invokeNewTrack(ctx: any, tokenInfoId: string) {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, `track [${tokenInfoId}]`);

        const tokenInfo = await SolanaTokenInfoModel.findById(tokenInfoId)

        if (tokenInfo === null) {
            await ctx.telegram.sendMessage(ctx.chat.id, '❌ Invalid token to track', {
                parse_mode: botEnum.PARSE_MODE_V2
            });
        } else {
            const track = await startTokenTrack(telegramId, tokenInfo.chain, tokenInfo.address)
            const t = await getTrackText(telegramId, track.chain, track.address)

            let msg
            if (t.tokenInfo) {
                msg = await ctx.telegram.sendMessage(ctx.chat.id, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, track.chain, track.address)
                });
            } else {
                msg = await ctx.telegram.sendMessage(ctx.chat.id, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }

            track.msgId = msg.message_id
            await track.save()

            await sleep(1000);

            await ctx.telegram.pinChatMessage(ctx.chat.id, ctx.update.callback_query.message.message_id);
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
}

const invokeAutoSellLowPriceLimit = async (ctx: any, autoSellId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto sell low price limit');

        await updateChatId(telegramId, ctx.chat.id);

        const autoSellCtx = await AutoSellTokenModel.findById(autoSellId)
        const chain = autoSellCtx.chain
        const t = await getTrackText(telegramId, chain, autoSellCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                const markup = await getTrackMarkup(telegramId, chain, autoSellCtx.token)
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoSellCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoSellLowPriceLimitCancel = async (ctx: any, autoSellId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto sell low price limit cancel');

        await updateChatId(telegramId, ctx.chat.id)

        const autoSellCtx = await AutoSellTokenModel.findById(autoSellId)

        const chain = autoSellCtx.chain
        const t = await getTrackText(telegramId, chain, autoSellCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoSellCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoSellHighPriceLimit = async (ctx: any, autoSellId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto sell high price limit');

        await updateChatId(telegramId, ctx.chat.id);

        const autoSellCtx = await AutoSellTokenModel.findById(autoSellId)
        const chain = autoSellCtx.chain
        const t = await getTrackText(telegramId, chain, autoSellCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoSellCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoSellHighPriceLimitCancel = async (ctx: any, autoSellId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto sell high price limit cancel');

        await updateChatId(telegramId, ctx.chat.id)

        const autoSellCtx = await AutoSellTokenModel.findById(autoSellId)

        const chain = autoSellCtx.chain
        const t = await getTrackText(telegramId, chain, autoSellCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoSellCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoSellAmountSwitch = async (ctx: any, autoSellId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto sell amount switch');

        await updateChatId(telegramId, ctx.chat.id);

        const autoSellCtx = await AutoSellTokenModel.findById(autoSellId)
        const chain = autoSellCtx.chain
        const t = await getTrackText(telegramId, chain, autoSellCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoSellCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoSellLoHiSwitch = async (ctx: any, autoSellId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto sell lo - high switch');

        await updateChatId(telegramId, ctx.chat.id);

        const autoSellCtx = await AutoSellTokenModel.findById(autoSellId)
        const chain = autoSellCtx.chain
        const t = await getTrackText(telegramId, chain, autoSellCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoSellCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoBuyTrack = async (ctx: any, tokenInfoId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'auto buy track');

        await updateChatId(telegramId, ctx.chat.id)

        const tokenDB = await SolanaTokenInfoModel.findById(tokenInfoId)

        const chain = tokenDB.chain

        const isAS = await isTokenAutoBuySet(telegramId, chain, tokenDB.address)
        if (isAS === true) {
            await removeTokenAutoBuy(telegramId, chain, tokenDB.address)
            await userVerboseLog(telegramId, `removed ${tokenDB.address} from auto buy`);
        } else {
            const tokenPrice = await getTokenPrice(chain, tokenDB.address)
            if (tokenPrice === undefined) {
                throw new Error(`invokeAutoBuyTrack: unresolvable token price [${chain}] ${tokenDB.address}`)
            }
            await addTokenAutoBuy(telegramId, chain, tokenDB.address, tokenPrice);
            await userVerboseLog(telegramId, `added ${tokenDB.address} to auto buy`);

			await revokeAutoTrade(ctx, tokenDB.address)
        }

        if (ctx.update.callback_query?.message.message_id) {
            if (ctx.update.callback_query?.message.message_id) {
				await ctx.telegram.editMessageReplyMarkup(ctx.chat.id, ctx.update.callback_query?.message.message_id, undefined, await getTrackMarkup(telegramId, chain, tokenDB.address))
			}
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoBuyPriceLimit = async (ctx: any, autoBuyId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto buy price limit');

        await updateChatId(telegramId, ctx.chat.id)

        const autoBuyCtx = await AutoBuyTokenModel.findById(autoBuyId)

        const chain = autoBuyCtx.chain
        const t = await getTrackText(telegramId, chain, autoBuyCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoBuyCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

const invokeAutoBuyPriceLimitCancel = async (ctx: any, autoBuyId: string) => {
    const telegramId = ctx.from.id;

    try {
        await userVerboseLog(telegramId, 'track auto buy price limit cancel');

        await updateChatId(telegramId, ctx.chat.id);

        const autoBuyCtx = await AutoBuyTokenModel.findById(autoBuyId)
        const chain = autoBuyCtx.chain
        const t = await getTrackText(telegramId, chain, autoBuyCtx.token)

        if (ctx.update.callback_query?.message.message_id) {
            if (t.tokenInfo) {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2,
                    reply_markup: await getTrackMarkup(telegramId, chain, autoBuyCtx.token)
                });
            } else {
                await ctx.telegram.editMessageText(ctx.chat.id, ctx.update.callback_query?.message.message_id, 0, t.text, {
                    parse_mode: botEnum.PARSE_MODE_V2
                });
            }
        }
    } catch (err) {
        await processError(ctx, telegramId, err);
    }
};

module.exports = (bot: any) => {
    bot.command(botEnum.monitor.value, invokeMonitor)
    bot.action(botEnum.monitor.value, invokeMonitor)

    bot.action(RegExp('^' + botEnum.track.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.track.value.length + 1)
        await invokeNewTrack(ctx, tokenInfoId)
    })

    bot.action(RegExp('^' + botEnum.prevTrack.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.prevTrack.value.length + 1)
        await gotoPrevTrack(ctx, trackId)
    })

    bot.action(RegExp('^' + botEnum.nextTrack.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.nextTrack.value.length + 1)
        await gotoNextTrack(ctx, trackId)
    })

    bot.action(RegExp('^' + botEnum.refreshTrack.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.refreshTrack.value.length + 1)
        await invokeRefreshTrack(ctx, trackId)
    })

	bot.action(RegExp('^' + botEnum.track_switch_to_buy.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.track_switch_to_buy.value.length + 1)
        await switchBuySell(ctx, trackId, true)
    })

	bot.action(RegExp('^' + botEnum.track_switch_to_sell.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.track_switch_to_sell.value.length + 1)
        await switchBuySell(ctx, trackId)
    })

    bot.action(RegExp('^' + botEnum.enableTrack.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.enableTrack.value.length + 1)
        await invokeEnableTrack(ctx, trackId)
    })

    bot.action(botEnum.resetTracks.value, invokeResetTracks)

    bot.action(RegExp('^' + botEnum.stopTrack.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.stopTrack.value.length + 1)
        await invokeStopTrack(ctx, trackId)
    })

    bot.action(RegExp('^' + botEnum.deleteTrack.value + '_.+'), async (ctx: any) => {
        const trackId = ctx.update.callback_query.data.slice(botEnum.deleteTrack.value.length + 1)
        await invokeDeleteTrack(ctx, trackId)
    })

    bot.action(RegExp('^' + botEnum.autoSellTrack.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.autoSellTrack.value.length + 1)
		try {
			await ctx.answerCbQuery()
		} catch { }

        await invokeAutoSellTrack(ctx, tokenInfoId)
    })

    bot.action(RegExp('^' + botEnum.autoSellLowPriceLimit.value + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.autoSellLowPriceLimit.value.length + 1)
        await invokeAutoSellLowPriceLimit(ctx, autoSellId)
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellLowPriceLimitCancel + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellLowPriceLimitCancel.length + 1)
        await invokeAutoSellLowPriceLimitCancel(ctx, autoSellId)
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellLowPriceLimitPercentage + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellLowPriceLimitPercentage.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-low-price-percentage', msgId: ctx.update.callback_query?.message.message_id, autoSellId })
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellLowPriceLimitUsd + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellLowPriceLimitUsd.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-low-price-usd', msgId: ctx.update.callback_query?.message.message_id, autoSellId });
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellLowPriceLimitMarketcap + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellLowPriceLimitMarketcap.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-low-price-marketcap', msgId: ctx.update.callback_query?.message.message_id, autoSellId });
    })

	bot.action(RegExp('^' + botEnum.trackAutoSellLowPriceLimitUnified + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellLowPriceLimitUnified.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-low-price-unified', msgId: ctx.update.callback_query?.message.message_id, autoSellId })
    })

    bot.action(RegExp('^' + botEnum.autoSellHighPriceLimit.value + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.autoSellHighPriceLimit.value.length + 1)
        await invokeAutoSellHighPriceLimit(ctx, autoSellId)
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellHighPriceLimitCancel + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellHighPriceLimitCancel.length + 1)
        await invokeAutoSellHighPriceLimitCancel(ctx, autoSellId)
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellHighPriceLimitPercentage + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellHighPriceLimitPercentage.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-high-price-percentage', msgId: ctx.update.callback_query?.message.message_id, autoSellId });
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellHighPriceLimitUsd + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellHighPriceLimitUsd.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-high-price-usd', msgId: ctx.update.callback_query?.message.message_id, autoSellId })
    })

    bot.action(RegExp('^' + botEnum.trackAutoSellHighPriceLimitMarketcap + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellHighPriceLimitMarketcap.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-high-price-marketcap', msgId: ctx.update.callback_query?.message.message_id, autoSellId });
    })

	bot.action(RegExp('^' + botEnum.trackAutoSellHighPriceLimitUnified + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackAutoSellHighPriceLimitUnified.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-high-price-unified', msgId: ctx.update.callback_query?.message.message_id, autoSellId });
    })

    bot.action(RegExp('^' + botEnum.trackLoHi.value + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.trackLoHi.value.length + 1)
        await invokeAutoSellAmountSwitch(ctx, autoSellId)
    })

    bot.action(RegExp('^' + botEnum.autoSellAmountSwitch.value + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.autoSellAmountSwitch.value.length + 1)
        await invokeAutoSellLoHiSwitch(ctx, autoSellId)
    })

    bot.action(RegExp('^' + botEnum.autoSellAmountAtLowPrice + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.autoSellAmountAtLowPrice.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-amount-low-price', msgId: ctx.update.callback_query?.message.message_id, autoSellId });
    })

    bot.action(RegExp('^' + botEnum.autoSellAmountAtHighPrice + '_.+'), async (ctx: any) => {
        const autoSellId = ctx.update.callback_query.data.slice(botEnum.autoSellAmountAtHighPrice.length + 1)
        await ctx.scene.enter(AUTO_SELL_LISTENER, { input_type: 'auto-sell-amount-high-price', msgId: ctx.update.callback_query?.message.message_id, autoSellId });
    })

    bot.action(RegExp('^' + botEnum.buyDipTrack.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyDipTrack.value.length + 1)

		try {
			await ctx.answerCbQuery()
		} catch { }

        await invokeAutoBuyTrack(ctx, tokenInfoId)
    })

    bot.action(RegExp('^' + botEnum.buyDipPriceThreshold.value + '_.+'), async (ctx: any) => {
        const autoBuyId = ctx.update.callback_query.data.slice(botEnum.buyDipPriceThreshold.value.length + 1)
        await invokeAutoBuyPriceLimit(ctx, autoBuyId)
    })

    bot.action(RegExp('^' + botEnum.trackAutoBuyPriceLimitPercentage + '_.+'), async (ctx: any) => {
        const autoBuyId = ctx.update.callback_query.data.slice(botEnum.trackAutoBuyPriceLimitPercentage.length + 1)
        await ctx.scene.enter(AUTO_BUY_LISTENER, { input_type: 'auto-buy-price-percentage', msgId: ctx.update.callback_query?.message.message_id, autoBuyId });
    })

    bot.action(RegExp('^' + botEnum.trackAutoBuyPriceLimitUsd + '_.+'), async (ctx: any) => {
        const autoBuyId = ctx.update.callback_query.data.slice(botEnum.trackAutoBuyPriceLimitUsd.length + 1)
        await ctx.scene.enter(AUTO_BUY_LISTENER, { input_type: 'auto-buy-price-usd', msgId: ctx.update.callback_query?.message.message_id, autoBuyId });
    })

    bot.action(RegExp('^' + botEnum.trackAutoBuyPriceLimitMarketcap + '_.+'), async (ctx: any) => {
        const autoBuyId = ctx.update.callback_query.data.slice(botEnum.trackAutoBuyPriceLimitMarketcap.length + 1)
        await ctx.scene.enter(AUTO_BUY_LISTENER, { input_type: 'auto-buy-price-marketcap', msgId: ctx.update.callback_query?.message.message_id, autoBuyId });
    })

	bot.action(RegExp('^' + botEnum.trackAutoBuyPriceLimitUnified + '_.+'), async (ctx: any) => {
        const autoBuyId = ctx.update.callback_query.data.slice(botEnum.trackAutoBuyPriceLimitUnified.length + 1)
        await ctx.scene.enter(AUTO_BUY_LISTENER, { input_type: 'auto-buy-price-unified', msgId: ctx.update.callback_query?.message.message_id, autoBuyId });
    })

    bot.action(RegExp('^' + botEnum.trackAutoBuyPriceLimitCancel + '_.+'), async (ctx: any) => {
        const autoBuyId = ctx.update.callback_query.data.slice(botEnum.trackAutoBuyPriceLimitCancel.length + 1)
        await invokeAutoBuyPriceLimitCancel(ctx, autoBuyId)
    })

    bot.action(RegExp('^' + botEnum.buyDipAmount.value + '_.+'), async (ctx: any) => {
        const autoBuyId = ctx.update.callback_query.data.slice(botEnum.buyDipAmount.value.length + 1)
        await ctx.scene.enter(AUTO_BUY_LISTENER, { input_type: 'auto-buy-amount', msgId: ctx.update.callback_query?.message.message_id, autoBuyId });
    })
};

module.exports.externalInvokeMonitor = externalInvokeMonitor
