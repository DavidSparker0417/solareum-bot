import { ReferralModel } from "../models/referral.model.js";
import Logging from "../utils/logging.js";
import { getAppUser } from "./app.user.service.js";
import { getWallet } from "./wallet.service.js";
import crypto from 'crypto'

export const REFERRAL_LEADING = 'https://t.me/solareum_bot?start='

const generateFakeAmount = (seedText: string = '') => {
    const buffer = crypto.randomBytes(4)
	return buffer.toString('hex');
}

export async function findNewReferralCode(telegramId: string) {
	let finalRandId
	while (true) {
		const randId = generateFakeAmount(telegramId + (new Date()).toLocaleString())
		if (0 === await ReferralModel.countDocuments({link: `${REFERRAL_LEADING}${randId}`})) {
			finalRandId = randId
			break
		}
	}
	return finalRandId
}

async function createReferral(telegramId: string) {
    const user = await getAppUser(telegramId)
	const finalRandId = await findNewReferralCode(telegramId)

    const newReferral = new ReferralModel({
        user: user._id,
        link: `${REFERRAL_LEADING}${finalRandId}`
    })
    await newReferral.save()
}

export async function getReferralLink(telegramId: string) {
    const user = await getAppUser(telegramId)
    if (0 === await ReferralModel.countDocuments({ user: user._id })) {
        await createReferral(telegramId)
    }

    const ret = await ReferralModel.findOne({ user: user._id })
    return ret?.link
}

export function getReferralCodeFromLink(link: string) {
	return link.slice(REFERRAL_LEADING.length).split('&')[0]
}

export async function getReferralWallet(telegramId: string) {
    const user = await getAppUser(telegramId)
    if (0 === await ReferralModel.countDocuments({ user: user._id })) {
        await createReferral(telegramId)
    }

    const ret = await ReferralModel.findOne({ user: user._id })
    return ret?.wallet
}

export async function getReferralPayWallet(telegramId: string) {
    const user = await getAppUser(telegramId)
    if (0 === await ReferralModel.countDocuments({ user: user._id })) {
        await createReferral(telegramId)
    }

    const ret = await ReferralModel.findOne({ user: user._id })
    if (ret?.wallet) return ret?.wallet

    try {
        const w = await getWallet(telegramId)
        return w.address
    } catch (err) {
    }
}

async function getRefereeChain(telegramId: string) {
    const user = await getAppUser(telegramId)
    let myReferrer = await ReferralModel.findOne({ user: user._id })
    let ret = []

    while (myReferrer.referrer) {
        myReferrer = await ReferralModel.findOne({user: myReferrer.referrer})
        ret = [...ret, myReferrer]
    }

    return ret
}

export async function updateReferralWallet(telegramId: string, wallet: string) {
    const user = await getAppUser(telegramId)
    if (0 === await ReferralModel.countDocuments({ user: user._id })) {
        await createReferral(telegramId)
    }

    await ReferralModel.updateOne({ user: user._id }, { wallet: wallet })
}

export async function isRefereeLink(refereeLink: string) {
    return 0 < await ReferralModel.countDocuments({ link: refereeLink })
}

export async function updateReferralReferee(telegramId: string, referralCode: string) {
	const refereeLink = `${REFERRAL_LEADING}${referralCode}`
    const refereeToAdd: any = await ReferralModel.findOne({ link: refereeLink })
    if (refereeToAdd === null) {
        throw new Error("❌ <i>Invalid referrer</i>")
    }

    await refereeToAdd.populate('user')
    const refereeList = await getRefereeChain(refereeToAdd.user.telegramId)

    const user = await getAppUser(telegramId)
    const myReferral = await ReferralModel.findOne({ user: user._id })

    if ([refereeToAdd, ...refereeList].find(r => (r.user._id ?? r.user).toString() === myReferral.user.toString())) {
        throw new Error('❌ <i>Failed to accept referral link because cyclic reference has been detected</i>')
    }

    if (refereeLink === myReferral.link) {
        throw new Error('❌ <i>Not allowed to refer myself</i>')
    }

    myReferral.referrer = refereeToAdd.user._id
    await myReferral.save()
}

export async function getReferralCount(telegramId: string) {
    const user = await getAppUser(telegramId)

    return await ReferralModel.countDocuments({referrer: user._id})
}

export async function getRefereeWallets(telegramId: string) {
    try {
        const user = await getAppUser(telegramId)
        const myReferral = await ReferralModel.findOne({ user: user._id })

        if (myReferral.referrer) {
            await myReferral.populate('user')
            const referrerList = await getRefereeChain((myReferral.user as any).telegramId)
            const walletArray = await Promise.all(referrerList.map(async (r) => {
                if (r.wallet) return r.wallet

                try {
                    await r.populate('user')
                    const w = await getWallet(r.user.telegramId)
                    return w.address
                } catch (err) {
                    return null
                }
            }))

            return walletArray.filter(w => w !== null)
        } else {
            return []
        }
    } catch (err) {
        console.error(`==> ${new Date().toLocaleString()}`)
        console.error(err)
        Logging.error(`[getRefereeWallets] ${err.message}`)
        return []
    }
}
