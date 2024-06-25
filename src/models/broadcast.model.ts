import { Schema, model } from 'mongoose';

const broadcastSchema = new Schema(
	{
		content: { type: String },
		usersLeft: { type: Number }
	},
	{ timestamps: true }
);

export const BroadcastModel = model('Broadcast', broadcastSchema);
