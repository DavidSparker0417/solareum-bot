import * as dotenv from 'dotenv';
import path from 'path';
import { botEnum } from '../constants/botEnum.js';
import { IAddressPagination } from '../models/address.model.js';
import { getAutoBuyContexts, getQuickAutoBuyContext, getTokenAutoBuyContext, isTokenAutoBuySet } from '../service/autobuy.service.js';
import { getAutoSellContexts, getTokenAutoSellContext, isTokenAutoSellSet } from '../service/autosell.service.js';
import { getCopyTradeAddresses } from '../service/copytrade.service.js';
import { getNativeCurrencySymbol } from '../web3/chain.parameters.js';
import { IPageAndLimit } from './global.functions.js';
import { getSettings } from '../service/settings.service.js';
import { getTokenInfo } from '../service/token.service.js';
import { getTrackByToken } from '../service/track.service.js';
import { getWallet } from '../service/wallet.service.js';
import { getETHBalance } from '../web3/nativecurrency/nativecurrency.query.js';
import { getBN, getCUPriceByPreset, newSolWeb3 } from '../web3/web3.operation.js';
import { SolanaTokenInfoModel } from '../models/solana/solana.token.info.model.js';
import { BridgeModel } from '../models/bridge.model.js';
import { getDefaultSnipeSetting } from '../service/snipe.token.service.js';
import { OrcaWhirlPoolInfoModel } from '../models/solana/orca/whirlpool.model.js';
import { findBiggestLP } from '../web3/dex/raydium/trade.js';
import { createNewRedisClient } from '../service/multicore/ioredis.js';

if (process.env.NODE_ENV == ('development' || 'development ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else if (process.env.NODE_ENV == ('production' || 'production ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env') });
} else if (process.env.NODE_ENV == ('staging' || 'staging ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.staging') });
}

async function getTokenExternalURL(chain: string, tokenAddress: string) {
	const connection = await newSolWeb3('', 'solana')
	const redis = createNewRedisClient()
	const raydiumLPInfo = await findBiggestLP(redis, connection, tokenAddress)

	let url = 'https://www.dextools.io/app/en/solana/pair-explorer/';
	if (raydiumLPInfo) {
		url += raydiumLPInfo.id
	} else {
		const whirlPoolInfo = await OrcaWhirlPoolInfoModel.findOne({
			$or: [
				{ tokenA: tokenAddress },
				{ tokenB: tokenAddress },
			]
		})
		if (whirlPoolInfo) {
			url += whirlPoolInfo.address
		}
	}

	return url
}

export function markupStart(username: number, firstName: string) {
	return {
		inline_keyboard: [
			[
				{ text: botEnum.wallets.key, callback_data: botEnum.wallets.value },
				{ text: botEnum.monitor.key, callback_data: botEnum.monitor.value },
			],
			[
				{ text: botEnum.snipe.key, callback_data: botEnum.snipe.value },
				{ text: botEnum.settings.key, callback_data: botEnum.settings.value },
			],
			[
				{ text: botEnum.auto_trade.key, callback_data: botEnum.auto_trade.value },
				{ text: botEnum.quick.key, callback_data: botEnum.quick.value }
			],
			[
				{ text: botEnum.transfer.key, callback_data: botEnum.transfer.value },
				// { text: botEnum.bridge.key, callback_data: botEnum.bridge.value },
			],
			[
				{ text: botEnum.referral.key, callback_data: botEnum.referral.value },
			],
			// [
			// 	{ text: 'Mix SOL with $DJBONK', url: 'https://t.me/djbonk_bot' },
			// ]
		]
	};
}

export function verifyLink(telegramId: string) {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.verifyLink,
					callback_data: botEnum.verifyLink
				}
			]
		]
	};
}

export function disconnectWallet(chain: any) {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.confirmDisconnect.key,
					callback_data: botEnum.confirmDisconnect.value + '_' + chain,
				},
				{
					text: botEnum.generate_wallet.key,
					callback_data: botEnum.generate_wallet.value + '_' + chain
				}
			],
			[
				{
					text: botEnum.wallets.key,
					callback_data: botEnum.wallets.value
				}
			]
		]
	};
}

export function walletConfigMarkup() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: 'Solana',
					callback_data: botEnum.select_chain.value + '_' + 'solana'
				}
			]
		]
	};
}

export function markupWalletConnected(telegramId: string, chain: string) {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.disconnectWallet.key,
					callback_data: botEnum.disconnectWallet.value + '_' + chain
				},
				{
					text: '↩️',
					callback_data: botEnum.wallets.value
				}
			],
			[
				{
					text: botEnum.generate_wallet.key,
					callback_data: botEnum.generate_wallet.value + '_' + chain
				},
				{
					text: botEnum.multiWallet.key,
					callback_data: `multi_wallet_chain?${chain}_page?1_limit?4`
				}
			]
		]
	};
}

export function markupWalletDisconnected(telegramId: string, chain: string) {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.connect_wallet.key,
					callback_data: botEnum.connect_wallet.value + '_' + chain
				},
				{
					text: '↩️',
					callback_data: botEnum.wallets.value
				}
			],
			[
				{
					text: botEnum.generate_wallet.key,
					callback_data: botEnum.generate_wallet.value + '_' + chain
				}
			]
		]
	};
}

export function markupMultiWalletMainDefault(telegramId: string, chain: string, isMultiWallet: Boolean) {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: `${!isMultiWallet ? '❌' : '✅'} Multi-Wallet`,
					callback_data: !isMultiWallet ? `${botEnum.enableMultiWallet}_chain?${chain}_Id?q_page?1_limit?4` : `${botEnum.disableMultiWallet}_chain?${chain}_Id?q_page?1_limit?4`
				},
				{
					text: '↩️',
					callback_data: botEnum.select_chain.value + '_' + chain
				}
			],
			[
				{
					text: botEnum.multiWalletConnectWallet.key,
					callback_data: botEnum.multiWalletConnectWallet.value + '_' + chain
				},
				{
					text: botEnum.multiWalletGenerateWallet.key,
					callback_data: botEnum.multiWalletGenerateWallet.value + '_' + chain
				}
			]
		]
	};
}

