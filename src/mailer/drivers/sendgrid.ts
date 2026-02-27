/**
 * Sendgrid Mailer Driver
 *
 * Sends emails via Sendgrid API.
 * Supports sandbox mode for testing without actual delivery.
 */

import type { MailMessage, SendgridMailerConfig } from "../types";
import { BaseMailerDriver } from "./base";

// ============= Sendgrid Driver =============

export class SendgridMailerDriver extends BaseMailerDriver {
	private config: SendgridMailerConfig;
	private readonly apiUrl = "https://api.sendgrid.com/v3/mail/send";

	constructor(config: SendgridMailerConfig) {
		super(config);
		this.config = config;
	}

	/**
	 * Connect to Sendgrid API
	 */
	async connect(): Promise<void> {
		try {
			if (!this.config.apiKey) {
				throw new Error("Sendgrid API key is required");
			}

			// Verify API key by making a simple request
			if (!this.config.dryRun) {
				const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${this.config.apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						personalizations: [{ to: [{ email: "test@example.com" }] }],
						from: { email: this.config.from },
						subject: "API Test",
						content: [{ type: "text/plain", value: "test" }],
						mail_settings: { sandbox_mode: { enable: true } },
					}),
				});

				if (!response.ok && response.status !== 202) {
					// 202 is accepted, 400+ for sandbox mode test
					if (response.status !== 400) {
						throw new Error(`Sendgrid API error: ${response.status}`);
					}
				}
			}

			this.connected = true;
		} catch (error) {
			throw new Error(`Sendgrid connection failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Disconnect from Sendgrid API
	 */
	async disconnect(): Promise<void> {
		this.connected = false;
	}

	/**
	 * Send a mail message via Sendgrid
	 */
	async send(message: MailMessage): Promise<string | undefined> {
		if (!this.connected) {
			throw new Error("Sendgrid driver not connected");
		}

		const normalized = this.normalizeMessage(message);

		try {
			if (this.config.dryRun) {
				console.log(`[SendgridMailer] Would send email:`);
				console.log(`  To: ${this.formatRecipients(message.to).join(", ")}`);
				console.log(`  Subject: ${message.subject}`);
				this.recordSuccess();
				return normalized.messageId;
			}

			// Build Sendgrid request payload
			const payload = this._buildSendgridPayload(normalized);

			// Send via API
			const response = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (response.status === 202) {
				this.recordSuccess();
				console.log(`[SendgridMailer] Email sent: ${normalized.messageId}`);
				return normalized.messageId;
			} else {
				const error = await response.text();
				this.recordFailure();
				throw new Error(`Sendgrid API error: ${response.status} - ${error}`);
			}
		} catch (error) {
			this.recordFailure();
			throw new Error(`Sendgrid send failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Build Sendgrid API payload
	 */
	private _buildSendgridPayload(message: MailMessage) {
		const recipients = this.formatRecipients(message.to);
		const ccList = message.cc ? this.formatRecipients(message.cc) : [];
		const bccList = message.bcc ? this.formatRecipients(message.bcc) : [];

		return {
			personalizations: [
				{
					to: recipients.map((email) => ({ email })),
					cc: ccList.length > 0 ? ccList.map((email) => ({ email })) : undefined,
					bcc: bccList.length > 0 ? bccList.map((email) => ({ email })) : undefined,
				},
			],
			from: {
				email: message.from || this.config.from,
				name: this.config.fromName,
			},
			subject: message.subject,
			content: [
				message.html ? { type: "text/html", value: message.html } : null,
				message.text ? { type: "text/plain", value: message.text } : null,
			].filter(Boolean),
			attachments: message.attachments?.map((att) => ({
				content:
					typeof att.content === "string"
						? Buffer.from(att.content).toString("base64")
						: att.content.toString("base64"),
				type: att.contentType || "application/octet-stream",
				filename: att.filename,
				disposition: att.contentDisposition || "attachment",
			})),
			headers: message.headers,
			categories: message.tags,
			reply_to: message.replyTo ? { email: message.replyTo } : undefined,
			custom_args: message.metadata ? { metadata: JSON.stringify(message.metadata) } : undefined,
			mail_settings: {
				sandbox_mode: { enable: this.config.sandbox ?? false },
			},
		};
	}
}
