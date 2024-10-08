import { Schema, model } from 'mongoose';

const autoBuyTokenSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, ref: 'AppUser' },
		chain: { type: String },
		token: { type: String },
		state: { type: String },
		transaction: { type: Schema.Types.ObjectId, ref: 'TransactionHistory' },
		priceCommitted: { type: String },
		priceStamp: { type: String },
		priceLimit: { type: String },
		amountAtLimit: { type: String },
		multi: { type: Boolean },
		slippage: { type: Number },
		gasPrice: { type: Number }
	},
	{ timestamps: true }
);

export const AutoBuyTokenModel = model('AutoBuyToken', autoBuyTokenSchema);