export function markupMultiWalletMainPaginate(telegramId: string, chain: string, isMultiWallet: Boolean, data: IAddressPagination) {
	let address1D = [];
	let address2D = [];
	let paginationButtons = [[]];

	let page = data.metaData[0].pageNumber;
	page++;
	let totalPages = data.metaData[0].totalPages++;
	let prevPage = page - 1;
	let nextPage = page + 1;

	for (let address of data.data) {
		address1D.push({
			text: `🛠 ${address.name}`,
			callback_data: `${botEnum.manage_additional_dynamic_address}_chain?${chain}_Id?${address._id.toString()}_page?${page}_limit?${4}`
		});
	}

	while (address1D.length) address2D.push(address1D.splice(0, 2));

	if (page > 1) {
		paginationButtons[0].push({
			text: botEnum.multiWalletPaginationPrev.key,
			callback_data: `multi_wallet_chain?${chain}_page?${prevPage}_limit?4`
		});
	}

	// for (let pageLength = pageBefore; pageLength < pageAfter; pageLength++) {
	//     paginationButtons[0].push({
	//         text: `${(pageLength + 1)}`,
	//         callback_data: `${botEnum.multi_wallet_pagination_to_page}_${(pageLength + 1)}`
	//     })

	// }

	paginationButtons[0].push({
		text: `${page} of ${totalPages}`,
		callback_data: `multi_wallet_chain?${chain}_page?${page}_limit?4`
	});

	if (page < totalPages) {
		paginationButtons[0].push({
			text: botEnum.multiWalletPaginationNext.key,
			callback_data: `multi_wallet_chain?${chain}_page?${nextPage}_limit?4`
		});
	}

	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: `${!isMultiWallet ? '❌' : '✅'} Multi-Wallet`,
					callback_data: !isMultiWallet ? `${botEnum.enableMultiWallet}_chain?${chain}_page?${page}_limit?${4}` : `${botEnum.disableMultiWallet}_chain?${chain}_page?${page}_limit?${4}`
				},
				{
					text: '↩️',
					callback_data: botEnum.select_chain.value + '_' + chain
				}
			],
			[
				{
					text: botEnum.multiWalletConnectWallet.key,
					callback_data: botEnum.multiWalletConnectWallet.value + '_' + chain
				},
				{
					text: botEnum.multiWalletGenerateWallet.key,
					callback_data: botEnum.multiWalletGenerateWallet.value + '_' + chain
				}
			],
			...address2D,
			...paginationButtons
		]
	};
}

export async function manageAdditionalDynamicWalletMainMenu(telegramId: string, chain: string, address: any, confirmDelete?: boolean, page?: IPageAndLimit) {
	let enableDisabledText = `${address.connected ? '☑️ Enabled' : '❌ Disabled'}`;
	let enableDisabledCallback = address.connected ?
		`qwa_ev_chain?${chain}_Id?${address._id.toString()}_page?${page.page || 1}_limit?${page.limit || 4}`
		:
		`qwa_e_chain?${chain}_Id?${address._id.toString()}_page?${page.page || 1}_limit?${page.limit || 4}`

	let isDeleteOrConfirmDeleteText;
	let isDeleteOrConfirmDeleteCallback;
	if (confirmDelete == null || typeof confirmDelete == undefined || confirmDelete == false) {
		isDeleteOrConfirmDeleteText = `❌ Delete`;
		isDeleteOrConfirmDeleteCallback = `${botEnum.delete_additional_address.value}_chain?${chain}_Id?${address._id.toString()}_page?${page.page || 1}_limit?${page.limit || 4}`;
	} else if (confirmDelete) {
		isDeleteOrConfirmDeleteText = `❌ Confirm`;
		isDeleteOrConfirmDeleteCallback = `${botEnum.additional_address_confirm_delete}_chain?${chain}_Id?${address._id.toString()}_page?${page.page || 1}_limit?${page.limit || 4}`;
	}

	const symbol = await getNativeCurrencySymbol(chain);

	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: enableDisabledText,
					callback_data: enableDisabledCallback
				},
				{
					text: '↩️',
					callback_data: botEnum.multiWalletReturn.value + '_' + chain
				}
			],
			[
				{
					text: `💰 ${symbol}`,
					callback_data: `${botEnum.transferNativeCurrency.value}_chain?${chain}_Id?${address._id.toString()}_page?${page.page || 1}_limit?${page.limit || 4}`
				},
				{
					text: `💰 Tokens`,
					callback_data: `${botEnum.transferToken.value}_chain?${chain}_Id?${address._id.toString()}_page?${page.page || 1}_limit?${page.limit || 4}`
				}
			],
			[
				{
					text: botEnum.rename_additional_address.key,
					callback_data: `${botEnum.rename_additional_address.value}_chain?${chain}_Id?${address._id.toString()}_page?${page.page || 1}_limit?${page.limit || 4}`
				},
				{
					text: isDeleteOrConfirmDeleteText,
					callback_data: isDeleteOrConfirmDeleteCallback
				}
			]
		]
	};
}

