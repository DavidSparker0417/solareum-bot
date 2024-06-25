import { userVerboseLog } from '../service/app.user.service.js';
import { getEvmWallet } from '../service/evm.wallet.service.js';

const ethers = require('ethers');
const BN = require('bignumber.js');
const Web3 = require('web3');

BN.config({
    EXPONENTIAL_AT: [-40, 96]
});

export function getBN() {
    return BN;
}

export async function newEvmWeb3() {
    return new Web3('https://swift-eth-node.com')
}

export async function getEthGasPrice() {
    const web3 = await newEvmWeb3()
    const ret = await Promise.all([
        web3.eth.getBlock('pending'),
        web3.eth.getBlock('latest')
    ])
	const gasBal = ret[0].baseFeePerGas || ret[1].gasPrice
	return gasBal
}

export async function getEthGasEstimation(web3: any, tx: any, from: string, to: string, value?: string) {
    return tx ? await tx.estimateGas({ from: from, value: value !== undefined ? value : '0' }) : await web3.eth.estimateGas({ from: from, to: to, value: value === undefined ? '0' : value });
}

export async function getChainId(web3: any) {
    return await web3.eth.net.getId()
}

export async function getNonce(web3: any, address: string) {
    return await web3.eth.getTransactionCount(address)
}

export async function signTxn(web3: any, info: any, pvkey: string) {
    const BN = getBN()
    let chainParams = await Promise.all([
        getNonce(web3, web3.eth.accounts.privateKeyToAccount(pvkey).address),
        getEthGasPrice(),
        getChainId(web3)
    ])

    if (!info.nonce) {
        info.nonce = chainParams[0]
    }

	if (BN(info.type).eq(BN(2))) {
		if (!info.maxFeePerGas) {
			info.maxFeePerGas = BN(chainParams[1]).times('1.1').integerValue().toString()
			info.maxPriorityFeePerGas = BN(info.maxFeePerGas).minus(BN(chainParams[1])).integerValue().toString()
		}
		info.gasPrice = undefined
	} else {
		if (!info.gasPrice) {
			info.gasPrice = BN(chainParams[1]).times('1.1').integerValue().toString()
		}
	}

    const signData = {
        ...info,
        chainId: chainParams[2]
    }

    return await web3.eth.accounts.signTransaction(signData, pvkey);
}

export async function sendTxnByProvider(web3: any, info: any, pvkey: string) {
    // const info = {
    //     from: address,
    //     to: contractAddress,
    //     data: data,
    //     gas,
    //     gasPrice,
    //     nonce,
    //     value: value !== undefined ? value : '0',
    //     chainId: networkId
    // };
    const signedTx = await signTxn(web3, info, pvkey)

    console.log('pending tx', signedTx)
    return await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

export async function estimateGasByProvider(web3: any, info: any) {
    // info = {
    //     from: from,
    //     to: to,
    //     data: data,
    //     value: value === undefined ? '0' : value
    // }
    if (web3 === undefined) {
        web3 = await newEvmWeb3()
    }
    return await web3.eth.estimateGas(info);
}

export async function getUpperGas(estimated: any) {
    const BN = getBN()
    return BN(estimated.toString()).plus("35000").integerValue().toString()
}

export async function executeTxnByProvider(web3: any, info: any, pvkey: string) {
    const gas = await estimateGasByProvider(web3, info)
    return await sendTxnByProvider(web3, {
        ...info,
        gas: await getUpperGas(gas)
    }, pvkey)
}

export function isValidEvmAddress(addr: string) {
    return ethers.utils.isAddress(addr)
}

export async function transferEvmETH(telegramId: string, addressTo: string, valueToSend: string) {
    const BN = getBN()
    const vD = BN(valueToSend).div(BN(`1e18`)).toString()
    await userVerboseLog(telegramId, `Transferring ${vD} ETH to ${addressTo}`)

    const w = await getEvmWallet(telegramId);

    const web3 = await newEvmWeb3();

    const tx = await executeTxnByProvider(
        web3,
        {
            // from: account.address, // bsc unexpected revert error if this field is up
            data: '0x',
            to: addressTo,
            value: valueToSend,
            type: 2
        },
        w.privateKey
    );

	console.log('evm transaction receipt', tx)

	return tx?.transactionHash || tx
}

export async function getEvmETHBalance(address: string) {
    const web3 = await newEvmWeb3()

    const BN = getBN()
    const bal = await web3.eth.getBalance(address)

    return BN(bal.toString())
        .div(BN(`1e18`))
        .toString();
}
