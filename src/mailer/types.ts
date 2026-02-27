/**
 * Mailer System Type Definitions
 *
 * Complete type system for email sending with support for multiple drivers
 * (SMTP, Sendgrid, Brevo, Resend) and extensible channel system.
 */

// ============= Recipient Types =============

export interface EmailRecipient {
	name?: string;
	email: string;
}

export type Recipients = string | EmailRecipient | (string | EmailRecipient)[];

// ============= Attachment Types =============

export interface MailerAttachment {
	filename: string;
	content: string | Buffer;
	contentType?: string;
	encoding?: string;
	contentDisposition?: "attachment" | "inline";
	cid?: string;
}

// ============= Email Message Types =============

export interface MailMessage {
	/** Email subject */
	subject: string;
	/** Plain text body */
	text?: string;
	/** HTML body */
	html?: string;
	/** Recipient email(s) */
	to: Recipients;
	/** CC recipient(s) */
	cc?: Recipients;
	/** BCC recipient(s) */
	bcc?: Recipients;
	/** Reply-to email */
	replyTo?: string;
	/** From email (usually from config) */
	from?: string;
	/** Email attachments */
	attachments?: MailerAttachment[];
	/** Custom headers */
	headers?: Record<string, string>;
	/** Message ID for tracking */
	messageId?: string;
	/** References for threading */
	references?: string[];
	/** In-Reply-To for threading */
	inReplyTo?: string;
	/** Tags for organizing (provider-specific) */
	tags?: string[];
	/** Priority level */
	priority?: "high" | "normal" | "low";
	/** Scheduled send time */
	scheduledAt?: Date;
	/** Custom metadata */
	metadata?: Record<string, unknown>;
}

// ============= Mailable Interface =============

/**
 * Interface for composable email messages
 * Implement this interface to create reusable email templates
 */
export interface Mailable {
	/**
	 * Build the mail message
	 * @returns MailMessage or Promise<MailMessage>
	 */
	build(): MailMessage | Promise<MailMessage>;
}

// ============= Mailer Driver Types =============

export type MailerDriverType = "smtp" | "sendgrid" | "brevo" | "resend" | "mock";

export interface BaseMailerDriverConfig {
	/** Driver type */
	driver: MailerDriverType;
	/** Default from email */
	from: string;
	/** Default from name */
	fromName?: string;
	/** Enable development mode (logs instead of sending) */
	dryRun?: boolean;
}

export interface SmtpMailerConfig extends BaseMailerDriverConfig {
	driver: "smtp";
	/** SMTP host */
	host: string;
	/** SMTP port */
	port: number;
	/** Enable TLS/SSL */
	secure?: boolean;
	/** SMTP username */
	username?: string;
	/** SMTP password */
	password?: string;
	/** Connection timeout in ms */
	timeout?: number;
	/** Pool size for concurrent connections */
	poolSize?: number;
}

export interface SendgridMailerConfig extends BaseMailerDriverConfig {
	driver: "sendgrid";
	/** Sendgrid API key */
	apiKey: string;
	/** Enable sandbox mode (emails not delivered) */
	sandbox?: boolean;
}

export interface BrevoMailerConfig extends BaseMailerDriverConfig {
	driver: "brevo";
	/** Brevo API key */
	apiKey: string;
}

export interface ResendMailerConfig extends BaseMailerDriverConfig {
	driver: "resend";
	/** Resend API key */
	apiKey: string;
}

export interface MockMailerConfig extends BaseMailerDriverConfig {
	driver: "mock";
	/** Storage backend for mock emails */
	storage?: "memory" | "file";
	/** File path for storing mock emails (if storage is 'file') */
	storagePath?: string;
}

export type MailerConfig =
	| SmtpMailerConfig
	| SendgridMailerConfig
	| BrevoMailerConfig
	| ResendMailerConfig
	| MockMailerConfig;

// ============= Mailer Driver Interface =============

export interface MailerDriver {
	/**
	 * Connect to the mail service
	 */
	connect(): Promise<void>;