export async function getTrackMarkup(telegramId: string, chain: string, token: string, showOther?: string) {
	const isAS = await isTokenAutoSellSet(telegramId, chain, token);
	let autoSellCtx;
	if (isAS === true) autoSellCtx = await getTokenAutoSellContext(telegramId, chain, token);

	const isAB = await isTokenAutoBuySet(telegramId, chain, token);
	let autoBuyCtx;
	if (isAB === true) autoBuyCtx = await getTokenAutoBuyContext(telegramId, chain, token);

	const url = await getTokenExternalURL(chain, token)

	const track = await getTrackByToken(telegramId, chain, token)
	const tokenInfo = await SolanaTokenInfoModel.findOne({ chain: chain, address: token })
	const tokenSymbol = tokenInfo.symbol
	const nativeSymbol = await getNativeCurrencySymbol(chain)

	const buyTokenInlineKeyboard = [
		[
			{
				text: botEnum.buyASOL.key + ' ' + nativeSymbol,
				callback_data: botEnum.buyASOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.buyBSOL.key + ' ' + nativeSymbol,
				callback_data: botEnum.buyBSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			}
		],
		[
			{
				text: botEnum.buyCSOL.key + ' ' + nativeSymbol,
				callback_data: botEnum.buyCSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.buyDSOL.key + ' ' + nativeSymbol,
				callback_data: botEnum.buyDSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			}
		],
		[
			{
				text: botEnum.buyESOL.key + ' ' + nativeSymbol,
				callback_data: botEnum.buyESOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.buyFSOL.key + ' ' + nativeSymbol,
				callback_data: botEnum.buyFSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			}
		],
		[
			{
				text: botEnum.buyXETH.key + ' ' + nativeSymbol,
				callback_data: botEnum.buyXETH.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.buyApeMax.key,
				callback_data: botEnum.buyApeMax.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.buyXToken.key + ' ' + tokenSymbol,
				callback_data: botEnum.buyXToken.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			}
		]
	]

	const sellTokenInlineKeyboard = [
		[
			{
				text: botEnum.sellToken25Percent.key,
				callback_data: botEnum.sellToken25Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.sellToken50Percent.key,
				callback_data: botEnum.sellToken50Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.sellToken75Percent.key,
				callback_data: botEnum.sellToken75Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.sellToken100Percent.key,
				callback_data: botEnum.sellToken100Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			}
		],
		[
			{
				text: botEnum.sellTokenMaxTX.key,
				callback_data: botEnum.sellTokenMaxTX.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.sellTokenForXETH.key + ' ' + nativeSymbol,
				callback_data: botEnum.sellTokenForXETH.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: botEnum.sellTokenX.key + ' ' + tokenSymbol,
				callback_data: botEnum.sellTokenX.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			}
		]
	]

	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.prevTrack.key,
					callback_data: botEnum.prevTrack.value + '_' + ((track === null) ? '' : track._id.toString())
				},
				{
					text: botEnum.refreshTrack.key + ' ' + tokenSymbol,
					callback_data: botEnum.refreshTrack.value + '_' + ((track === null) ? '' : track._id.toString())
				},
				{
					text: botEnum.nextTrack.key,
					callback_data: botEnum.nextTrack.value + '_' + ((track === null) ? '' : track._id.toString())
				}
			],
			[
				{
					text: botEnum.registerSnipe.key,
					callback_data: botEnum.registerSnipe.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				},
				{
					text: `📈 ${botEnum.chart.key}`,
					url: url
				}
			],
			[
				// {
				//     text: botEnum.antiRugTrack.key,
				//     callback_data: botEnum.antiRugTrack.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				// },
				{
					text: (isAS === true ? '🟢 ' : '❌ ') + botEnum.autoSellTrack.key,
					callback_data: botEnum.autoSellTrack.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				},
				// {
				//     text: botEnum.trailingTrack.key,
				//     callback_data: botEnum.trailingTrack.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				// }
			],
			[
				{
					text: (isAB === true ? '🟢 ' : '❌ ') + botEnum.buyDipTrack.key,
					callback_data: botEnum.buyDipTrack.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				}
			],
			[
				{
					text: showOther === 'buy'? botEnum.track_switch_to_sell.key: botEnum.track_switch_to_buy.key,
					callback_data: (showOther === 'buy'? botEnum.track_switch_to_sell.value: botEnum.track_switch_to_buy.value) + '_' + ((track === null) ? '' : track._id.toString())
				}
			],
			...(showOther === 'buy' ? buyTokenInlineKeyboard : sellTokenInlineKeyboard),
			[
				{
					text: botEnum.resetTracks.key,
					callback_data: botEnum.resetTracks.value
				},
				{
					text: botEnum.enableTrack.key,
					callback_data: botEnum.enableTrack.value + '_' + ((track === null) ? '' : track._id.toString())
				},
				{
					text: botEnum.stopTrack.key,
					callback_data: botEnum.stopTrack.value + '_' + ((track === null) ? '' : track._id.toString())
				},
				{
					text: botEnum.deleteTrack.key,
					callback_data: botEnum.deleteTrack.value + '_' + ((track === null) ? '' : track._id.toString())
				}
			]
		]
	};
}

