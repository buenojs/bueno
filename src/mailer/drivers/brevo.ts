/**
 * Brevo Mailer Driver
 *
 * Sends emails via Brevo (formerly Sendinblue) API.
 * Supports template-based emails and advanced sending options.
 */

import type { MailMessage, BrevoMailerConfig } from "../types";
import { BaseMailerDriver } from "./base";

// ============= Brevo Driver =============

export class BrevoMailerDriver extends BaseMailerDriver {
	private config: BrevoMailerConfig;
	private readonly apiUrl = "https://api.brevo.com/v3/smtp/email";

	constructor(config: BrevoMailerConfig) {
		super(config);
		this.config = config;
	}

	/**
	 * Connect to Brevo API
	 */
	async connect(): Promise<void> {
		try {
			if (!this.config.apiKey) {
				throw new Error("Brevo API key is required");
			}

			// Verify API key by checking account info
			if (!this.config.dryRun) {
				const response = await fetch("https://api.brevo.com/v3/account", {
					method: "GET",
					headers: {
						"api-key": this.config.apiKey,
						"Content-Type": "application/json",
					},
				});

				if (!response.ok) {
					throw new Error(`Brevo API authentication failed: ${response.status}`);
				}
			}

			this.connected = true;
		} catch (error) {
			throw new Error(`Brevo connection failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Disconnect from Brevo API
	 */
	async disconnect(): Promise<void> {
		this.connected = false;
	}

	/**
	 * Send a mail message via Brevo
	 */
	async send(message: MailMessage): Promise<string | undefined> {
		if (!this.connected) {
			throw new Error("Brevo driver not connected");
		}

		const normalized = this.normalizeMessage(message);

		try {
			if (this.config.dryRun) {
				console.log(`[BrevoMailer] Would send email:`);
				console.log(`  To: ${this.formatRecipients(message.to).join(", ")}`);
				console.log(`  Subject: ${message.subject}`);
				this.recordSuccess();
				return normalized.messageId;
			}

			// Build Brevo request payload
			const payload = this._buildBrevoPayload(normalized);

			// Send via API
			const response = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					"api-key": this.config.apiKey,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (response.status === 201 || response.status === 200) {
				const result = await response.json();
				this.recordSuccess();
				console.log(`[BrevoMailer] Email sent: ${normalized.messageId}`);
				return result.messageId || normalized.messageId;
			} else {
				const error = await response.text();
				this.recordFailure();
				throw new Error(`Brevo API error: ${response.status} - ${error}`);
			}
		} catch (error) {
			this.recordFailure();
			throw new Error(`Brevo send failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Build Brevo API payload
	 */
	private _buildBrevoPayload(message: MailMessage) {
		const recipients = this.formatRecipients(message.to);
		const ccList = message.cc ? this.formatRecipients(message.cc) : [];
		const bccList = message.bcc ? this.formatRecipients(message.bcc) : [];

		return {
			to: recipients.map((email) => ({ email })),
			cc: ccList.length > 0 ? ccList.map((email) => ({ email })) : undefined,
			bcc: bccList.length > 0 ? bccList.map((email) => ({ email })) : undefined,
			from: {
				email: message.from || this.config.from,
				name: this.config.fromName,
			},
			subject: message.subject,
			htmlContent: message.html,
			textContent: message.text,
			replyTo: message.replyTo ? { email: message.replyTo } : undefined,
			headers: message.headers,
			attachment: message.attachments?.map((att) => ({
				content:
					typeof att.content === "string"
						? Buffer.from(att.content).toString("base64")
						: att.content.toString("base64"),
				name: att.filename,
			})),
			tags: message.tags,
			params: message.metadata,
			scheduledAt: message.scheduledAt ? message.scheduledAt.toISOString() : undefined,
		};
	}

	/**
	 * Get account information
	 */
	async getAccountInfo() {
		if (!this.connected) {
			throw new Error("Brevo driver not connected");
		}

		const response = await fetch("https://api.brevo.com/v3/account", {
			method: "GET",
			headers: {
				"api-key": this.config.apiKey,
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to get account info: ${response.status}`);
		}

		return response.json();
	}
}
