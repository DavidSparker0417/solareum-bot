import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { updateChatId, userVerboseLog } from '../../../service/app.user.service.js';
import { processError } from '../../../service/error.js';
import { getWallet } from '../../../service/wallet.service.js';
import { getNativeCurrencySymbol } from '../../../web3/chain.parameters.js';
import { getBN } from '../../../web3/web3.operation.js';
import { SEND_AMOUNT_PLACEHOLDER, TOKEN_BUY_X_AMOUNT_LISTENER, TOKEN_BUY_X_TOKEN_AMOUNT_LISTENER } from '../../../utils/common.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { userETHBalance } from '../../../web3/nativecurrency/nativecurrency.query.js';
import { userSwapETHForTokens, userSwapETHForTokensApeMax } from '../../../web3/dex.interaction.js';
import { getTokenBalance } from '../../../web3/multicall.js';
import { SolanaTokenInfoModel } from '../../../models/solana/solana.token.info.model.js';

export const tokenBuyXETHAmountListener = new Scenes.BaseScene(TOKEN_BUY_X_AMOUNT_LISTENER);
export const tokenBuyXTokenAmountListener = new Scenes.BaseScene(TOKEN_BUY_X_TOKEN_AMOUNT_LISTENER);

// send a prompt message when user enters scene
tokenBuyXETHAmountListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id

    try {
        await updateChatId(telegramId, ctx.chat.id)

        const tokenInfo = await SolanaTokenInfoModel.findById(ctx.scene.state.tokenInfoId)
        if (tokenInfo === null) {
            await ctx.telegram.sendMessage(
                ctx.chat.id,
                `❌ Not valid token`,
                {
                    parse_mode: botEnum.PARSE_MODE_V2
                }
            )
            await ctx.scene.leave()
            return
        }

        const label = await getNativeCurrencySymbol(tokenInfo.chain)
        const myETHBal = await userETHBalance(telegramId, tokenInfo.chain)

        const ret = await ctx.telegram.sendMessage(
            ctx.chat.id,
            `How much <b>${label}</b> do you want to buy by? You can use <b>% notation or a regular number</b>.\n\n` +
            'If you type <b>100%</b>, it will transfer <b>the entire balance</b>.\n' +
            `You currently have <code>${myETHBal}</code> <b>${label}</b>`,
            {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true,
                    input_field_placeholder: SEND_AMOUNT_PLACEHOLDER,
                }
            }
        );

        const context = {
            msgBackupAmount: JSON.stringify(ret),
            amount: null,
            tokenInfoId: ctx.scene.state.tokenInfoId
        };

        await new SceneStageService().saveScene(telegramId, TOKEN_BUY_X_AMOUNT_LISTENER, JSON.stringify(context), new Date())
        await ctx.scene.leave()
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});

async function buyTokenByETH(telegramId: string, ctx: any, tokenInfo: any, amount: string) {
    let tx;
    try {
        tx = await userSwapETHForTokens(telegramId, tokenInfo.chain, tokenInfo.address, amount);
    } catch (err) {
        await processError(ctx, telegramId, err);
        return;
    }
}

// send a prompt message when user enters scene
tokenBuyXTokenAmountListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;
    try {
        const tokenInfo = await SolanaTokenInfoModel.findById(ctx.scene.state.tokenInfoId)

        if (tokenInfo === null) {
            await ctx.telegram.sendMessage(
                ctx.chat.id,
                '❌ Not valid token',
                {
                    parse_mode: botEnum.PARSE_MODE_V2
                }
            );
            await ctx.scene.leave()
            return
        }

        const w = await getWallet(telegramId);
        const tInfo = await getTokenBalance(tokenInfo.chain, tokenInfo.address, w.address);

        const ret = await ctx.telegram.sendMessage(
            ctx.chat.id,
            `How much <b>${tInfo.symbol}</b> do you want to buy? You can use <b>% notation or a regular number</b>.\n\n` +
            'If you type <b>100%</b>, it will transfer <b>the entire balance</b>.\n' +
            `You currently have <code>${tInfo.balance}</code> <b>${tInfo.symbol}</b>`,
            {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            }
        );


        const context = {
            msgBackupAmount: JSON.stringify(ret),
            amount: null,
            tokenInfoId: ctx.scene.state.tokenInfoId
        };

        await new SceneStageService().saveScene(telegramId, TOKEN_BUY_X_TOKEN_AMOUNT_LISTENER, JSON.stringify(context), new Date());
        await ctx.scene.leave();
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});