export async function getTokenPasteMarkup(telegramId: string, mode: string, chain: string, symbol: string, tokenSymbol: string, tokenAddress: string) {
	let url = await getTokenExternalURL(chain, tokenAddress)

	const tokenInfo = await getTokenInfo(chain, tokenAddress)

	const defArray = [
		[
			{
				text: botEnum.menu.key,
				callback_data: botEnum.menu.value
			},
			{
				text: botEnum.dismiss.key,
				callback_data: botEnum.dismiss.value
			}
		],
		[
			{
				text: botEnum.registerSnipe.key,
				callback_data: botEnum.registerSnipe.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			}
		],
		[
			{
				text: botEnum.track.key,
				callback_data: botEnum.track.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
			},
			{
				text: `🔄 ${tokenInfo.symbol}`,
				callback_data: botEnum.token_refresh.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString()),
			}
		],
		[
			// {
			//     text: `💳 ${botEnum.menu.key}`,
			//     callback_data: botEnum.menu.value
			// },
			{
				text: `📈 ${botEnum.chart.key}`,
				url: url
			},
			{
				text: mode === 'buy' ? botEnum.switch_to_sell.key : mode === 'sell' ? botEnum.switch_to_buy.key : "❌",
				callback_data: mode === 'buy' ? botEnum.switch_to_sell.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString()) : mode === 'sell' ? botEnum.switch_to_buy.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString()) : ''
			}
		]
	]

	if (mode === 'buy') {
		return {
			inline_keyboard: [
				...defArray,
				[
					{
						text: botEnum.buyASOL.key + ' ' + symbol,
						callback_data: botEnum.buyASOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.buyBSOL.key + ' ' + symbol,
						callback_data: botEnum.buyBSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					}
				],
				[
					{
						text: botEnum.buyCSOL.key + ' ' + symbol,
						callback_data: botEnum.buyCSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.buyDSOL.key + ' ' + symbol,
						callback_data: botEnum.buyDSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					}
				],
				[
					{
						text: botEnum.buyESOL.key + ' ' + symbol,
						callback_data: botEnum.buyESOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.buyFSOL.key + ' ' + symbol,
						callback_data: botEnum.buyFSOL.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					}
				],
				[
					{
						text: botEnum.buyXETH.key + ' ' + symbol,
						callback_data: botEnum.buyXETH.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.buyApeMax.key,
						callback_data: botEnum.buyApeMax.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.buyXToken.key + ' ' + tokenSymbol,
						callback_data: botEnum.buyXToken.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					}
				]
			]
		};
	} else if (mode === 'sell') {
		return {
			inline_keyboard: [
				...defArray,
				[
					{
						text: botEnum.sellToken25Percent.key,
						callback_data: botEnum.sellToken25Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.sellToken50Percent.key,
						callback_data: botEnum.sellToken50Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					}
				],
				[
					{
						text: botEnum.sellToken75Percent.key,
						callback_data: botEnum.sellToken75Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.sellToken100Percent.key,
						callback_data: botEnum.sellToken100Percent.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					}
				],
				[
					{
						text: botEnum.sellTokenMaxTX.key,
						callback_data: botEnum.sellTokenMaxTX.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.sellTokenForXETH.key + ' ' + symbol,
						callback_data: botEnum.sellTokenForXETH.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					},
					{
						text: botEnum.sellTokenX.key + ' ' + tokenSymbol,
						callback_data: botEnum.sellTokenX.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
					}
				]
			]
		};
	} else {
		return {
			inline_keyboard: defArray
		}
	}
}

export async function getQuickMarkup(telegramId: string, chain: string) {
	let tt = [];
	const quickItem = await getQuickAutoBuyContext(telegramId, chain)
	const nativeSymbol = await getNativeCurrencySymbol(chain)
	// for (const ch of chains)
	{
		tt = [
			...tt,
			[
				{
					text: botEnum.prevQuickChain.key,
					callback_data: botEnum.prevQuickChain.value + '_' + chain,
				},
				{
					text: '🛠 ' + chain.toUpperCase(),
					callback_data: botEnum.quickChainLabel + '_' + chain
				},
				{
					text: botEnum.nextQuickChain.key,
					callback_data: botEnum.nextQuickChain.value + '_' + chain,
				}
			],
			[
				{
					text: (quickItem.enabled === true ? '✅' : '❌') + ' Auto-Buy Pasted CA',
					callback_data: botEnum.autoBuyPastedContract + '_' + chain,
				}
			],
			[
				{
					text: '✏️ ' + nativeSymbol + ' Amount to Buy Pasted-CA',
					callback_data: botEnum.pastedContractBuyAmount + '_' + chain,
				}
			],
			[
				{
					text: (quickItem.multi === true ? '✅' : '❌') + ' Multi',
					callback_data: botEnum.quickChainMulti + '_' + chain,
				},
				// {
				// 	text: (quickItem.smartSlippage === true ? '✅' : '❌') + ' Smart Slippage',
				// 	callback_data: botEnum.quickChainSmartSlippage + '_' + chain,
				// }
				// ],
				// [
				// 	{
				// 		text: chain === 'ethereum' ? '✏️ Buy Gas Delta' : '✏️ Buy Gas Price',
				// 		callback_data: botEnum.quickBuyGas + '_' + chain,
				// 	},
				{
					text: '✏️ Slippage',
					callback_data: botEnum.quickSlippage + '_' + chain,
				}
			]
		];
	}

	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			...tt
		]
	};
}

export function affiliateNotFound() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.setupAffiliate.key,
					callback_data: botEnum.setupAffiliate.value
				},
				{
					text: '↩️',
					callback_data: botEnum.menu.value
				}
			]
		]
	};
}

export function affiliateMainMenu() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.deleteAffiliate.key,
					callback_data: botEnum.deleteAffiliate.value
				},
				{
					text: '↩️',
					callback_data: botEnum.menu.value
				}
			]
		]
	};
}

