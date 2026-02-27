/**
 * Notification Service
 *
 * Core notification service with registry-based channel management.
 * Supports dynamic channel registration and multi-channel notification sending.
 */

import type {
	NotificationMessage,
	ChannelService,
	Notifiable,
	NotificationChannel,
	ChannelHealth,
	ChannelMetrics,
	NotificationServiceConfig,
	TemplateRef,
} from "./types";
import { isTemplateRef } from "./types";

// ============= Notification Service =============

export class NotificationService {
	private channels: Map<NotificationChannel, ChannelService> = new Map();
	private config: NotificationServiceConfig;
	private metrics: Map<NotificationChannel, ChannelMetrics> = new Map();

	constructor(config: NotificationServiceConfig = {}) {
		this.config = config;
	}

	/**
	 * Register a channel service
	 * @param service Channel service to register
	 * @throws Error if channel is already registered
	 */
	registerChannel<T extends NotificationMessage>(service: ChannelService<T>): void {
		if (this.channels.has(service.name)) {
			throw new Error(`Channel already registered: ${service.name}`);
		}
		this.channels.set(service.name, service);

		// Initialize metrics
		if (this.config.enableMetrics) {
			this.metrics.set(service.name, {
				sent: 0,
				failed: 0,
				successRate: 0,
				avgSendTime: 0,
				totalSendTime: 0,
				updatedAt: new Date(),
			});
		}
	}

	/**
	 * Unregister a channel service
	 * @param channelName Name of the channel to unregister
	 */
	unregisterChannel(channelName: NotificationChannel): void {
		this.channels.delete(channelName);
		this.metrics.delete(channelName);
	}

	/**
	 * Get a registered channel service
	 * @param channelName Name of the channel
	 * @returns Channel service or null if not found
	 */
	getChannel(channelName: NotificationChannel): ChannelService | null {
		return this.channels.get(channelName) || null;
	}

	/**
	 * Get all registered channel names
	 */
	getChannels(): NotificationChannel[] {
		return Array.from(this.channels.keys());
	}

	/**
	 * Check if a channel is registered
	 */
	hasChannel(channelName: NotificationChannel): boolean {
		return this.channels.has(channelName);
	}

	/**
	 * Send a notification via specified channel
	 * @param message Notification message
	 * @returns Message ID or undefined
	 * @throws Error if channel not found or message invalid
	 */
	async send(message: NotificationMessage): Promise<string | undefined> {
		const startTime = Date.now();

		try {
			const service = this.channels.get(message.channel);
			if (!service) {
				throw new Error(`Channel not registered: ${message.channel}`);
			}

			// Resolve template references
			const resolvedMessage = await this._resolveTemplates(message);

			// Validate message
			service.validate(resolvedMessage);

			// Send message
			const messageId = await service.send(resolvedMessage);

			// Update metrics
			if (this.config.enableMetrics) {
				this._updateMetrics(message.channel, true, Date.now() - startTime);
			}

			return messageId;
		} catch (error) {
			// Update metrics
			if (this.config.enableMetrics) {
				this._updateMetrics(message.channel, false, Date.now() - startTime);
			}

			throw error;
		}
	}

	/**
	 * Send multiple notifications (potentially different channels)
	 * @param messages Array of notification messages
	 * @returns Array of message IDs
	 */
	async sendBatch(messages: NotificationMessage[]): Promise<(string | undefined)[]> {
		const results: (string | undefined)[] = [];

		for (const message of messages) {
			try {
				const messageId = await this.send(message);
				results.push(messageId);
			} catch (error) {
				results.push(undefined);
			}
		}

		return results;
	}

	/**
	 * Send a notification from a Notifiable
	 * @param notifiable Notifiable instance
	 * @param channel Optional specific channel (otherwise uses buildAll or default)
	 * @returns Message ID(s)
	 */
	async sendNotifiable(notifiable: Notifiable, channel?: NotificationChannel): Promise<string | undefined> {
		if (channel) {
			// Send to specific channel
			const message = await notifiable.build(channel);
			return this.send(message);
		}

		// Try buildAll for multi-channel
		if (notifiable.buildAll) {
			const messages = await notifiable.buildAll();
			const results = await this.sendBatch(
				Object.values(messages).filter((m) => m !== undefined) as NotificationMessage[],
			);
			return results[0]; // Return first message ID
		}

		// Fall back to build
		const message = await notifiable.build();
		return this.send(message);
	}

