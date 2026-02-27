/**
 * Resend Mailer Driver
 *
 * Sends emails via Resend API.
 * Modern email API built for developers, with clean interface.
 */

import type { MailMessage, ResendMailerConfig } from "../types";
import { BaseMailerDriver } from "./base";

// ============= Resend Driver =============

export class ResendMailerDriver extends BaseMailerDriver {
	private config: ResendMailerConfig;
	private readonly apiUrl = "https://api.resend.com/emails";

	constructor(config: ResendMailerConfig) {
		super(config);
		this.config = config;
	}

	/**
	 * Connect to Resend API
	 */
	async connect(): Promise<void> {
		try {
			if (!this.config.apiKey) {
				throw new Error("Resend API key is required");
			}

			// Verify API key by checking account info
			if (!this.config.dryRun) {
				const response = await fetch("https://api.resend.com/account", {
					method: "GET",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					throw new Error(`Resend API authentication failed: ${response.status}`);
				}
			}

			this.connected = true;
		} catch (error) {
			throw new Error(`Resend connection failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Disconnect from Resend API
	 */
	async disconnect(): Promise<void> {
		this.connected = false;
	}

	/**
	 * Send a mail message via Resend
	 */
	async send(message: MailMessage): Promise<string | undefined> {
		if (!this.connected) {
			throw new Error("Resend driver not connected");
		}

		const normalized = this.normalizeMessage(message);

		try {
			if (this.config.dryRun) {
				console.log(`[ResendMailer] Would send email:`);
				console.log(`  To: ${this.formatRecipients(message.to).join(", ")}`);
				console.log(`  Subject: ${message.subject}`);
				this.recordSuccess();
				return normalized.messageId;
			}

			// Build Resend request payload
			const payload = this._buildResendPayload(normalized);

			// Send via API
			const response = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (response.status === 200) {
				const result = await response.json();
				this.recordSuccess();
				console.log(`[ResendMailer] Email sent: ${result.id}`);
				return result.id;
			} else {
				const error = await response.text();
				this.recordFailure();
				throw new Error(`Resend API error: ${response.status} - ${error}`);
			}
		} catch (error) {
			this.recordFailure();
			throw new Error(`Resend send failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Build Resend API payload
	 */
	private _buildResendPayload(message: MailMessage) {
		const recipients = this.formatRecipients(message.to);
		const ccList = message.cc ? this.formatRecipients(message.cc) : [];
		const bccList = message.bcc ? this.formatRecipients(message.bcc) : [];

		return {
			from: message.from || this.config.from,
			to: recipients,
			cc: ccList.length > 0 ? ccList : undefined,
			bcc: bccList.length > 0 ? bccList : undefined,
			subject: message.subject,
			html: message.html,
			text: message.text,
			replyTo: message.replyTo,
			attachments: message.attachments?.map((att) => ({
				filename: att.filename,
				content:
					typeof att.content === "string"
						? Buffer.from(att.content).toString("base64")
						: att.content.toString("base64"),
			})),
			tags: message.tags?.map((tag) => ({
				name: tag,
				value: tag,
			})),
			headers: message.headers,
		};
	}

	/**
	 * Get account information
	 */
	async getAccountInfo() {
		if (!this.connected) {
			throw new Error("Resend driver not connected");
		}

		const response = await fetch("https://api.resend.com/account", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${this.config.apiKey}`,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to get account info: ${response.status}`);
		}

		return response.json();
	}
}
