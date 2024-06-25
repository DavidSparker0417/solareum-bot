/*
 * each chain has multiple cores to synchronize and invoke some actions
 * sync: fetch all of block headers, receipts, pending transactions
 * tx: analyze and pending transactions
 * analyze:
 */
export const core_info = {
    solana: {
		route: 1,
		background: [2, 3, 4, 5, 6],
		scaling: [7, 8, 9, 10, 11, 12, 13, 14],
		snipe: 15,
		snipes: [16, 17, 18, 19, 20, 21, 22, 23, 24],
		autosells: [25, 26],
		autobuys: [27, 28],
        sync: 29,
        tx: 30,
        copytrade: 31,
    }
}

export function getAllCores(chain: string) {
    return [
		core_info[chain].route,
		...core_info[chain].background,
		...core_info[chain].scaling,
		core_info[chain].sync,
		core_info[chain].tx,
		core_info[chain].snipe,
		...core_info[chain].snipes,
		...core_info[chain].autosells,
		...core_info[chain].autobuys,
		core_info[chain].copytrade
	]
}