/**
 * Notification System Unit Tests
 *
 * Tests for notification service, channels, and core functionality
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import {
	NotificationService,
	EmailChannelService,
	SMSChannelService,
	WhatsAppChannelService,
	PushNotificationChannelService,
	type EmailMessage,
	type SMSMessage,
	type WhatsAppMessage,
	type PushNotificationMessage,
	type TemplateRef,
} from "../../src/notification";
import { TemplateEngine } from "../../src/templates";

// ============= Test Fixtures =============

const testEmailMessage: EmailMessage = {
	channel: "email",
	recipient: "test@example.com",
	subject: "Test Email",
	html: "<p>This is a test</p>",
	text: "This is a test",
};

const testSMSMessage: SMSMessage = {
	channel: "sms",
	recipient: "+1234567890",
	message: "This is a test SMS message",
};

const testWhatsAppMessage: WhatsAppMessage = {
	channel: "whatsapp",
	recipient: "+1234567890",
	templateId: "welcome_template",
	parameters: { name: "John" },
};

const testPushMessage: PushNotificationMessage = {
	channel: "push",
	recipient: "device_token_123",
	title: "Test Notification",
	body: "This is a test push notification",
};

// ============= Email Channel Tests =============

describe("EmailChannelService", () => {
	let channel: EmailChannelService;

	beforeEach(() => {
		channel = new EmailChannelService({
			driver: "smtp",
			from: "noreply@example.com",
			dryRun: true,
		});
	});

	test("should validate email message", () => {
		expect(() => {
			channel.validate(testEmailMessage);
		}).not.toThrow();
	});

	test("should reject email without subject", () => {
		expect(() => {
			channel.validate({
				channel: "email",
				recipient: "test@example.com",
				html: "<p>Test</p>",
			});
		}).toThrow();
	});

	test("should reject email without recipient", () => {
		expect(() => {
			channel.validate({
				channel: "email",
				subject: "Test",
				html: "<p>Test</p>",
			});
		}).toThrow();
	});

	test("should reject email without html or text", () => {
		expect(() => {
			channel.validate({
				channel: "email",
				recipient: "test@example.com",
				subject: "Test",
			});
		}).toThrow();
	});

	test("should send email in dry-run mode", async () => {
		const messageId = await channel.send(testEmailMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});

	test("should track metrics", async () => {
		await channel.send(testEmailMessage);
		await channel.send(testEmailMessage);

		const metrics = channel.getMetrics();
		expect(metrics.sent).toBe(2);
		expect(metrics.failed).toBe(0);
		expect(metrics.successRate).toBe(1);
	});
});

// ============= SMS Channel Tests =============

describe("SMSChannelService", () => {
	let channel: SMSChannelService;

	beforeEach(() => {
		channel = new SMSChannelService({
			driver: "twilio",
			dryRun: true,
		});
	});

	test("should validate SMS message", () => {
		expect(() => {
			channel.validate(testSMSMessage);
		}).not.toThrow();
	});

	test("should reject SMS without recipient", () => {
		expect(() => {
			channel.validate({
				channel: "sms",
				message: "Test message",
			});
		}).toThrow();
	});

	test("should reject SMS without message", () => {
		expect(() => {
			channel.validate({
				channel: "sms",
				recipient: "+1234567890",
			});
		}).toThrow();
	});

	test("should send SMS in dry-run mode", async () => {
		const messageId = await channel.send(testSMSMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});

	test("should warn about long messages", async () => {
		const longMessage: SMSMessage = {
			...testSMSMessage,
			message: "A".repeat(200),
		};

		await expect(channel.send(longMessage)).resolves.toBeDefined();
	});
});

// ============= WhatsApp Channel Tests =============

describe("WhatsAppChannelService", () => {
	let channel: WhatsAppChannelService;

	beforeEach(() => {
		channel = new WhatsAppChannelService({
			driver: "twilio",
			dryRun: true,
		});
	});

	test("should validate WhatsApp message", () => {
		expect(() => {
			channel.validate(testWhatsAppMessage);
		}).not.toThrow();
	});

	test("should reject WhatsApp without templateId", () => {
		expect(() => {
			channel.validate({
				channel: "whatsapp",
				recipient: "+1234567890",
			});
		}).toThrow();
	});

	test("should send WhatsApp in dry-run mode", async () => {
		const messageId = await channel.send(testWhatsAppMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});
});

// ============= Push Notification Channel Tests =============

describe("PushNotificationChannelService", () => {
	let channel: PushNotificationChannelService;

	beforeEach(() => {
		channel = new PushNotificationChannelService({
			driver: "firebase",
			dryRun: true,
		});
	});

	test("should validate push message", () => {
		expect(() => {
			channel.validate(testPushMessage);
		}).not.toThrow();
	});

	test("should reject push without title", () => {
		expect(() => {
			channel.validate({
				channel: "push",
				recipient: "device_token",
				body: "Test",
			});
		}).toThrow();
	});

	test("should reject push without body", () => {
		expect(() => {
			channel.validate({
				channel: "push",
				recipient: "device_token",
				title: "Test",
			});
		}).toThrow();
	});

	test("should send push in dry-run mode", async () => {
		const messageId = await channel.send(testPushMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});
});

// ============= Notification Service Tests =============

describe("NotificationService", () => {
	let service: NotificationService;

	beforeEach(() => {
		service = new NotificationService({ enableMetrics: true });
		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);
		service.registerChannel(
			new SMSChannelService({ driver: "twilio", dryRun: true }),
		);
	});

	test("should create service", () => {
		expect(service).toBeDefined();
	});

	test("should register channels", () => {
		expect(service.hasChannel("email")).toBe(true);
		expect(service.hasChannel("sms")).toBe(true);
		expect(service.hasChannel("push")).toBe(false);
	});

	test("should get registered channels", () => {
		const channels = service.getChannels();
		expect(channels).toContain("email");
		expect(channels).toContain("sms");
	});

	test("should get channel by name", () => {
		const emailChannel = service.getChannel("email");
		expect(emailChannel).toBeDefined();
		expect(emailChannel?.name).toBe("email");
	});

	test("should send via email channel", async () => {
		const messageId = await service.send(testEmailMessage);
		expect(messageId).toBeDefined();
	});

	test("should send via SMS channel", async () => {
		const messageId = await service.send(testSMSMessage);
		expect(messageId).toBeDefined();
	});

	test("should throw when sending to unregistered channel", async () => {
		const message: PushNotificationMessage = {
			...testPushMessage,
		};

		await expect(service.send(message)).rejects.toThrow("Channel not registered");
	});

	test("should send batch messages", async () => {
		const messages = [testEmailMessage, testSMSMessage];
		const results = await service.sendBatch(messages);

		expect(results.length).toBe(2);
		expect(results[0]).toBeDefined();
		expect(results[1]).toBeDefined();
	});

	test("should handle batch errors gracefully", async () => {
		const validMessage = testEmailMessage;
		const invalidMessage: EmailMessage = {
			...testEmailMessage,
			subject: "", // Invalid
		};

		const results = await service.sendBatch([validMessage, invalidMessage]);
		expect(results.length).toBe(2);
		expect(results[0]).toBeDefined(); // Valid message succeeded
		expect(results[1]).toBeUndefined(); // Invalid message failed
	});

	test("should get channel metrics", async () => {
		await service.send(testEmailMessage);

		const metrics = service.getChannelMetrics("email");
		expect(metrics).toBeDefined();
		expect(metrics?.sent).toBe(1);
	});

	test("should get all metrics", async () => {
		await service.send(testEmailMessage);
		await service.send(testSMSMessage);

		const allMetrics = service.getAllMetrics();
		expect(allMetrics.email).toBeDefined();
		expect(allMetrics.sms).toBeDefined();
	});

	test("should get channel health", async () => {
		const health = await service.getChannelHealth("email");
		expect(health).toBeDefined();
		expect(health?.status).toBe("healthy");
	});

	test("should get all health statuses", async () => {
		const allHealth = await service.getHealthStatus();
		expect(allHealth.email).toBeDefined();
		expect(allHealth.sms).toBeDefined();
	});

	test("should unregister channel", () => {
		expect(service.hasChannel("email")).toBe(true);
		service.unregisterChannel("email");
		expect(service.hasChannel("email")).toBe(false);
	});

	test("should throw when registering duplicate channel", () => {
		const emailChannel = new EmailChannelService({
			driver: "smtp",
			from: "noreply@example.com",
			dryRun: true,
		});

		expect(() => {
			service.registerChannel(emailChannel);
		}).toThrow("Channel already registered");
	});
});

// ============= Notifiable Interface Tests =============

describe("Notifiable Interface", () => {
	test("should build single notification", async () => {
		const notifiable = {
			build: async () => testEmailMessage,
		};

		const service = new NotificationService();
		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const messageId = await service.sendNotifiable(notifiable);
		expect(messageId).toBeDefined();
	});

	test("should build multiple notifications", async () => {
		const notifiable = {
			buildAll: async () => ({
				email: testEmailMessage,
				sms: testSMSMessage,
			}),
		};

		const service = new NotificationService();
		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);
		service.registerChannel(
			new SMSChannelService({ driver: "twilio", dryRun: true }),
		);

		const messageId = await service.sendNotifiable(notifiable);
		expect(messageId).toBeDefined();
	});

	test("should send to specific channel", async () => {
		const notifiable = {
			build: async (channel?: string) => {
				if (channel === "sms") return testSMSMessage;
				return testEmailMessage;
			},
		};

		const service = new NotificationService();
		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);
		service.registerChannel(
			new SMSChannelService({ driver: "twilio", dryRun: true }),
		);

		const messageId = await service.sendNotifiable(notifiable, "sms");
		expect(messageId).toBeDefined();
	});
});

// ============= Multi-Channel Tests =============

describe("Multi-Channel Notifications", () => {
	test("should support all built-in channels", () => {
		const service = new NotificationService({ enableMetrics: true });

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);
		service.registerChannel(
			new SMSChannelService({ driver: "twilio", dryRun: true }),
		);
		service.registerChannel(
			new WhatsAppChannelService({ driver: "twilio", dryRun: true }),
		);
		service.registerChannel(
			new PushNotificationChannelService({ driver: "firebase", dryRun: true }),
		);

		const channels = service.getChannels();
		expect(channels).toContain("email");
		expect(channels).toContain("sms");
		expect(channels).toContain("whatsapp");
		expect(channels).toContain("push");
	});

	test("should send to all channels", async () => {
		const service = new NotificationService({ enableMetrics: true });

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);
		service.registerChannel(
			new SMSChannelService({ driver: "twilio", dryRun: true }),
		);
		service.registerChannel(
			new WhatsAppChannelService({ driver: "twilio", dryRun: true }),
		);
		service.registerChannel(
			new PushNotificationChannelService({ driver: "firebase", dryRun: true }),
		);

		const results = await service.sendBatch([
			testEmailMessage,
			testSMSMessage,
			testWhatsAppMessage,
			testPushMessage,
		]);

		expect(results.length).toBe(4);
		expect(results.every((r) => r !== undefined)).toBe(true);
	});
});

// ============= Template Integration Tests =============

describe("Template Integration", () => {
	const TEST_DIR = resolve("./tests/.template-notif");

	beforeEach(() => {
		// Create test template directory
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		// Cleanup
		try {
			rmSync(TEST_DIR, { recursive: true, force: true });
		} catch {
			// Ignore errors
		}
	});

	const createTemplate = (
		templateId: string,
		content: string,
		metadata?: Record<string, unknown>
	) => {
		const [dir, ...nameParts] = templateId.split("/");
		const dirPath = resolve(TEST_DIR, dir);
		mkdirSync(dirPath, { recursive: true });

		let frontMatter = "";
		if (metadata) {
			const lines = Object.entries(metadata).map(([k, v]) => {
				if (Array.isArray(v)) {
					const formatted = v.map((item) => `"${item}"`).join(", ");
					return `${k}: [${formatted}]`;
				} else if (typeof v === "string") {
					return `${k}: ${v}`;
				} else {
					return `${k}: ${JSON.stringify(v)}`;
				}
			});
			frontMatter = `---\n${lines.join("\n")}\n---\n`;
		}

		const filePath = resolve(TEST_DIR, templateId + ".md");
		writeFileSync(filePath, frontMatter + content);
	};

	test("should resolve email html TemplateRef to HTML", async () => {
		createTemplate("emails/welcome", "## Email\nWelcome {{ name }}!");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const emailRef: TemplateRef = {
			templateId: "emails/welcome",
			data: { name: "Alice" },
		};

		const message: EmailMessage = {
			channel: "email",
			recipient: "alice@example.com",
			subject: "Welcome",
			html: emailRef,
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();

		const metrics = service.getChannelMetrics("email");
		expect(metrics?.sent).toBe(1);
	});

	test("should resolve email text TemplateRef to plain text", async () => {
		createTemplate("emails/reset", "## Email\nReset link: {{ link }}");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const textRef: TemplateRef = {
			templateId: "emails/reset",
			data: { link: "https://example.com/reset?token=xyz" },
		};

		const message: EmailMessage = {
			channel: "email",
			recipient: "user@example.com",
			subject: "Reset Password",
			text: textRef,
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should resolve SMS message TemplateRef to text", async () => {
		createTemplate("sms/verify", "## SMS\nCode: {{ code }}");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new SMSChannelService({ driver: "twilio", dryRun: true }),
		);

		const smsRef: TemplateRef = {
			templateId: "sms/verify",
			data: { code: "123456" },
		};

		const message: SMSMessage = {
			channel: "sms",
			recipient: "+1234567890",
			message: smsRef,
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should resolve push title TemplateRef to text", async () => {
		createTemplate("push/order", "## Push\nOrder {{ orderId }} confirmed");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new PushNotificationChannelService({
				driver: "firebase",
				dryRun: true,
			}),
		);

		const titleRef: TemplateRef = {
			templateId: "push/order",
			data: { orderId: "ORD123" },
		};

		const message: PushNotificationMessage = {
			channel: "push",
			recipient: "device_token_123",
			title: titleRef,
			body: "Your order has been confirmed",
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should resolve push body TemplateRef to text", async () => {
		createTemplate("push/delivery", "## Push\nEst. delivery: {{ date }}");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new PushNotificationChannelService({
				driver: "firebase",
				dryRun: true,
			}),
		);

		const bodyRef: TemplateRef = {
			templateId: "push/delivery",
			data: { date: "Feb 28, 2026" },
		};

		const message: PushNotificationMessage = {
			channel: "push",
			recipient: "device_token_456",
			title: "Delivery Update",
			body: bodyRef,
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should use variant override when provided", async () => {
		createTemplate("emails/notify", "## SMS\nSMS variant: {{ msg }}\n\n---\n\n## Email\nEmail variant: {{ msg }}");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		// Force SMS variant even though channel is email
		const htmlRef: TemplateRef = {
			templateId: "emails/notify",
			data: { msg: "Hello" },
			variant: "sms", // Override!
		};

		const message: EmailMessage = {
			channel: "email",
			recipient: "test@example.com",
			subject: "Test",
			html: htmlRef,
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should auto-detect variant from channel", async () => {
		createTemplate("shared/notify", "## SMS\nSMS: {{ msg }}\n\n---\n\n## Email\nEmail: {{ msg }}");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new SMSChannelService({ driver: "twilio", dryRun: true }),
		);

		const smsRef: TemplateRef = {
			templateId: "shared/notify",
			data: { msg: "Test message" },
			// No variant specified - should auto-detect "sms"
		};

		const message: SMSMessage = {
			channel: "sms",
			recipient: "+1234567890",
			message: smsRef,
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should throw when template not found", async () => {
		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const missingRef: TemplateRef = {
			templateId: "emails/nonexistent",
			data: { name: "Alice" },
		};

		const message: EmailMessage = {
			channel: "email",
			recipient: "test@example.com",
			subject: "Test",
			html: missingRef,
		};

		await expect(service.send(message)).rejects.toThrow(
			"Template not found"
		);
	});

	test("should throw when TemplateRef used without engine", async () => {
		const service = new NotificationService({
			enableMetrics: true,
			// No templateEngine configured!
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const htmlRef: TemplateRef = {
			templateId: "emails/welcome",
			data: { name: "Alice" },
		};

		const message: EmailMessage = {
			channel: "email",
			recipient: "test@example.com",
			subject: "Welcome",
			html: htmlRef,
		};

		await expect(service.send(message)).rejects.toThrow(
			"TemplateRef found in field"
		);
	});

	test("should pass through plain string fields unchanged", async () => {
		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const message: EmailMessage = {
			channel: "email",
			recipient: "test@example.com",
			subject: "Hello World",
			html: "<p>Plain HTML string</p>",
			text: "Plain text string",
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should support mixed TemplateRef and plain string fields", async () => {
		createTemplate("emails/mixed", "## Email\nBody from template: {{ content }}");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const htmlRef: TemplateRef = {
			templateId: "emails/mixed",
			data: { content: "Important update" },
		};

		const message: EmailMessage = {
			channel: "email",
			recipient: "test@example.com",
			subject: "Mixed message",
			html: htmlRef,
			text: "Plain text fallback", // Plain string, not TemplateRef
		};

		const messageId = await service.send(message);
		expect(messageId).toBeDefined();
	});

	test("should update metrics after template resolution", async () => {
		createTemplate("emails/stats", "## Email\nMetrics test: {{ test }}");

		const engine = new TemplateEngine({
			basePath: TEST_DIR,
			cache: { enabled: true, ttl: 3600, maxSize: 100 },
		});

		const service = new NotificationService({
			enableMetrics: true,
			templateEngine: engine,
		});

		service.registerChannel(
			new EmailChannelService({
				driver: "smtp",
				from: "noreply@example.com",
				dryRun: true,
			}),
		);

		const ref: TemplateRef = {
			templateId: "emails/stats",
			data: { test: "value" },
		};

		const message: EmailMessage = {
			channel: "email",
			recipient: "test@example.com",
			subject: "Metrics test",
			html: ref,
		};

		await service.send(message);

		const metrics = service.getChannelMetrics("email");
		expect(metrics).toBeDefined();
		expect(metrics?.sent).toBe(1);
		expect(metrics?.successRate).toBe(1);
	});
});
