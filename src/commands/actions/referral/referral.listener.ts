import { Scenes } from 'telegraf';
import { botEnum } from '../../../constants/botEnum.js';
import { REFERRAL_LISTENER } from '../../../utils/common.js';
import { SceneStageService } from '../../../service/scene.stage.service.js';
import { processError } from '../../../service/error.js';
import { updateChatId } from '../../../service/app.user.service.js';

export const referralListener = new Scenes.BaseScene(REFERRAL_LISTENER);

// send a prompt message when user enters scene
referralListener.enter(async (ctx: any) => {
    const telegramId = ctx.from.id;

    try {
        const context = {
            inputType: ctx.scene.state.input_type,
            msgId: ctx.scene.state.msgId,
        }
        let ret;

        await updateChatId(telegramId, ctx.chat.id)

        if (ctx.scene.state.input_type === 'update-payee-wallet') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Please input wallet address to get paid from referrals`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, REFERRAL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        } else if (ctx.scene.state.input_type === 'generate-referral-token-ca') {
            ret = await ctx.telegram.sendMessage(ctx.chat.id, `Please input <b>token address</b> to generate <b>referral link</b> by`, {
                parse_mode: botEnum.PARSE_MODE_V2,
                reply_markup: {
                    force_reply: true
                }
            });

            await new SceneStageService().saveScene(telegramId, REFERRAL_LISTENER, JSON.stringify(context), new Date());
            await ctx.scene.leave();
        }
    } catch (err) {
        await processError(ctx, telegramId, err)
    }
});
