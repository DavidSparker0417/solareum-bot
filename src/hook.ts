import { isPurgingMessages } from "./service/app.service.js";
import Logging from "./utils/logging.js";

export async function handleBotHookMessage(bot: any, message: any) {
    // Logging.info(`received new message ${JSON.stringify(message)}`)
    // Logging.info(`received new message ${message.MessageId}`)

    // // convert to json
    // const decodedRequestBodyString = Buffer.from(message.Body, 'base64');
    // const requestBodyObject = JSON.parse(decodedRequestBodyString.toString());

    // process message
    const handleAsync = async (request) => {
        try {
            const isPurging = await isPurgingMessages()
            if (isPurging) {
                Logging.info(`Purged ${JSON.stringify(request)}`)
            } else {
                await bot.handleUpdate(request)
            }
        } catch (err) {
            console.error(`==> ${new Date().toLocaleString()}`)
            console.error(err)
            Logging.error(`oh no ${err}`)
        }
    }

    handleAsync(message)
}