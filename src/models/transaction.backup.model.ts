import { Schema, model } from 'mongoose';

const transactionBackupSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'AppUser' },
        chain: { type: String },
		transactionHash: { type: String },
        transactionMessage: { type: String },
		rawTransaction: { type: String },
        msgId: { type: Number },
        label: { type: String },
        error: { type: String },
        exInfo: { type: String }
    },
    { timestamps: true }
);

export const TransactionBackupModel = model('TransactionBackup', transactionBackupSchema);
