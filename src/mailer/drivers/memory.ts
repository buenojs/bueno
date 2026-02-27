/**
 * Memory Mailer Driver
 *
 * Stores emails in memory. Used as fallback when no driver is configured.
 */

import type { MailMessage } from "../types";
import { BaseMailerDriver } from "./base";

// ============= Memory Driver =============

export class MemoryMailerDriver extends BaseMailerDriver {
	private emails: MailMessage[] = [];

	/**
	 * Connect to the memory store (no-op)
	 */
	async connect(): Promise<void> {
		this.connected = true;
	}

	/**
	 * Disconnect from the memory store (no-op)
	 */
	async disconnect(): Promise<void> {
		this.connected = false;
	}

	/**
	 * Send a mail message (store in memory)
	 */
	async send(message: MailMessage): Promise<string | undefined> {
		const normalized = this.normalizeMessage(message);
		this.emails.push(normalized);
		this.recordSuccess();
		return normalized.messageId;
	}

	/**
	 * Get all stored emails
	 */
	getAllEmails(): MailMessage[] {
		return [...this.emails];
	}

	/**
	 * Clear all emails
	 */
	clear(): void {
		this.emails = [];
	}
}
