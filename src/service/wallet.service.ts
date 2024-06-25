import { AddressModel, IAddress, IAddressPagination, IAddressPaginationMetaData } from '../models/address.model.js';
import { WalletModel } from '../models/wallet.model.js';
import Logging from '../utils/logging.js';
import { MAX_WALLET_REACHED_NON_PREMIUM, NOT_CONNECTED_WALLET } from '../utils/common.js';
import { getAppUser } from './app.user.service.js';
import { IPremium } from '../models/premium.model.js';
import { PremiumService } from './premium.service.js';
import { AES, enc } from 'crypto-js';
import solWeb3 from "@solana/web3.js"
import bs58 from 'bs58'

const bip39 = require('bip39')

async function addWallet(telegramId: string, generator: string, wallet: any, multiChain?: boolean, name?: string) {
	const user = await getAppUser(telegramId);

	const premium: IPremium = await new PremiumService().getPremium(telegramId);

	let isPremiumUser = false;

	if (premium != null && premium.endDate != null && premium.endDate > new Date()) {
		isPremiumUser = true;
	}

	let dbWallet = await WalletModel.findOne({ owner: user._id });

	if (dbWallet === null) {
		dbWallet = new WalletModel({
			owner: user._id,
			generator: generator,
			addresses: []
		});
	} else {
		dbWallet.generator = generator;
	}
	await dbWallet.save()

	let dbAddress;
	const shortPvKey = shortenPrivateKey(wallet.privateKey);
	if (dbWallet.addresses.length == 10 && !isPremiumUser) {
		throw new Error(MAX_WALLET_REACHED_NON_PREMIUM);
	} else if (dbWallet.addresses.length <= 10 && !isPremiumUser) {
		dbAddress = await getAddressByPvKey(shortPvKey);
		if (typeof dbAddress === undefined || dbAddress === undefined || dbAddress === null) {
			await deSelectAddresses(dbWallet.addresses);
			dbAddress = new AddressModel({
				walletPk: dbWallet._id,
				address: wallet.address,
				privateKey: encrypt(wallet.privateKey),
				shortPrivateKey: shortPvKey,
				mnemonic: generator === 'mnemonic' || generator === 'random' ? encrypt(wallet.mnemonic.phrase) : '',
				shortMnemonic: generator === 'mnemonic' || generator === 'random' ? shortenPrivateKey(wallet.mnemonic.phrase) : '',
				connected: true,
				selected: true,
				name: name,
				additional: multiChain
			});
		} else if (dbAddress?.shortPrivateKey === shortPvKey && dbAddress.walletPk.toString() === dbWallet._id.toString()) {
			Logging.info(`user:${telegramId} address: [${wallet.address}] short Pv Key: [${shortenPrivateKey(wallet.privateKey)}] already exists, Premium: [${isPremiumUser}]`);
		}
		else {
			Logging.info(`address: [${wallet.address}] short Pv Key: [${shortenPrivateKey(wallet.privateKey)}] already exists, Premium: [${isPremiumUser}]`);
		}

		await dbAddress.save();
	} else if (dbWallet.addresses.length <= 101 && isPremiumUser) {
		dbAddress = await getAddressByPvKey(wallet.privateKey);
		if (typeof dbAddress === undefined || dbAddress === undefined || dbAddress === null) {
			await deSelectAddresses(dbWallet.addresses);
			dbAddress = new AddressModel({
				walletPk: dbWallet._id,
				address: wallet.address,
				privateKey: encrypt(wallet.privateKey),
				shortPrivateKey: shortPvKey,
				mnemonic: generator === 'mnemonic' || generator === 'random' ? encrypt(wallet.mnemonic.phrase) : '',
				shortMnemonic: generator === 'mnemonic' || generator === 'random' ? shortenPrivateKey(wallet.mnemonic.phrase) : '',
				connected: true,
				selected: true,
				name: name,
				additional: multiChain
			});
		} else if (dbAddress?.shortPrivateKey === shortPvKey && dbAddress.walletPk.toString() === dbWallet._id.toString()) {
			Logging.info(`user:${telegramId} address: [${wallet.address}] short Pv Key: [${shortenPrivateKey(wallet.privateKey)}] already exists, Premium: [${isPremiumUser}]`);
		}
		else {
			Logging.info(`address: [${wallet.address}] already exists, Premium: [${isPremiumUser}]`);
		}

		await dbAddress.save();
	}

	if (dbAddress != null) {
		dbWallet.addresses.push(dbAddress._id);
		await dbWallet.save();
	}
}

async function deSelectAddresses(addresses: any) {
	if (addresses != null && addresses.length > 0) {
		for (const address of addresses) {
			if (address != null || typeof address != undefined) {
				if (addresses.selected) {
					addresses.selected = false;
					await addresses.save();
				}
			}
		}
	}
}

async function getAddressByPvKey(shortPvKey: string) {
	await AddressModel.findOne({
		shortPrivateKey: shortPvKey
	})
		.then((address) => {
			return address;
		})
		.catch((err) => {
			return null;
		});
}

