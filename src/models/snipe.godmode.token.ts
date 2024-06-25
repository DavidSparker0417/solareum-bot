import { Schema, model } from 'mongoose';

const snipeTokenSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, ref: 'AppUser' },
		token: { type: Schema.Types.ObjectId, ref: 'SolanaTokenInfo' },
		state: { type: String },
		disabled: { type: Boolean },
		transactions: [{ type: Schema.Types.ObjectId, ref: 'TransactionHistory' }],
		multi: { type: Boolean },
		method: { type: String },
		blockDelay: { type: Number },
		nativeCurrencyAmount: { type: String },
		tokenAmount: { type: String },
		slippage: { type: Number },
		maxTx: { type: Boolean },
		maxComputeUnits: { type: Number },
		computeUnitPrice: { type: Number },
		priorityFee: { type: String },
	},
	{ timestamps: true }
);

const snipeSyncSchema = new Schema(
	{
		snipe: { type: String, unique: true },
	},
	{ timestamps: true }
);

export const SnipeTokenModel = model('SnipeToken', snipeTokenSchema);
export const SnipeSyncModel = model('SnipeSync', snipeSyncSchema);
