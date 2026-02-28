/**
 * WhatsApp Channel Service
 *
 * Sends notifications via WhatsApp through various drivers
 * (Twilio, custom)
 */

import type { WhatsAppChannelConfig, WhatsAppMessage } from "../types";
import { BaseChannelService } from "./base";

// ============= WhatsApp Channel Service =============

export class WhatsAppChannelService extends BaseChannelService<WhatsAppMessage> {
	readonly name = "whatsapp";
	private config: WhatsAppChannelConfig;
	private sentCount = 0;
	private failureCount = 0;

	constructor(config: WhatsAppChannelConfig) {
		super();
		this.config = config;
	}

	/**
	 * Validate WhatsApp message structure
	 */
	validate(message: unknown): asserts message is WhatsAppMessage {
		if (typeof message !== "object" || message === null) {
			throw new Error("Invalid WhatsApp message: must be an object");
		}

		const msg = message as Record<string, unknown>;

		if (msg.channel !== "whatsapp") {
			throw new Error('Invalid WhatsApp message: channel must be "whatsapp"');
		}

		if (typeof msg.recipient !== "string" || msg.recipient.length === 0) {
			throw new Error(
				"Invalid WhatsApp message: recipient (phone number) is required",
			);
		}

		if (typeof msg.templateId !== "string" || msg.templateId.length === 0) {
			throw new Error("Invalid WhatsApp message: templateId is required");
		}
	}

	/**
	 * Send WhatsApp message
	 */
	async send(message: WhatsAppMessage): Promise<string | undefined> {
		try {
			if (this.config.dryRun) {
				console.log(
					`[WhatsAppChannel] Would send WhatsApp to: ${message.recipient}`,
				);
				console.log(`  Template: ${message.templateId}`);
				console.log(
					`  Parameters: ${JSON.stringify(message.parameters || {})}`,
				);
				this.sentCount++;
				return this._generateMessageId();
			}

			// In a real implementation, delegate to appropriate driver
			// For now, simulate sending
			const messageId = this._generateMessageId();
			console.log(
				`[WhatsAppChannel] WhatsApp sent: ${messageId} to ${message.recipient}`,
			);
			this.sentCount++;

			return messageId;
		} catch (error) {
			this.failureCount++;
			throw new Error(
				`Failed to send WhatsApp: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get WhatsApp channel metrics
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
		return `wa_${timestamp}_${random}`;
	}
}
