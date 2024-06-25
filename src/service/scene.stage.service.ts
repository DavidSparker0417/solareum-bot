import { AutoBuyListener } from "../commands/actions/auto/autobuy.processor.js";
import { AutoSellListener } from "../commands/actions/auto/autosell.processor.js";
import { BridgeListener } from "../commands/actions/bridge/bridge.processor.js";
import { CopyTradeListener } from "../commands/actions/copytrade/copytrade.processor.js";
import { ManualBuyAmountListener } from "../commands/actions/manual/buy.token.processor.js";
import { ManualSellTokenListener } from "../commands/actions/manual/sell.token.processor.js";
import { ReferralListener } from "../commands/actions/referral/referral.processor.js";
import { SettingsListener } from "../commands/actions/settings/settings.processor.js";
import { SnipeValuesListener } from "../commands/actions/snipe/snipe.values.processor.js";
import { TokenBuyXETHAmountListener, TokenBuyXTokenAmountListener } from "../commands/actions/token/token.buy.processor.js";
import { TokenSellXEthAmountListener, TokenSellXTokenAmountListener } from "../commands/actions/token/token.sell.processor.js";
import { MultiWalletTransferNativeCurrencyListener } from "../commands/actions/transfer/multi.wallet.transfer/multi.wallet.transfer.nativecurrency.listener.js";
import { MultiWalletTransferTokenListener } from "../commands/actions/transfer/multi.wallet.transfer/multi.wallet.transfer.token.listener.js";
import { TransferNativeCurrencyToListener } from "../commands/actions/transfer/transfer.nativecurrency.listener.js";
import { TransferTokenTokenListener } from "../commands/actions/transfer/transfer.token.listener.js";
import { PvKeyMnemonicListener } from "../commands/actions/wallet/pvkey.mnemonic.listener.js";
import { PvKeyMnemonicMultiWalletConnectListener } from "../commands/actions/wallet/pvkey.mnemonic.multi.wallet.connect.listener.js";
import { PvKeyMnemonicMultiWalletGenerateListener } from "../commands/actions/wallet/pvkey.mnemonic.multi.wallet.generate.listener.js";
import { RenameMultiWalletListener } from "../commands/actions/wallet/rename.multi.wallet.listener.js";
import { IAppUser } from "../models/app.user.model.js";
import { ISceneStage, SceneStageModel } from "../models/scene.stage.model.js";
import { AUTO_BUY_LISTENER, AUTO_SELL_LISTENER, COPY_TRADE_LISTENER, MANUAL_BUY_TOKEN_LISTENER, MANUAL_SELL_TOKEN_LISTENER, MIX_LISTENER, MULTI_WALLET_TRANSFER_NATIVE_CURRENCY_LISTENER, MULTI_WALLET_TRANSFER_TOKEN_LISTENER, PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER, PV_KEY_MNEMONIC_MULTI_WALLET_GENERATE_LISTENER, REFERRAL_LISTENER, RENAME_MULTI_WALLET_LISTENER, SETTINGS_LISTENER, SNIPE_INPUT_LISTENER, TOKEN_BUY_X_AMOUNT_LISTENER, TOKEN_BUY_X_TOKEN_AMOUNT_LISTENER, TOKEN_SELL_X_ETH_AMOUNT_LISTENER, TOKEN_SELL_X_TOKEN_AMOUNT_LISTENER, TRANSFER_NATIVE_CURRENCY_LISTENER, TRANSFER_TOKEN_TOKEN_LISTENER, WALLET_KEY_LISTENER, BRIDGE_LISTENER } from "../utils/common.js";
import Logging from "../utils/logging.js";
import { getAppUser } from "./app.user.service.js";


export interface ISceneResponse {
    appUser?: IAppUser;
    scene?: ISceneStage
}

