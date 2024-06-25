import { botEnum } from '../constants/botEnum.js';
import { TokenTrackModel } from '../models/token.track.model.js';
import { sleep, timeGapString, timeGapStringDetails } from '../utils/common.js';
import { currencyFormat, numberFormat } from '../utils/global.functions.js';
import { getTrackMarkup } from '../utils/inline.markups.js';
import Logging from '../utils/logging.js';
import { emptyActiveTradesMessage } from '../utils/messages.js';
import { getNativeCurrencyPrice, getNativeCurrencySymbol } from '../web3/chain.parameters.js';
import { getTokenBalance, prefetchTokensOnChain } from '../web3/multicall.js';
import { getBN } from '../web3/web3.operation.js';
import { getAppUser } from './app.user.service.js';
import { getReferralLink } from './referral.service.js';
import { getSettings } from './settings.service.js';
import { getTokenInfo, getTokenPrice } from './token.service.js';
import { getPnL } from './trade.service.js';
import { getMultiWallets, getWallet } from './wallet.service.js';

export async function startTokenTrack(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);

	await TokenTrackModel.updateMany({ user: user._id }, { primary: false });

	let track = await TokenTrackModel.findOne({ user: user._id, chain: chain, address: token });

	if (track === null) {
		track = new TokenTrackModel({
			user: user._id,
			chain: chain,
			address: token,
			state: 'enabled'
		});
	}

	track.primary = true

	await track.save()

	return track
}

export async function moveTokenTrack(telegramId: string, trackId: string, bPrev: boolean, msgId: number) {
	const tracks = await getAllTracks(telegramId)

	if (tracks.length <= 0) return null

	const track = tracks.find((t) => t._id.toString() === trackId)
	let index;
	if (track === undefined) {
		index = 0;
	} else {
		const foundIndex = tracks.indexOf(track)

		if (bPrev === true) {
			index = (foundIndex + tracks.length - 1) % tracks.length
		} else {
			index = (foundIndex + 1) % tracks.length
		}
	}

	const user = await getAppUser(telegramId);
	await TokenTrackModel.updateMany({ user: user._id }, { primary: false });

	const foundId = tracks[index]._id
	tracks[index].primary = true
	tracks[index].msgId = msgId
	await tracks[index].save()

	return await TokenTrackModel.findById(foundId)
}

export async function getAllTracks(telegramId: string) {
	const user = await getAppUser(telegramId)
	return await TokenTrackModel.find({ user: user._id })
}

export async function getFirstTrack(telegramId: string) {
	const tracks = await getAllTracks(telegramId)
	if (tracks.length > 0) return tracks[0]
	else return null
}

export async function getTrackByToken(telegramId: string, chain: string, token: string) {
	const user = await getAppUser(telegramId);
	return await TokenTrackModel.findOne({ user: user._id, chain: chain, address: token })
}

