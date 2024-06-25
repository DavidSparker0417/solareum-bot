export interface FilteredPairInfo {
	pairAddress: string,
	chain: string
}

function filterDextoolsPairCa(url: string) : FilteredPairInfo {
	if (/^https?:\/\/(?:www\.)?dextools\.io/.test(url)) {
		let splitted = url.split('/')
		const idx = splitted?.indexOf('pair-explorer')
		if (idx > 0 && idx < splitted?.length - 1) {
			const chainMap = {
				['ether']: 'ethereum',
				['bnb']: 'bsc',
				['arbitrum']: 'arbitrum',
				['base']: 'base',
			}
			const newChain = chainMap[splitted[idx - 1]] || splitted[idx - 1]
			if (newChain !== 'solana') {
				throw new Error(`Unknown ${newChain} chain in dextools`)
			}
			return {
				pairAddress: splitted[idx + 1].split('?')[0],
				chain: newChain
			}
		} else {
			throw new Error('Unknown dextools URL')
		}
	}
}


function filterDexscreenerPairCa(url: string) : FilteredPairInfo {
	if (/^https?:\/\/(?:www\.)?dexscreener\.com/.test(url)) {
		let splitted = url.split('/')
		const idx = 4
		if (idx > 0 && idx < splitted?.length) {
			const chainMap = {
				['ether']: 'ethereum',
				['bnb']: 'bsc',
				['arbitrum']: 'arbitrum',
				['base']: 'base',
			}
			const newChain = chainMap[splitted[idx - 1]] || splitted[idx - 1]
			if (newChain !== 'solana') {
				throw new Error(`Unknown ${newChain} chain in dexscreener`)
			}
			return {
				pairAddress: splitted[idx].split('?')[0],
				chain: newChain
			}
		} else {
			throw new Error('Unknown dexscreener URL')
		}
	}
}

export function filterPairCa(url: string): FilteredPairInfo {
	return filterDextoolsPairCa(url) ?? filterDexscreenerPairCa(url) ?? { pairAddress: url, chain: 'solana' }
}