export async function getSnipeTokenMarkup(telegramId: string, snipe: any, method: string) {
	const BN = getBN()
	const defSetting = getDefaultSnipeSetting(telegramId, 'solana')

	if (snipe === null || snipe === undefined) {
		return {
			inline_keyboard: [
				[
					{
						text: botEnum.menu.key,
						callback_data: botEnum.menu.value
					},
					{
						text: botEnum.dismiss.key,
						callback_data: botEnum.dismiss.value
					}
				],
				[
					{
						text: botEnum.addSnipe.key,
						callback_data: botEnum.addSnipe.value
					}
				],
				// [
				// 	{
				// 		text: (defSetting.multi === true ? '✅ ' : '❌ ') + botEnum.snipeMulti.key,
				// 		callback_data: 'undefined'
				// 	},
				// 	// {
				// 	// 	text: (primary.maxTx === true ? '✅ ' : '❌ ') + botEnum.toggleAutoMaxTx.key,
				// 	// 	callback_data: botEnum.toggleAutoMaxTx.value + '_' + snipe._id.toString()
				// 	// },
				// 	{
				// 		text: 'Snipe Amount: ' + defSetting.nativeCurrencyAmount,
				// 		callback_data: 'undefined'
				// 	},
				// 	// {
				// 	// 	text: (primary.tokenAmount || '0') + (!primary.tokenAmount || primary.tokenAmount.indexOf('%') < 0 ? ' ' + primary.token.symbol : ''),
				// 	// 	callback_data: botEnum.snipeTokenAmount.value + '_' + snipe._id.toString()
				// 	// },
				// ],
				// [
				// 	// {
				// 	//     text: botEnum.snipeSlippage.key + ' ' + snipe.slippage + '%',
				// 	//     callback_data: botEnum.snipeSlippage.value + '_' + snipe._id.toString()
				// 	// },
				// 	{
				// 		text: botEnum.snipeMaxComputeUnits.key + ` (${defSetting.maxComputeUnits})`,
				// 		callback_data: 'undefined'
				// 	},
				// ],
				// [
				// 	{
				// 		text: botEnum.snipeComputeUnitPrice.key + ` (${BN(defSetting.computeUnitPrice).div(BN('1e6')).toString()} lamports)`,
				// 		callback_data: 'undefined'
				// 	}
				// ]
			]
		};
	}

	const primary = await snipe.populate('token')
	const nativeSymbol = await getNativeCurrencySymbol(snipe.token.chain)
	const userSetting = await getSettings(telegramId, snipe.token.chain)
	const defaultTip = parseInt(await getCUPriceByPreset(1000000, userSetting.gasPreset))


	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.deleteSnipe.key,
					callback_data: botEnum.deleteSnipe.value + '_' + snipe._id.toString()
				},
				{
					text: primary.disabled === true ? '❌ Disabled' : '✅ Enabled',
					callback_data: botEnum.enableSnipe.value + '_' + snipe._id.toString()
				}
			],
			[
				{
					text: botEnum.addSnipe.key,
					callback_data: botEnum.addSnipe.value
				}
			],
			[
				{
					text: botEnum.prevSnipe.key,
					callback_data: botEnum.prevSnipe.value + '_' + snipe._id.toString()
				},
				{
					text: botEnum.refreshSnipe.key + ' ' + primary.token.symbol,
					callback_data: botEnum.refreshSnipe.value + '_' + snipe._id.toString()
				},
				{
					text: botEnum.nextSnipe.key,
					callback_data: botEnum.nextSnipe.value + '_' + snipe._id.toString()
				}
			],
			[
				{
					text: botEnum.snipeDefaultSetting.key,
					callback_data: botEnum.snipeDefaultSetting.value + '_' + snipe._id.toString()
				}
			],
			[
				{
					text: (primary.multi === true ? '✅ ' : '❌ ') + botEnum.snipeMulti.key,
					callback_data: botEnum.snipeMulti.value + '_' + snipe._id.toString()
				},
				// {
				// 	text: (primary.maxTx === true ? '✅ ' : '❌ ') + botEnum.toggleAutoMaxTx.key,
				// 	callback_data: botEnum.toggleAutoMaxTx.value + '_' + snipe._id.toString()
				// },
				{
					text: 'Snipe Amount: ' + primary.nativeCurrencyAmount + (primary.nativeCurrencyAmount.indexOf('%') < 0? ` ${nativeSymbol}`: ''),
					callback_data: botEnum.snipeETHAmount.value + '_' + snipe._id.toString()
				},
				// {
				// 	text: (primary.tokenAmount || '0') + (!primary.tokenAmount || primary.tokenAmount.indexOf('%') < 0 ? ' ' + primary.token.symbol : ''),
				// 	callback_data: botEnum.snipeTokenAmount.value + '_' + snipe._id.toString()
				// },
			],
			// [
			// 	// {
			// 	//     text: botEnum.snipeSlippage.key + ' ' + snipe.slippage + '%',
			// 	//     callback_data: botEnum.snipeSlippage.value + '_' + snipe._id.toString()
			// 	// },
			// 	{
			// 		text: botEnum.snipeMaxComputeUnits.key + ` (${primary.maxComputeUnits})`,
			// 		callback_data: botEnum.snipeMaxComputeUnits.value + '_' + snipe._id.toString()
			// 	},
			// ],
			// [
			// 	{
			// 		text: botEnum.snipeComputeUnitPrice.key + ` (${BN(primary.computeUnitPrice).div(BN('1e6')).toString()} lamports)`,
			// 		callback_data: botEnum.snipeComputeUnitPrice.value + '_' + snipe._id.toString()
			// 	}
			// ],
			[
				{
					text: botEnum.snipePriorityFee.key + ` (${primary.priorityFee || BN(defaultTip).div(BN('1e9').toString())} SOL)`,
					callback_data: botEnum.snipePriorityFee.value + '_' + snipe._id.toString()
				}
			],
			[
				{
					text: botEnum.snipeGasPresetSlow.key,
					callback_data: botEnum.snipeGasPresetSlow.value + '_' + snipe._id.toString()
				},
				{
					text: botEnum.snipeGasPresetAverage.key,
					callback_data: botEnum.snipeGasPresetAverage.value + '_' + snipe._id.toString()
				}
			],
			[
				{
					text: botEnum.snipeGasPresetFast.key,
					callback_data: botEnum.snipeGasPresetFast.value + '_' + snipe._id.toString()
				},
				{
					text: botEnum.snipeGasPresetMaxSpeed.key,
					callback_data: botEnum.snipeGasPresetMaxSpeed.value + '_' + snipe._id.toString()
				}
			]
		]
	};
}

export async function affiliateEarningsSummaryMarkup() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.affiliateRename.key,
					callback_data: botEnum.affiliateRename.value
				},
				{
					text: botEnum.affiliateRefresh.key,
					callback_data: botEnum.affiliateRefresh.value,
				},
				{
					text: botEnum.affiliateDelete.key,
					callback_data: botEnum.affiliateDelete.value
				}
			]
		]
	};
}

