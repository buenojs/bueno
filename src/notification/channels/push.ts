/**
 * Push Notification Channel Service
 *
 * Sends notifications via push through various drivers
 * (Firebase, APNS, custom)
 */

import type { PushChannelConfig, PushNotificationMessage } from "../types";
import { BaseChannelService } from "./base";

// ============= Push Notification Channel Service =============

export class PushNotificationChannelService extends BaseChannelService<PushNotificationMessage> {
	readonly name = "push";
	private config: PushChannelConfig;
	private sentCount = 0;
	private failureCount = 0;

	constructor(config: PushChannelConfig) {
		super();
		this.config = config;
	}

	/**
	 * Validate push notification message structure
	 */
	validate(message: unknown): asserts message is PushNotificationMessage {
		if (typeof message !== "object" || message === null) {
			throw new Error("Invalid push message: must be an object");
		}

		const msg = message as Record<string, unknown>;

		if (msg.channel !== "push") {
			throw new Error('Invalid push message: channel must be "push"');
		}

		if (typeof msg.recipient !== "string" || msg.recipient.length === 0) {
			throw new Error(
				"Invalid push message: recipient (device token) is required",
			);
		}

		if (typeof msg.title !== "string" || msg.title.length === 0) {
			throw new Error("Invalid push message: title is required");
		}

		if (typeof msg.body !== "string" || msg.body.length === 0) {
			throw new Error("Invalid push message: body is required");
		}
	}

	/**
	 * Send push notification message
	 */
	async send(message: PushNotificationMessage): Promise<string | undefined> {
		try {
			if (this.config.dryRun) {
				console.log(`[PushChannel] Would send push to: ${message.recipient}`);
				console.log(`  Title: ${message.title}`);
				console.log(`  Body: ${message.body}`);
				this.sentCount++;
				return this._generateMessageId();
			}

			// In a real implementation, delegate to appropriate driver
			// For now, simulate sending
			const messageId = this._generateMessageId();
			console.log(
				`[PushChannel] Push sent: ${messageId} to ${message.recipient}`,
			);
			this.sentCount++;

			return messageId;
		} catch (error) {
			this.failureCount++;
			throw new Error(
				`Failed to send push: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get push channel metrics
	 */
	getMetrics() {
		const total = this.sentCount + this.failureCount;
		return {
			sent: this.sentCount,
			failed: this.failureCount,
			total,
			successRate: total > 0 ? this.sentCount / total : 0,
		};
	}

	/**
	 * Generate a message ID
	 */
	private _generateMessageId(): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 15);
		return `push_${timestamp}_${random}`;
	}
}
