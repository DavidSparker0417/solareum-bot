import * as dotenv from 'dotenv';
import express, { Express, Request, Response } from 'express';
import { Telegraf, Scenes, session } from 'telegraf';
import path from 'path';
import Logging from './utils/logging.js';
import { connect, sessionStore } from './utils/connect.js';
import walletKeyListener from './commands/actions/wallet/pvkey.mnemonic.listener.js';
import multiWalletConnectKeyListener from './commands/actions/wallet/pvkey.mnemonic.multi.wallet.connect.listener.js';
import multiWalletGenerateKeyListener from './commands/actions/wallet/pvkey.mnemonic.multi.wallet.generate.listener.js';
import multiWalletRenameListener from './commands/actions/wallet/rename.multi.wallet.listener.js';
import multiWalletTransferNativeCurrencyListener from './commands/actions/transfer/multi.wallet.transfer/multi.wallet.transfer.nativecurrency.listener.js';
import multiWalletTransferTokenListener from './commands/actions/transfer/multi.wallet.transfer/multi.wallet.transfer.token.listener.js';
import { transferNativeCurrencyToListener } from './commands/actions/transfer/transfer.nativecurrency.listener.js';
import { transferTokenTokenListener } from './commands/actions/transfer/transfer.token.listener.js';
import { manualBuyAmountListener } from './commands/actions/manual/buy.token.listener.js';
import { manualSellTokenListener } from './commands/actions/manual/sell.token.listener.js';
import { registerTokenBuy, tokenBuyXETHAmountListener, tokenBuyXTokenAmountListener } from './commands/actions/token/token.buy.action.js';
import { copyTradeListener } from './commands/actions/copytrade/copytrade.listener.js';
import { referralListener } from './commands/actions/referral/referral.listener.js';
import { settingsListener } from './commands/actions/settings/settings.listener.js';
import { bridgeListener } from './commands/actions/bridge/bridge.listener.js';

import { registerTokenSell, tokenSellXETHAmountListener, tokenSellXTokenAmountListener } from './commands/actions/token/token.sell.action.js';

import { autoSellInputListener } from './commands/actions/auto/autosell.listener.js';
import { autoBuyInputListener } from './commands/actions/auto/autobuy.listener.js';
import { snipeInputListener } from './commands/actions/snipe/snipe.values.listener.js';

import { loadChainParameters, setBotInstance } from './web3/chain.parameters.js';
import { loadLpLockers } from './web3/chain.lp.lockers.js';
import { pollTrackTokens } from './service/track.service.js';
import cluster from 'cluster'
import { cpus } from 'os'
import { pollBroadcast } from './service/app.user.service.js';
import { pollAutoSellBuy } from './service/autosell.service.js';
import { core_info, getAllCores } from './service/multicore/config.js';
import { createBackgroundService, resetIPC, sendIPCMessage } from './service/multicore/service.js';
import { handleBotHookMessage } from './hook.js';
import { pushUnfinishedBridges } from './service/bridge.service.js';
import { pollFeeCollection } from './service/stat.service.js';
import { isPurgingMessages } from './service/app.service.js';

const os = require('os')

dotenv.config();
if (process.env.NODE_ENV == ('development' || 'development ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else if (process.env.NODE_ENV == ('production' || 'production ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env') });
} else if (process.env.NODE_ENV == ('staging' || 'staging ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.staging') });
}

/**
 * Clusters of Node.js processes can be used to run multiple instances of Node.js
 *  that can distribute workloads among their application threads. When process isolation
 *  is not needed, use the worker_threads module instead, which allows running multiple 
 * application threads within a single Node.js instance.
 */

// ========================= Telegraf Bot =============================
const bot = new Telegraf(process.env.TELEGRAM_API_KEY, { handlerTimeout: 9_000_000 });
Logging.log(`configured bot [${process.env.TELEGRAM_API_KEY}]`);

bot.use((ctx, next) => {
	// if (ctx.update.message?.from.id === 5024160149 && ctx.update.message?.message_id === 3467) {
	//     return
	// }
	return next();
});

bot.catch((err: any) => {
	console.log('Oops', err);

	bot.stop();

	process.exit(1);
});

setBotInstance(bot)
const highPriority = -15
console.log(`Process priority is [${os.getPriority()}], Forcing to ${highPriority}...`)
os.setPriority(highPriority);