export async function affiliateEarningsSummaryConfirmDeleteMarkup() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.withdrawAffiliate.key,
					callback_data: botEnum.withdrawAffiliate.value
				},
				{
					text: '↩️',
					callback_data: botEnum.menu.value
				}
			],
			[
				{
					text: botEnum.affiliateRename.key,
					callback_data: botEnum.affiliateRename.value
				},
				{
					text: botEnum.affiliateConfirmDelete.key,
					callback_data: botEnum.affiliateConfirmDelete.value
				}
			]
		]
	};
}

export async function getCopyTradeMarkup(telegramId: string, chain: string) {
	const addresses = await getCopyTradeAddresses(telegramId, chain)

	const tMore = addresses.map((a) => {
		return [
			{
				text: '🛠 ' + a.name,
				callback_data: botEnum.copyTradeMoreSetting + '_' + a._id.toString()
			},
			{
				text: 'Rename',
				callback_data: botEnum.copyTradeRename + '_' + a._id.toString()
			},
			{
				text: a.state === 'on' ? '🟢 ON' : '🔴 OFF',
				callback_data: botEnum.copyTradeOnOff + '_' + a._id.toString()
			},
			{
				text: '❌',
				callback_data: botEnum.copyTradeDelete + '_' + a._id.toString()
			}
		];
	});

	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.prevCopyTradeChain.key,
					callback_data: botEnum.prevCopyTradeChain.value + '_' + chain
				},
				{
					text: '🛠 ' + chain.toUpperCase(),
					callback_data: botEnum.copyTradeChainLabel + '_' + chain
				},
				{
					text: botEnum.nextCopyTradeChain.key,
					callback_data: botEnum.nextCopyTradeChain.value + '_' + chain
				}
			],
			[
				{
					text: botEnum.copyTradeAddWallet.key,
					callback_data: botEnum.copyTradeAddWallet.value + '_' + chain
				}
			],
			...tMore
		]
	};
}

export async function getSettingsMarkup(telegramId: string, chain: string, mode: string) {
	const tSetting = await getSettings(telegramId, chain)

	const gasPresetMarkup = await getBotGasPresetsMarkup(telegramId, chain)

	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.prevSettingsChain.key,
					callback_data: botEnum.prevSettingsChain.value + '_' + chain
				},
				{
					text: '🛠 ' + chain.toUpperCase(),
					callback_data: botEnum.settingsChainLabel
				},
				{
					text: botEnum.nextSettingsChain.key,
					callback_data: botEnum.nextSettingsChain.value + '_' + chain
				}
			],
			...gasPresetMarkup.inline_keyboard.slice(2),
			[
				{
					text: botEnum.settingsPriorityGas.key,
					callback_data: botEnum.settingsPriorityGas.value + '_' + chain
				},
				{
					text: botEnum.settingsPriorityGasRemove.key,
					callback_data: botEnum.settingsPriorityGasRemove.value + '_' + chain
				}
			],
			[
				{
					text: botEnum.settingsSlippage.key,
					callback_data: botEnum.settingsSlippage.value + '_' + chain
				},
				{
					text: botEnum.settingsSlippageRemove.key,
					callback_data: botEnum.settingsSlippageRemove.value + '_' + chain
				}
			]
		]
	}
}

export async function getBotGasPresetsMarkup(telegramId: string, chain: string) {
	const tSetting = await getSettings(telegramId, chain)
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.prevSettingsGasPresetChain.key,
					callback_data: botEnum.prevSettingsGasPresetChain.value + '_' + chain
				},
				{
					text: '🛠 ' + chain.slice(0, 3).toUpperCase(),
					callback_data: botEnum.settingsChainLabel
				},
				{
					text: botEnum.nextSettingsGasPresetChain.key,
					callback_data: botEnum.nextSettingsGasPresetChain.value + '_' + chain
				}
			],
			[
				{
					text: (tSetting.gasPreset === 'slow' ? '✅ ' : '❌ ') + botEnum.settingsGasPresetSlow.key,
					callback_data: botEnum.settingsGasPresetSlow.value + '_' + chain
				},
				{
					text: (tSetting.gasPreset === 'avg' ? '✅ ' : '❌ ') + botEnum.settingsGasPresetFast.key,
					callback_data: botEnum.settingsGasPresetFast.value + '_' + chain
				},
			],
			[
				{
					text: ((tSetting.gasPreset || 'fast') === 'fast' ? '✅ ' : '❌ ') + botEnum.settingsGasPresetAverage.key,
					callback_data: botEnum.settingsGasPresetAverage.value + '_' + chain
				},
				{
					text: (tSetting.gasPreset === 'max' ? '✅ ' : '❌ ') + botEnum.settingsGasPresetMaxSpeed.key,
					callback_data: botEnum.settingsGasPresetMaxSpeed.value + '_' + chain
				},
			],
		]
	}
}

export async function getChainStateMarkup() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.eth_state.key,
					callback_data: botEnum.eth_state.value
				},
				{
					text: botEnum.arb_state.key,
					callback_data: botEnum.arb_state.value
				},
				{
					text: botEnum.bsc_state.key,
					callback_data: botEnum.bsc_state.value
				},
				{
					text: botEnum.base_state.key,
					callback_data: botEnum.base_state.value
				}
			]
		]
	}
}

export async function getZkProofMixerMarkup(telegramId: string, chain: string) {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.mix.key,
					callback_data: botEnum.mix.value + '_' + chain
				},
				{
					text: botEnum.retrieve.key,
					callback_data: botEnum.retrieve.value + '_' + chain
				}
			]
		]
	}
}