async function tokenBuyXETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyXETH.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyXETH.value.length + 1)

        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, `token buy by X ETH [${tokenInfoId}]`);

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)
        if (token !== null) {
            await ctx.scene.enter(TOKEN_BUY_X_AMOUNT_LISTENER, { tokenInfoId: tokenInfoId })
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

function tokenBuyXTokenAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyXToken.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyXToken.value.length + 1)

        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, `token buy X Token [${tokenInfoId}]`);

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)
        if (token !== null) {
            await ctx.scene.enter(TOKEN_BUY_X_TOKEN_AMOUNT_LISTENER, { tokenInfoId: tokenInfoId })
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

function tokenBuy001ETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyASOL.value + '_.+'), async (ctx: any) => {
		try {
			const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyASOL.value.length + 1)

			const telegramId = ctx.from.id;
			await userVerboseLog(telegramId, `token buy by 0.1 SOL [${tokenInfoId}]`);
			const token = await SolanaTokenInfoModel.findById(tokenInfoId)
			if (token !== null) {
				await buyTokenByETH(telegramId, ctx, token, '0.1');
			} else {
				await ctx.reply(`❌ Not valid token`);
			}
		} catch(err) {
			console.error(err)
		}
    });
}

function tokenBuy005ETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyBSOL.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyBSOL.value.length + 1)

        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, `token buy by 0.5 SOL [${tokenInfoId}]`);

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)
        if (token !== null) {
            await buyTokenByETH(telegramId, ctx, token, '0.5');
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

function tokenBuy010ETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyCSOL.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyCSOL.value.length + 1)

        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, `token buy by 1 SOL [${tokenInfoId}]`);

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)

        if (token !== null) {
            await buyTokenByETH(telegramId, ctx, token, '1');
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

function tokenBuy020ETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyDSOL.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyDSOL.value.length + 1)

        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, `token buy by 2 SOL [${tokenInfoId}]`);

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)
        if (token !== null) {
            await buyTokenByETH(telegramId, ctx, token, '2');
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

function tokenBuy050ETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyESOL.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyESOL.value.length + 1)

        const telegramId = ctx.from.id
        await userVerboseLog(telegramId, `token buy by 5 SOL [${tokenInfoId}]`)

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)
        if (token !== null) {
            await buyTokenByETH(telegramId, ctx, token, '5');
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

function tokenBuy100ETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyFSOL.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyFSOL.value.length + 1)

        const telegramId = ctx.from.id;
        await userVerboseLog(telegramId, `token buy by 10 SOL [${tokenInfoId}]`);

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)
        if (token !== null) {
            await buyTokenByETH(telegramId, ctx, token, '10');
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

async function buyTokenApeMax(telegramId: string, ctx: any, tokenInfo: any) {
    const BN = getBN();

    let tx;
    try {
        // const w = await getWallet(telegramId)
        // const decimals = await getNativeCurrencyDecimal(chain)
        // const ethBal = await getETHBalance(telegramId, chain, w.address)
        // const amn = await amountSwapETHForTokenApeMax(telegramId, chain, token, w, undefined, undefined)
        // await ctx.reply(`ape max ETH value is ${amn.div(BN(`1e${decimals}`))}, my ETH ${ethBal.toString()}`)
        // return
        tx = await userSwapETHForTokensApeMax(telegramId, tokenInfo.chain, tokenInfo.address)
    } catch (err) {
        await processError(ctx, telegramId, err);
        return;
    }
    const w = await getWallet(telegramId);
    const tInfo = await getTokenBalance(tokenInfo.chain, tokenInfo.address, w.address);
    if (tx?.transactionHash) {
    } else {
        await ctx.reply(`You have <b>${tInfo.balance} ${tInfo.symbol}</b>`, {
            parse_mode: botEnum.PARSE_MODE_V2
        });
    }
}

function tokenBuyApeMaxETHAction(bot: any) {
    bot.action(RegExp('^' + botEnum.buyApeMax.value + '_.+'), async (ctx: any) => {
        const tokenInfoId = ctx.update.callback_query.data.slice(botEnum.buyApeMax.value.length + 1)

        const telegramId = ctx.from.id
        await userVerboseLog(telegramId, `token buy ape max [${tokenInfoId}]`)

        const token = await SolanaTokenInfoModel.findById(tokenInfoId)
        if (token !== null) {
            await buyTokenApeMax(telegramId, ctx, token);
        } else {
            await ctx.reply(`❌ Not valid token`);
        }
    });
}

export function registerTokenBuy(bot: any) {
    tokenBuyXETHAction(bot);
    tokenBuyXTokenAction(bot);
    tokenBuy001ETHAction(bot);
    tokenBuy005ETHAction(bot);
    tokenBuy010ETHAction(bot);
    tokenBuy020ETHAction(bot);
    tokenBuy050ETHAction(bot);
    tokenBuy100ETHAction(bot);
    tokenBuyApeMaxETHAction(bot);
}

module.exports = { registerTokenBuy, tokenBuyXETHAmountListener, tokenBuyXTokenAmountListener };
