/**
 * WebSocket Helpers
 *
 * Utilities for WebSocket connections, pub/sub patterns,
 * and real-time communication in Bueno applications.
 */

// ============= Types =============

export interface WebSocketData {
	id: string;
	userId?: string;
	[key: string]: unknown;
}

export interface WebSocketMessage {
	type: string;
	payload: unknown;
	timestamp: number;
}

export interface WebSocketOptions {
	idleTimeout?: number;
	maxPayloadLength?: number;
	perMessageDeflate?: boolean;
}

export type WebSocketHandler = (
	ws: Bun.ServerWebSocket<WebSocketData>,
	message: WebSocketMessage,
) => void | Promise<void>;
export type OpenHandler = (
	ws: Bun.ServerWebSocket<WebSocketData>,
) => void | Promise<void>;
export type CloseHandler = (
	ws: Bun.ServerWebSocket<WebSocketData>,
	code: number,
	reason: string,
) => void | Promise<void>;
export type ErrorHandler = (
	ws: Bun.ServerWebSocket<WebSocketData>,
	error: Error,
) => void | Promise<void>;

// ============= WebSocket Server =============

export interface WebSocketServerOptions extends WebSocketOptions {
	onMessage?: WebSocketHandler;
	onOpen?: OpenHandler;
	onClose?: CloseHandler;
	onError?: ErrorHandler;
}

export class WebSocketServer {
	private options: WebSocketServerOptions;
	private connections: Map<string, Bun.ServerWebSocket<WebSocketData>> =
		new Map();
	private rooms: Map<string, Set<string>> = new Map();
	private messageHandlers: Map<string, WebSocketHandler[]> = new Map();

	constructor(options: WebSocketServerOptions = {}) {
		this.options = {
			idleTimeout: 255,
			maxPayloadLength: 1024 * 1024, // 1MB
			perMessageDeflate: true,
			...options,
		};
	}

	/**
	 * Get Bun WebSocket configuration
	 */
	getWebSocketConfig(): Bun.WebSocketHandler<WebSocketData> {
		return {
			idleTimeout: this.options.idleTimeout,
			maxPayloadLength: this.options.maxPayloadLength,
			perMessageDeflate: this.options.perMessageDeflate,

			open: (ws) => {
				this.connections.set(ws.data.id, ws);
				this.options.onOpen?.(ws);
			},

			message: (ws, message) => {
				let parsed: WebSocketMessage;

				if (typeof message === "string") {
					try {
						parsed = JSON.parse(message);
					} catch {
						parsed = { type: "raw", payload: message, timestamp: Date.now() };
					}
				} else {
					parsed = { type: "binary", payload: message, timestamp: Date.now() };
				}

				// Call global handler
				this.options.onMessage?.(ws, parsed);

				// Call type-specific handlers
				const handlers = this.messageHandlers.get(parsed.type);
				if (handlers) {
					for (const handler of handlers) {
						handler(ws, parsed);
					}
				}
			},

			close: (ws, code, reason) => {
				this.connections.delete(ws.data.id);

				// Remove from all rooms
				for (const [room, members] of this.rooms) {
					members.delete(ws.data.id);
				}

				this.options.onClose?.(ws, code, reason);
			},
		};
	}

	/**
	 * Register a message type handler
	 */
	on(type: string, handler: WebSocketHandler): this {
		const handlers = this.messageHandlers.get(type) ?? [];
		handlers.push(handler);
		this.messageHandlers.set(type, handlers);
		return this;
	}

	/**
	 * Broadcast to all connections
	 */
	broadcast(type: string, payload: unknown): void {
		const message: WebSocketMessage = { type, payload, timestamp: Date.now() };
		const data = JSON.stringify(message);

		for (const ws of this.connections.values()) {
			ws.send(data);
		}
	}

	/**
	 * Send to specific connection
	 */
	send(connectionId: string, type: string, payload: unknown): boolean {
		const ws = this.connections.get(connectionId);
		if (!ws) return false;

		const message: WebSocketMessage = { type, payload, timestamp: Date.now() };
		ws.send(JSON.stringify(message));
		return true;
	}