export async function getMixMarkup(telegramId: string, chain: string) {
	const nativeSymbol = await getNativeCurrencySymbol(chain)
	const w = await getWallet(telegramId)
	const bal = await getETHBalance(telegramId, chain, w.address)
	const BN = getBN()

	return {
		inline_keyboard: [
			[
				{
					text: '↩️',
					callback_data: botEnum.zkProof.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: (BN(bal).gte(BN(botEnum.mix_0_1.key)) ? '💰 ' : '❌ ') + botEnum.mix_0_1.key + ' ' + nativeSymbol,
					callback_data: botEnum.mix_0_1.value + '_' + chain
				},
				{
					text: (BN(bal).gte(BN(botEnum.mix_0_2.key)) ? '💰 ' : '❌ ') + botEnum.mix_0_2.key + ' ' + nativeSymbol,
					callback_data: botEnum.mix_0_2.value + '_' + chain
				},
				{
					text: (BN(bal).gte(BN(botEnum.mix_0_5.key)) ? '💰 ' : '❌ ') + botEnum.mix_0_5.key + ' ' + nativeSymbol,
					callback_data: botEnum.mix_0_5.value + '_' + chain
				}
			],
			[
				{
					text: (BN(bal).gte(BN(botEnum.mix_1.key)) ? '💰 ' : '❌ ') + botEnum.mix_1.key + ' ' + nativeSymbol,
					callback_data: botEnum.mix_1.value + '_' + chain
				},
				{
					text: (BN(bal).gte(BN(botEnum.mix_5.key)) ? '💰 ' : '❌ ') + botEnum.mix_5.key + ' ' + nativeSymbol,
					callback_data: botEnum.mix_5.value + '_' + chain
				},
				{
					text: (BN(bal).gte(BN(botEnum.mix_10.key)) ? '💰 ' : '❌ ') + botEnum.mix_10.key + ' ' + nativeSymbol,
					callback_data: botEnum.mix_10.value + '_' + chain
				}
			]
		]
	}
}


export async function getRetrieveMarkup(telegramId: string, chain: string) {
	const nativeSymbol = await getNativeCurrencySymbol(chain)

	return {
		inline_keyboard: [
			[
				{
					text: '↩️',
					callback_data: botEnum.zkProof.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.retrieve_0_1.key + ' ' + nativeSymbol,
					callback_data: botEnum.retrieve_0_1.value + '_' + chain
				},
				{
					text: botEnum.retrieve_0_2.key + ' ' + nativeSymbol,
					callback_data: botEnum.retrieve_0_2.value + '_' + chain
				},
				{
					text: botEnum.retrieve_0_5.key + ' ' + nativeSymbol,
					callback_data: botEnum.retrieve_0_5.value + '_' + chain
				}
			],
			[
				{
					text: botEnum.retrieve_1.key + ' ' + nativeSymbol,
					callback_data: botEnum.retrieve_1.value + '_' + chain
				},
				{
					text: botEnum.retrieve_5.key + ' ' + nativeSymbol,
					callback_data: botEnum.retrieve_5.value + '_' + chain
				},
				{
					text: botEnum.retrieve_10.key + ' ' + nativeSymbol,
					callback_data: botEnum.retrieve_10.value + '_' + chain
				}
			]
		]
	}
}

export async function getReferralMarkup() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.referralWallet.key,
					callback_data: botEnum.referralWallet.value
				}
			],
			[
				{
					text: botEnum.referralGenerateToken.key,
					callback_data: botEnum.referralGenerateToken.value
				}
			]
		]
	}
}