export class SceneStageService {
    public async getSceneStage(telegramId: string) {
        const user = await getAppUser(telegramId);
        let response: ISceneResponse = {};
        response.appUser = user
        await SceneStageModel.findOne({ owner: user._id.toString() }).then(res => {
            response.scene = res
        }).catch((err) => {
            console.error(`==> ${new Date().toLocaleString()}`)
            console.error(err)
            Logging.error(`[getSceneStage] ${err.message}`);
        });
        return response
    }


    public async saveScene(telegramId: string, name: string, text: string, updateDate: Date) {
        const user = await getAppUser(telegramId);
        if (0 === (await SceneStageModel.countDocuments({ owner: user._id }))) {
            const wallet = new SceneStageModel({
                owner: user._id,
                name: name,
                text: text,
                date: new Date(),
            });

            await wallet.save();
        } else {
            await SceneStageModel.findOneAndUpdate({ owner: user._id }, {
                name: name,
                text: text,
                date: updateDate,
            })
        }
    }

    public async deleteScene(telegramId: string) {
        const user = await getAppUser(telegramId);
        await SceneStageModel.deleteOne({ owner: user._id }).then(res => {
            return res;
        }).catch((err) => {
            console.error(`==> ${new Date().toLocaleString()}`)
            console.error(err)
            Logging.error(`[deleteScene] ${err.message}`);
        });
    }


    public async processSceneStage(telegramId: string, text: string, scene: ISceneResponse, ctx: any) {
        if (scene != null) {
            if (scene.scene.name === WALLET_KEY_LISTENER) {
                await new PvKeyMnemonicListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === TRANSFER_NATIVE_CURRENCY_LISTENER) {
                await new TransferNativeCurrencyToListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === TRANSFER_TOKEN_TOKEN_LISTENER) {
                await new TransferTokenTokenListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === TOKEN_BUY_X_AMOUNT_LISTENER) {
                await new TokenBuyXETHAmountListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === TOKEN_BUY_X_TOKEN_AMOUNT_LISTENER) {
                await new TokenBuyXTokenAmountListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === TOKEN_SELL_X_ETH_AMOUNT_LISTENER) {
                await new TokenSellXEthAmountListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === TOKEN_SELL_X_TOKEN_AMOUNT_LISTENER) {
                await new TokenSellXTokenAmountListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === PV_KEY_MNEMONIC_MULTI_WALLET_CONNECT_LISTENER) {
                await new PvKeyMnemonicMultiWalletConnectListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === PV_KEY_MNEMONIC_MULTI_WALLET_GENERATE_LISTENER) {
                await new PvKeyMnemonicMultiWalletGenerateListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === RENAME_MULTI_WALLET_LISTENER) {
                await new RenameMultiWalletListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === MULTI_WALLET_TRANSFER_NATIVE_CURRENCY_LISTENER) {
                await new MultiWalletTransferNativeCurrencyListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === MULTI_WALLET_TRANSFER_TOKEN_LISTENER) {
                await new MultiWalletTransferTokenListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === MANUAL_BUY_TOKEN_LISTENER) {
                await new ManualBuyAmountListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name === MANUAL_SELL_TOKEN_LISTENER) {
                await new ManualSellTokenListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name == SETTINGS_LISTENER) {
                await new SettingsListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name == AUTO_BUY_LISTENER) {
                await new AutoBuyListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name == AUTO_SELL_LISTENER) {
                await new AutoSellListener().processMessage(telegramId, scene, text, ctx)
            }
            else if (scene.scene.name == SNIPE_INPUT_LISTENER) {
                await new SnipeValuesListener().processMessage(telegramId, scene, text, ctx)
            } else if (scene.scene.name === COPY_TRADE_LISTENER) {
                await new CopyTradeListener().processMessage(telegramId, scene, text, ctx)
            } else if (scene.scene.name === REFERRAL_LISTENER) {
                await new ReferralListener().processMessage(telegramId, scene, text, ctx)
            } else if (scene.scene.name === BRIDGE_LISTENER) {
                await new BridgeListener().processMessage(telegramId, scene, text, ctx)
            }
        }
    }
}