	/**
	 * Queue a notification for async sending (requires job queue integration)
	 * @param message Notification message
	 * @returns Job ID or undefined
	 */
	async queue(message: NotificationMessage): Promise<string | undefined> {
		// This will integrate with JobQueue in Phase 3
		// For now, placeholder
		return undefined;
	}

	/**
	 * Get health status for a channel
	 * @param channelName Name of the channel
	 */
	async getChannelHealth(channelName: NotificationChannel): Promise<ChannelHealth | null> {
		const service = this.channels.get(channelName);
		if (!service) return null;

		return (
			service.getHealth?.() || {
				status: "healthy" as const,
				message: "OK",
				checkedAt: new Date(),
			}
		);
	}

	/**
	 * Get health status for all channels
	 */
	async getHealthStatus(): Promise<Record<NotificationChannel, ChannelHealth>> {
		const health: Record<NotificationChannel, ChannelHealth> = {};

		for (const [name] of this.channels) {
			const channelHealth = await this.getChannelHealth(name);
			if (channelHealth) {
				health[name] = channelHealth;
			}
		}

		return health;
	}

	/**
	 * Get metrics for a specific channel
	 * @param channelName Name of the channel
	 */
	getChannelMetrics(channelName: NotificationChannel): ChannelMetrics | null {
		return this.metrics.get(channelName) || null;
	}

	/**
	 * Get metrics for all channels
	 */
	getAllMetrics(): Record<NotificationChannel, ChannelMetrics> {
		const allMetrics: Record<NotificationChannel, ChannelMetrics> = {};

		for (const [name, metrics] of this.metrics) {
			allMetrics[name] = metrics;
		}

		return allMetrics;
	}

	/**
	 * Resolve TemplateRef objects in message fields to rendered strings
	 */
	private async _resolveTemplates(message: NotificationMessage): Promise<NotificationMessage> {
		const engine = this.config.templateEngine;
		if (!engine) {
			// If no engine, check that no TemplateRef fields exist
			this._assertNoTemplateRefs(message);
			return message;
		}

		const channel = message.channel;
		const msg = { ...message } as Record<string, unknown>;

		const resolveField = async (value: unknown, defaultFormat: "html" | "text"): Promise<string> => {
			if (!isTemplateRef(value)) return value as string;
			const fmt = value.outputFormat ?? defaultFormat;
			const variant = value.variant ?? engine.getVariantForChannel(channel);
			return engine.render(value.templateId, value.data, { variant, outputFormat: fmt });
		};

		// Email: resolve html (→ HTML) and text (→ text)
		if (channel === "email") {
			if (isTemplateRef(msg.html)) {
				msg.html = await resolveField(msg.html, "html");
			}
			if (isTemplateRef(msg.text)) {
				msg.text = await resolveField(msg.text, "text");
			}
		}
		// SMS: resolve message (→ text)
		else if (channel === "sms") {
			if (isTemplateRef(msg.message)) {
				msg.message = await resolveField(msg.message, "text");
			}
		}
		// Push: resolve title and body (→ text)
		else if (channel === "push") {
			if (isTemplateRef(msg.title)) {
				msg.title = await resolveField(msg.title, "text");
			}
			if (isTemplateRef(msg.body)) {
				msg.body = await resolveField(msg.body, "text");
			}
		}

		return msg as NotificationMessage;
	}

	/**
	 * Assert that no TemplateRef fields exist in the message
	 * Throws if a TemplateRef is found but no templateEngine is configured
	 */
	private _assertNoTemplateRefs(message: Record<string, unknown>): void {
		for (const [key, value] of Object.entries(message)) {
			if (isTemplateRef(value)) {
				throw new Error(
					`TemplateRef found in field "${key}" but no templateEngine is configured in NotificationService`,
				);
			}
		}
	}

	/**
	 * Update metrics for a channel
	 */
	private _updateMetrics(
		channelName: NotificationChannel,
		success: boolean,
		duration: number,
	): void {
		const metrics = this.metrics.get(channelName);
		if (!metrics) return;

		if (success) {
			metrics.sent++;
			metrics.totalSendTime += duration;
		} else {
			metrics.failed++;
		}

		const total = metrics.sent + metrics.failed;
		metrics.successRate = total > 0 ? metrics.sent / total : 0;
		metrics.avgSendTime = metrics.sent > 0 ? metrics.totalSendTime / metrics.sent : 0;
		metrics.updatedAt = new Date();
	}
}

/**
 * Factory function to create notification service
 */
export function createNotificationService(
	config?: NotificationServiceConfig,
): NotificationService {
	return new NotificationService(config);
}
