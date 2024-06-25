import { PublicKey } from '@solana/web3.js'
const BN = require('bignumber.js')

BN.config({
	EXPONENTIAL_AT: [-40, 96],
	ROUNDING_MODE: 3
});

export const MAX_SLOT_DIFFERENCE = 25
export const Magic = 0xa1b2c3d4
export enum AccountType {
	Unknown,
	Mapping,
	Product,
	Price,
	Test,
	Permission,
}
export enum PriceType {
	Unknown,
	Price,
}

export enum PriceStatus {
	Unknown,
	Trading,
	Halted,
	Auction,
	Ignored,
}

export interface Ema {
	valueComponent: bigint
	value: number
	numerator: bigint
	denominator: bigint
}

export enum CorpAction {
	NoCorpAct,
}

export interface Price {
	priceComponent: bigint
	price: number
	confidenceComponent: bigint
	confidence: number
	status: PriceStatus
	corporateAction: CorpAction
	publishSlot: number
}

export interface PriceComponent {
	publisher: PublicKey
	aggregate: Price
	latest: Price
}

export function parseBaseData(data: Buffer) {
	// data is too short to have the magic number.
	if (data.byteLength < 4) {
		return undefined
	}

	const magic = data.readUInt32LE(0)
	if (magic === Magic) {
		// program version
		const version = data.readUInt32LE(4)
		// account type
		const type: AccountType = data.readUInt32LE(8)
		// account used size
		const size = data.readUInt32LE(12)
		return { magic, version, type, size }
	} else {
		return undefined
	}
}

const empty32Buffer = Buffer.alloc(32)
const PKorNull = (data: Buffer) => (data.equals(empty32Buffer) ? null : new PublicKey(data))

export interface Product {
	[index: string]: string
}

export const parseProductData = (data: Buffer) => {
	// pyth magic number
	const magic = data.readUInt32LE(0)
	// program version
	const version = data.readUInt32LE(4)
	// account type
	const type = data.readUInt32LE(8)
	// price account size
	const size = data.readUInt32LE(12)
	// first price account in list
	const priceAccountBytes = data.slice(16, 48)
	const priceAccountKey = PKorNull(priceAccountBytes)
	const product = {} as Product
	if (priceAccountKey) product.price_account = priceAccountKey.toBase58()
	let idx = 48
	while (idx < size) {
		const keyLength = data[idx]
		idx++
		if (keyLength) {
			const key = data.slice(idx, idx + keyLength).toString()
			idx += keyLength
			const valueLength = data[idx]
			idx++
			const value = data.slice(idx, idx + valueLength).toString()
			idx += valueLength
			product[key] = value
		}
	}
	return { magic, version, type, size, priceAccountKey, product }
}


// https://github.com/nodejs/node/blob/v14.17.0/lib/internal/errors.js#L758
const ERR_BUFFER_OUT_OF_BOUNDS = () => new Error('Attempt to access memory outside buffer bounds')

// https://github.com/nodejs/node/blob/v14.17.0/lib/internal/errors.js#L968
const ERR_INVALID_ARG_TYPE = (name: string, expected: string, actual: any) =>
	new Error(`The "${name}" argument must be of type ${expected}. Received ${actual}`)

// https://github.com/nodejs/node/blob/v14.17.0/lib/internal/errors.js#L1262
const ERR_OUT_OF_RANGE = (str: string, range: string, received: number) =>
	new Error(`The value of "${str} is out of range. It must be ${range}. Received ${received}`)


function validateNumber(value: any, name: string) {
	if (typeof value !== 'number') throw ERR_INVALID_ARG_TYPE(name, 'number', value)
}

function boundsError(value: number, length: number) {
	if (Math.floor(value) !== value) {
		validateNumber(value, 'offset')
		throw ERR_OUT_OF_RANGE('offset', 'an integer', value)
	}

	if (length < 0) throw ERR_BUFFER_OUT_OF_BOUNDS()

	throw ERR_OUT_OF_RANGE('offset', `>= 0 and <= ${length}`, value)
}


