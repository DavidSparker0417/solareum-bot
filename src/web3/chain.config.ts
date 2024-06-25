import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();
if (process.env.NODE_ENV == ('development' || 'development ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else if (process.env.NODE_ENV == ('production' || 'production ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env') });
} else if (process.env.NODE_ENV == ('staging' || 'staging ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.staging') });
}

export const chainConfig = {
    solana: {
        nativeCurrency: {
            label: 'SOL',
            decimals: 9
        },
        rpcUrls: [
			process.env.SOLANA_RPC_DOLOHOV,
			process.env.SOLANA_RPC_DOLOHOV,
			// 'https://solana-mainnet.core.chainstack.com/aa771decf557aac180029c47fa19e739', // chainstack, minhnguyen1994@gmail.com
			// 'https://solana-mainnet.core.chainstack.com/aa771decf557aac180029c47fa19e739', // chainstack, solareum-rpc
			'https://mainnet.helius-rpc.com/?api-key=9a24f0cb-ba18-441e-9352-487b50301544', // helius, john.avery.1119@gmail.com
			'https://nd-468-856-411.p2pify.com/bee679eaeba5c2ea04571536171321e0/', // chainstack, solareum-elastic
			'https://api.mainnet-beta.solana.com/', /// default mainnet
			'https://api.devnet.solana.com/', // devnet
        ],
        wsUrls: [
			// 'wss://ws-nd-468-856-411.p2pify.com/bee679eaeba5c2ea04571536171321e0/',
            'wss://api.mainnet-beta.solana.com/',
        ],
        blockExplorer: 'https://solscan.io', //'https://explorer.solana.com', 'https://solscan.io'
        feeDistributor: process.env.FEE_DISTRIBUTOR,
		jupiterAPI: '',
        tokens: [
            'So11111111111111111111111111111111111111112', // WSOL
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        ],
        priceFeeds: [
            'H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG', // WSOL
            '3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL', // USDT
            'Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD', // USDC
        ],
        lpLocksAddress: []
    }
};

export const lpLockersConfig = {
};
