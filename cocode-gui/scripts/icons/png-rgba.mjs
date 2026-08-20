import { deflateSync, inflateSync } from "node:zlib"

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

export function decodeRgbaPng(buffer) {
	if (!Buffer.isBuffer(buffer)) throw new TypeError("PNG input must be a Buffer.")
	if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
		throw new Error("Invalid PNG signature.")
	}

	let offset = PNG_SIGNATURE.length
	let header
	const compressed = []
	let sawEnd = false
	while (offset + 12 <= buffer.length) {
		const length = buffer.readUInt32BE(offset)
		offset += 4
		if (offset + 8 + length > buffer.length) throw new Error("Truncated PNG chunk.")
		const type = buffer.toString("ascii", offset, offset + 4)
		offset += 4
		const data = buffer.subarray(offset, offset + length)
		offset += length
		const expectedCrc = buffer.readUInt32BE(offset)
		offset += 4
		if (crc32(Buffer.concat([Buffer.from(type), data])) !== expectedCrc) {
			throw new Error(`PNG chunk CRC mismatch: ${type}.`)
		}
		if (type === "IHDR") {
			if (length !== 13) throw new Error("PNG IHDR has an invalid length.")
			header = {
				width: data.readUInt32BE(0),
				height: data.readUInt32BE(4),
				bitDepth: data[8],
				colorType: data[9],
				compression: data[10],
				filter: data[11],
				interlace: data[12],
			}
		} else if (type === "IDAT") {
			compressed.push(data)
		} else if (type === "IEND") {
			sawEnd = true
			break
		}
	}
	if (!header || !sawEnd) throw new Error("PNG is missing IHDR or IEND.")
	if (header.bitDepth !== 8 || header.colorType !== 6) {
		throw new Error("Only 8-bit RGBA PNGs are supported.")
	}
	if (header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
		throw new Error(
			"Only non-interlaced PNGs with the standard compression/filter method are supported.",
		)
	}
	if (header.width < 1 || header.height < 1) throw new Error("PNG dimensions must be positive.")

	const rowBytes = header.width * 4
	const expectedInflatedLength = header.height * (rowBytes + 1)
	const inflated = inflateSync(Buffer.concat(compressed))
	if (inflated.length !== expectedInflatedLength)
		throw new Error("PNG scanline data has an invalid length.")

	const data = new Uint8ClampedArray(header.width * header.height * 4)
	let sourceOffset = 0
	let previous = new Uint8Array(rowBytes)
	for (let y = 0; y < header.height; y += 1) {
		const filterType = inflated[sourceOffset]
		sourceOffset += 1
		const filtered = inflated.subarray(sourceOffset, sourceOffset + rowBytes)
		sourceOffset += rowBytes
		const row = new Uint8Array(rowBytes)
		for (let x = 0; x < rowBytes; x += 1) {
			const left = x >= 4 ? row[x - 4] : 0
			const up = previous[x] ?? 0
			const upperLeft = x >= 4 ? previous[x - 4] ?? 0 : 0
			const value = filtered[x]
			switch (filterType) {
				case 0:
					row[x] = value
					break
				case 1:
					row[x] = (value + left) & 0xff
					break
				case 2:
					row[x] = (value + up) & 0xff
					break
				case 3:
					row[x] = (value + Math.floor((left + up) / 2)) & 0xff
					break
				case 4:
					row[x] = (value + paeth(left, up, upperLeft)) & 0xff
					break
				default:
					throw new Error(`Unsupported PNG filter type: ${filterType}.`)
			}
		}
		data.set(row, y * rowBytes)
		previous = row
	}
	return {
		width: header.width,
		height: header.height,
		bitDepth: header.bitDepth,
		colorType: header.colorType,
		data,
	}
}

export function encodeRgbaPng(image) {
	assertImage(image)
	const rowBytes = image.width * 4
	const scanlines = Buffer.alloc(image.height * (rowBytes + 1))
	for (let y = 0; y < image.height; y += 1) {
		const rowOffset = y * (rowBytes + 1)
		scanlines[rowOffset] = 0
		Buffer.from(image.data.buffer, image.data.byteOffset + y * rowBytes, rowBytes).copy(
			scanlines,
			rowOffset + 1,
		)
	}
	const header = Buffer.alloc(13)
	header.writeUInt32BE(image.width, 0)
	header.writeUInt32BE(image.height, 4)
	header[8] = 8
	header[9] = 6
	return Buffer.concat([
		PNG_SIGNATURE,
		pngChunk("IHDR", header),
		pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
		pngChunk("IEND", Buffer.alloc(0)),
	])
}

