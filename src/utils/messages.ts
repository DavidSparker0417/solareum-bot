import * as dotenv from 'dotenv';
import path from 'path';
import { getMultiWallets, getWallet } from '../service/wallet.service.js';
import { chainPrice, getAllChains } from '../service/chain.service.js';
import { getSelectedChain } from '../service/connected.chain.service.js';
import { getBN, getCUPriceByPreset, getPriorityGas } from '../web3/web3.operation.js';
import { getTokenBalance } from '../web3/multicall.js';

import { getNativeCurrencyPrice, getNativeCurrencySymbol } from '../web3/chain.parameters.js';
import {
	NOT_STARTED,
	NOT_ENOUGH_BALANCE,
	TOO_MUCH_REQUESTED,
	NOT_CONFIGURED_CHAIN,
	NOT_CONNECTED_CHAIN,
	NOT_CONNECTED_WALLET,
	NOT_APPROVED,
	MAX_TX_NOT_FOUND,
	APE_MAX_NOT_FOUND,
	INSUFFICIENT_ETH,
	ALREADY_EXIST,
	timeGapString,
	GASPRICE_OVERLOADED,
	GAS_EXCEEDED,
	TX_ERROR,
	ESTIMATE_GAS_ERROR,
	INVALID_VALUE_SET,
	NOT_ALLOWED_ANTIMEV,
	ROUTER_NOT_FOUND,
	INVALID_WALLET_ADDRESS,
	TX_FAILED_CONFIRM,
	TX_FETCH_FAILED,
	TX_FAILED_PARSING
} from './common.js';
import { IAddress } from '../models/address.model.js';
import { ChainModel } from '../models/chain.model.js';
import { getAutoBuyContexts, getQuickAutoBuyContext } from '../service/autobuy.service.js';
import { getTokenPrice } from '../service/token.service.js';
import { currencyFormat, numberFormat } from './global.functions.js';
import { UserStatModel } from '../models/user.stat.model.js';
import { getAppUser } from '../service/app.user.service.js';
import { getSettings } from '../service/settings.service.js';
import { batchAddressBalances, getETHBalance, userETHBalance } from '../web3/nativecurrency/nativecurrency.query.js';
import { getReferralCount, getReferralLink, getReferralPayWallet, getReferralWallet } from '../service/referral.service.js';
import { getAutoSellContexts } from '../service/autosell.service.js';
import { getAllTracks } from '../service/track.service.js';
import { getEvmWallet } from '../service/evm.wallet.service.js';
import { getEvmETHBalance } from '../web3/evm.web3.operation.js';
import { BridgeModel } from '../models/bridge.model.js';
import { getPnL } from '../service/trade.service.js';

dotenv.config();
if (process.env.NODE_ENV == ('development' || 'development ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else if (process.env.NODE_ENV == ('production' || 'production ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env') });
} else if (process.env.NODE_ENV == ('staging' || 'staging ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.staging') });
}

export const startMessage = `
<b> Solareum Trading Bot </b> ⚡

Welcome To The 1st Ever <b>Solana Trading Bot</b> with integrated EVM-SVM bridge.

Paste any Solana Token CA onto this bot to Start Trading !
`;

//
export const linkAccountMessage = (telegramId: string) => {
	return `
⚡️ *Link app account*

1. launch IOS/Android/MacOS/Linux app
2. goto settings
3. link account
4. enter code *S-${telegramId}*
`;
};

export const walletAction = `
💳 <b>Wallets</b>
Please select a <b>chain</b> for which you would like to <b>create or connect</b> a wallet.
`;

export const emptyActiveTradesMessage = `
📊 Tracker
📣 This panel will show up shortly if you have any active trades.
`
export async function getChainStatus(telegramId: string, chain: string) {
	const BN = getBN()
	let ret = `📤 Transfer <b>${chain.slice(0, 3).toUpperCase()}</b>\n\n`;

	let wallet;
	try {
		wallet = await getWallet(telegramId);
	} catch { }
	const connected = wallet !== undefined;

	if (connected === true) {
		ret += `${disabledEnabledEmoji(true)} Address: <code>${wallet.address}</code>\n\n`;

		const ethBal = await userETHBalance(telegramId, chain);
		ret += `You have <b>${parseFloat(BN(ethBal).toFixed(4))} ${await getNativeCurrencySymbol(chain)}</b>`;
	} else {
		ret += `${disabledEnabledEmoji(false)} Address\n`;
	}

	return ret;
}