// https://github.com/nodejs/node/blob/v14.17.0/lib/internal/buffer.js#L129-L145
export function readBigInt64LE(buffer: Buffer, offset = 0): bigint {
	validateNumber(offset, 'offset')
	const first = buffer[offset]
	const last = buffer[offset + 7]
	if (first === undefined || last === undefined) boundsError(offset, buffer.length - 8)
	// tslint:disable-next-line:no-bitwise
	const val = buffer[offset + 4] + buffer[offset + 5] * 2 ** 8 + buffer[offset + 6] * 2 ** 16 + (last << 24) // Overflow
	return (
		(BigInt(val) << BigInt(32)) + // tslint:disable-line:no-bitwise
		BigInt(first + buffer[++offset] * 2 ** 8 + buffer[++offset] * 2 ** 16 + buffer[++offset] * 2 ** 24)
	)
}


export function readBigUInt64LE(buffer: Buffer, offset = 0): bigint {
	const first = buffer[offset]
	const last = buffer[offset + 7]
	if (first === undefined || last === undefined) boundsError(offset, buffer.length - 8)

	const lo = first + buffer[++offset] * 2 ** 8 + buffer[++offset] * 2 ** 16 + buffer[++offset] * 2 ** 24

	const hi = buffer[++offset] + buffer[++offset] * 2 ** 8 + buffer[++offset] * 2 ** 16 + last * 2 ** 24

	return BigInt(lo) + (BigInt(hi) << BigInt(32)) // tslint:disable-line:no-bitwise
}


const parseEma = (data: Buffer, exponent: number): Ema => {
	// current value of ema
	const valueComponent = readBigInt64LE(data, 0)
	const value = Number(valueComponent) * 10 ** exponent
	// numerator state for next update
	const numerator = readBigInt64LE(data, 8)
	// denominator state for next update
	const denominator = readBigInt64LE(data, 16)
	return { valueComponent, value, numerator, denominator }
}


const parsePriceInfo = (data: Buffer, exponent: number): Price => {
	// aggregate price
	const priceComponent = readBigInt64LE(data, 0)
	const price = Number(priceComponent) * 10 ** exponent
	// aggregate confidence
	const confidenceComponent = readBigUInt64LE(data, 8)
	const confidence = Number(confidenceComponent) * 10 ** exponent
	// aggregate status
	const status: PriceStatus = data.readUInt32LE(16)
	// aggregate corporate action
	const corporateAction: CorpAction = data.readUInt32LE(20)
	// aggregate publish slot. It is converted to number to be consistent with Solana's library interface (Slot there is number)
	const publishSlot = Number(readBigUInt64LE(data, 24))
	return {
		priceComponent,
		price,
		confidenceComponent,
		confidence,
		status,
		corporateAction,
		publishSlot,
	}
}

