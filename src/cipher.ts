import {
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
} from 'node:crypto'

/**
 * Low-level class for encrypting and decrypting payloads.
 * @example
 * const cipher = new TuyaCipher({key: 'xxxxxxxxxxxxxxxx', version: 3.1})
 */
export class TuyaCipher {
	public sessionKey: Buffer | null = null
	readonly key: string
	readonly version: string

	/**
	 * @param options.key localKey of cipher
	 * @param options.version protocol version
	 */
	constructor(options: { key: string; version: number }) {
		this.key = options.key
		this.version = options.version.toString()
	}

	/**
	 * Encrypts data.
	 * @param data data to encrypt
	 * @param base64 `true` to return result in Base64
	 * @example
	 * TuyaCipher.encrypt({data: 'hello world'})
	 * @returns Buffer unless options.base64 is true
	 */
	encrypt(options: {
		data: string
		base64?: boolean
		aad?: Buffer
		iv?: Buffer
	}): Buffer | string {
		if (this.version === '3.4') {
			const cipher = createCipheriv('aes-128-ecb', this.getKey(), null)
			cipher.setAutoPadding(false)

			const encrypted = cipher.update(options.data)
			cipher.final()

			// Default base64 enable TODO: check if this is needed?
			// if (options.base64 === false) {
			//   return Buffer.from(encrypted, 'base64');
			// }

			return encrypted
		}

		if (this.version === '3.5') {
			let localIV = Buffer.from((Date.now() * 10).toString().slice(0, 12))
			if (options.iv !== undefined) {
				localIV = options.iv.slice(0, 12)
			}

			const cipher = createCipheriv('aes-128-gcm', this.getKey(), localIV)

			let encrypted: Buffer

			if (options.aad === undefined) {
				encrypted = Buffer.concat([cipher.update(options.data), cipher.final()])
			} else {
				cipher.setAAD(options.aad)

				encrypted = Buffer.concat([
					localIV,
					cipher.update(options.data),
					cipher.final(),
					cipher.getAuthTag(),
					Buffer.from([0x00, 0x00, 0x99, 0x66]),
				])
			}

			return encrypted
		}

		// Pre 3.4

		const cipher = createCipheriv('aes-128-ecb', this.getKey(), '')

		let encrypted = cipher.update(options.data, 'utf8', 'base64')
		encrypted += cipher.final('base64')

		// Default base64 enable
		if (options.base64 === false) {
			return Buffer.from(encrypted, 'base64')
		}

		return encrypted
	}

	/**
	 * Decrypts data.
	 * @param data to decrypt
	 * @returns object if data is JSON, else returns string
	 */
	decrypt(data: string | Buffer): object | string {
		if (this.version === '3.4') {
			return this._decrypt34(data)
		}

		if (this.version === '3.5') {
			return this._decrypt35(data)
		}

		return this._decryptPre34(data)
	}

	/**
	 * Decrypts data for protocol 3.3 and before
	 * @param data to decrypt
	 * @returns object if data is JSON, else returns string
	 */
	private _decryptPre34(data: string | Buffer): object | string {
		// Incoming data format
		let format = 'buffer'

		if (data.indexOf(this.version) === 0) {
			if (this.version === '3.3' || this.version === '3.2') {
				// Remove 3.3/3.2 header
				data = data.slice(15)
			} else {
				// Data has version number and is encoded in base64

				// Remove prefix of version number and MD5 hash
				data = data.slice(19).toString()
				// Decode incoming data as base64
				format = 'base64'
			}
		}

		// Decrypt data
		let result: Buffer
		try {
			const decipher = createDecipheriv('aes-128-ecb', this.getKey(), '')
			result = decipher.update(data, format, 'utf8')
			result += decipher.final('utf8')
		} catch (_) {
			throw new Error('Decrypt failed')
		}

		// Try to parse data as JSON,
		// otherwise return as string.
		try {
			return JSON.parse(result.toString('utf-8'))
		} catch (_) {
			return result
		}
	}

	/**
	 * Decrypts data for protocol 3.4
	 * @param data to decrypt
	 * @returns object if data is JSON, else returns string
	 */
	private _decrypt34(data: string | Buffer): object | string {
		if (typeof data === 'string') {
			data = Buffer.from(data)
		}

		let result: Buffer

		try {
			const decipher = createDecipheriv('aes-128-ecb', this.getKey(), null)
			decipher.setAutoPadding(false)
			result = decipher.update(data)
			decipher.final()
			// Remove padding
			result = result.slice(0, result.length - result[result.length - 1])
		} catch (_) {
			throw new Error('Decrypt failed')
		}

		// Try to parse data as JSON,
		// otherwise return as string.
		// 3.4 protocol
		// {"protocol":4,"t":1632405905,"data":{"dps":{"101":true},"cid":"00123456789abcde"}}
		try {
			if (result.indexOf(this.version) === 0) {
				result = result.slice(15)
			}

			const res = JSON.parse(result.toString('utf-8'))

			if ('data' in res) {
				const resData = res.data
				resData.t = res.t
				return resData // Or res.data // for compatibility with tuya-mqtt
			}

			return res
		} catch (_) {
			return result
		}
	}

	/**
	 * Decrypts data for protocol 3.5
	 * @param data to decrypt
	 * @returns object if data is JSON, else returns string
	 */
	private _decrypt35(data: string | Buffer): object | string {
		if (typeof data === 'string') {
			data = Buffer.from(data)
		}

		const header = data.slice(0, 14)
		const iv = data.slice(14, 26)
		const tag = data.slice(data.length - 16)
		data = data.slice(26, data.length - 16)

		let result: Buffer

		try {
			const decipher = createDecipheriv('aes-128-gcm', this.getKey(), iv)
			decipher.setAuthTag(tag)
			decipher.setAAD(header)

			result = Buffer.concat([decipher.update(data), decipher.final()])
			result = result.slice(4) // Remove 32bit return code
		} catch (_) {
			throw new Error('Decrypt failed')
		}

		// Try to parse data as JSON, otherwise return as string.
		// 3.5 protocol
		// {"protocol":4,"t":1632405905,"data":{"dps":{"101":true},"cid":"00123456789abcde"}}
		try {
			if (result.indexOf(this.version) === 0) {
				result = result.slice(15)
			}

			const res = JSON.parse(result.toString('utf-8'))
			if ('data' in res) {
				const resData = res.data
				resData.t = res.t
				return resData // Or res.data // for compatibility with tuya-mqtt
			}

			return res
		} catch (_) {
			return result
		}
	}

	/**
	 * Calculates a MD5 hash.
	 * @param data to hash
	 * @returns characters 8 through 16 of hash of data
	 */
	md5(data: string): string {
		const md5hash = createHash('md5').update(data, 'utf8').digest('hex')
		return md5hash.slice(8, 24)
	}

	/**
	 * Gets the key used for encryption/decryption
	 * @returns sessionKey (if set for protocol 3.4, 3.5) or key
	 */
	getKey(): string | Buffer {
		return this.sessionKey === null ? this.key : this.sessionKey
	}

	/**
	 * Returns the HMAC for the current key (sessionKey if set for protocol 3.4, 3.5 or key)
	 * @param data data to hash
	 * @returns HMAC
	 */
	hmac(data: string | Buffer): Buffer {
		return createHmac('sha256', this.getKey()).update(data, 'utf8').digest() // .digest('hex');
	}
}
