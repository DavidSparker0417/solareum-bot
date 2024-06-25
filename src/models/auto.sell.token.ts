import { Schema, model } from 'mongoose';

const autoSellTokenSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, ref: 'AppUser' },
		chain: { type: String },
		token: { type: String },
		state: { type: String },
		transaction: { type: Schema.Types.ObjectId, ref: 'TransactionHistory' },
		priceCommitted: { type: String },
		priceStamp: { type: String },
		lowPriceLimit: { type: String },
		highPriceLimit: { type: String },
		amountAtLowPrice: { type: String },
		amountAtHighPrice: { type: String }
	},
	{ timestamps: true }
);

export const AutoSellTokenModel = model('AutoSellToken', autoSellTokenSchema);
