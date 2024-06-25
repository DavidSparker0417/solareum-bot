import { Schema, model } from 'mongoose';

const referralSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'AppUser', unique: true },
        link: { type: String },
        wallet: { type: String },
        referrer: { type: Schema.Types.ObjectId, ref: 'AppUser' }
    },
    { timestamps: true }
);

export const ReferralModel = model('Referral', referralSchema);
