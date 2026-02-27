/**
 * Base Mailer Driver
 *
 * Abstract base class for all mailer drivers with common functionality
 */

import type { MailMessage, MailerDriver, MailerConfig, MailerHealth } from "../types";

// ============= Abstract Base Driver =============

export abstract class BaseMailerDriver implements MailerDriver {
	protected config: MailerConfig;
	protected connected = false;
	protected sentCount = 0;
	protected failureCount = 0;

	constructor(config: MailerConfig) {
		this.config = config;
	}

	/**
	 * Connect to the mail service
	 */
	abstract connect(): Promise<void>;

	/**
	 * Disconnect from the mail service
	 */
	abstract disconnect(): Promise<void>;

	/**
	 * Send a mail message
	 */
	abstract send(message: MailMessage): Promise<string | undefined>;

	/**
	 * Send multiple messages in batch
	 */
	async sendBatch(messages: MailMessage[]): Promise<(string | undefined)[]> {
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
	 * Check if driver is connected
	 */
	async isConnected(): Promise<boolean> {
		return this.connected;
	}

	/**
	 * Get driver health status
	 */
	async getHealth(): Promise<MailerHealth> {
		return {
			status: this.connected ? "healthy" : "unhealthy",
			message: this.connected ? "Driver is connected" : "Driver is not connected",
			checkedAt: new Date(),
		};
	}

	/**
	 * Format recipient email/name
	 */
	protected formatRecipient(recipient: string | { name?: string; email: string }): string {
		if (typeof recipient === "string") {
			return recipient;
		}
		return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;
	}

	/**
	 * Format array of recipients
	 */
	protected formatRecipients(
		recipients: string | { name?: string; email: string } | (string | { name?: string; email: string })[],
	): string[] {
		const arr = Array.isArray(recipients) ? recipients : [recipients];
		return arr.map((r) => this.formatRecipient(r));
	}

	/**
	 * Generate a message ID
	 */
	protected generateMessageId(): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 15);
		return `${timestamp}.${random}@bueno.local`;
	}

	/**
	 * Normalize message data
	 */
	protected normalizeMessage(message: MailMessage): MailMessage {
		return {
			...message,
			from: message.from || this.config.from,
			messageId: message.messageId || this.generateMessageId(),
		};
	}

	/**
	 * Record sent email for metrics
	 */
	protected recordSuccess(): void {
		this.sentCount++;
	}

	/**
	 * Record failed email for metrics
	 */
	protected recordFailure(): void {
		this.failureCount++;
	}

	/**
	 * Get metrics
	 */
	getMetrics() {
		const total = this.sentCount + this.failureCount;
		const successRate = total > 0 ? this.sentCount / total : 0;
		return {
			sent: this.sentCount,
			failed: this.failureCount,
			total,
			successRate,
		};
	}
}