if (cluster.isPrimary === true) {
	Logging.info(`Max Performance total CPU cores ${cpus().length} on pid ${process.pid}`)
	// .isPrimary with node v16.0.0 or above
	// .isMaster (depreciated) with older version
	/**********************************************************************************
	 * 
	 * resetting inter-process communication unix sockets
	 * 
	**********************************************************************************/
	resetIPC('solana')
		.then(() => {
			/**********************************************************************************
		 * 
		 * forking CPUS to synchronize chain parameters and all transactions
		 * 
		**********************************************************************************/
			const CPUS: any = cpus()
			CPUS.forEach(() => cluster.fork())
		})

	setTimeout(() => {
		Logging.error('Exiting to clean up memory')
		process.exit(0)
	}, 1000 * 3600 * 24)
} else {
	// running cores
	let coresInUse = []
	Logging.info(`Running worker ${cluster.worker.id} on pid ${process.pid}`)

	/**********************************************************************************
	 * 
	 * synchronize transactions on each chain
	 * 
	**********************************************************************************/

	const mainChain = 'solana'
	{
		const ch = mainChain
		{
			const coresOnChain = getAllCores(ch)
			coresOnChain.forEach(core => {
				if (cluster.worker.id === core) {
					if (cluster.worker?.id && !coresInUse.find(core => core === cluster.worker?.id)) coresInUse.push(cluster.worker.id)

					connect()
						.then(() => {
							createBackgroundService(core, ch)
						})
						.catch(err => {
							console.error(`==> ${new Date().toLocaleString()}`)
							console.error(err)
							Logging.error(`Worker ${cluster.worker.id}`)
						})
				}
			})
		}
	}

	/**********************************************************************************
	 * 
	 * bot handling routines
	 * 
	**********************************************************************************/

	const registerBotActions = () => {
		const stage = new Scenes.Stage([
			walletKeyListener as any,
			transferNativeCurrencyToListener as any,
			transferTokenTokenListener as any,
			manualBuyAmountListener as any,
			manualSellTokenListener as any,
			tokenBuyXETHAmountListener as any,
			tokenBuyXTokenAmountListener as any,
			tokenSellXETHAmountListener as any,
			tokenSellXTokenAmountListener as any,
			transferNativeCurrencyToListener as any,
			multiWalletConnectKeyListener as any,
			multiWalletGenerateKeyListener as any,
			multiWalletRenameListener as any,
			multiWalletTransferNativeCurrencyListener as any,
			multiWalletTransferTokenListener as any,
			autoSellInputListener as any,
			autoBuyInputListener as any,
			snipeInputListener as any,
			copyTradeListener as any,
			settingsListener as any,
			referralListener as any,
			bridgeListener as any
		]);

		bot.use(session()); // Important! Scenes require session first
		bot.use(stage.middleware()); // enable our scenes

		// ------------- commands --------------
		//start command
		const startCommand = require('./commands/start');
		startCommand(bot);

		// snipe command
		const snipeCommand = require('./commands/snipe');
		snipeCommand(bot);

		//   const stateCommand = require('./commands/state');
		//   stateCommand(bot);

		const transferCommand = require('./commands/transfer');
		transferCommand(bot);

		//   const tradeCommand = require('./commands/trade');
		//   tradeCommand(bot);

		const walletCommand = require('./commands/wallet');
		walletCommand(bot);

		const monitorCommand = require('./commands/monitor');
		monitorCommand(bot);

		const quickCommand = require('./commands/quick');
		quickCommand(bot);

		//   const copytradeCommand = require('./commands/copytrade');
		//   copytradeCommand(bot);

		//   const scrapeCommand = require('./commands/scraper');
		//   scrapeCommand(bot);

		//   const presalesCommand = require('./commands/presales');
		//   presalesCommand(bot);

		const helpCommand = require('./commands/help');
		helpCommand(bot);

		const settingsCommand = require('./commands/settings');
		settingsCommand(bot);

		//   const mixerCommand = require('./commands/zkproof');
		//   mixerCommand(bot);

		const clearTradeCommand = require('./commands/cleartrade');
		clearTradeCommand(bot);

		const referralCommand = require('./commands/referral');
		referralCommand(bot);

		const autoTradeCommand = require('./commands/auto');
		autoTradeCommand(bot);

		// const bridgeCommand = require('./commands/bridge');
		// bridgeCommand(bot);

		// ------------- actions --------------
		const linkAccountAction = require('./commands/actions/link.account.action');
		linkAccountAction(bot);

		const selectChainAction = require('./commands/actions/wallet/select.chain.action');
		selectChainAction(bot);

		const connectWalletAction = require('./commands/actions/wallet/chain.wallet.connect');
		connectWalletAction(bot);

		const generateWalletAction = require('./commands/actions/wallet/chain.wallet.generate');
		generateWalletAction(bot);

		const disconnectWalletAction = require('./commands/actions/wallet/chain.wallet.disconnect');
		disconnectWalletAction(bot);

		const transferNativeCurrencyAction = require('./commands/actions/transfer/transfer.nativecurrency');
		transferNativeCurrencyAction(bot);

		const transferTokenAction = require('./commands/actions/transfer/transfer.token');
		transferTokenAction(bot);

		const manualBuyTokenAction = require('./commands/actions/manual/buy.token');
		manualBuyTokenAction(bot);

		const manualSellTokenAction = require('./commands/actions/manual/sell.token');
		manualSellTokenAction(bot);

		const defaultInputAction = require('./commands/actions/default.input.action');
		defaultInputAction(bot);

		const multiWalletAction = require('./commands/actions/wallet/chain.multi.wallet');
		multiWalletAction(bot);

		const multiWalletSubMenuActions = require('./commands/actions/wallet/additional_wallet');
		multiWalletSubMenuActions(bot);

		const multiWalletSubMenuTransferActions = require('./commands/actions/transfer/multi.wallet.transfer/multi.wallet.transfer.nativecurrency');
		multiWalletSubMenuTransferActions(bot);

		registerTokenBuy(bot);
		registerTokenSell(bot);
	}

	// ========================== Express Server =============================
	if (core_info[mainChain].scaling.indexOf(cluster.worker.id) > -1) {
		if (process.env.BOT_MODE === 'webhook') {
			registerBotActions()
		}
	}

	if (cluster.worker.id === core_info[mainChain].route) {
		if (cluster.worker?.id) coresInUse.push(cluster.worker.id)

		if (process.env.BOT_MODE === 'polling') {
			registerBotActions()
			bot.launch();
		}

		connect()
			.then(() => {
				const app: Express = express();

				app.use(express.json());
				app.use('/', require('./routes/app.routes'));

				app.get('/', (request: Request, response: Response) => {
					response.send('Health check v3');
				});

				let scalingIdx = 0
				app.post('/', async (request: Request, response: Response) => {
					const distributeTo = scalingIdx
					scalingIdx = (scalingIdx + 1) % core_info[mainChain].scaling.length
					try {
						const isPurging = await isPurgingMessages()
						if (isPurging) {
							Logging.info(`Purged ${JSON.stringify(request.body)}`)
						} else {
							await sendIPCMessage(core_info[mainChain].scaling[distributeTo], mainChain, JSON.stringify({
								discriminator: 'bot-webhook',
								content: request.body
							}))
						}
					} catch (err) {
						console.error(err)
					}
					response.send('ok');
				});

				app.use('/transactions', require('./routes/transactions'));
				app.use('/broadcast', require('./routes/broadcast'));
				app.use('/debug', require('./routes/debug'));
				app.use('/info', require('./routes/info'));

				app.listen(process.env.PORT, async function () {
					Logging.log(`Ready to go. listening on port:[${process.env.PORT}] on pid:[${process.pid}]`);
				});
			})
			.catch((err) => {
				console.error(`==> ${new Date().toLocaleString()}`)
				console.error(err)
				Logging.error(`Worker ${cluster.worker.id}`)
			})
	}

	/**********************************************************************************
	 * 
	 * synchronize chain parameters
	 * 
	**********************************************************************************/
	const backgroundIndex = core_info[mainChain].background.indexOf(cluster.worker.id)
	if (backgroundIndex >= 0) {
		if (cluster.worker?.id) coresInUse.push(cluster.worker.id)

		connect()
			.then(() => {
				if (backgroundIndex === 0) {
					loadChainParameters()
					loadLpLockers()
				} else if (backgroundIndex === 1) {
					pollAutoSellBuy(bot)
				} else if (backgroundIndex === 2) {
					pollTrackTokens(bot)
					pollBroadcast(bot)
				} else if (backgroundIndex === 3) {
					pushUnfinishedBridges()
				} else if (backgroundIndex === 4) {
					pollFeeCollection()
				}
			})
			.catch(err => {
				if (err.message.includes('message is not modified:')) return
				console.error(`==> ${new Date().toLocaleString()}`)
				console.error(err)
				Logging.error(`Worker ${cluster.worker.id}`)
			})
	}

	if (!coresInUse.find(t => t === cluster.worker.id)) {
		Logging.warn(`Exiting core processor ${cluster.worker.id}...`)
		process.exit(0)
	}
}