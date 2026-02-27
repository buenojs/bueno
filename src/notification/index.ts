/**
 * Notification Module
 *
 * Multi-channel notification system with support for email, SMS, WhatsApp,
 * push notifications, and custom channels. Uses registry pattern for
 * dynamic channel registration.
 */

// Export types
export type {
	NotificationChannel,
	NotificationMessage,
	EmailRecipient,
	EmailRecipients,
	EmailAttachment,
	EmailMessage,
	SMSMessage,
	WhatsAppMessage,
	PushNotificationMessage,
	BuiltInNotification,
	Notifiable,
	ChannelHealth,
	ChannelService,
	BaseChannelConfig,
	EmailChannelConfig,
	SMSChannelConfig,
	WhatsAppChannelConfig,
	PushChannelConfig,
	ChannelConfig,
	NotificationServiceConfig,
	ChannelMetrics,
	NotificationEvent,
	NotificationEventType,
	NotificationValidationResult,
	StandardSchema,
} from "./types";

// Export service
export { NotificationService, createNotificationService } from "./service";

// Export base channel
export { BaseChannelService } from "./channels/base";

// Export built-in channels
export { EmailChannelService } from "./channels/email";
export { SMSChannelService } from "./channels/sms";
export { WhatsAppChannelService } from "./channels/whatsapp";
export { PushNotificationChannelService } from "./channels/push";
