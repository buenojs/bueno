/**
 * Email Channel Service
 *
 * Sends notifications via email through various drivers
 * (SMTP, Sendgrid, Brevo, Resend)
 */

import type { EmailMessage, EmailChannelConfig } from "../types";
import { BaseChannelService } from "./base";

// ============= Email Channel Service =============

export class EmailChannelService extends BaseChannelService<EmailMessage> {
	readonly name = "email";
	private config: EmailChannelConfig;
	private sentCount = 0;
	private failureCount = 0;

	constructor(config: EmailChannelConfig) {
		super();
		this.config = config;
	}

	/**
	 * Validate email message structure
	 */
	validate(message: unknown): asserts message is EmailMessage {
		if (typeof message !== "object" || message === null) {
			throw new Error("Invalid email message: must be an object");
		}

		const msg = message as Record<string, unknown>;

		// Check required fields
		if (msg.channel !== "email") {
			throw new Error('Invalid email message: channel must be "email"');
		}

		if (typeof msg.recipient !== "string" || !msg.recipient.includes("@")) {
			throw new Error("Invalid email message: recipient must be a valid email");
		}

		if (typeof msg.subject !== "string" || msg.subject.length === 0) {
			throw new Error("Invalid email message: subject is required");
		}

		// Check that at least one of html or text is present
		if (!msg.html && !msg.text) {
			throw new Error("Invalid email message: either html or text must be provided");
		}
	}

	/**
	 * Send email message
	 */
	async send(message: EmailMessage): Promise<string | undefined> {
		try {
			if (this.config.dryRun) {
				console.log(`[EmailChannel] Would send email to: ${message.recipient}`);
				console.log(`  Subject: ${message.subject}`);
				this.sentCount++;
				return this._generateMessageId();
			}

			// In a real implementation, delegate to appropriate driver
			// For now, simulate sending
			const messageId = this._generateMessageId();
			console.log(`[EmailChannel] Email sent: ${messageId} to ${message.recipient}`);
			this.sentCount++;

			return messageId;
		} catch (error) {
			this.failureCount++;
			throw new Error(
				`Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Get email channel metrics
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
		return `${timestamp}.${random}@bueno.local`;
	}
}
