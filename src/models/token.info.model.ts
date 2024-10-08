import { Schema, model } from 'mongoose';

const tokenInfoSchema = new Schema(
    {
        chain: { type: String, index: true },
        owner: { type: String, index: true },
        address: { type: String, index: true },
        name: { type: String, index: true },
        symbol: { type: String, index: true },
        decimals: { type: Number, index: true },
        totalSupply: { type: String, index: true },
        lp: [{ type: String }],
        buyTax: { type: String },
        sellTax: { type: String },
        maxTx: { type: Number },
        maxWallet: { type: Number },
        price: { type: String },
        hitCount: { type: Number, default: 0 },
        age: { type: Date },
        burnt: { type: String },
        marketCap: { type: String }
    },
    { timestamps: true }
);

export const TokenInfoModel = model('TokenInfo', tokenInfoSchema);
