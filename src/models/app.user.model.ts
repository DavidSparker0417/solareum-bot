import { Schema, model } from 'mongoose';

export interface IAppUser {
    userId: string;
    telegramId: string;
    firstName: string;
    lastName: string;
    userName: string;
    chatId: number;
}

const appUserSchema = new Schema<IAppUser>(
    {
        telegramId: { type: String, unique: true },
        firstName: { type: String },
        lastName: { type: String },
        userName: { type: String },
        chatId: { type: Number },
    },
    { timestamps: true }
);


export const AppUserModel = model<IAppUser>('AppUser', appUserSchema);