export async function createRandomWallet(telegramId: string, multiChain?: boolean, name?: string) {
	const mnemonic = bip39.generateMnemonic()
	const seed = await bip39.mnemonicToSeedSync(mnemonic, "")
	const keypair = solWeb3.Keypair.fromSeed(seed.slice(0, 32));
	if (keypair === undefined) return false;

	await addWallet(telegramId, 'random', {
		address: keypair.publicKey.toBase58(),
		privateKey: Buffer.from(keypair.secretKey).toString('hex'),
		mnemonic: { phrase: mnemonic },
	}, multiChain, name);

	return true;
}

export async function importWallet(telegramId: string, pvKeyOrMnemonics: string, multiChain?: boolean, name?: string) {
	let wallet;
	let generator = '';
	try {
		const mnemonic = pvKeyOrMnemonics
		if (mnemonic.split(' ').length < 12) {
			throw new Error('Not mnemonic input')
		}
		const seed = await bip39.mnemonicToSeed(mnemonic)
		const keypair = solWeb3.Keypair.fromSeed(seed.slice(0, 32));

		wallet = {
			address: keypair.publicKey.toBase58(),
			privateKey: Buffer.from(keypair.secretKey).toString('hex'),
			mnemonic: { phrase: mnemonic },
		}
		generator = 'mnemonic';
	} catch {
	}

	if (wallet === undefined) {
		try {
			let regex = new RegExp(/^[a-zA-Z0-9]+$/)
			if (!regex.test(pvKeyOrMnemonics)) {
				throw new Error('Not a secret key')
			}

			let keypair
			try {
				keypair = solWeb3.Keypair.fromSecretKey(bs58.decode(pvKeyOrMnemonics));
			} catch (err) {
				console.error(err)
				const pvKey = Uint8Array.from(Buffer.from(pvKeyOrMnemonics, 'hex'))
				keypair = solWeb3.Keypair.fromSecretKey(pvKey);
			}

			wallet = {
				address: keypair.publicKey.toBase58(),
				privateKey: Buffer.from(keypair.secretKey).toString('hex')
			}
			generator = 'privatekey';
		} catch { }
	}

	if (wallet === undefined) return false;

	await addWallet(telegramId, generator, wallet, multiChain, name);

	return true;
}

