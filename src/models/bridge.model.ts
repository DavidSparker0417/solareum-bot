import { Schema, model } from 'mongoose';

const bridgeSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, ref: 'AppUser' },
		fromCurrency: { type: String, required: true },
		toCurrency: { type: String, required: true },
		tradePair: { type: String, required: true },
		amount: { type: String, required: true },
		to: { type: String, required: true },
		state: { type: String, required: true },
		depositTransaction: { type: String },
		depositResult: { type: String },
		depositError: { type: String },
		orderId: { type: String },
		orderError: { type: String },
		withdrawAmount: {type: String },
		withdrawId: { type: String },
		withdrawError: { type: String },
		withdrawTransaction: { type: String },
	},
	{ timestamps: true }
);

export const BridgeModel = model('Bridge', bridgeSchema);
