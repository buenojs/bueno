/**
 * Mailer Module
 *
 * Complete email sending system with support for multiple drivers
 * (SMTP, Sendgrid, Brevo, Resend) and template rendering.
 */

// Export types
export type {
	EmailRecipient,
	Recipients,
	MailerAttachment,
	MailMessage,
	Mailable,
	MailerDriver,
	MailerHealth,
	MailerOptions,
	MailTemplate,
	TemplateData,
	TemplateRenderOptions,
	TemplateRenderer,
	MailerEvent,
	MailerMetrics,
	Notification,
	NotificationChannel,
	MailerConfig,
	BaseMailerDriverConfig,
	SmtpMailerConfig,
	SendgridMailerConfig,
	BrevoMailerConfig,
	ResendMailerConfig,
	MockMailerConfig,
	MailerConfigValidationResult,
	MailerEventType,
} from "./types";

// Export main service
export { MailerService, createMailer } from "./service";

// Export drivers
export { BaseMailerDriver } from "./drivers/base";
export { MemoryMailerDriver } from "./drivers/memory";
export { SmtpMailerDriver } from "./drivers/smtp";
export { SendgridMailerDriver } from "./drivers/sendgrid";
export { BrevoMailerDriver } from "./drivers/brevo";
export { ResendMailerDriver } from "./drivers/resend";
export { MockMailerDriver } from "./drivers/mock";