export async function getErrorMessageResponse(telegramId: string, error: string) {
	if (error === NOT_STARTED) {
		return `⚠️ You never started here\nPlease run by /start`;
	} else if (error.startsWith(NOT_ENOUGH_BALANCE) || error.startsWith(TOO_MUCH_REQUESTED)) {
		return error;
	} else if (error === NOT_CONFIGURED_CHAIN) {
		return `⚠️ Not configured chain\nPlease run by /start and /wallets`;
	} else if (error === NOT_CONNECTED_CHAIN) {
		return `⚠️ Not connected chain\nPlease run by /start and /wallets`;
	} else if (error === NOT_CONNECTED_WALLET) {
		return `⚠️ Not connected wallet\nPlease run by /start and /wallets`;
	} else if (error === NOT_APPROVED) {
		return `⚠️ Token not approved\nPlease approve it by clicking <b>Approve</b> button`;
	} else if (error === MAX_TX_NOT_FOUND) {
		return `⚠️ Can't specify max tx amount`;
	} else if (error === APE_MAX_NOT_FOUND) {
		return `⚠️ Can't specify ape max amount`;
	} else if (error.startsWith(INSUFFICIENT_ETH) || error.startsWith(GASPRICE_OVERLOADED) || error.startsWith(GAS_EXCEEDED) || error.startsWith(TX_ERROR) || error.startsWith(ESTIMATE_GAS_ERROR) || error.startsWith(INVALID_VALUE_SET) || error.startsWith(NOT_ALLOWED_ANTIMEV) || error.startsWith(ROUTER_NOT_FOUND) || error.startsWith(INVALID_WALLET_ADDRESS) ) { // || error.startsWith(TX_FAILED_CONFIRM) || error.startsWith(TX_FETCH_FAILED) || error.startsWith(TX_FAILED_PARSING)
		return error;
	} else if (error.startsWith(ALREADY_EXIST)) {
		return error;
	}
	return null;
}

export async function getTokenStatusMessage(telegramId: string, chain: string, token: string) {
	const BN = getBN();
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

	const tokenPrice = await getTokenPrice(chain, token)

	const name = ret[0].name;
	const symbol = ret[0].symbol;

	const totalSupplyExcludingBurnt = BN(ret[0].totalSupply);
	const marketCapExcludingBurnt = BN(totalSupplyExcludingBurnt).times(BN(tokenPrice)).toFixed(0);
	const nPrice = await chainPrice(chain);
	const nativeSymbol = await getNativeCurrencySymbol(chain)

	let multiBalanceText = ''
	if (wallets.length > 1) {
		multiBalanceText = `= (<b>${ret[0].balance}</b>` + ret.slice(1).map(t => ` + ${t.balance}`) + ')'
	}

	let text = `🪙 <b>${name} (\$${symbol}) ⚡️ ${chain.slice(0, 3).toUpperCase()}</b>\n`;
	text += '\n'
	text += `CA: <code>${token}</code>\n`;
	text += '\n'
	text += `📈 Price | <code>$${BN(parseFloat(BN(tokenPrice).toFixed(10))).toString()}</code>\n`;
	text += `🧢 Market Cap | <code>$${numberFormat().format(marketCapExcludingBurnt)}</code>\n`;
	text += '\n'
	text += `💰 Balance | <code>${numberFormat().format(balanceSum)}</code> <b>${ret[0].symbol}</b> ${multiBalanceText}\n`;
	try {
		const pnlInfo = await getPnL(telegramId, chain, token)
		const initial = pnlInfo.initial
		const worth = pnlInfo.worth
		const pnlAmount = BN(worth).minus(BN(initial))
		const percentage = BN(initial).eq(0)? "0": pnlAmount.times(100).div(BN(initial)).toFixed(3)

		text += '\n'
		text += `💰 Initial: <code>${parseFloat(BN(initial).toFixed(4))}</code> <b>${nativeSymbol}</b>\n`
		text += `💰 Current Worth: <code>${parseFloat(BN(worth).toFixed(4))}</code> <b>${nativeSymbol}</b>\n`
		text += '\n'
		text += `🧾 P/L: <code>${parseFloat(percentage)}%</code> Ξ <code>${parseFloat(pnlAmount.toFixed(4))}</code> <b>${nativeSymbol}</b>\n`
	} catch { }
	text += '\n'

	text += `🎯 Alpha | <code>${ret[0].hitCount}</code>\n`;
	text += `🕰 Age: ${ret[0].age ? timeGapString(ret[0].age, new Date()) : '<b>Not specified</b>'}\n`;

	text += '\n'
	const refLink = await getReferralLink(telegramId)
	text += `Your Referral Link: ${refLink}\n`

	return {
		text,
		symbol
	};
}

