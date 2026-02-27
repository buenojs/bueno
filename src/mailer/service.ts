/**
 * Mailer Service
 *
 * Main public interface for sending emails with template support
 * and integration with job queue for async sending.
 */

import type { MailMessage, MailerConfig, MailerDriver, MailerMetrics, Mailable } from "./types";
import { MemoryMailerDriver } from "./drivers/memory";
import { SmtpMailerDriver } from "./drivers/smtp";
import { SendgridMailerDriver } from "./drivers/sendgrid";
import { BrevoMailerDriver } from "./drivers/brevo";
import { ResendMailerDriver } from "./drivers/resend";
import { MockMailerDriver } from "./drivers/mock";
import type { MailerOptions } from "./types";

// ============= Mailer Service =============

export class MailerService {
	private driver: MailerDriver;
	private config: MailerConfig;
	private options: MailerOptions;
	private metrics = {
		sent: 0,
		failed: 0,
		queued: 0,
		totalSendTime: 0,
	};

	constructor(config: MailerConfig, options?: Partial<MailerOptions>) {
		this.config = config;
		this.options = {
			config,
			metrics: options?.metrics ?? true,
			retryOnError: options?.retryOnError ?? true,
			maxRetries: options?.maxRetries ?? 3,
			queue: options?.queue ?? false,
		};

		// Instantiate appropriate driver
		this.driver = this._instantiateDriver(config);
	}

	/**
	 * Instantiate the appropriate driver based on config
	 */
	private _instantiateDriver(config: MailerConfig): MailerDriver {
		switch (config.driver) {
			case "smtp":
				return new SmtpMailerDriver(config as any);
			case "sendgrid":
				return new SendgridMailerDriver(config as any);
			case "brevo":
				return new BrevoMailerDriver(config as any);
			case "resend":
				return new ResendMailerDriver(config as any);
			case "mock":
				return new MockMailerDriver(config as any);
			default:
				return new MemoryMailerDriver(config as any);
		}
	}

	/**
	 * Initialize the mailer service
	 */
	async init(): Promise<void> {
		await this.driver.connect();
	}

	/**
	 * Shutdown the mailer service
	 */
	async shutdown(): Promise<void> {
		await this.driver.disconnect();
	}

	/**
	 * Send a single email
	 */
	async send(message: MailMessage | Mailable): Promise<string | undefined> {
		const startTime = Date.now();

		try {
			// Build message if Mailable interface
			const mailMessage = await this._buildMessage(message);

			const messageId = await this.driver.send(mailMessage);

			// Track metrics
			if (this.options.metrics) {
				this.metrics.sent++;
				this.metrics.totalSendTime += Date.now() - startTime;
			}

			return messageId;
		} catch (error) {
			if (this.options.metrics) {
				this.metrics.failed++;
			}

			if (this.options.retryOnError) {
				// Could implement retry logic here
				console.warn("Email send failed, retry logic not yet implemented");
			}

			throw error;
		}
	}

	/**
	 * Send multiple emails in batch
	 */
	async sendBatch(messages: (MailMessage | Mailable)[]): Promise<(string | undefined)[]> {
		const builtMessages = await Promise.all(messages.map((msg) => this._buildMessage(msg)));
		return this.driver.sendBatch(builtMessages);
	}

	/**
	 * Queue an email for async sending (requires job queue integration)
	 */
	async queue(message: MailMessage | Mailable): Promise<string | undefined> {
		// This would integrate with JobQueue when available
		// For now, return undefined
		if (this.options.metrics) {
			this.metrics.queued++;
		}
		return undefined;
	}

	/**
	 * Build a message from Mailable or return as-is
	 */
	private async _buildMessage(message: MailMessage | Mailable): Promise<MailMessage> {
		if ("build" in message) {
			return await (message as Mailable).build();
		}
		return message as MailMessage;
	}

	/**
	 * Check if mailer is connected
	 */
	async isConnected(): Promise<boolean> {
		return this.driver.isConnected();
	}

	/**
	 * Get mailer health status
	 */
	async getHealth() {
		return this.driver.getHealth?.() ?? { status: "healthy", message: "OK", checkedAt: new Date() };
	}

	/**
	 * Get mailer metrics
	 */
	getMetrics(): MailerMetrics {
		const total = this.metrics.sent + this.metrics.failed;
		return {
			sent: this.metrics.sent,
			failed: this.metrics.failed,
			queued: this.metrics.queued,
			successRate: total > 0 ? this.metrics.sent / total : 0,
			avgSendTime: this.metrics.sent > 0 ? this.metrics.totalSendTime / this.metrics.sent : 0,
			totalSendTime: this.metrics.totalSendTime,
			updatedAt: new Date(),
		};
	}

	/**
	 * Get the underlying driver
	 */
	getDriver(): MailerDriver {
		return this.driver;
	}
}

/**
 * Factory function to create mailer instance
 */
export function createMailer(config: MailerConfig, options?: Partial<MailerOptions>): MailerService {
	return new MailerService(config, options);
}