export async function getTrackText(telegramId: string, chain: string, token: string) {
	const BN = getBN();

	const track = await getTrackByToken(telegramId, chain, token)
	const allTracks = await getAllTracks(telegramId)

	if (allTracks.length === 0) {
		return {
			text: emptyActiveTradesMessage
		}
	}

	if (track === null) {
		return {
			text: '❌ Invalid track'
		}
	}

	const foundIndex = allTracks.map((t, idx) => t.chain === track.chain && t.address === track.address ? idx : -1).find(t => t > -1)

	const nativeSymbol = await getNativeCurrencySymbol(track.chain)

	const setting = await getSettings(telegramId, chain)

	let wallets = [await getWallet(telegramId)]

	if (setting.multiWallet === true) {
		try {
			wallets = [...wallets, ...(await getMultiWallets(telegramId))]
		} catch { }
	}

	const ret = await Promise.all(wallets.map(async w => {
		try {
			return await getTokenBalance(chain, token, w.address);
		} catch (err) {
			return { balance: '0' }
		}
	}))
	const balanceSum = ret.reduce((prev, cur) => prev.plus(BN(cur.balance)), BN(0)).toString()

	const tokenPrice = await getTokenPrice(track.chain, track.address)
	let multiBalanceText = ''
	if (wallets.length > 1) {
		multiBalanceText = `= (<b>${ret[0].balance}</b>` + ret.slice(1).map(t => ` + ${t.balance}`) + ')'
	}

	// const pnlInfo = await getPNL(track.chain, track.address, w.address)

	// const impact = await getPriceImpact(track.chain, track.address, w.address)

	let text = `📊 <b>Active Trades</b> ⚡️ ${track.chain.slice(0, 3).toUpperCase()}\n`;
	text += `\n`;
	text += `👛 Token: <b>${ret[0].symbol}</b>\n`
	text += `<code>${ret[0].address}</code>\n`
	text += '\n'
	text += `📈 Price: <code>$${BN(tokenPrice).toFixed(6)}</code>\n`;
	text += `🧢 Market Cap: <code>$${numberFormat().format(BN(ret[0].totalSupply).times(BN(tokenPrice)).toFixed(0))}</code>\n`
	text += '\n'
	text += `💰 Balance: <code>${BN(balanceSum).times(100).integerValue().div(100).toString()}</code> <b>${ret[0].symbol}</b> ${multiBalanceText}\n`
	try {
		const nPrice = await getNativeCurrencyPrice(chain)

		const pnlInfo = await getPnL(telegramId, chain, token)
		const initial = pnlInfo.initial
		const worth = pnlInfo.worth
		const pnlAmount = BN(worth).minus(BN(initial))
		const percentage = BN(initial).eq(0) ? "0" : pnlAmount.times(100).div(BN(initial)).toFixed(3)

		text += '\n'
		text += `💰 Initial: <code>${parseFloat(BN(initial).toFixed(4))}</code> <b>${nativeSymbol}</b>\n`
		text += `💰 Current Worth: <code>${parseFloat(BN(worth).toFixed(4))}</code> <b>${nativeSymbol}</b>\n`
		text += '\n'
		text += `🧾 P/L: <code>${parseFloat(percentage)}%</code> Ξ <code>${parseFloat(pnlAmount.toFixed(4))}</code> <b>${nativeSymbol}</b>\n`
	} catch { }
	text += '\n'
	// text += `💸 Initial: <b>${parseFloat(BN(pnlInfo.initial || '0').toFixed(4))} ${nativeSymbol}</b>\n`;
	// text += `💸 Worth: <b>${parseFloat(BN(pnlInfo.worth || '0').toFixed(4))} ${nativeSymbol}</b>\n`;
	// text += `\n`;

	// text += `🧾 P/L after taxes: ${parseFloat(BN(pnlInfo.pnl || '0').toFixed(4))}%\n`
	// text += `💥 Price impact: <b>${parseFloat(BN(impact || '0').toFixed(4))}</b>%\n`;
	// text += `💸 Expected payout: <b>${parseFloat(BN(pnlInfo.worth).times(BN(100).minus(BN(taxInfo?.sellTax || '0'))).div(BN(100)).toFixed(4))}</b> ${nativeSymbol}\n`; // BN(payout || '0')
	// text += `\n`;

	text += `⏳ Time elapsed: <b>${timeGapStringDetails(track.createdAt, new Date())}</b>\n`;
	text += `\n`;

	if (allTracks.length > 1) {
		text += `🗓️ <b>Other Trades</b>\n`;
	} else {
		text += `🗓️ <b>No Other Trades</b>\n`;
	}

	for (let i = 0; i < allTracks.length - 1 && i < 20; i++) {
		const t = allTracks[(i + foundIndex + 1) % allTracks.length];
		const tt = await getTokenInfo(t.chain, t.address);

		if (tt !== null) {
			let percentage = '0'
			try {
				const pnlInfo = await getPnL(telegramId, t.chain, t.address)
				const initial = pnlInfo.initial
				const worth = pnlInfo.worth
				const pnlAmount = BN(worth).minus(BN(initial))
				percentage = BN(initial).eq(0) ? "0" : pnlAmount.times(100).div(BN(initial)).toFixed(3)
			} catch { }

			text += `/${i + 1} 🪙 <b>${tt.symbol}</b> 🚀 <b>${parseFloat(percentage)}</b>% ⏱ ${timeGapString(tt.createdAt, new Date())}\n`;
		}

		if (i + 1 >= 20) {
			text += '...\n'
		}
	}

	text += '\n'
	const refLink = await getReferralLink(telegramId)
	text += `Your Referral Link: ${refLink}\n`

	// text += `\n`;
	// text += `ℹ Sell-Lo/Hi compare against the coin's P/L, not its P/L w/tax\n`;
	// text += `\n`;
	// text += `📢 Ad: Advertise with us @LightningMaker`;

	return {
		text,
		tokenInfo: ret[0],
		chain: track.chain
	};
}