export const getBotGeneralConfiguration = async (telegramId: string, chain: string, part: string = 'general') => {
	let w;
	let botSettings = await getSettings(telegramId, chain)
	let symbol;
	const BN = getBN()
	try {
		w = await getWallet(telegramId);
		symbol = await getNativeCurrencySymbol(chain);
	} catch { }

	let displayBalance = '';
	if (w !== undefined) {
		const balance = await userETHBalance(telegramId, chain);
		displayBalance = `<b>${parseFloat(BN(balance).toFixed(4))} ${symbol}</b>`;
	}

	let text = '⚙️ Setting'
	text += `⚡️ <b>${chain.slice(0, 3).toUpperCase()}</b>\n`
	text += `Wallet: <b><code>${w?.address || 'Disconnected'}</code></b>\n`
	text += `${displayBalance}\n`
	text += `Multi-Wallets: <b>${disabledEnabledEmoji(botSettings?.multiWallet || false)}</b>\n`
	text += `\n`
	const priorityGas = parseFloat(getPriorityGas(botSettings.gasPreset))
	if (!isNaN(priorityGas) && priorityGas >= 0) {
		text += `Priority Gas: <code>${priorityGas}</code> <b>SOL</b>\n`
	}
	text += `Slippage: <b>${(botSettings?.slippage < 100 ? `${botSettings?.slippage}%` : undefined) || 'Default(100%)'}</b>\n`

	return text
};

export const getWalletInfoOfChain = async (telegramId: string, chain: string) => {
	let w;
	let multiWwallets;
	const BN = getBN()
	let botSettings = await getSettings(telegramId, chain)
	let symbol;
	try {
		w = await getWallet(telegramId);
		multiWwallets = [w, ...await getMultiWallets(telegramId, { configure: true })]
		symbol = await getNativeCurrencySymbol(chain);
	} catch { }

	let displayBalances = []

	let displayUser = '<b>Disconnected</b>\n'

	if (botSettings.multiWallet === true) {
		if (w !== undefined && multiWwallets !== undefined) {
			displayUser = `${disabledEnabledEmoji(botSettings.multiWallet || false)} Multi-Wallets\n`
			displayBalances = await Promise.all(multiWwallets.map(m => getETHBalance(telegramId, chain, m.address)))
			displayUser += multiWwallets.map((m, idx) => `${idx + 1} - <b><code>${m.address}</code></b> <b>${parseFloat(BN(displayBalances[idx]).toFixed(4))} ${symbol}</b>\n`).reduce((prev, cur) => prev + cur, '')
		}
	} else {
		if (w !== undefined) {
			const balance = await userETHBalance(telegramId, chain);
			displayUser = `${disabledEnabledEmoji(botSettings.multiWallet || false)} Multi-Wallets\n`
			displayUser += `<b><code>${w.address}</code></b> <b>${parseFloat(BN(balance).toFixed(4))} ${symbol}</b>\n`
		}
	}

	return `
⚡ <b>${chain.slice(0, 3).toUpperCase()}</b>

${displayUser}
    `;
};

export function disabledEnabledEmoji(value: any) {
	if (value) {
		return '✅';
	} else {
		return '❌';
	}
}

export async function multiWalletMessage(telegramId: string, chain: string, addresses: IAddress[]) {
	addresses = await batchAddressBalances(telegramId, chain, addresses);
	let response = '';
	const symbol = await getNativeCurrencySymbol(chain);
	for (let address of addresses) {
		let displayBalance = '';
		if (address !== undefined) {
			displayBalance = `<b>${address.balance} ${symbol}</b>`;
		}
		response =
			response +
			`
👛 <b>${address.name || 'untitled'} ${address.connected ? '🟢' : '🔴'}</b>
Address: <b><code>${address.address}</code></b>
${displayBalance}
        `;
	}
	return response;
}

