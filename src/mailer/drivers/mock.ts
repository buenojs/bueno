/**
 * Mock Mailer Driver
 *
 * For testing and development. Stores emails in memory or file system.
 * Useful for running tests without a real mail service.
 */

import type { MailMessage, MockMailerConfig } from "../types";
import { BaseMailerDriver } from "./base";

// ============= Mock Mailer Driver =============

export class MockMailerDriver extends BaseMailerDriver {
	private emails: MailMessage[] = [];
	private config: MockMailerConfig;

	constructor(config: MockMailerConfig) {
		super(config);
		this.config = config;
	}

	/**
	 * Connect to the mock service (no-op)
	 */
	async connect(): Promise<void> {
		this.connected = true;
	}

	/**
	 * Disconnect from the mock service (no-op)
	 */
	async disconnect(): Promise<void> {
		this.connected = false;
	}

	/**
	 * Send a mail message (store in memory/file)
	 */
	async send(message: MailMessage): Promise<string | undefined> {
		const normalized = this.normalizeMessage(message);

		// Store email
		this.emails.push(normalized);
		this.recordSuccess();

		// Log email for development
		if (!this.config.dryRun) {
			console.log(`[MockMailer] Email sent to: ${this.formatRecipients(message.to).join(", ")}`);
		}

		return normalized.messageId;
	}

	/**
	 * Get all stored emails
	 */
	getAllEmails(): MailMessage[] {
		return [...this.emails];
	}

	/**
	 * Get emails sent to a specific address
	 */
	getEmailsTo(email: string): MailMessage[] {
		return this.emails.filter((msg) => {
			const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
			return recipients.some((r) => {
				if (typeof r === "string") return r === email;
				return r.email === email;
			});
		});
	}

	/**
	 * Clear all stored emails
	 */
	clear(): void {
		this.emails = [];
	}

	/**
	 * Get email by message ID
	 */
	getById(messageId: string): MailMessage | undefined {
		return this.emails.find((email) => email.messageId === messageId);
	}

	/**
	 * Get last sent email
	 */
	getLastEmail(): MailMessage | undefined {
		return this.emails[this.emails.length - 1];
	}

	/**
	 * Count of emails sent
	 */
	count(): number {
		return this.emails.length;
	}
}