	/**
	 * Broadcast to a room
	 */
	broadcastToRoom(room: string, type: string, payload: unknown): void {
		const members = this.rooms.get(room);
		if (!members) return;

		const message: WebSocketMessage = { type, payload, timestamp: Date.now() };
		const data = JSON.stringify(message);

		for (const id of members) {
			const ws = this.connections.get(id);
			if (ws) {
				ws.send(data);
			}
		}
	}

	/**
	 * Join a room
	 */
	joinRoom(connectionId: string, room: string): void {
		if (!this.rooms.has(room)) {
			this.rooms.set(room, new Set());
		}
		this.rooms.get(room)?.add(connectionId);
	}

	/**
	 * Leave a room
	 */
	leaveRoom(connectionId: string, room: string): void {
		this.rooms.get(room)?.delete(connectionId);
	}

	/**
	 * Get room members
	 */
	getRoomMembers(room: string): string[] {
		return Array.from(this.rooms.get(room) ?? []);
	}

	/**
	 * Get all connection IDs
	 */
	getConnectionIds(): string[] {
		return Array.from(this.connections.keys());
	}

	/**
	 * Get connection count
	 */
	get connectionCount(): number {
		return this.connections.size;
	}

	/**
	 * Check if connection exists
	 */
	hasConnection(connectionId: string): boolean {
		return this.connections.has(connectionId);
	}

	/**
	 * Close a connection
	 */
	closeConnection(
		connectionId: string,
		code = 1000,
		reason = "Closed by server",
	): boolean {
		const ws = this.connections.get(connectionId);
		if (!ws) return false;

		ws.close(code, reason);
		return true;
	}

	/**
	 * Close all connections
	 */
	closeAll(code = 1000, reason = "Server shutting down"): void {
		for (const ws of this.connections.values()) {
			ws.close(code, reason);
		}
	}
}

// ============= WebSocket Client =============

export interface WebSocketClientOptions {
	url: string;
	protocols?: string | string[];
	reconnect?: boolean;
	reconnectInterval?: number;
	maxReconnectAttempts?: number;
	onOpen?: () => void;
	onClose?: (event: CloseEvent) => void;
	onMessage?: (message: WebSocketMessage) => void;
	onError?: (event: Event) => void;
}

export class WebSocketClient {
	private ws: WebSocket | null = null;
	private options: WebSocketClientOptions;
	private reconnectAttempts = 0;
	private shouldReconnect = true;
	private messageQueue: string[] = [];

	constructor(options: WebSocketClientOptions) {
		this.options = {
			reconnect: true,
			reconnectInterval: 1000,
			maxReconnectAttempts: 5,
			...options,
		};
	}

	/**
	 * Connect to WebSocket server
	 */
	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			try {
				this.ws = new WebSocket(this.options.url, this.options.protocols);
				this.shouldReconnect = true;

				this.ws.onopen = () => {
					this.reconnectAttempts = 0;

					// Send queued messages
					while (this.messageQueue.length > 0) {
						const message = this.messageQueue.shift()!;
						this.ws?.send(message);
					}

					this.options.onOpen?.();
					resolve();
				};

				this.ws.onclose = (event) => {
					this.options.onClose?.(event);

					if (this.shouldReconnect && this.options.reconnect) {
						this.attemptReconnect();
					}
				};

				this.ws.onmessage = (event) => {
					let message: WebSocketMessage;

					try {
						message = JSON.parse(event.data);
					} catch {
						message = {
							type: "raw",
							payload: event.data,
							timestamp: Date.now(),
						};
					}

					this.options.onMessage?.(message);
				};

				this.ws.onerror = (event) => {
					this.options.onError?.(event);
					reject(event);
				};
			} catch (error) {
				reject(error);
			}
		});
	}

	/**
	 * Attempt to reconnect
	 */
	private attemptReconnect(): void {
		if (this.reconnectAttempts >= (this.options.maxReconnectAttempts ?? 5)) {
			return;
		}

		this.reconnectAttempts++;
		setTimeout(() => {
			this.connect().catch(() => {
				// Reconnect failed, will try again if attempts remaining
			});
		}, this.options.reconnectInterval);
	}

	/**
	 * Send a message
	 */
	send(type: string, payload: unknown): void {
		const message: WebSocketMessage = { type, payload, timestamp: Date.now() };
		const data = JSON.stringify(message);

		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(data);
		} else {
			// Queue message for when connection is ready
			this.messageQueue.push(data);
		}
	}

	/**
	 * Send raw data
	 */
	async sendRaw(data: string | ArrayBuffer | Blob): Promise<void> {
		if (this.ws?.readyState === WebSocket.OPEN) {
			if (data instanceof Blob) {
				this.ws.send(await data.arrayBuffer());
			} else {
				this.ws.send(data);
			}
		}
	}

	/**
	 * Close the connection
	 */
	close(code = 1000, reason = "Client closing"): void {
		this.shouldReconnect = false;
		this.ws?.close(code, reason);
	}

	/**
	 * Check if connected
	 */
	get isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Get ready state
	 */
	get readyState(): number {
		return this.ws?.readyState ?? WebSocket.CLOSED;
	}
}

