import { IAddress } from "../../models/address.model.js";
import { getWallet } from "../../service/wallet.service.js";
import { getNativeCurrencyDecimal } from "../chain.parameters.js";
import { getBN, newSolWeb3 } from "../web3.operation.js";
import solWeb3 from '@solana/web3.js'

export async function getETHBalance(telegramId: string, chain: string, address: string) {
    const connection = await newSolWeb3(telegramId, chain)

    const BN = getBN()
    const bal = await connection.getBalance(new solWeb3.PublicKey(address))

    const decimals = await getNativeCurrencyDecimal(chain)
    return BN(bal.toString())
        .div(BN(`1e${decimals}`))
        .toString();
}

export async function batchAddressBalances(telegramId: string, chain: string, addresses: IAddress[]) {
    const connection = await newSolWeb3(telegramId, chain)
	const balances = await Promise.all(addresses.map(a => getETHBalance(telegramId, chain, a.address)))

    addresses.forEach((ad, idx) => ad.balance = balances[idx])
    return addresses;
}

export async function userETHBalance(telegramId: string, chain: string) {
    const w = await getWallet(telegramId);
    return await getETHBalance(telegramId, chain, w.address);
}
