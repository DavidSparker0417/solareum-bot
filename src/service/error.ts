import { botEnum } from '../constants/botEnum.js';
import { AppUserModel } from '../models/app.user.model.js';
import { getErrorMessageResponse } from '../utils/messages.js';

export async function processError(ctx: any, telegramId: string, err: any, forceSend?:boolean) {
    const errMsg = await getErrorMessageResponse(telegramId, err.message);
    if (errMsg !== null || forceSend === true) {
        let chatId = ctx.chat?.id
        if (chatId === undefined) {
            const user: any = await AppUserModel.findOne({ telegramId: telegramId });
            chatId = user !== null ? user.chatId : undefined
        }

        if (chatId === undefined) {
            console.log(`${telegramId} ${(new Date()).toLocaleString()} processError-1`)
            console.error(`${telegramId} ${(new Date()).toLocaleString()} processError-1`)
            console.error(err)
        } else {
            await ctx.telegram.sendMessage(chatId, errMsg || err.message, {
                parse_mode: botEnum.PARSE_MODE_V2
            });
			return true
        }
    } else {
		if (err.message.includes('message is not modified:') || err.message.includes('message to edit not found')) return
        console.log(`${telegramId} ${(new Date()).toLocaleString()} processError-2`)
        console.error(`${telegramId} ${(new Date()).toLocaleString()} processError-2`)
        console.error(err)
    }
}