export function resizeRgbaImage(image, width, height) {
	assertImage(image)
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
		throw new Error("Resize dimensions must be positive integers.")
	}
	const data = new Uint8ClampedArray(width * height * 4)
	for (let y = 0; y < height; y += 1) {
		const sourceY = ((y + 0.5) * image.height) / height - 0.5
		const y0 = clamp(Math.floor(sourceY), 0, image.height - 1)
		const y1 = clamp(y0 + 1, 0, image.height - 1)
		const fy = Math.max(0, Math.min(1, sourceY - Math.floor(sourceY)))
		for (let x = 0; x < width; x += 1) {
			const sourceX = ((x + 0.5) * image.width) / width - 0.5
			const x0 = clamp(Math.floor(sourceX), 0, image.width - 1)
			const x1 = clamp(x0 + 1, 0, image.width - 1)
			const fx = Math.max(0, Math.min(1, sourceX - Math.floor(sourceX)))
			const outputOffset = (y * width + x) * 4
			const samples = [
				pixel(image, x0, y0),
				pixel(image, x1, y0),
				pixel(image, x0, y1),
				pixel(image, x1, y1),
			]
			const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]
			let alpha = 0
			const premultiplied = [0, 0, 0]
			for (let index = 0; index < samples.length; index += 1) {
				const sample = samples[index]
				const weight = weights[index]
				const sampleAlpha = sample[3] / 255
				alpha += sampleAlpha * weight
				for (let channel = 0; channel < 3; channel += 1) {
					premultiplied[channel] += sample[channel] * sampleAlpha * weight
				}
			}
			data[outputOffset + 3] = Math.round(alpha * 255)
			for (let channel = 0; channel < 3; channel += 1) {
				data[outputOffset + channel] =
					alpha === 0 ? 0 : Math.round(premultiplied[channel] / alpha)
			}
		}
	}
	return { width, height, bitDepth: 8, colorType: 6, data }
}

export function compositeRgba(base, overlay) {
	assertImage(base)
	assertImage(overlay)
	if (base.width !== overlay.width || base.height !== overlay.height) {
		throw new Error("RGBA images must have equal dimensions for compositing.")
	}
	const data = new Uint8ClampedArray(base.data)
	for (let offset = 0; offset < data.length; offset += 4) {
		const sourceAlpha = overlay.data[offset + 3] / 255
		const destinationAlpha = data[offset + 3] / 255
		const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha)
		if (outputAlpha === 0) {
			data[offset] = 0
			data[offset + 1] = 0
			data[offset + 2] = 0
			data[offset + 3] = 0
			continue
		}
		for (let channel = 0; channel < 3; channel += 1) {
			data[offset + channel] = Math.round(
				(overlay.data[offset + channel] * sourceAlpha +
					data[offset + channel] * destinationAlpha * (1 - sourceAlpha)) /
					outputAlpha,
			)
		}
		data[offset + 3] = Math.round(outputAlpha * 255)
	}
	return { ...base, data }
}

export function cropRgbaImage(image, bounds = alphaBounds(image)) {
	assertImage(image)
	if (!bounds) throw new Error("Cannot crop an image without visible alpha.")
	const width = bounds.right - bounds.left + 1
	const height = bounds.bottom - bounds.top + 1
	const data = new Uint8ClampedArray(width * height * 4)
	for (let y = 0; y < height; y += 1) {
		const sourceOffset = ((bounds.top + y) * image.width + bounds.left) * 4
		data.set(image.data.subarray(sourceOffset, sourceOffset + width * 4), y * width * 4)
	}
	return { width, height, bitDepth: 8, colorType: 6, data }
}

export function alphaBounds(image) {
	assertImage(image)
	let left = image.width
	let top = image.height
	let right = -1
	let bottom = -1
	for (let y = 0; y < image.height; y += 1) {
		for (let x = 0; x < image.width; x += 1) {
			if (image.data[(y * image.width + x) * 4 + 3] === 0) continue
			left = Math.min(left, x)
			top = Math.min(top, y)
			right = Math.max(right, x)
			bottom = Math.max(bottom, y)
		}
	}
	return right < 0 ? null : { left, top, right, bottom }
}

export function makeSolidRgbaImage(width, height, [red, green, blue, alpha = 255]) {
	if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
		throw new Error("Solid image dimensions must be positive integers.")
	}
	const data = new Uint8ClampedArray(width * height * 4)
	for (let offset = 0; offset < data.length; offset += 4) {
		data[offset] = red
		data[offset + 1] = green
		data[offset + 2] = blue
		data[offset + 3] = alpha
	}
	return { width, height, bitDepth: 8, colorType: 6, data }
}

function assertImage(image) {
	if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)) {
		throw new TypeError("Invalid RGBA image.")
	}
	if (!(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray)) {
		throw new TypeError("RGBA image data must be a Uint8Array.")
	}
	if (image.data.length !== image.width * image.height * 4) {
		throw new Error("RGBA image data has an invalid length.")
	}
}

function pixel(image, x, y) {
	const offset = (y * image.width + x) * 4
	return image.data.subarray(offset, offset + 4)
}

function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value))
}

function paeth(left, up, upperLeft) {
	const estimate = left + up - upperLeft
	const leftDistance = Math.abs(estimate - left)
	const upDistance = Math.abs(estimate - up)
	const upperLeftDistance = Math.abs(estimate - upperLeft)
	if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left
	if (upDistance <= upperLeftDistance) return up
	return upperLeft
}

function pngChunk(type, data) {
	const typeBuffer = Buffer.from(type, "ascii")
	const length = Buffer.alloc(4)
	length.writeUInt32BE(data.length, 0)
	const checksum = Buffer.alloc(4)
	checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
	return Buffer.concat([length, typeBuffer, data, checksum])
}

const CRC_TABLE = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
	let value = index
	for (let bit = 0; bit < 8; bit += 1)
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
	CRC_TABLE[index] = value >>> 0
}

function crc32(buffer) {
	let value = 0xffffffff
	for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
	return (value ^ 0xffffffff) >>> 0
}
