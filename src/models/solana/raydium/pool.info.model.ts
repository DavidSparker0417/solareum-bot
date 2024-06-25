import { Schema, model } from 'mongoose';

const raydiumPoolInfoSchema = new Schema(
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
		authority: { type: String }, // not required
		openOrders: { type: String },
		targetOrders: { type: String },
		baseVault: { type: String },
		quoteVault: { type: String },
		withdrawQueue: { type: String },
		lpVault: { type: String },
		marketVersion: { type: Number }, // not required
		marketProgramId: { type: String },
		marketId: { type: String },
		marketAuthority: { type: String }, // not required,
		marketBaseVault: { type: String }, // not required,
		marketQuoteVault: { type: String }, // not required
		marketBids: { type: String }, // not required
		marketAsks: { type: String }, // not required
		marketEventQueue: { type: String }, // not required
		lookupTableAccount: { type: String },
	},
	{ timestamps: true }
);

export const RaydiumPoolInfoModel = model('RaydiumPoolInfo', raydiumPoolInfoSchema);
