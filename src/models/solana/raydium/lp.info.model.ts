import { Schema, model } from 'mongoose';

const raydiumLPInfoSchema = new Schema(
	{
		id: { type: String, unique: true },
		baseMint: { type: String },
		quoteMint: { type: String },
		lpMint: { type: String },
		baseDecimals: { type: Number },
		quoteDecimals: { type: Number },
		lpDecimals: { type: Number },
		version: { type: Number },
		programId: { type: String },
		authority: { type: String },
		openOrders: { type: String },
		targetOrders: { type: String },
		baseVault: { type: String },
		quoteVault: { type: String },
		withdrawQueue: { type: String },
		lpVault: { type: String },
		marketVersion: { type: Number },
		marketProgramId: { type: String },
		marketId: { type: String },
		marketAuthority: { type: String },
		marketBaseVault: { type: String },
		marketQuoteVault: { type: String },
		marketBids: { type: String },
		marketAsks: { type: String },
		marketEventQueue: { type: String },
		lookupTableAccount: { type: String },
	},
	{ timestamps: true }
);

export const RaydiumLPInfoModel = model('RaydiumLPInfo', raydiumLPInfoSchema);
