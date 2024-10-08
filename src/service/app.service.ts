import { botEnum } from "../constants/botEnum.js";
import { AppModel } from "../models/app.model.js";
import { getBotInstance } from "../web3/chain.parameters.js";
import { getAppUser } from "./app.user.service.js";

export async function getAppSetting() {
    if (0 === await AppModel.countDocuments({})) {
        const newApp = new AppModel({
            purgeMessages: false,
        })
        await newApp.save()
    }

    return await AppModel.findOne({})
}

export async function isPurgingMessages() {
    const app = await getAppSetting()
    return app.purgeMessages || false
}

export async function sendBotMessage(telegramId: string, text: string) {
    try {
        const bot = getBotInstance()
        const user = await getAppUser(telegramId)
        await bot.telegram.sendMessage(user.chatId, text, { parse_mode: botEnum.PARSE_MODE_V2, inline_keyboard: [
			[
				{
					text: botEnum.dismiss.key,
					callback_data: botEnum.dismiss.value
				}
			]
		] })
    } catch (err) {
        console.log('sendBotMessage', err)
    }
}