export async function disconnectWallet(telegramId: string) {
	const user = await getAppUser(telegramId);
	const dbFound = await WalletModel.findOne({ owner: user._id });
	if (dbFound === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	const dbWallet = await dbFound.populate('addresses');

	for (const w of dbWallet.addresses) {
		let newAddressesList = [];
		let hasUpdate = false;
		if (w.additional === false && w.connected === true) {
			await AddressModel.deleteOne({ _id: w._id.toString() });
			hasUpdate = true;
		} else {
			newAddressesList.push(w);
		}
		dbWallet.addresses = newAddressesList;
		if (hasUpdate) {
			await dbWallet.save();
		}
	}

	Logging.info(`disconnected wallet ${telegramId}`);
}

export async function getWallet(telegramId: string) {
	const user = await getAppUser(telegramId);

	const wFound = await WalletModel.findOne({ owner: user._id });
	if (wFound === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	const wallet = await wFound.populate('addresses')

	const cn = wallet.addresses.filter((w: IAddress) => w.connected === true && w.additional === false);

	if (cn.length === 0) {
		throw new Error(NOT_CONNECTED_WALLET);
	}
	cn[0].privateKey = decrypt(cn[0].privateKey)
	if (cn[0].mnemonic !== null && cn[0].mnemonic.length > 0)
		cn[0].mnemonic = decrypt(cn[0].mnemonic)
	return cn[0];
}

export async function getMultiWallets(telegramId: string, ex?: any) {
	const user = await getAppUser(telegramId);

	if (0 === (await WalletModel.countDocuments({ owner: user._id }))) {
		const wallet = new WalletModel({
			owner: user._id,
			generator: 'random',
			addresses: []
		});

		await wallet.save();
	}

	const wFound = await WalletModel.findOne({ owner: user._id });
	if (wFound === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	const wallet = await wFound.populate('addresses');

	const cn = wallet.addresses.filter((w: IAddress) => w.name !== null && w.additional === true && (ex?.configure === true || w.connected === true));

	let response = []
	for (let wallet of cn) {
		wallet.privateKey = decrypt(wallet.privateKey)
		if (wallet.mnemonic !== null && wallet.mnemonic.length > 0)
			wallet.mnemonic = decrypt(wallet.mnemonic)
		response.push(wallet)
	}
	return response;
}

export async function getMultiWalletsPagination(telegramId: string, page?: number, perPage?: number) {
	const user = await getAppUser(telegramId);
	if (perPage != null && perPage > 4) {
		perPage = 4;
	}

	const options = {
		page: (page || 1) - 1,
		limit: perPage || 4
	};

	let wallet
	await WalletModel.findOne({ owner: user._id }).then(res => {
		wallet = res
	});

	if (wallet === null) {
		wallet = new WalletModel({
			owner: user._id,
			generator: 'random',
			addresses: []
		}).save();
	}

	let addresses: any
	await AddressModel.aggregate([
		{
			$match: {
				walletPk: wallet._id,
				additional: true
			}
		},
		{
			$facet: {
				metaData: [
					{
						$count: 'totalAddresses'
					},
					{
						$addFields: {
							pageNumber: options.page,
							totalPages: { $ceil: { $divide: ['$totalAddresses', options.limit] } }
						}
					}
				],
				data: [
					{
						$skip: options.page * options.limit
					},
					{
						$limit: options.limit
					}
				]
			}
		}
	]).then(res => {
		addresses = res
	});

	let response: IAddressPagination = addresses[0];

	if (response !== null && response[0] != null && response[0].data != null) {
		for (let address of response[0].data) {
			address.privateKey = decrypt(address.privateKey)
			if (address.mnemonic !== null && address.mnemonic.length > 0)
				address.mnemonic = decrypt(address.mnemonic)
		}
	}

	const metaData: IAddressPaginationMetaData = {
		...response.metaData[0],
		count: response.data.length
	};

	response.metaData[0] = metaData;

	return response;
}

export async function getAdditionalWalletByName(telegramId: string, name: string) {
	const user = await getAppUser(telegramId);
	const wFound = await WalletModel.findOne({ owner: user._id });
	if (wFound === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	const wallet = await wFound.populate('addresses');

	let cn = wallet.addresses.filter((w: IAddress) => w.name === name && w.additional === true);


	if (cn.length === 0) {
		throw new Error(NOT_CONNECTED_WALLET);
	} else {
		cn[0].privateKey = decrypt(cn[0].privateKey)
		if (cn[0].mnemonic !== null && cn[0].mnemonic.length > 0)
			cn[0].mnemonic = decrypt(cn[0].mnemonic)
	}

	return cn[0];
}

export async function isAdditionalWalletNameExist(telegramId: string, name?: string) {
	const user = await getAppUser(telegramId);

	const wFound = await WalletModel.findOne({ owner: user._id });
	if (wFound === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	const wallet = await wFound.populate('addresses');

	let cn = wallet.addresses.filter((w: IAddress) => w.name === name && w.additional === true);

	if (cn.length > 0) {
		return true;
	} else {
		return false;
	}
}

export async function isAdditionalWalletPrivateKeyExist(telegramId: string, pvKey?: string) {
	const user = await getAppUser(telegramId);

	const wFound = await WalletModel.findOne({ owner: user._id });
	if (wFound === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	const wallet = await wFound.populate('addresses');

	if (wallet.addresses !== null && wallet.addresses.length > 0) {
		for (let address of wallet.addresses) {
			address.privateKey = decrypt(address.privateKey)
			if (address.mnemonic !== null && address.mnemonic.length > 0)
				address.mnemonic = decrypt(address.mnemonic)
		}
	}

	let cn = []
	if (pvKey.split(" ").length > 0) {
		cn = wallet.addresses.filter((w: IAddress) => w.mnemonic === pvKey && w.additional === true);
	} else {
		cn = wallet.addresses.filter((w: IAddress) => w.privateKey.includes(pvKey) && w.additional === true);
	}


	if (cn.length > 0) {
		return true;
	} else {
		return false;
	}
}

export async function enableDisableAdditionalAddress(id: string, value: boolean) {
	let address = await AddressModel.findOne({ _id: id });

	if (address === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	address.connected = value;

	return await address.save();
}

export async function deleteAddress(telegramId: string, id: string) {
	const user = await getAppUser(telegramId);
	let wallet = await WalletModel.findOne({
		owner: user._id
	});

	if (wallet.addresses != null && wallet.addresses.length > 0) {
		let newAddressList = [];
		for (let address of wallet.addresses) {
			if (address._id.toString() !== id) {
				newAddressList.push(address);
			}
		}

		wallet.addresses = newAddressList;
		await wallet.save();
	}

	return await AddressModel.deleteOne({ _id: id });
}

export async function renameAddress(id: string, name: string) {
	let address = await AddressModel.findOne({ _id: id });

	if (address === null) {
		throw new Error(NOT_CONNECTED_WALLET);
	}

	address.name = name;

	return await address.save();
}

export async function getAddressById(id: string) {
	const response = await AddressModel.findOne({ _id: id });

	if (typeof response !== null || response !== null || response !== null) {
		response.privateKey = decrypt(response.privateKey)
		response.mnemonic = decrypt(response.mnemonic)
	}

	return response;
}


// Encryption function
function encrypt(text: string): string {
	const key = process.env.ENCRYPT_KEY;
	const encrypted = AES.encrypt(text, key).toString();
	return encrypted;
}

// Decryption function
function decrypt(encryptedText: string): string {
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

