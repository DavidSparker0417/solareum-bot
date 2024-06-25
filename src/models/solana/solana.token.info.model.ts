import { Schema, model } from 'mongoose';

const solanaTokenInfoSchema = new Schema(
    {
		id: { type:String, unique: true },
		chain: { type: String },
        owner: { type: String },
        address: { type: String },
        name: { type: String, index: true },
        symbol: { type: String, index: true },
        decimals: { type: Number, index: true },
        totalSupply: { type: String, index: true },
		mintAuthority: { type: String },
		isInitialized: { type: Boolean },
		freezeAuthority: {type: String}, 
		tlvData: { type: String },
		updateAuthority: { type: String },
		isMutable: { type: Boolean },
        price: { type: String },
        hitCount: { type: Number, default: 0 },
        age: { type: Date },
        burnt: { type: String },
        marketCap: { type: String }
    },
    { timestamps: true }
);

export const SolanaTokenInfoModel = model('SolanaTokenInfo', solanaTokenInfoSchema);