export async function getQuickMessage(telegramId: string, chain: string) {
	let text = ''

	const ch = await ChainModel.findOne({ name: chain })

	const BN = getBN();

	const bc = await getQuickAutoBuyContext(telegramId, chain)

	// for (const ch of chains)
	{
		text += `⚡️ Quick Settings <b>${ch.name.slice(0, 3).toUpperCase()}</b>\n`;
		text += '\n';
		text += `Auto Buy: ${bc.enabled === true ? '✅' : '❌'}\n`;
		text += `Buy Amount: <b>${bc.amount?.indexOf('%') > -1 ? bc.amount : (bc.amount || '0') + ' ' + ch.currency}</b>\n`;
		text += `Multi Wallet: ${bc.multi === true ? '✅' : '❌'}\n`;
		text += `Slippage: <b>${bc.slippage === undefined ? 'Default (100%)' : bc.slippage.toString() + '%'} </b>\n`;
		text += '\n';
	}

	return text;
}

export async function getSnipeTokenInfoText(telegramId: string, snipe: any) {
	if (snipe === null || snipe === undefined) {
		return '⚠️ No tokens to snipe'
	}

	const BN = getBN()
	const primary = await snipe.populate('token')
	const nativeSymbol = await getNativeCurrencySymbol(primary.token.chain)

	let text = `🔫 <b>Sniper</b>\n\n`;
	text += `${primary.disabled === true? '❌ <b>Configure only</b>': '✅ <b>Configure & Execute</b>'}\n`
	text += '\n'

	text += `🪙 <b>${primary.token.name} (${primary.token.symbol})</b> ⚡️ ${primary.token.chain.slice(0, 3).toUpperCase()}\n`;
	text += `CA: <code>${primary.token.address}</code>\n`;
	text += '\n'

	// text += `Automatic Max Tx: ${primary.maxTx === true ? '✅' : '❌'}\n`
	text += `Snipe Amount: <code>${primary.nativeCurrencyAmount}</code> <b>${(primary.nativeCurrencyAmount.indexOf('%') < 0? `${nativeSymbol}`: '')}</b>\n`

	if (primary.tokenAmount && BN(primary.tokenAmount).gt(0)) {
		text += `Buy <b>${primary.token.symbol}</b>: <code>${primary.tokenAmount}</code>\n`
	}
	text += '\n'

	const userSetting = await getSettings(telegramId, primary.token.chain)
	const tipAmount = parseInt(await getCUPriceByPreset(1000000, userSetting.gasPreset))
	text += `💵 Wallet | <b>${primary.multi === true ? 'Multi' : "Main"}</b>\n`;
	text += `⛽ TX Tip | <code>${primary.priorityFee || BN(tipAmount).div(BN('1e9')).toString()}</code> <b>${nativeSymbol}</b>`;
	text += '\n'
	text += '\n'

	text += `⚠️ You can snipe <b>${primary.token.symbol}</b> by <b>SOL</b> or <b>other coin</b> which was paired to <b>${primary.token.symbol}</b> in <b>Raydium</b>\n`
	text += `⚠️ <b>Snipe amount</b> is described in <b>amount or percentage</b> of <b>paired coin</b> you are holding`

	return text;
}

export async function getStateMessage(telegramId: string, ctx: any) {
	const chain = await getSelectedChain(telegramId);
	const user = await getAppUser(telegramId)

	let text = ''

	text += '⚡️' + `<b>${chain}</b>\n`;
	let w;
	try {
		w = await getWallet(telegramId);
	} catch { }

	if (w !== undefined) {
		text += 'Wallet: <b>connected</b>\n';

		if (w !== null) {
			text += `Address: <code>${w.address}</code>\n`;
			if (ctx.chat.type === 'private') {
				text += `Private Key: <code>${w.privateKey}</code>\n`;
				if (w.mnemonic) {
					text += `Mnemonic: <code>${w.mnemonic}</code>\n`;
				}
			}

			const bal = await userETHBalance(telegramId, chain);
			const nativeSymbol = await getNativeCurrencySymbol(chain);
			text += `You have <b>${bal.toString()} ${nativeSymbol}</b>\n`;

			const st = await UserStatModel.findOne({ user: user._id, chain: chain })
			if (st !== null) {
				text += `fee: ${st.txFee} ${nativeSymbol}\n`
				text += `paid: ${st.txPaid} ${nativeSymbol}\n`
			}
		}
		text += '\n';
	} else {
		text += 'Wallet: <b>disconnected</b>\n';
	}

	return text
}

