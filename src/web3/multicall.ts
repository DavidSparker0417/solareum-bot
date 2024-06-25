import { WSOL_ADDRESS, getBN, getSolAccount, getSolAccounts, newSolWeb3 } from './web3.operation.js';
import { getNativeCurrencyPrice } from './chain.parameters.js';
import { getTokenInfo, getTokenPrice } from '../service/token.service.js';
import Logging from '../utils/logging.js';
import { chainConfig } from './chain.config.js';

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { MPL_TOKEN_METADATA_PROGRAM_ID, deserializeMetadata, Metadata, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata"
import { SolanaTokenInfoModel } from '../models/solana/solana.token.info.model.js';
import axios from 'axios'
import { unpackMint } from '@solana/spl-token'
import { PublicKey } from '@solana/web3.js';
import { RpcAccount } from '@metaplex-foundation/umi';

const umi = createUmi(chainConfig['solana'].rpcUrls[0])
umi.use(mplTokenMetadata())

export async function queryAndSyncToken(telegramId: string, chain: string, token: string, user: string) {
	try {
		let storedToken: any = await getTokenInfo(chain, token);

		if (storedToken === null || storedToken.totalSupply === undefined) {
			await prefetchTokensOnChain(chain, JSON.stringify([token]))
			storedToken = await getTokenInfo(chain, token);
		}

		return storedToken
	} catch (err) {
		Logging.error('[queryAndSyncToken]')
		console.error(err)
	}
}

export async function prefetchTokensOnChain(chain: string, tokens: string) {
	try {
		const tokenArray = JSON.parse(tokens)
		if (tokenArray === undefined) return

		let uniqueArray = []

		for (const t of tokenArray) {
			if (tokenArray[tokenArray.indexOf(t)] === t) {
				// if (0 === await TokenInfoModel.countDocuments({ chain: chain, address: t })) {
				uniqueArray = [...uniqueArray, t]
			}
		}

		if (uniqueArray.length === 0) return

		const BN = getBN()
		const connection = await newSolWeb3('', chain)
		const tokenAccounts = getSolAccounts(uniqueArray)
		/** tokenAccounts
			  [
				PublicKey [PublicKey(EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)] {
					_bn: <BN: c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61>
				}
			]
		 */
		const tarray = await connection.getMultipleAccountsInfo(tokenAccounts)
		/** tarray
			  [
				{
					data: <Buffer 01 00 00 00 1c e3 59 ed 5a 01 2e 04 fa 14 2b 9c 75 1a 1c 5e 87 cf d0 a0 16 1b 9c 85 ff d3 1b 78 cd fc d8 f6 23 66 30 19 41 e3 11 00 06 01 01 00 00 00 ... 32 more bytes>,
					executable: false,
					lamports: 217267966440,
					owner: PublicKey [PublicKey(TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)] {
					_bn: <BN: 6ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9>
					},
					rentEpoch: 361,
					space: 82
				}
			]
		 */
		const mintInfoArray = await Promise.all(tarray.map((t, idx) => unpackMint(tokenAccounts[idx], t)))
		/** mintInfoArray
			[
				{
					address: undefined,
					mintAuthority: PublicKey [PublicKey(2wmVCSfPxGPjrnMMn7rchp4uaeoTqN39mXFC2zhPdri9)] {
					_bn: <BN: 1ce359ed5a012e04fa142b9c751a1c5e87cfd0a0161b9c85ffd31b78cdfcd8f6>
					},
					supply: 5034943339062819n,
					decimals: 6,
					isInitialized: true,
					freezeAuthority: PublicKey [PublicKey(3sNBr7kMccME5D55xNgsmYpZnzPgP2g12CixAajXypn6)] {
					_bn: <BN: 2a9e5edbb53c04679098ff7b12651714434fc08c562a9a3b861105e672d42273>
					},
					tlvData: <Buffer >
				}
			]
		 */

		const metaProgId = getSolAccount(MPL_TOKEN_METADATA_PROGRAM_ID)
		const tokenMetaPubKeyArray = tokenAccounts.map(t => PublicKey.findProgramAddressSync([Buffer.from("metadata"), metaProgId.toBuffer(), t.toBuffer()], metaProgId)[0])
		const metaDataAccountArray = await connection.getMultipleAccountsInfo(tokenMetaPubKeyArray)
		const metadataArray = metaDataAccountArray.map((m, idx) => {
			return m === null ? null : deserializeMetadata({
				executable: m.executable,
				owner: m.owner.toBase58(),
				lamports: m.lamports,
				rentEpoch: m.rentEpoch,
				publicKey: tokenAccounts[idx].toBase58(),
				data: Uint8Array.from(m.data)
			} as any)
		})
		/** metadataArray
			  [
				{
					publicKey: undefined,
					header: {
						executable: false,
						lamports: 5616720,
						owner: [PublicKey [PublicKey(metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s)]],
						rentEpoch: 361,
						space: 679
					},
					key: 4,
					updateAuthority: '2wmVCSfPxGPjrnMMn7rchp4uaeoTqN39mXFC2zhPdri9',
					mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
					name: 'USD Coin',
					symbol: 'USDC',
					uri: '',
					sellerFeeBasisPoints: 0,
					creators: { __option: 'None' },
					primarySaleHappened: false,
					isMutable: true,
					editionNonce: { __option: 'Some', value: 252 },
					tokenStandard: { __option: 'None' },
					collection: { __option: 'None' },
					uses: { __option: 'None' },
					collectionDetails: { __option: 'None' },
					programmableConfig: { __option: 'None' }
				}
			]
		 */

		// // Retrieve the `indexed-route-map`
		// const routeMapResponse = await axios.get('http://127.0.0.1:10115/indexed-route-map')
		// const indexedRouteMap = routeMapResponse.data
		// const getMint = (index) => indexedRouteMap["mintKeys"][index];
		// const getIndex = (mint) => indexedRouteMap["mintKeys"].indexOf(mint);

		// // Generate the route map by replacing indexes with mint addresses
		// var generatedRouteMap = {};
		// Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
		// generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
		// });

		// // List all possible input tokens by mint address
		// const allInputMints = Object.keys(generatedRouteMap);

		// // List all possition output tokens that can be swapped from the mint address for SOL.
		// // SOL -> X
		// const swappableOutputForSOL = generatedRouteMap[WSOL_ADDRESS];
		const solPrice = await getNativeCurrencyPrice(chain)
		// console.log({ allInputMints, swappableOutputForSOL })
		const prices = await Promise.all(tokenAccounts.map(async (t, idx) => {
			try {
				if (t.toString() === WSOL_ADDRESS) {
					return solPrice
				}

				const solAmount = '1000000'
				const quoteResponse = await axios.get(`http://127.0.0.1:10115/quote?inputMint=${WSOL_ADDRESS}&outputMint=${t.toString()}&amount=${solAmount}&slippageBps=0`)
				/** quoteResponse.data
					{
						inputMint: WSOL_ADDRESS,
						inAmount: '1000000',
						outputMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
						outAmount: '59839',
						otherAmountThreshold: '59839',
						swapMode: 'ExactIn',
						slippageBps: 0,
						platformFee: null,
						priceImpactPct: '0',
						routePlan: [
							{ swapInfo: [Object], percent: 100 },
							{ swapInfo: [Object], percent: 100 },
							{ swapInfo: [Object], percent: 100 }
						],
						contextSlot: 231103840,
						timeTaken: 0.061438603
					}
				 */
				const pricePerSol = BN(quoteResponse.data.outAmount).div(BN(`1e${mintInfoArray[idx].decimals}`)).div(BN(quoteResponse.data.inAmount).div(BN('1e9'))).toString()
				return BN(solPrice || '0').eq(0) ? '0' : BN(pricePerSol).div(BN(solPrice)).toString()
			} catch (err) {
				return null
			}
		}))

		await Promise.all(tokenAccounts.map(async (t, idx) => {
			const id = chain + "_" + t.toString()
			const tokenInfo = await SolanaTokenInfoModel.findOne({ id: id })
			const tSupply = BN(mintInfoArray[idx].supply.toString()).div(BN(`1e${mintInfoArray[idx].decimals}`)).toString()

			if (tokenInfo === null) {
				const newTokenInfo = new SolanaTokenInfoModel({
					id: id,
					chain: chain,
					owner: tarray[idx].owner.toString(),
					address: t.toString(),
					name: metadataArray[idx]? metadataArray[idx].name: 'N/A',
					symbol: metadataArray[idx]? metadataArray[idx].symbol: 'N/A',
					decimals: mintInfoArray[idx].decimals,
					totalSupply: tSupply,

					mintAuthority: mintInfoArray[idx].mintAuthority?.toString(),
					isInitialized: mintInfoArray[idx].isInitialized,
					freezeAuthority: mintInfoArray[idx].freezeAuthority?.toString(),
					tlvData: mintInfoArray[idx].tlvData.toString('hex'),
					updateAuthority: metadataArray[idx]? metadataArray[idx].updateAuthority?.toString(): 'N/A',
					isMutable: metadataArray[idx]? metadataArray[idx].isMutable: false,

					price: prices[idx],
					marketCap: prices[idx] ? BN(prices[idx]).times(BN(tSupply)).toString() : '0'
				})
				await newTokenInfo.save()
			} else {
				tokenInfo.name = metadataArray[idx]? metadataArray[idx].name: 'N/A'
				tokenInfo.symbol = metadataArray[idx]? metadataArray[idx].symbol: 'N/A'
				tokenInfo.decimals = mintInfoArray[idx].decimals
				tokenInfo.totalSupply = tSupply

				tokenInfo.mintAuthority = mintInfoArray[idx].mintAuthority?.toString()
				tokenInfo.isInitialized = mintInfoArray[idx].isInitialized
				tokenInfo.freezeAuthority = mintInfoArray[idx].freezeAuthority?.toString()
				tokenInfo.tlvData = mintInfoArray[idx].tlvData.toString('hex')
				tokenInfo.updateAuthority = metadataArray[idx]? metadataArray[idx].updateAuthority?.toString(): 'N/A'
				tokenInfo.isMutable = metadataArray[idx]? metadataArray[idx].isMutable: false

				if (BN(prices[idx]).gt('0')) {
					tokenInfo.price = prices[idx],
						tokenInfo.marketCap = prices[idx] ? BN(prices[idx]).times(BN(tSupply)).toString() : '0'
				}

				await tokenInfo.save()
			}
		}))
	} catch (err) {
		Logging.error(`[prefetchTokensOnChain] ${chain}`)
		console.error(err)
	}
}

export async function getTokenBalance(chain: string, token: string, address: string) {
	const connection = await newSolWeb3('', chain)
	const userPubkey = new PublicKey(address)
	const tokenPubkey = new PublicKey(token)

	let tokenInfo: any = await getTokenInfo(chain, token)
	if (tokenInfo === null) {
		throw new Error('❌ Such token does not exist')
	}

	const BN = getBN()
	const tokenAccount = await connection.getTokenAccountsByOwner(userPubkey, { mint: tokenPubkey })
	/**
	{
		context: { apiVersion: '1.16.18', slot: 231455697 },
		value: [
			{
			account: [Object],
			pubkey: [PublicKey [PublicKey(3LwU9PrLWv1yT59KS4TtSJMFaZp1MButuzfMckmvatDx)]]
			}
		]
	}
	 */
	let balance = '0'
	if (tokenAccount.value.length > 0) {
		const tokenAccountInfo = tokenAccount.value[0].account
		const info = await connection.getTokenAccountBalance(tokenAccount.value[0].pubkey)
		balance = BN(info.value.amount.toString()).div(BN(`1e${info.value.decimals}`)).toString()
	}

	return {
		...tokenInfo._doc,
		balance
	}
}