export const parsePriceData = (data: Buffer, currentSlot?: number) => {
	// pyth magic number
	const magic = data.readUInt32LE(0)
	// program version
	const version = data.readUInt32LE(4)
	// account type
	const type = data.readUInt32LE(8)
	// price account size
	const size = data.readUInt32LE(12)
	// price or calculation type
	const priceType: PriceType = data.readUInt32LE(16)
	// price exponent
	const exponent = data.readInt32LE(20)
	// number of component prices
	const numComponentPrices = data.readUInt32LE(24)
	// number of quoters that make up aggregate
	const numQuoters = data.readUInt32LE(28)
	// slot of last valid (not unknown) aggregate price
	const lastSlot = readBigUInt64LE(data, 32)
	// valid on-chain slot of aggregate price
	const validSlot = readBigUInt64LE(data, 40)
	// exponential moving average price
	const emaPrice = parseEma(data.slice(48, 72), exponent)
	// exponential moving average confidence interval
	const emaConfidence = parseEma(data.slice(72, 96), exponent)
	// timestamp of the current price
	const timestamp = readBigInt64LE(data, 96)
	// minimum number of publishers for status to be TRADING
	const minPublishers = data.readUInt8(104)
	// space for future derived values
	const drv2 = data.readInt8(105)
	// space for future derived values
	const drv3 = data.readInt16LE(106)
	// space for future derived values
	const drv4 = data.readInt32LE(108)
	// product id / reference account
	const productAccountKey = new PublicKey(data.slice(112, 144))
	// next price account in list
	const nextPriceAccountKey = PKorNull(data.slice(144, 176))
	// valid slot of previous update
	const previousSlot = readBigUInt64LE(data, 176)
	// aggregate price of previous update
	const previousPriceComponent = readBigInt64LE(data, 184)
	const previousPrice = Number(previousPriceComponent) * 10 ** exponent
	// confidence interval of previous update
	const previousConfidenceComponent = readBigUInt64LE(data, 192)
	const previousConfidence = Number(previousConfidenceComponent) * 10 ** exponent
	// space for future derived values
	const previousTimestamp = readBigInt64LE(data, 200)
	const aggregate = parsePriceInfo(data.slice(208, 240), exponent)

	let status = aggregate.status

	if (currentSlot && status === PriceStatus.Trading) {
		if (currentSlot - aggregate.publishSlot > MAX_SLOT_DIFFERENCE) {
			status = PriceStatus.Unknown
		}
	}

	let price
	let confidence
	if (status === PriceStatus.Trading) {
		price = aggregate.price
		confidence = aggregate.confidence
	}

	// price components - up to 32
	const priceComponents: PriceComponent[] = []
	let offset = 240
	while (priceComponents.length < numComponentPrices) {
		const publisher = new PublicKey(data.slice(offset, offset + 32))
		offset += 32
		const componentAggregate = parsePriceInfo(data.slice(offset, offset + 32), exponent)
		offset += 32
		const latest = parsePriceInfo(data.slice(offset, offset + 32), exponent)
		offset += 32
		priceComponents.push({ publisher, aggregate: componentAggregate, latest })
	}

	return {
		magic,
		version,
		type,
		size,
		priceType,
		exponent,
		numComponentPrices,
		numQuoters,
		lastSlot,
		validSlot,
		emaPrice,
		emaConfidence,
		timestamp,
		minPublishers,
		drv2,
		drv3,
		drv4,
		productAccountKey,
		nextPriceAccountKey,
		previousSlot,
		previousPriceComponent,
		previousPrice,
		previousConfidenceComponent,
		previousConfidence,
		previousTimestamp,
		aggregate,
		priceComponents,
		price,
		confidence,
		status,
	}
}

export const parsePermissionData = (data: Buffer) => {
	// pyth magic number
	const magic = data.readUInt32LE(0)
	// program version
	const version = data.readUInt32LE(4)
	// account type
	const type = data.readUInt32LE(8)
	// price account size
	const size = data.readUInt32LE(12)
	const masterAuthority = new PublicKey(data.slice(16, 48))
	const dataCurationAuthority = new PublicKey(data.slice(48, 80))
	const securityAuthority = new PublicKey(data.slice(80, 112))
	return {
		magic,
		version,
		type,
		size,
		masterAuthority,
		dataCurationAuthority,
		securityAuthority,
	}
}

export function parsePriceFeedData(data: Buffer, currentSlot?: number) {
	const base = parseBaseData(data)
	console.log('>>>', data, base)
	if (base) {
		switch (base.type) {
			case AccountType.Mapping:
				// We can skip these because we're going to get every account owned by this program anyway.
				break
			case AccountType.Product:
				const productData = parseProductData(data)
				console.log('productData +++', productData)
				break
			case AccountType.Price:
				const priceData = parsePriceData(data, currentSlot)
				console.log('priceData +++', priceData)
				break
			case AccountType.Test:
				break
			case AccountType.Permission:
				const permissionData = parsePermissionData(data)
				console.log('permissionData +++', permissionData)
				break

			default:
				throw new Error(`Unknown account type: ${base.type}. Try upgrading pyth-client.`)
		}
	}
}

export function getPriceFromPriceFeed(pfeed: PublicKey, data: Buffer, currentSlot?: number) {
	const baseData = parseBaseData(data)
	if (baseData === undefined || baseData.type !== AccountType.Price) {
		throw new Error('Account ' + pfeed.toBase58() + ' is not a price account')
	}

	const priceData = parsePriceData(data, currentSlot)
	return priceData
}