export async function getBotPresetMessage(telegramId: string, chain: string) {
	let text = ''
	text += '<b>Bot Presets</b>\n'
	text += '\n'
	text += `Please select a preset of <b>priority fee</b> for <b>transactions</b>.`
	return text
}

export async function getZkProofMixerMessage(telegramId: string, chain: string) {
	let text = ''

	const BN = getBN()
	const w = await getWallet(telegramId)
	const bal = await getETHBalance(telegramId, chain, w.address)
	const nativeSymbol = await getNativeCurrencySymbol(chain)

	text += `Welcome to mixer platform using <b>Zero Knowledge Proof</b> technology.\n`
	text += '\n'
	text += `Balance: <code>${parseFloat(BN(bal).toFixed(6))} ${nativeSymbol}</code>\n`
	text += '\n'
	text += 'Please mix or retrieve your fund using security note regardless of your wallet address.'

	return text
}

export async function getReferralMessage(telegramId: string) {
	let text = ''

	const link = await getReferralLink(telegramId)

	text += '👥 <b>My Referral Information</b>\n'
	text += '\n'
	text += `<b>Link</b>: ${link}\n`

	const configuredWallet = await getReferralWallet(telegramId)
	const payWallet = await getReferralPayWallet(telegramId)

	text += `<b>Payee Wallet</b>: ${configuredWallet ? `<code>${configuredWallet}</code>` : payWallet ? `You might be paid to account wallet <code>${payWallet}</code>` : '<i>You neither configured a wallet nor created a wallet in this bot</i>'}\n`

	const referCount = await getReferralCount(telegramId)
	text += `<b>Total Referral</b>: <code>${referCount}</code>\n`
	// text += '\n'
	// text += '🔊 If you are using this bot as <b>someone</b> let you know, then you <b>paste his/her referral link</b> in this tg channel.'
	return text
}

export async function getAutoTradeText(telegramId: string, chain: string, tokenToFocus?: string) {
	const autoSellContexts = await getAutoSellContexts(telegramId, chain)
	const autoBuyContexts = await getAutoBuyContexts(telegramId, chain)
	const ta = [...autoSellContexts.map(as => as.token), ...autoBuyContexts.map(ab => ab.token)]
	const tokens = ta.filter((t, idx) => idx === ta.indexOf(t))

	if (!tokenToFocus) {
		if (autoSellContexts.length > 0) {
			tokenToFocus = autoSellContexts[0].token
		} else if (autoBuyContexts.length > 0) {
			tokenToFocus = autoBuyContexts[0].token
		}
	}

	if (!tokenToFocus) {
		return "🌉 You don't have orders"
	}

	let text = ''

	text += `🌉 <b>Orders</b>: ⚡ <b>${chain.slice(0, 3).toUpperCase()}</b>\n`
	text += '\n'
	text += `Total: <code>${tokens.length}</code> tokens\n`
	text += `Buy: <code>${autoBuyContexts.length}</code> tokens\n`
	text += `Sell: <code>${autoSellContexts.length}</code> tokens\n`
	text += '\n'

	const w = await getWallet(telegramId)
	const tokenPrice = await getTokenPrice(chain, tokenToFocus)
	const b = await getTokenBalance(chain, tokenToFocus, w.address)
	const tokenInfo = b

	text += `<b>${tokenInfo.symbol}</b>: <code>${tokenToFocus}</code>\n`
	text += `Price Now: 📈 $<code>${Math.floor(parseFloat(tokenPrice) * 10000) / 10000}</code>\n`
	text += `Balance: <code>${b.balance}</code> <b>${tokenInfo.symbol}</b>\n`

	const asFound = autoSellContexts.find(as => as.token === tokenToFocus)
	const abFound = autoBuyContexts.find(ab => ab.token === tokenToFocus)

	if (asFound) {
		text += '\n'
		text += '<b>Auto-Sell</b>\n'
		text += `Initial Price: 📈 $<code>${Math.floor(parseFloat(asFound.priceStamp) * 10000) / 10000}</code>\n`
		text += `SL Level: 📈 <code>${asFound.lowPriceLimit}</code>\n`
		text += `TP Level: 📈 <code>${asFound.highPriceLimit}</code>\n`
		text += `Amount(SL): <code>${asFound.amountAtLowPrice}</code> <b>${tokenInfo.symbol}</b>\n`
		text += `Amount(TP): <code>${asFound.amountAtHighPrice}</code> <b>${tokenInfo.symbol}</b>\n`
	}

	const nativeSymbol = await getNativeCurrencySymbol(chain)

	if (abFound) {
		text += '\n'
		text += '<b>Auto-Buy</b>\n'
		text += `Initial Price: 📈 $<code>${Math.floor(parseFloat(abFound.priceStamp) * 10000) / 10000}</code>\n`
		text += `Price Limit: 📈 <code>${abFound.priceLimit}</code>\n`
		text += `Amount: <code>${abFound.amountAtLimit}</code> <b>${nativeSymbol}</b>\n`
	}

	return text
}

