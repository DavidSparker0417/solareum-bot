import Logging from '../utils/logging.js';
import { getAppUser } from './app.user.service.js';
import { AES, enc } from 'crypto-js';
import { EvmWalletModel } from '../models/evm.wallet.model.js';

const ethers = require("ethers")

async function addWallet(telegramId: string, generator: string, wallet: any) {
    const user = await getAppUser(telegramId);

    let dbWallet = await EvmWalletModel.findOne({ owner: user._id });
	const shortPvKey = shortenPrivateKey(wallet.privateKey);

    if (dbWallet === null) {
        dbWallet = new EvmWalletModel({
            owner: user._id,
			address: wallet.address.toLowerCase(),
			privateKey: encrypt(wallet.privateKey),
			shortPrivateKey: shortPvKey,
			mnemonic: generator === 'mnemonic' || generator === 'random' ? encrypt(wallet.mnemonic.phrase) : '',
			shortMnemonic: generator === 'mnemonic' || generator === 'random' ? shortenPrivateKey(wallet.mnemonic.phrase) : ''
        });

		await dbWallet.save()
    }
}

export async function createRandomEvmWallet(telegramId: string) {
    const wallet = ethers.Wallet.createRandom();
    if (wallet === undefined) return false;

    await addWallet(telegramId, 'random', wallet);

    return true;
}

export async function importEvmWallet(telegramId: string, pvKeyOrMnemonics: string) {
    let wallet;
    let generator = '';
    try {
        wallet = ethers.Wallet.fromMnemonic(pvKeyOrMnemonics);
        generator = 'mnemonic';
    } catch (err) {
        console.error(err)
    }

    if (wallet === undefined) {
        try {
            wallet = new ethers.Wallet(pvKeyOrMnemonics);
            generator = 'privatekey';
        } catch (err) {
            console.error(err)
        }
    }

    if (wallet === undefined) return false;

    await addWallet(telegramId, generator, wallet);

    return true;
}

export async function disconnectEvmWallet(telegramId: string) {
    const user = await getAppUser(telegramId);
    const dbFound = await EvmWalletModel.deleteMany({ owner: user._id });
    Logging.info(`disconnected wallet ${telegramId}`);
}

export async function getEvmWallet(telegramId: string) {
    const user = await getAppUser(telegramId);

    const wFound = await EvmWalletModel.findOne({ owner: user._id });
    
    wFound.privateKey = decrypt(wFound.privateKey)
    if (wFound.mnemonic !== null && wFound.mnemonic.length > 0) {
		wFound.mnemonic = decrypt(wFound.mnemonic)
	}
    return wFound;
}

// Encryption function
function encrypt(text: string): string {
    const key = process.env.ENCRYPT_KEY;
    const encrypted = AES.encrypt(text, key).toString();
    return encrypted;
}

// Decryption function
export function decrypt(encryptedText: string): string {
    const key = process.env.ENCRYPT_KEY;
    const decrypted = AES.decrypt(encryptedText, key).toString(enc.Utf8);
    return decrypted;
}

// shorten privateKey for DB find
function shortenPrivateKey(pvKey: string): string {
    let response = ''
    if (!pvKey) return ''

    const first4 = pvKey.slice(0, 4);
    const last4 = pvKey.slice(pvKey.length - 4, pvKey.length);
    response = `${first4}....Solareum....${last4}`

    return response
}
