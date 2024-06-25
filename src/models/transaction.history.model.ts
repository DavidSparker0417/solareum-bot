import { Schema, model } from 'mongoose';

const transactionHistorySchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'AppUser' },
        chain: { type: String, default: '' },
        from: {type: String, required: true},
        explorer: { type: String },
        blockTime: { type: Number },
        blockNumber: { type: Number },
        fee: { type: String },
        transactionHash: { type: String }
    },
    { timestamps: true }
);

export const TransactionHistoryModel = model('TransactionHistory', transactionHistorySchema);
