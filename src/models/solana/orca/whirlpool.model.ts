import { Schema, model } from 'mongoose';

const orcaWhirlPoolInfoSchema = new Schema(
	{
		address: { type: String, unique: true },
		tokenA: { type: String },
		tokenB: { type: String },
		whitelisted: { type: Boolean },
		tickSpacing: { type: Number },
		price: { type: Number },
		lpFeeRate: { type: Number },
		protocolFeeRate: { type: Number },
		whirlpoolsConfig: { type: String },
	},
	{ timestamps: true }
);

export const OrcaWhirlPoolInfoModel = model('OrcaWhirlPoolInfo', orcaWhirlPoolInfoSchema);
