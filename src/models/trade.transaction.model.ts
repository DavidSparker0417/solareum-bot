import { Schema, model } from 'mongoose';

const tradeTransactionSchema = new Schema(
	{
		user: { type: Schema.Types.ObjectId, ref: 'AppUser' },
		chain: { type: String },
		transactionHash: { type: String, unique: true },
		transaction: { type: Schema.Types.ObjectId, ref: 'TransactionHistory' },
		from: { type: String },
		tokenAddress: { type: String },
		side: { type: String }, // buy, sell
		solAmount: { type: String },
		tokenAmount: { type: String },
	},
	{ timestamps: true }
);

export const TradeTransactionModel = model('TradeTransaction', tradeTransactionSchema);