export async function resetTokenTracks(telegramId: string) {
	const user = await getAppUser(telegramId);

	await TokenTrackModel.deleteMany({ user: user._id });
}

export async function stopTokenTrack(telegramId: string, trackId: string) {
	let track = await TokenTrackModel.findById(trackId)
	if (track !== null) {
		track.state = 'stopped'
		await track.save()
	}
	return track
}

export async function enableTokenTrack(telegramId: string, trackId: string) {
	let track = await TokenTrackModel.findById(trackId)
	if (track !== null) {
		track.state = 'enabled'
		await track.save()
	}

	return track;
}

export async function deleteTokenTrack(telegramId: string, trackId: string) {
	let tracks = await getAllTracks(telegramId)
	if (tracks.length <= 0) return null;

	let nextTrack
	const track = tracks.find((t) => t._id.toString() === trackId)
	if (track !== undefined) {
		const foundIndex = tracks.indexOf(track)
		if (tracks.length > 1) {
			nextTrack = tracks[(foundIndex + 1) % tracks.length];
		}
	}

	await TokenTrackModel.findByIdAndDelete(trackId)

	if (nextTrack) {
		return await TokenTrackModel.findById(nextTrack._id);
	} else return null
}

export async function pollTrackTokens(bot: any) {
	Logging.info('[pollTrackTokens] Started monitoring active trades...')
	while (true) {
		const tracks: any[] = await TokenTrackModel.find({ state: 'enabled', primary: true })
		let count = 0
		for (let i = 0; i < tracks.length; i += 50) {
			const ret = await Promise.all(tracks.slice(i, i + 50).map(async t => {
				try {
					await t.populate('user')

					const telegramId = t.user.telegramId
					const chatId = t.user.chatId
					const msgId = t.msgId
					const chain = t.chain

					const ptext = await getTrackText(telegramId, chain, t.address)

					await bot.telegram.editMessageText(chatId, msgId, 0, ptext.text, {
						parse_mode: botEnum.PARSE_MODE_V2,
						reply_markup: await getTrackMarkup(telegramId, chain, t.address)
					})
					return msgId
				} catch (err) {
					if (err.message.includes('message is not modified:') || err.message.includes('message to edit not found')) return
					console.error(`==> ${new Date().toLocaleString()}`)
					console.error(err)
					Logging.error(`[pollTrackTokens] ${err.message}`)
					if (!err.message.includes('message is not modified:')) {
						await TokenTrackModel.findByIdAndDelete(t._id)
					}
				}
			}))
			count += ret.filter(r => r !== undefined).length
		}

		Logging.info(`[pollTrackTokens] refreshed ${count} tracks`)
		await sleep(10000)
	}
}

export async function getPrimaryTokenTrack(telegramId: string) {
	const user = await getAppUser(telegramId);
	return await TokenTrackModel.findOne({ user: user._id, primary: true })
}
