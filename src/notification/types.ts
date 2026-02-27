/**
 * Notification System Type Definitions
 *
 * Flexible multi-channel notification system with support for email, SMS,
 * WhatsApp, push notifications, and custom channels. Uses registry pattern
 * for dynamic channel registration.
 */

// ============= Core Channel Types =============

/**
 * Supported notification channels
 */
export type NotificationChannel = "email" | "sms" | "whatsapp" | "push" | string;

/**
 * Base notification message interface
 * All notification types must extend this
 */
export interface NotificationMessage {
	/** Channel identifier */
	channel: NotificationChannel;
	/** Recipient identifier (email, phone, device ID, etc) */
	recipient: string;
	/** Optional metadata */
	metadata?: Record<string, unknown>;
}

// ============= Email Channel Types =============

export interface EmailRecipient {
	name?: string;
	email: string;
}

export type EmailRecipients = string | EmailRecipient | (string | EmailRecipient)[];

export interface EmailAttachment {
	filename: string;
	content: string | Buffer;
	contentType?: string;
	encoding?: string;
	contentDisposition?: "attachment" | "inline";
	cid?: string;
}

export interface EmailMessage extends NotificationMessage {
	channel: "email";
	recipient: string; // email address
	subject: string;
	html?: string;
	text?: string;
	cc?: EmailRecipients;
	bcc?: EmailRecipients;
	replyTo?: string;
	from?: string;
	attachments?: EmailAttachment[];
	headers?: Record<string, string>;
	messageId?: string;
	references?: string[];
	inReplyTo?: string;
	tags?: string[];
	priority?: "high" | "normal" | "low";
	scheduledAt?: Date;
}

// ============= SMS Channel Types =============

export interface SMSMessage extends NotificationMessage {
	channel: "sms";
	recipient: string; // phone number
	message: string; // Max 160 chars typically
	senderId?: string;
	scheduledAt?: Date;
}

// ============= WhatsApp Channel Types =============

export interface WhatsAppMessage extends NotificationMessage {
	channel: "whatsapp";
	recipient: string; // phone number with country code
	templateId: string;
	parameters?: Record<string, string>;
	mediaUrl?: string;
}

// ============= Push Notification Channel Types =============

export interface PushNotificationMessage extends NotificationMessage {
	channel: "push";
	recipient: string; // device token or user ID
	title: string;
	body: string;
	actionUrl?: string;
	imageUrl?: string;
	data?: Record<string, unknown>;
}

// ============= Union Type =============

/**
 * Union of all built-in notification types
 */
export type BuiltInNotification =
	| EmailMessage
	| SMSMessage
	| WhatsAppMessage
	| PushNotificationMessage;

// ============= Mailable/Notifiable Interface =============

/**
 * Interface for composable notification messages
 * Implement this interface to create reusable notification templates
 */
export interface Notifiable {
	/**
	 * Build notification message(s)
	 * Can return single message or array of messages for multi-channel
	 * @returns NotificationMessage or Promise<NotificationMessage>
	 */
	build(channel?: NotificationChannel): NotificationMessage | Promise<NotificationMessage>;

	/**
	 * Optional: Build multiple channel notifications at once
	 */
	buildAll?(): Record<NotificationChannel, NotificationMessage | Promise<NotificationMessage>>;
}

// ============= Channel Service Types =============

/**
 * Health status for channel services
 */
export interface ChannelHealth {
	status: "healthy" | "degraded" | "unhealthy";
	message: string;
	checkedAt: Date;
	error?: string;
}

/**
 * Base interface for all channel services
 */
export interface ChannelService<T extends NotificationMessage = NotificationMessage> {
	/** Channel name/identifier */
	readonly name: NotificationChannel;

	/** Configuration schema validator (optional) */
	readonly configSchema?: StandardSchema;

	/**
	 * Validate message structure at runtime
	 * Should throw if message is invalid
	 */
	validate(message: unknown): asserts message is T;

	/**
	 * Send a notification message
	 * @returns Message ID or undefined if not trackable
	 */
	send(message: T): Promise<string | undefined>;

	/**
	 * Get channel health status
	 */
	getHealth?(): Promise<ChannelHealth>;

	/**
	 * Get channel metrics (optional)
	 */
	getMetrics?(): Promise<ChannelMetrics>;
}

// ============= Channel Configuration Types =============

export interface BaseChannelConfig {
	/** Enable this channel */
	enabled?: boolean;
	/** Dry-run mode (log instead of sending) */
	dryRun?: boolean;
	/** Enable metrics collection */
	enableMetrics?: boolean;
}

export interface EmailChannelConfig extends BaseChannelConfig {
	driver: "smtp" | "sendgrid" | "brevo" | "resend";
	from: string;
	fromName?: string;
	smtp?: {
		host: string;
		port: number;
		secure?: boolean;
		username?: string;
		password?: string;
	};
	apiKey?: string;
}

export interface SMSChannelConfig extends BaseChannelConfig {
	driver: "twilio" | "aws-sns" | "custom";
	accountSid?: string;
	authToken?: string;
	fromNumber?: string;
	apiKey?: string;
}

export interface WhatsAppChannelConfig extends BaseChannelConfig {
	driver: "twilio" | "custom";
	accountSid?: string;
	authToken?: string;
	businessPhoneNumber?: string;
	apiKey?: string;
}

export interface PushChannelConfig extends BaseChannelConfig {
	driver: "firebase" | "apns" | "custom";
	serverKey?: string;
	certificatePath?: string;
	apiKey?: string;
}

export type ChannelConfig =
	| EmailChannelConfig
	| SMSChannelConfig
	| WhatsAppChannelConfig
	| PushChannelConfig
	| Record<string, unknown>;

// ============= Notification Service Configuration =============

export interface NotificationServiceConfig {
	/** Channels configuration */
	channels?: Record<NotificationChannel, ChannelConfig>;
	/** Default channel for sending */
	defaultChannel?: NotificationChannel;
	/** Queue system for async sending */
	queue?: boolean;
	/** Enable metrics collection */
	enableMetrics?: boolean;
}

// ============= Metrics Types =============

export interface ChannelMetrics {
	/** Total messages sent */
	sent: number;
	/** Total messages failed */
	failed: number;
	/** Successful send rate (0-1) */
	successRate: number;
	/** Average send time in ms */
	avgSendTime: number;
	/** Total time spent sending */
	totalSendTime: number;
	/** Last updated timestamp */
	updatedAt: Date;
}

// ============= Event Types =============

export type NotificationEventType =
	| "notification.sent"
	| "notification.failed"
	| "notification.queued"
	| "notification.bounced"
	| "notification.delivered";

export interface NotificationEvent {
	type: NotificationEventType;
	channel: NotificationChannel;
	messageId?: string;
	recipient?: string;
	timestamp: Date;
	data?: Record<string, unknown>;
}

// ============= Validation Result =============

export interface NotificationValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
}

// ============= Standard Schema (for config validation) =============

export interface StandardSchema<T = unknown> {
	"~standard": {
		version: number;
		types?: {
			input: unknown;
			output: T;
		};
		validate: (value: unknown) => Promise<{
			issues?: Array<{
				message: string;
				path?: Array<PropertyKey | { key: PropertyKey }>;
			}>;
		}>;
	};
}
