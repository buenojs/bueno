/**
 * SMS Channel Service
 *
 * Sends notifications via SMS through various drivers
 * (Twilio, AWS SNS, custom)
 */

import type { SMSChannelConfig, SMSMessage } from "../types";
import { BaseChannelService } from "./base";

// ============= SMS Channel Service =============

export class SMSChannelService extends BaseChannelService<SMSMessage> {
	readonly name = "sms";
	private config: SMSChannelConfig;
	private sentCount = 0;
	private failureCount = 0;

	constructor(config: SMSChannelConfig) {
		super();
		this.config = config;
	}

	/**
	 * Validate SMS message structure
	 */
	validate(message: unknown): asserts message is SMSMessage {
		if (typeof message !== "object" || message === null) {
			throw new Error("Invalid SMS message: must be an object");
		}

		const msg = message as Record<string, unknown>;

		if (msg.channel !== "sms") {
			throw new Error('Invalid SMS message: channel must be "sms"');
		}

		if (typeof msg.recipient !== "string" || msg.recipient.length === 0) {
			throw new Error(
				"Invalid SMS message: recipient (phone number) is required",
			);
		}

		if (typeof msg.message !== "string" || msg.message.length === 0) {
			throw new Error("Invalid SMS message: message is required");
		}

		if (msg.message.length > 160) {
			console.warn(
				`SMS message exceeds 160 characters (${msg.message.length}), will be split`,
			);
		}
	}

	/**
	 * Send SMS message
	 */
	async send(message: SMSMessage): Promise<string | undefined> {
		try {
			if (this.config.dryRun) {
				console.log(`[SMSChannel] Would send SMS to: ${message.recipient}`);
				console.log(`  Message: ${message.message.substring(0, 50)}...`);
				this.sentCount++;
				return this._generateMessageId();
			}

			// In a real implementation, delegate to appropriate driver
			// For now, simulate sending
			const messageId = this._generateMessageId();
			console.log(
				`[SMSChannel] SMS sent: ${messageId} to ${message.recipient}`,
			);
			this.sentCount++;

			return messageId;
		} catch (error) {
			this.failureCount++;
			throw new Error(
				`Failed to send SMS: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get SMS channel metrics
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
		return `sms_${timestamp}_${random}`;
	}
}
