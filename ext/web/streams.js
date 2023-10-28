// Ported from https://github.com/whatwg/streams/tree/main/reference-implementation

export class ByteLengthQueuingStrategy {
	constructor({ highWaterMark }) {
		this.highWaterMark = highWaterMark;
	}

	/**
	 * @param {Uint8Array} chunk
	 */
	size(chunk) {
		return chunk.byteLength;
	}
}

export class CountQueuingStrategy {
	constructor({ highWaterMark }) {
		this.highWaterMark = highWaterMark;
	}

	get size() {
		return 1;
	}
}