export async function getMenuMessage(telegramId: string) {
	const BN = getBN()

	const allChains = getAllChains()
	let text = ''

	text += `⚡ <b>${allChains.reduce((prev, cur, idx) => prev + (idx > 0 ? ' | ' : '') + (cur !== 'base' ? cur.slice(0, 3).toUpperCase() : cur.toUpperCase()), '')}</b>\n`

	const nativeCurrencies = await Promise.all(allChains.map(c => getNativeCurrencySymbol(c)))

	try {
		const w = await getWallet(telegramId)
		const multiWallets = await getMultiWallets(telegramId, { configure: true })
		const allWallets = [w, ...multiWallets]

		let widx = 0
		for (const wl of allWallets) {
			text += '\n'

			const balances = await Promise.all(allChains.map(c => getETHBalance(telegramId, c, wl.address)))
			text += `${widx === 0 ? '<b>✅ Main Wallet</b>' : '<b>✨ Additional Wallet</b>'}\n`
			text += `Address: <code>${wl.address}</code>\n`
			text += `👛 Balance: <code>${balances.reduce((prev, cur, idx) => prev + (idx === 0 ? '' : ' | ') + parseFloat(BN(cur).toFixed(6)) + ' ' + nativeCurrencies[idx], '')}</code>\n`

			widx++
		}
	} catch (err) {
		text += `Wallet: <b>Disconnected</b>\n`
	}

	const ethPrices = await Promise.all(allChains.map(c => getNativeCurrencyPrice(c)))
	text += '\n'
	text += `Price <code>${ethPrices.reduce((prev, cur, idx) => prev + (idx === 0 ? '' : ' | ') + '$' + parseFloat(BN(cur).toFixed(2)) + `(${nativeCurrencies[idx]})`, '')}</code>\n`

	const tracks = await getAllTracks(telegramId)
	text += '\n'
	text += `👁️ <code>${tracks.length} Tracked Token(s)</code>\n`

	const positions = await Promise.all(allChains.map(async (ch: string) => {
		const autoSellContexts = await getAutoSellContexts(telegramId, ch)
		const autoBuyContexts = await getAutoBuyContexts(telegramId, ch)
		const ta = [...autoSellContexts.map(as => as.token), ...autoBuyContexts.map(ab => ab.token)]
		const tokens = ta.filter((t, idx) => idx === ta.indexOf(t))
		return tokens.length
	}))

	text += `🙈 <code>${positions.reduce((prev, cur) => prev + cur, 0)} Position(s)</code>\n`

	text += '\n'
	const link = await getReferralLink(telegramId)
	text += `Your Referral Link: ${link}\n`

	return text
}

export const getBridgeMessage = async (telegramId: string) => {
	let ethWallet;
	let w
	try {
		ethWallet = await getEvmWallet(telegramId);
		w = await getWallet(telegramId)
	} catch { }

	let displayUser = '<b>Disconnected</b>\n'

	const BN = getBN()
	if (ethWallet !== undefined) {
		const ethbal = await getEvmETHBalance(ethWallet.address);
		displayUser = `<b>ETH</b>: <code>${ethWallet.address}</code>\n`
		displayUser += `           <code>${parseFloat(BN(ethbal).toFixed(4))}</code> <b>ETH</b>\n`
		const solbal = await userETHBalance(telegramId, 'solana')
		displayUser += `<b>SOL</b>: <code>${w.address}</code>\n`
		displayUser += `           <code>${parseFloat(BN(solbal).toFixed(4))}</code> <b>SOL</b>\n`
	}

	return `
Welcome to the <b>1st ever Telegram-based ETH-SOL Bridge</b> ! 

Top up the below <b>ETH/SOL</b> Wallet and <b>bridge</b> to any <b>ETH/SOL wallet</b> of your choice !

${displayUser}
⚠️ Minimum Bridge: <code>$21</code>
    `;
};

