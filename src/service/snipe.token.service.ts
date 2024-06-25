import { SnipeTokenModel } from '../models/snipe.godmode.token.js';
import { SolanaTokenInfoModel } from '../models/solana/solana.token.info.model.js';
import { getAppUser, userVerboseLog } from './app.user.service.js';

export function getDefaultSnipeSetting(telegramId: string, chain: string) {
	return {
		disabled: true,
		multi: false,
		blockDelay: 0,
		method: 'dynamic',
		nativeCurrencyAmount: '1',
		slippage: 100,
		maxTx: true,
		maxComputeUnits: '100000',
		computeUnitPrice: 20000, // micro-lamports
		// priorityFee: '0.00001'
	}
}

export async function registerSnipeToken(telegramId: string, chain: string, tokenAddress: string) {
    const token = await SolanaTokenInfoModel.findOne({ chain: chain, address: tokenAddress });
    if (token === null) {
        throw new Error(`Token not found\n<b>${chain}</b>: <code>${tokenAddress}</code>`);
    }

    const user = await getAppUser(telegramId);

    let retSnipe = await SnipeTokenModel.findOne({ user: user._id, token: token._id, state: 'pending' });

    if (retSnipe === null) {
        retSnipe = new SnipeTokenModel({
            user: user._id,
            token: token._id,
            state: 'pending',
            ...getDefaultSnipeSetting(telegramId, chain)
        });

        await retSnipe.save();
        await userVerboseLog(telegramId, 'added a new snipe token ' + token.address);

        retSnipe = await SnipeTokenModel.findOne({ user: user._id, token: token._id, state: 'pending' });
    }

    return retSnipe
}

export async function getSnipeTokenList(telegramId: string) {
    const user = await getAppUser(telegramId);

    const s: any[] = await SnipeTokenModel.find({ user: user._id, state: 'pending' });

    return s;
}

export async function moveTokenSnipe(telegramId: string, snipeId: string, bPrev: boolean) {
    const user = await getAppUser(telegramId);

    let snipes = await SnipeTokenModel.find({ user: user._id, state: 'pending' });
    if (snipes.length === 0) return null
    else if (snipes.length === 1) {
        return snipes[0]
    }

    const snipe = snipes.find((t) => t._id.toString() === snipeId)
    let index
    if (snipe === undefined) {
        index = 0;
    } else {
        const foundIndex = snipes.indexOf(snipe)

        if (bPrev === true) {
            index = (foundIndex + snipes.length - 1) % snipes.length;
        } else {
            index = (foundIndex + 1) % snipes.length;
        }
    }

    return snipes[index]
}

export async function clearTokenSnipes(telegramId: string) {
    const user = await getAppUser(telegramId)

    await SnipeTokenModel.deleteMany({ user: user._id })
}
