import { createCanvas, loadImage, registerFont } from "canvas";
import Logging from "../utils/logging.js";
import QRCode from 'qrcode'
import { getBotInstance, getNativeCurrencyPrice, getNativeCurrencySymbol } from "../web3/chain.parameters.js";
import { getPnL } from "./trade.service.js";
import { getBN } from "../web3/web3.operation.js";
import { getTokenInfo, getTokenPrice } from "./token.service.js";
import { getReferralCodeFromLink, getReferralLink } from "./referral.service.js";
import { getAppUser } from "./app.user.service.js";
registerFont('./assets/SourceCodePro-SemiBold.ttf', { family: 'Manrope SemiBold' })

const maxSymbolLength = 6;
const imageProportion = 2;
const maxReffLength = 13;

function resetTextSize(ctx) {
	ctx.font = "1rem Manrope Semibold"
}

function drawText(ctx, x, y, text, style, fontSize = 1, fontFamily = "Manrope SemiBold") {
	ctx.font = `${fontSize * imageProportion}rem ${fontFamily}`;
	ctx.fillStyle = style
	ctx.fillText(text, imageProportion * x, imageProportion * y);
}

/**
 * 
 * @param pnlInfo nativePrice, nativeSymbol, tokenSymbol, entry (in SOL), worth (in SOL), reflink, refcode
 * @returns 
 */
export async function createPnLCard(pnlInfo: any) {
	try {
		const canvas = createCanvas(900, 1200);
		const ctx = canvas.getContext("2d");

		const entry = parseFloat(Number(pnlInfo.initial).toFixed(4))
		const worth = parseFloat(Number(pnlInfo.worth).toFixed(4))
		const isProfit = worth > entry? 1: worth < entry? -1: 0;
		const gainz = `${isProfit > 0 ? "+" : ""}${(((worth * 100) / entry) - 100).toFixed(2)}%`
		const tokenSymbolRaw = pnlInfo.tokenSymbol
		const tokenSymbol = tokenSymbolRaw.length > maxSymbolLength ? `${tokenSymbolRaw.slice(0, maxSymbolLength)}...` : tokenSymbolRaw
		const nativeSymbol = pnlInfo.nativeSymbol

		// Calculate position of data prices
		resetTextSize(ctx)
		const x_start = 60
		const space_width = 10 * imageProportion
		const prices_x_bigger = Math.max(ctx.measureText(`${entry}`).width, ctx.measureText(`${worth}`).width) + ctx.measureText(` ${nativeSymbol}`).width
		const prices_x_start = (prices_x_bigger + x_start + ctx.measureText("Current Price").width) + space_width
		const prices_x_dollar_start = prices_x_start + (space_width / 4)

		const bgImage = await loadImage(
			"./assets/card_bg.jpg"
		);

		// center fill
		const hRatio = canvas.width / bgImage.width;
		const vRatio = canvas.height / bgImage.height;
		const ratio = Math.max(hRatio, vRatio);
		const centerShift_x = (canvas.width - bgImage.width * ratio) / 2;
		const centerShift_y = (canvas.height - bgImage.height * ratio) / 2;

		ctx.drawImage(
			bgImage,
			0,
			0,
			bgImage.width,
			bgImage.height,
			centerShift_x,
			centerShift_y,
			bgImage.width * ratio,
			bgImage.height * ratio
		);

		// Profit or Loss text
		drawText(ctx, x_start, 117, isProfit > 0 ? "Profit" : isProfit < 0? "Loss": "Equal", isProfit > 0 ? "#2BBD84" : isProfit < 0? "#E95065": "#CCCCCC")
		ctx.rect(150 * imageProportion, 93 * imageProportion, 1 * imageProportion, 32 * imageProportion);
		ctx.fillStyle = "#676767";
		ctx.fill();
		drawText(ctx, 165, 117, `${tokenSymbol} / ${nativeSymbol}`, "#CFCFCF")


		//Trade percentage
		drawText(ctx, x_start, 185, gainz, isProfit > 0 ? "#2BBD84" : isProfit < 0? "#E95065": "#CCCCCC", 2.8)

		//Entry and Worth Price
		drawText(ctx, x_start, 225, "Initial", "#CFCFCF")
		drawText(ctx, x_start, 255, "Worth", "#CFCFCF")
		ctx.textAlign = "right"
		drawText(ctx, prices_x_start, 225, `${entry} ${nativeSymbol}`, "#D8AC12")
		drawText(ctx, prices_x_start, 255, `${worth} ${nativeSymbol}`, "#D8AC12")
		ctx.textAlign = "left"
		// drawText(ctx, prices_x_dollar_start, 225, `(${entryInDollars}$)`, "#CFCFCF", 0.7)
		// drawText(ctx, prices_x_dollar_start, 255, `(${worthInDollars}$)`, "#CFCFCF", 0.7)


		//QR code
		const url = pnlInfo.reflink || "https://t.me/solareum_bot"
		const refCode = pnlInfo.refcode
		const isShrinking = refCode.length > maxReffLength

		let qrData = await QRCode.toDataURL(url, { width: 360 });
		const qrImage = await loadImage(
			qrData
		);

		ctx.drawImage(
			qrImage,
			0,
			0,
			qrImage.width,
			qrImage.height,
			59 * imageProportion,
			296 * imageProportion,
			qrImage.width * ratio,
			qrImage.height * ratio
		);

		// QR code info
		drawText(ctx, 260, 320, "Referral Code", "#CFCFCF", 0.9)
		drawText(ctx, 260, 350, `${isShrinking ? `${refCode.slice(0, maxReffLength)}...` : refCode}`, "#FFFFFF", 1.2)

		const logoImage = await loadImage('./assets/logo2.png')
		ctx.drawImage(
			logoImage,
			0,
			0,
			logoImage.width,
			logoImage.height,
			bgImage.width - 96 - 16,
			16,
			96,
			96 * logoImage.width / bgImage.width
		);

		// // Graphics
		// const imagePath = isProfit ? "./assets/profit_graphics.png" : "./assets/loss_graphics.png"
		// const graphicsImage = await loadImage(
		//     imagePath
		// );

		// ctx.drawImage(
		//     graphicsImage,
		//     0,
		//     0,
		//     graphicsImage.width,
		//     graphicsImage.height,
		//     2 * imageProportion,
		//     30 * imageProportion,
		//     graphicsImage.width * ratio,
		//     graphicsImage.height * ratio
		// );

		return canvas.toBuffer()
	} catch (err) {
		Logging.error(`[createPnLCard] ${err.message}`)
		console.error(err)
	}
}

export async function postPnLCard(telegramId: string, chain: string, token: string) {
	const BN = getBN()
	const nativePrice = await getNativeCurrencyPrice(chain)
	const pnlInfo = await getPnL(telegramId, chain, token)
	const tokenInfo = await getTokenInfo(chain, token)
	const tokenPrice = await getTokenPrice(chain, token)

	const reflink = await getReferralLink(telegramId)
	const bufferCard = await createPnLCard({
		nativePrice: Number(nativePrice),
		nativeSymbol: await getNativeCurrencySymbol(chain),
		tokenSymbol: tokenInfo.symbol,
		...pnlInfo,
		refcode: getReferralCodeFromLink(reflink)
	})
	const appUser = await getAppUser(telegramId)
	const bot = getBotInstance()
	await bot.telegram.sendPhoto(appUser.chatId, { source: bufferCard });
}