	/**
	 * Disconnect from the mail service
	 */
	disconnect(): Promise<void>;

	/**
	 * Send a mail message
	 * @param message The email message to send
	 * @returns Message ID or undefined if mock/dry-run
	 */
	send(message: MailMessage): Promise<string | undefined>;

	/**
	 * Send multiple messages in batch
	 * @param messages Array of email messages
	 * @returns Array of message IDs
	 */
	sendBatch(messages: MailMessage[]): Promise<(string | undefined)[]>;

	/**
	 * Check if driver is connected
	 */
	isConnected(): Promise<boolean>;

	/**
	 * Get driver health status
	 */
	getHealth?(): Promise<MailerHealth>;
}

// ============= Mailer Health Types =============

export interface MailerHealth {
	/** Driver is healthy and operational */
	status: "healthy" | "degraded" | "unhealthy";
	/** Detailed message */
	message: string;
	/** Last checked timestamp */
	checkedAt: Date;
	/** Optional error details */
	error?: string;
}

// ============= Mailer Service Types =============

export interface MailerOptions {
	/** Configuration */
	config: MailerConfig;
	/** Enable metrics collection */
	metrics?: boolean;
	/** Enable retry logic for failed emails */
	retryOnError?: boolean;
	/** Max retry attempts */
	maxRetries?: number;
	/** Queue system for async sending */
	queue?: boolean;
}

// ============= Template Types =============

export interface TemplateData {
	[key: string]: unknown;
}

export interface MailTemplate {
	/** Template name */
	name: string;
	/** Template subject (can include template variables) */
	subject: string;
	/** Template HTML body */
	html: string;
	/** Template plain text body */
	text?: string;
}

export interface TemplateRenderOptions {
	/** Data to pass to template renderer */
	data?: TemplateData;
	/** Enable HTML escaping */
	escape?: boolean;
	/** Custom helpers for template engine */
	helpers?: Record<string, Function>;
}

export interface TemplateRenderer {
	/**
	 * Render a template with data
	 * @param template Template content
	 * @param data Data to interpolate
	 * @returns Rendered output
	 */
	render(template: string, data?: TemplateData): string;

	/**
	 * Register a helper function
	 */
	registerHelper(name: string, fn: Function): void;

	/**
	 * Unregister a helper function
	 */
	unregisterHelper(name: string): void;
}

// ============= Mailer Event Types =============

export type MailerEventType =
	| "email.sent"
	| "email.failed"
	| "email.queued"
	| "email.bounced"
	| "email.opened"
	| "email.clicked"
	| "email.unsubscribed";

export interface MailerEvent {
	/** Event type */
	type: MailerEventType;
	/** Message ID */
	messageId?: string;
	/** Email address */
	email?: string;
	/** Event timestamp */
	timestamp: Date;
	/** Event data */
	data?: Record<string, unknown>;
}

// ============= Metrics Types =============

export interface MailerMetrics {
	/** Total emails sent */
	sent: number;
	/** Total emails failed */
	failed: number;
	/** Total emails queued */
	queued: number;
	/** Successful send rate (0-1) */
	successRate: number;
	/** Average send time in ms */
	avgSendTime: number;
	/** Total time spent sending */
	totalSendTime: number;
	/** Last updated timestamp */
	updatedAt: Date;
}

// ============= Notification Types (Future) =============

export type NotificationChannel = "email" | "sms" | "push" | "whatsapp";

export interface Notification {
	/** Notification channel */
	channel: NotificationChannel;
	/** Recipient identifier (email, phone, device ID, etc.) */
	recipient: string;
	/** Message content */
	message: string;
	/** Additional metadata */
	metadata?: Record<string, unknown>;
}

// ============= Validation Result Types =============

export interface MailerConfigValidationResult {
	/** Validation passed */
	valid: boolean;
	/** Validation errors */
	errors: string[];
	/** Validation warnings */
	warnings: string[];
}