export async function getBridgeSol2EthMessage(telegramId: string, processingId: string) {
	let text = ''
	const bridgeItem = await BridgeModel.findById(processingId)
	if (bridgeItem === null) {
		return '❌ Invalid bridge'
	}
	text +=  `<b>Bridge</b> from <b>${bridgeItem.fromCurrency}</b> to <b>${bridgeItem.toCurrency}</b>\n`
	text += '\n'
	text += `<b>Amount</b>: <code>${bridgeItem.amount}</code>\n`
	text += `<b>Destination</b>: <code>${bridgeItem.to}</code>\n`
	text += '\n'
	text += `<b>State</b>: <code>${bridgeItem.state}</code>\n`
	if (bridgeItem.depositResult && bridgeItem.depositResult !== 'pending') {
		text += `<b>Deposit</b>: <code>${bridgeItem.depositResult}</code>\n`
		if (bridgeItem.depositTransaction) {
			text += `https://solscan.io/tx/${bridgeItem.depositTransaction}\n`
		}
	}
	if (bridgeItem.orderId) {
		text += `<b>Bridge Id</b>: <code>${bridgeItem.orderId}</code>\n`
	}
	if (bridgeItem.orderError) {
		text += `<b>Order Error</b>: ⚠️ ${bridgeItem.orderError}\n`
	}
	if (bridgeItem.withdrawAmount) {
		text += `<b>Withdraw Amount</b>: <code>${bridgeItem.withdrawAmount}</code> <b>ETH</b>\n`
	}
	if (bridgeItem.withdrawError) {
		text += `<b>Withdraw Error</b>: ⚠️ ${bridgeItem.withdrawError}\n`
	}
	if (bridgeItem.withdrawTransaction) {
		text += `https://etherscan.io/tx/${bridgeItem.withdrawTransaction}\n`
	}
	text += '\n'
	text += `Elapsed: ${timeGapString(bridgeItem.createdAt, new Date())}`

	return text
}


export async function getBridgeEth2SolMessage(telegramId: string, processingId: string) {
	let text = ''
	const bridgeItem = await BridgeModel.findById(processingId)
	if (bridgeItem === null) {
		return '❌ Invalid bridge'
	}
	text +=  `<b>Bridge</b> from <b>${bridgeItem.fromCurrency}</b> to <b>${bridgeItem.toCurrency}</b>\n`
	text += '\n'
	text += `<b>Amount</b>: <code>${bridgeItem.amount}</code>\n`
	text += `<b>Destination</b>: <code>${bridgeItem.to}</code>\n`
	text += '\n'
	text += `<b>State</b>: <code>${bridgeItem.state}</code>\n`
	if (bridgeItem.depositResult && bridgeItem.depositResult !== 'pending') {
		text += `<b>Deposit</b>: <code>${bridgeItem.depositResult}</code>\n`
		if (bridgeItem.depositTransaction) {
			text += `https://etherscan.io/tx/${bridgeItem.depositTransaction}\n`
		}
	}
	if (bridgeItem.orderId) {
		text += `<b>Bridge Id</b>: <code>${bridgeItem.orderId}</code>\n`
	}
	if (bridgeItem.orderError) {
		text += `<b>Order Error</b>: ⚠️ ${bridgeItem.orderError}\n`
	}
	if (bridgeItem.withdrawAmount) {
		text += `<b>Withdraw Amount</b>: <code>${bridgeItem.withdrawAmount}</code> <b>SOL</b>\n`
	}
	if (bridgeItem.withdrawError) {
		text += `<b>Withdraw Error</b>: ⚠️ ${bridgeItem.withdrawError}\n`
	}
	if (bridgeItem.withdrawTransaction) {
		text += `https://solscan.io/tx/${bridgeItem.withdrawTransaction}\n`
	}
	text += '\n'
	text += `Elapsed: ${timeGapString(bridgeItem.createdAt, new Date())}`

	return text
}
