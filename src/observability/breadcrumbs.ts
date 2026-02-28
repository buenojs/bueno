/**
 * Breadcrumb Collector
 *
 * Ring-buffer implementation for tracking recent events leading up to an error.
 * When the buffer is full, the oldest entry is evicted to make room for new ones.
 */

import type { BreadcrumbEntry } from "./types";

/**
 * Fixed-size ring buffer for breadcrumb entries.
 * Thread-safe for single-threaded Bun environments.
 */
export class BreadcrumbCollector {
	private readonly _buffer: BreadcrumbEntry[];
	private readonly _maxSize: number;
	private _head = 0;
	private _size = 0;

	constructor(maxSize = 20) {
		if (maxSize < 1) throw new RangeError("maxSize must be at least 1");
		this._maxSize = maxSize;
		this._buffer = new Array(maxSize);
	}

	/**
	 * Add a breadcrumb to the ring buffer.
	 * If the buffer is full, the oldest entry is evicted.
	 */
	add(entry: BreadcrumbEntry): void {
		const index = (this._head + this._size) % this._maxSize;
		this._buffer[index] = entry;

		if (this._size < this._maxSize) {
			this._size++;
		} else {
			// Buffer full: advance head to evict oldest
			this._head = (this._head + 1) % this._maxSize;
		}
	}

	/**
	 * Return all breadcrumbs in chronological order (oldest first).
	 */
	getAll(): BreadcrumbEntry[] {
		const result: BreadcrumbEntry[] = [];
		for (let i = 0; i < this._size; i++) {
			result.push(this._buffer[(this._head + i) % this._maxSize]);
		}
		return result;
	}

	/**
	 * Clear all breadcrumbs.
	 */
	clear(): void {
		this._head = 0;
		this._size = 0;
	}

	/**
	 * Current number of stored breadcrumbs.
	 */
	get size(): number {
		return this._size;
	}

	/**
	 * Maximum capacity of this collector.
	 */
	get maxSize(): number {
		return this._maxSize;
	}
}

/**
 * Convenience helper to build a breadcrumb entry from HTTP request info.
 */
export function httpBreadcrumb(
	method: string,
	path: string,
	statusCode?: number,
	durationMs?: number,
): BreadcrumbEntry {
	const level = statusCode !== undefined && statusCode >= 400 ? "error" : "info";
	const data: Record<string, unknown> = { method, path };
	if (statusCode !== undefined) data.statusCode = statusCode;
	if (durationMs !== undefined) data.durationMs = durationMs;

	return {
		timestamp: new Date(),
		type: "http",
		level,
		message: `${method} ${path}${statusCode !== undefined ? ` ${statusCode}` : ""}`,
		data,
	};
}

/**
 * Convenience helper to build a log breadcrumb.
 */
export function logBreadcrumb(
	level: BreadcrumbEntry["level"],
	message: string,
	data?: Record<string, unknown>,
): BreadcrumbEntry {
	return {
		timestamp: new Date(),
		type: "log",
		level,
		message,
		data,
	};
}