// ============= Pub/Sub Types =============

export interface PubSubConfig {
	driver?: "redis" | "memory";
	url?: string; // Redis URL (e.g., redis://localhost:6379)
	keyPrefix?: string;
	reconnect?: boolean;
	reconnectInterval?: number;
	maxReconnectAttempts?: number;
}

export interface PubSubMessage {
	channel: string;
	pattern?: string; // Present for pattern subscriptions
	data: unknown;
	timestamp: number;
}

export type PubSubCallback = (message: PubSubMessage) => void | Promise<void>;

// ============= In-Memory Pub/Sub (Fallback) =============

class InMemoryPubSub {
	private channels: Map<string, Set<PubSubCallback>> = new Map();
	private patterns: Map<string, Set<PubSubCallback>> = new Map();

	async publish(channel: string, data: unknown): Promise<number> {
		const message: PubSubMessage = {
			channel,
			data,
			timestamp: Date.now(),
		};

		let deliveredCount = 0;

		// Direct channel subscribers
		const subscribers = this.channels.get(channel);
		if (subscribers) {
			for (const callback of subscribers) {
				await callback(message);
				deliveredCount++;
			}
		}

		// Pattern subscribers
		for (const [pattern, callbacks] of this.patterns) {
			if (this.matchPattern(pattern, channel)) {
				const patternMessage = { ...message, pattern };
				for (const callback of callbacks) {
					await callback(patternMessage);
					deliveredCount++;
				}
			}
		}

		return deliveredCount;
	}

	async subscribe(
		channel: string,
		callback: PubSubCallback,
	): Promise<() => void> {
		if (!this.channels.has(channel)) {
			this.channels.set(channel, new Set());
		}
		this.channels.get(channel)?.add(callback);

		return () => {
			this.channels.get(channel)?.delete(callback);
		};
	}

	async psubscribe(
		pattern: string,
		callback: PubSubCallback,
	): Promise<() => void> {
		if (!this.patterns.has(pattern)) {
			this.patterns.set(pattern, new Set());
		}
		this.patterns.get(pattern)?.add(callback);

		return () => {
			this.patterns.get(pattern)?.delete(callback);
		};
	}

	async unsubscribe(channel: string): Promise<void> {
		this.channels.delete(channel);
	}

	async punsubscribe(pattern: string): Promise<void> {
		this.patterns.delete(pattern);
	}

	getChannelSubscribers(channel: string): number {
		return this.channels.get(channel)?.size ?? 0;
	}

	getPatternSubscribers(pattern: string): number {
		return this.patterns.get(pattern)?.size ?? 0;
	}

	getTotalSubscribers(): number {
		let total = 0;
		for (const subscribers of this.channels.values()) {
			total += subscribers.size;
		}
		for (const subscribers of this.patterns.values()) {
			total += subscribers.size;
		}
		return total;
	}

	async clear(): Promise<void> {
		this.channels.clear();
		this.patterns.clear();
	}

	destroy(): void {
		this.channels.clear();
		this.patterns.clear();
	}