export async function getAutoTradeMarkup(telegramId: string, chain: string, tokenToFocus?: string) {
	const autoSellContexts = await getAutoSellContexts(telegramId, chain)
	const autoBuyContexts = await getAutoBuyContexts(telegramId, chain)

	const ta = [...autoSellContexts.map(as => as.token), ...autoBuyContexts.map(ab => ab.token)]
	const tokens = ta.filter((t, idx) => idx === ta.indexOf(t))

	const defaultInlineMarkup = [
		[
			{
				text: botEnum.menu.key,
				callback_data: botEnum.menu.value
			},
			{
				text: botEnum.dismiss.key,
				callback_data: botEnum.dismiss.value
			}
		],
		[
			{
				text: botEnum.addAutoTrade.key,
				callback_data: botEnum.addAutoTrade.value
			},
			{
				text: '↩️',
				callback_data: botEnum.addAutoTradeReturn.value + '_' + tokenToFocus
			}
		],
	]

	if (!tokenToFocus) {
		if (autoSellContexts.length > 0) {
			tokenToFocus = autoSellContexts[0].token
		} else if (autoBuyContexts.length > 0) {
			tokenToFocus = autoBuyContexts[0].token
		}
	}

	if (tokens.length === 0 || !tokenToFocus) return {
		inline_keyboard: defaultInlineMarkup
	}

	if (!tokens.find(t => t === tokenToFocus)) {
		throw new Error(`${chain}:${tokenToFocus} not configured to auto trade`)
	}

	const asRecord = autoSellContexts.find(as => as.token === tokenToFocus)
	const abRecord = autoBuyContexts.find(ab => ab.token === tokenToFocus)
	const tokenInfo = await getTokenInfo(chain, tokenToFocus)

	const idx = tokens.indexOf(tokenToFocus)
	const prevToken = tokens[(idx + tokens.length - 1) % tokens.length]
	const nextToken = tokens[(idx + 1) % tokens.length]
	const nativeSymbol = await getNativeCurrencySymbol(chain)

	return {
		inline_keyboard: [
			...defaultInlineMarkup,
			[
				{
					text: botEnum.prevAutoTradeToken.key,
					callback_data: botEnum.prevAutoTradeToken.value + '_' + prevToken
				},
				{
					text: tokenInfo.symbol,
					callback_data: 'undefined'
				},
				{
					text: botEnum.nextAutoTradeToken.key,
					callback_data: botEnum.nextAutoTradeToken.value + '_' + nextToken
				}
			],
			[
				// {
				//     text: botEnum.antiRugTrack.key,
				//     callback_data: botEnum.antiRugTrack.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				// },
				{
					text: (asRecord ? '🟢 ' : '❌ ') + botEnum.autoTradeSell.key,
					callback_data: botEnum.autoTradeSell.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				},
				// {
				//     text: botEnum.trailingTrack.key,
				//     callback_data: botEnum.trailingTrack.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				// }
			],
			...(asRecord ?
				[[
					{
						text: `Price (${asRecord.lowPriceLimit})`,
						callback_data: botEnum.trackAutoSellLowPriceLimitUnified + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
					},
					{
						text: `◀ SL ▶`,
						callback_data: 'undefined'//botEnum.autoSellLowPriceLimit.value + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
					},
					{
						text: `Amount (${asRecord.amountAtLowPrice})`,
						callback_data: botEnum.autoSellAmountAtLowPrice + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
					},
				],
				// [
				// 	{
				// 		text: '%',
				// 		callback_data: botEnum.trackAutoSellLowPriceLimitPercentage + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	},
				// 	{
				// 		text: 'Price',
				// 		callback_data: botEnum.trackAutoSellLowPriceLimitUsd + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	},
				// 	{
				// 		text: 'MC',
				// 		callback_data: botEnum.trackAutoSellLowPriceLimitMarketcap + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	}
				// ],
				// [
				// 	{
				// 		text: asRecord.amountAtLowPrice,
				// 		callback_data: botEnum.autoSellAmountAtLowPrice + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	},
				// 	{
				// 		text: '◀ SL Amount',
				// 		callback_data: 'undefined'//botEnum.autoSellAmountSwitch.value + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	}
				// ],
				[
					{
						text: `Price (${asRecord.highPriceLimit})`,
						callback_data: botEnum.trackAutoSellHighPriceLimitUnified + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
					},
					{
						text: `◀ TP ▶`,
						callback_data: 'undefined'//botEnum.autoSellHighPriceLimit.value + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
					},
					{
						text: `Amount (${asRecord.amountAtHighPrice})`,
						callback_data: botEnum.autoSellAmountAtHighPrice + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
					}
				],
				// [
				// 	{
				// 		text: '%',
				// 		callback_data: botEnum.trackAutoSellHighPriceLimitPercentage + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	},
				// 	{
				// 		text: 'Price',
				// 		callback_data: botEnum.trackAutoSellHighPriceLimitUsd + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	},
				// 	{
				// 		text: 'MC',
				// 		callback_data: botEnum.trackAutoSellHighPriceLimitMarketcap + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	}
				// ],
				// [
				// 	{
				// 		text: 'TP Amount ▶',
				// 		callback_data: 'undefined'//botEnum.autoSellAmountSwitch.value + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	},
				// 	{
				// 		text: asRecord.amountAtHighPrice,
				// 		callback_data: botEnum.autoSellAmountAtHighPrice + '_' + ((asRecord === null) ? '' : asRecord._id.toString())
				// 	}
				// ]
			]
				: [[]]),
			[
				{
					text: (abRecord ? '🟢 ' : '❌ ') + botEnum.autoTradeBuy.key,
					callback_data: botEnum.autoTradeBuy.value + '_' + ((tokenInfo === null) ? '' : tokenInfo._id.toString())
				}
			],
			...(abRecord ? [
				[
					{
						text: `Price (${abRecord.priceLimit})`,
						callback_data: botEnum.trackAutoBuyPriceLimitUnified + '_' + ((abRecord === null) ? '' : abRecord._id.toString())
					},
					{
						text: `Amount ${(abRecord.amountAtLimit && abRecord.amountAtLimit.indexOf('%') > -1) ? abRecord.amountAtLimit : abRecord.amountAtLimit + ' ' + nativeSymbol}`,
						callback_data: botEnum.buyDipAmount.value + '_' + ((abRecord === null) ? '' : abRecord._id.toString())
					}					
				],
				// [
				// 	{
				// 		text: '%',
				// 		callback_data: botEnum.trackAutoBuyPriceLimitPercentage + '_' + ((abRecord === null) ? '' : abRecord._id.toString())
				// 	},
				// 	{
				// 		text: 'Price',
				// 		callback_data: botEnum.trackAutoBuyPriceLimitUsd + '_' + ((abRecord === null) ? '' : abRecord._id.toString())
				// 	},
				// 	{
				// 		text: 'MC',
				// 		callback_data: botEnum.trackAutoBuyPriceLimitMarketcap + '_' + ((abRecord === null) ? '' : abRecord._id.toString())
				// 	}
				// ]
			] : [[]])
		]
	}
}

export async function getBridgeMarkup() {
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: botEnum.bridge_eth2sol.key,
					callback_data: botEnum.bridge_eth2sol.value
				},
				{
					text: botEnum.bridge_sol2eth.key,
					callback_data: botEnum.bridge_sol2eth.value
				}
			]
		]
	}
}

export async function getBridgeSol2EthMarkup(telegramId: string, processingId: string) {
	const bridgeItem = await BridgeModel.findById(processingId)
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: bridgeItem ? botEnum.bridge_sol2eth_refresh.key : botEnum.dismiss.key,
					callback_data: bridgeItem ? botEnum.bridge_sol2eth_refresh.value + "_" + processingId : botEnum.dismiss.value
				}
			]
		]
	}
}

export async function getBridgeEth2SolMarkup(telegramId: string, processingId: string) {
	const bridgeItem = await BridgeModel.findById(processingId)
	return {
		inline_keyboard: [
			[
				{
					text: botEnum.menu.key,
					callback_data: botEnum.menu.value
				},
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			],
			[
				{
					text: bridgeItem ? botEnum.bridge_eth2sol_refresh.key : botEnum.dismiss.key,
					callback_data: bridgeItem ? botEnum.bridge_eth2sol_refresh.value + "_" + processingId : botEnum.dismiss.value
				}
			]
		]
	}
}
