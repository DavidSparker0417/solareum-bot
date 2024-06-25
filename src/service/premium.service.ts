import { IPremium, PremiumModel } from '../models/premium.model.js';
import Logging from '../utils/logging.js';
import { getAppUser } from './app.user.service.js';

export class PremiumService {
    public async getPremium(telegramId: string): Promise<IPremium> {
        const user = await getAppUser(telegramId);
        let response: IPremium = {};
        await PremiumModel.findOne({ owner: user._id })
            .then((premium) => {
                response = premium;
            })
            .catch((err) => {
                console.error(`==> ${new Date().toLocaleString()}`)
                console.error(err)
                Logging.error(err.message);
                response = {};
            });
        return response;
    }
}