	/**
	 * Match a pattern against a channel name
	 * Supports * (match any characters) and ? (match single character)
	 */
	private matchPattern(pattern: string, channel: string): boolean {
		const regex = new RegExp(
			`^${pattern
				.replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except * and ?
				.replace(/\*/g, ".*") // * matches any characters
				.replace(/\?/g, ".")}$`,
		);
		return regex.test(channel);
	}
}

// ============= Redis Pub/Sub (Bun.redis Native) =============

class RedisPubSub {
	private publisher: unknown = null;
	private subscriber: unknown = null;
	private url: string;
	private keyPrefix: string;
	private channelCallbacks: Map<string, Set<PubSubCallback>> = new Map();
	private patternCallbacks: Map<string, Set<PubSubCallback>> = new Map();
	private _isConnected = false;
	private reconnect: boolean;
	private reconnectInterval: number;
	private maxReconnectAttempts: number;
	private reconnectAttempts = 0;

	constructor(config: PubSubConfig) {
		this.url = config.url ?? "redis://localhost:6379";
		this.keyPrefix = config.keyPrefix ?? "";
		this.reconnect = config.reconnect ?? true;
		this.reconnectInterval = config.reconnectInterval ?? 1000;
		this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
	}

	async connect(): Promise<void> {
		try {
			// Use Bun's native Redis client
			const { RedisClient } = await import("bun");

			// Create separate connections for pub and sub
			// (Subscriber connections enter a special mode and can't run other commands)
			this.publisher = new RedisClient(this.url);
			this.subscriber = new RedisClient(this.url);
			this._isConnected = true;
			this.reconnectAttempts = 0;
		} catch (error) {
			throw new Error(
				`Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async disconnect(): Promise<void> {
		const pub = this.publisher as { close?: () => Promise<void> } | null;
		const sub = this.subscriber as { close?: () => Promise<void> } | null;

		if (pub?.close) await pub.close();
		if (sub?.close) await sub.close();

		this._isConnected = false;
		this.publisher = null;
		this.subscriber = null;
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	async publish(channel: string, data: unknown): Promise<number> {
		if (!this._isConnected) {
			throw new Error("Redis Pub/Sub not connected");
		}

		const fullChannel = this.keyPrefix + channel;
		const message = JSON.stringify({
			channel,
			data,
			timestamp: Date.now(),
		});

		const client = this.publisher as {
			publish: (channel: string, message: string) => Promise<number>;
		};
		return client.publish(fullChannel, message);
	}

	async subscribe(
		channel: string,
		callback: PubSubCallback,
	): Promise<() => void> {
		if (!this._isConnected) {
			throw new Error("Redis Pub/Sub not connected");
		}

		const fullChannel = this.keyPrefix + channel;

		// Store callback
		if (!this.channelCallbacks.has(channel)) {
			this.channelCallbacks.set(channel, new Set());
		}
		this.channelCallbacks.get(channel)?.add(callback);

		// Subscribe to Redis channel
		const client = this.subscriber as {
			subscribe: (
				channel: string,
				callback: (message: string, channel: string) => void,
			) => Promise<void>;
		};

		// Create wrapper callback for Redis
		const wrappedCallback = (message: string, redisChannel: string) => {
			try {
				const parsed = JSON.parse(message);
				callback({
					channel: parsed.channel ?? channel,
					data: parsed.data,
					timestamp: parsed.timestamp ?? Date.now(),
				});
			} catch {
				// Handle raw string messages
				callback({
					channel,
					data: message,
					timestamp: Date.now(),
				});
			}
		};

		await client.subscribe(fullChannel, wrappedCallback);

		// Return unsubscribe function
		return async () => {
			this.channelCallbacks.get(channel)?.delete(callback);

			// If no more callbacks for this channel, unsubscribe from Redis
			if (this.channelCallbacks.get(channel)?.size === 0) {
				this.channelCallbacks.delete(channel);
				const unsubClient = this.subscriber as {
					unsubscribe: (channel: string) => Promise<void>;
				};
				await unsubClient.unsubscribe(fullChannel);
			}
		};
	}

	async psubscribe(
		pattern: string,
		callback: PubSubCallback,
	): Promise<() => void> {
		if (!this._isConnected) {
			throw new Error("Redis Pub/Sub not connected");
		}

		const fullPattern = this.keyPrefix + pattern;

		// Store callback
		if (!this.patternCallbacks.has(pattern)) {
			this.patternCallbacks.set(pattern, new Set());
		}
		this.patternCallbacks.get(pattern)?.add(callback);

		// Subscribe to Redis pattern
		const client = this.subscriber as {
			psubscribe: (
				pattern: string,
				callback: (message: string, channel: string, pattern: string) => void,
			) => Promise<void>;
		};

		// Create wrapper callback for Redis
		const wrappedCallback = (
			message: string,
			redisChannel: string,
			redisPattern: string,
		) => {
			try {
				const parsed = JSON.parse(message);
				callback({
					channel: parsed.channel ?? redisChannel.replace(this.keyPrefix, ""),
					pattern: pattern,
					data: parsed.data,
					timestamp: parsed.timestamp ?? Date.now(),
				});
			} catch {
				callback({
					channel: redisChannel.replace(this.keyPrefix, ""),
					pattern: pattern,
					data: message,
					timestamp: Date.now(),
				});
			}
		};

		await client.psubscribe(fullPattern, wrappedCallback);

		// Return unsubscribe function
		return async () => {
			this.patternCallbacks.get(pattern)?.delete(callback);

			// If no more callbacks for this pattern, unsubscribe from Redis
			if (this.patternCallbacks.get(pattern)?.size === 0) {
				this.patternCallbacks.delete(pattern);
				const unsubClient = this.subscriber as {
					punsubscribe: (pattern: string) => Promise<void>;
				};
				await unsubClient.punsubscribe(fullPattern);
			}
		};
	}

	async unsubscribe(channel: string): Promise<void> {
		if (!this._isConnected) return;

		const fullChannel = this.keyPrefix + channel;
		this.channelCallbacks.delete(channel);

		const client = this.subscriber as {
			unsubscribe: (channel: string) => Promise<void>;
		};
		await client.unsubscribe(fullChannel);
	}

	async punsubscribe(pattern: string): Promise<void> {
		if (!this._isConnected) return;

		const fullPattern = this.keyPrefix + pattern;
		this.patternCallbacks.delete(pattern);

		const client = this.subscriber as {
			punsubscribe: (pattern: string) => Promise<void>;
		};
		await client.punsubscribe(fullPattern);
	}

	getChannelSubscribers(channel: string): number {
		return this.channelCallbacks.get(channel)?.size ?? 0;
	}

	getPatternSubscribers(pattern: string): number {
		return this.patternCallbacks.get(pattern)?.size ?? 0;
	}

	getTotalSubscribers(): number {
		let total = 0;
		for (const subscribers of this.channelCallbacks.values()) {
			total += subscribers.size;
		}
		for (const subscribers of this.patternCallbacks.values()) {
			total += subscribers.size;
		}
		return total;
	}

	async clear(): Promise<void> {
		// Unsubscribe from all channels
		for (const channel of this.channelCallbacks.keys()) {
			await this.unsubscribe(channel);
		}
		// Unsubscribe from all patterns
		for (const pattern of this.patternCallbacks.keys()) {
			await this.punsubscribe(pattern);
		}
	}

	destroy(): void {
		this.disconnect().catch(() => {});
		this.channelCallbacks.clear();
		this.patternCallbacks.clear();
	}
}

// ============= Pub/Sub Class (Unified Interface) =============

export class PubSub {
	private driver: InMemoryPubSub | RedisPubSub;
	private driverType: "redis" | "memory";
	private _isConnected = false;

	constructor(config: PubSubConfig = {}) {
		this.driverType = config.driver ?? "memory";

		if (this.driverType === "redis" && config.url) {
			this.driver = new RedisPubSub(config);
		} else {
			this.driver = new InMemoryPubSub();
			// Memory driver is always "connected"
			this._isConnected = true;
		}
	}

	/**
	 * Connect to the pub/sub backend (Redis only)
	 */
	async connect(): Promise<void> {
		if (this.driver instanceof RedisPubSub) {
			await this.driver.connect();
		}
		this._isConnected = true;
	}

	/**
	 * Disconnect from the pub/sub backend
	 */
	async disconnect(): Promise<void> {
		if (this.driver instanceof RedisPubSub) {
			await this.driver.disconnect();
		} else {
			this.driver.destroy();
		}
		this._isConnected = false;
	}

	/**
	 * Check if connected
	 */
	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Get the driver type
	 */
	getDriverType(): "redis" | "memory" {
		return this.driverType;
	}

	/**
	 * Publish a message to a channel
	 * Returns the number of subscribers that received the message
	 */
	async publish(channel: string, data: unknown): Promise<number> {
		return this.driver.publish(channel, data);
	}

	/**
	 * Subscribe to a channel
	 * Returns an unsubscribe function
	 */
	async subscribe(
		channel: string,
		callback: PubSubCallback,
	): Promise<() => void> {
		return this.driver.subscribe(channel, callback);
	}

	/**
	 * Subscribe to channels matching a pattern
	 * Supports * (any characters) and ? (single character)
	 * Returns an unsubscribe function
	 */
	async psubscribe(
		pattern: string,
		callback: PubSubCallback,
	): Promise<() => void> {
		return this.driver.psubscribe(pattern, callback);
	}

	/**
	 * Unsubscribe all callbacks from a channel
	 */
	async unsubscribe(channel: string): Promise<void> {
		return this.driver.unsubscribe(channel);
	}

	/**
	 * Unsubscribe all callbacks from a pattern
	 */
	async punsubscribe(pattern: string): Promise<void> {
		return this.driver.punsubscribe(pattern);
	}

	/**
	 * Get subscriber count for a specific channel
	 */
	getChannelSubscribers(channel: string): number {
		return this.driver.getChannelSubscribers(channel);
	}

	/**
	 * Get subscriber count for a specific pattern
	 */
	getPatternSubscribers(pattern: string): number {
		return this.driver.getPatternSubscribers(pattern);
	}

	/**
	 * Get total subscriber count across all channels and patterns
	 */
	getTotalSubscribers(): number {
		return this.driver.getTotalSubscribers();
	}

	/**
	 * Clear all subscriptions
	 */
	async clear(): Promise<void> {
		return this.driver.clear();
	}

	/**
	 * Destroy the pub/sub instance and release resources
	 */
	destroy(): void {
		this.driver.destroy();
		this._isConnected = false;
	}
}

// ============= Factory Functions =============

/**
 * Create a WebSocket server
 */
export function createWebSocketServer(
	options?: WebSocketServerOptions,
): WebSocketServer {
	return new WebSocketServer(options);
}

/**
 * Create a WebSocket client
 */
export function createWebSocketClient(
	options: WebSocketClientOptions,
): WebSocketClient {
	return new WebSocketClient(options);
}

/**
 * Create a pub/sub instance
 * @param config Configuration options including driver type and Redis URL
 */
export function createPubSub(config?: PubSubConfig): PubSub {
	return new PubSub(config);
}

/**
 * Create a Redis pub/sub instance (convenience function)
 */
export function createRedisPubSub(
	url: string,
	options?: Omit<PubSubConfig, "driver" | "url">,
): PubSub {
	return new PubSub({ driver: "redis", url, ...options });
}

/**
 * Create an in-memory pub/sub instance (convenience function)
 */
export function createMemoryPubSub(): PubSub {
	return new PubSub({ driver: "memory" });
}

// ============= Upgrade Helper =============

/**
 * Check if request is a WebSocket upgrade request
 */
export function isWebSocketRequest(request: Request): boolean {
	return request.headers.get("upgrade")?.toLowerCase() === "websocket";
}

/**
 * Generate WebSocket connection ID
 */
export function generateConnectionId(): string {
	return crypto.randomUUID();
}

/**
 * Create WebSocket data for new connection
 */
export function createWebSocketData(
	data?: Partial<WebSocketData>,
): WebSocketData {
	return {
		id: generateConnectionId(),
		...data,
	};
}
