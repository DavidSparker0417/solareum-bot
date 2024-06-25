import { Schema, model } from 'mongoose';

const evmWalletSchema = new Schema(
    {
        owner: { type: Schema.Types.ObjectId, ref: 'AppUser' },
        address: { type: String, required: true },
        privateKey: { type: String, required: true },
        shortPrivateKey: { type: String, required: true },
        mnemonic: { type: String, required: false },
        shortMnemonic: { type: String, required: false }
    },
    { timestamps: true }
);

export const EvmWalletModel = model('EvmWallet', evmWalletSchema);
