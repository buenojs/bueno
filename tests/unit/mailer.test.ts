/**
 * Mailer Unit Tests
 *
 * Tests for mailer drivers and core functionality
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
	MailerService,
	MemoryMailerDriver,
	MockMailerDriver,
	SmtpMailerDriver,
	SendgridMailerDriver,
	BrevoMailerDriver,
	ResendMailerDriver,
	type MailMessage,
} from "../../src/mailer";

// ============= Test Fixtures =============

const testEmailMessage: MailMessage = {
	subject: "Test Email",
	text: "This is a test email",
	html: "<p>This is a test email</p>",
	to: "test@example.com",
	from: "noreply@example.com",
};

const testEmailWithRecipients: MailMessage = {
	subject: "Test Email with Recipients",
	text: "Test content",
	to: [
		{ name: "John Doe", email: "john@example.com" },
		"jane@example.com",
	],
	cc: "cc@example.com",
	bcc: "bcc@example.com",
	from: "noreply@example.com",
};

// ============= Mock Driver Tests =============

describe("MockMailerDriver", () => {
	let driver: MockMailerDriver;

	beforeEach(async () => {
		driver = new MockMailerDriver({
			driver: "mock",
			from: "noreply@example.com",
		});
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should connect successfully", async () => {
		expect(await driver.isConnected()).toBe(true);
	});

	test("should store sent emails in memory", async () => {
		const messageId = await driver.send(testEmailMessage);

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");

		const allEmails = driver.getAllEmails();
		expect(allEmails.length).toBe(1);
		expect(allEmails[0].subject).toBe("Test Email");
	});

	test("should retrieve emails by recipient", async () => {
		await driver.send(testEmailWithRecipients);

		const emailsToJohn = driver.getEmailsTo("john@example.com");
		expect(emailsToJohn.length).toBe(1);
		expect(emailsToJohn[0].subject).toBe("Test Email with Recipients");

		const emailsToJane = driver.getEmailsTo("jane@example.com");
		expect(emailsToJane.length).toBe(1);
	});

	test("should retrieve last sent email", async () => {
		await driver.send(testEmailMessage);
		await driver.send(testEmailWithRecipients);

		const lastEmail = driver.getLastEmail();
		expect(lastEmail?.subject).toBe("Test Email with Recipients");
	});

	test("should clear all emails", async () => {
		await driver.send(testEmailMessage);
		expect(driver.count()).toBe(1);

		driver.clear();
		expect(driver.count()).toBe(0);
	});

	test("should get email by message ID", async () => {
		const messageId = await driver.send(testEmailMessage);
		const email = driver.getById(messageId!);

		expect(email).toBeDefined();
		expect(email?.messageId).toBe(messageId);
	});

	test("should count sent emails", async () => {
		expect(driver.count()).toBe(0);

		await driver.send(testEmailMessage);
		expect(driver.count()).toBe(1);

		await driver.send(testEmailWithRecipients);
		expect(driver.count()).toBe(2);
	});

	test("should batch send emails", async () => {
		const messages = [testEmailMessage, testEmailWithRecipients];
		const messageIds = await driver.sendBatch(messages);

		expect(messageIds.length).toBe(2);
		expect(messageIds[0]).toBeDefined();
		expect(messageIds[1]).toBeDefined();
		expect(driver.count()).toBe(2);
	});
});

// ============= Memory Driver Tests =============

describe("MemoryMailerDriver", () => {
	let driver: MemoryMailerDriver;

	beforeEach(async () => {
		driver = new MemoryMailerDriver({
			driver: "mock",
			from: "noreply@example.com",
		});
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should connect successfully", async () => {
		expect(await driver.isConnected()).toBe(true);
	});

	test("should send and store emails", async () => {
		const messageId = await driver.send(testEmailMessage);

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");

		const allEmails = driver.getAllEmails();
		expect(allEmails.length).toBe(1);
	});

	test("should clear all emails", async () => {
		await driver.send(testEmailMessage);
		await driver.send(testEmailWithRecipients);

		expect(driver.getAllEmails().length).toBe(2);

		driver.clear();
		expect(driver.getAllEmails().length).toBe(0);
	});
});

// ============= SMTP Driver Tests =============

describe("SmtpMailerDriver", () => {
	let driver: SmtpMailerDriver;

	beforeEach(async () => {
		driver = new SmtpMailerDriver({
			driver: "smtp",
			from: "noreply@example.com",
			host: "localhost",
			port: 587,
			secure: false,
			dryRun: true,
		});
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should connect in dry-run mode", async () => {
		expect(await driver.isConnected()).toBe(true);
	});

	test("should send email in dry-run mode", async () => {
		const messageId = await driver.send(testEmailMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});

	test("should get connection info", () => {
		const info = driver.getConnectionInfo();
		expect(info.host).toBe("localhost");
		expect(info.port).toBe(587);
		expect(info.secure).toBe(false);
		expect(info.authenticated).toBe(false);
	});
});

// ============= Sendgrid Driver Tests =============

describe("SendgridMailerDriver", () => {
	let driver: SendgridMailerDriver;

	beforeEach(async () => {
		driver = new SendgridMailerDriver({
			driver: "sendgrid",
			from: "noreply@example.com",
			apiKey: "test-api-key",
			sandbox: true,
			dryRun: true,
		});
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should connect in dry-run mode", async () => {
		expect(await driver.isConnected()).toBe(true);
	});

	test("should send email in dry-run mode", async () => {
		const messageId = await driver.send(testEmailMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});

	test("should require API key on connect", async () => {
		const invalidDriver = new SendgridMailerDriver({
			driver: "sendgrid",
			from: "noreply@example.com",
			apiKey: "",
			dryRun: false,
		});

		await expect(invalidDriver.connect()).rejects.toThrow("API key is required");
	});
});

// ============= Brevo Driver Tests =============

describe("BrevoMailerDriver", () => {
	let driver: BrevoMailerDriver;

	beforeEach(async () => {
		driver = new BrevoMailerDriver({
			driver: "brevo",
			from: "noreply@example.com",
			apiKey: "test-api-key",
			dryRun: true,
		});
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should connect in dry-run mode", async () => {
		expect(await driver.isConnected()).toBe(true);
	});

	test("should send email in dry-run mode", async () => {
		const messageId = await driver.send(testEmailMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});

	test("should require API key on connect", async () => {
		const invalidDriver = new BrevoMailerDriver({
			driver: "brevo",
			from: "noreply@example.com",
			apiKey: "",
			dryRun: false,
		});

		await expect(invalidDriver.connect()).rejects.toThrow("API key is required");
	});
});

// ============= Resend Driver Tests =============

describe("ResendMailerDriver", () => {
	let driver: ResendMailerDriver;

	beforeEach(async () => {
		driver = new ResendMailerDriver({
			driver: "resend",
			from: "noreply@example.com",
			apiKey: "test-api-key",
			dryRun: true,
		});
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should connect in dry-run mode", async () => {
		expect(await driver.isConnected()).toBe(true);
	});

	test("should send email in dry-run mode", async () => {
		const messageId = await driver.send(testEmailMessage);
		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});

	test("should require API key on connect", async () => {
		const invalidDriver = new ResendMailerDriver({
			driver: "resend",
			from: "noreply@example.com",
			apiKey: "",
			dryRun: false,
		});

		await expect(invalidDriver.connect()).rejects.toThrow("API key is required");
	});
});

// ============= Mailer Service Tests =============

describe("MailerService", () => {
	let mailer: MailerService;

	beforeEach(async () => {
		mailer = new MailerService({
			driver: "mock",
			from: "noreply@example.com",
		});
		await mailer.init();
	});

	afterEach(async () => {
		await mailer.shutdown();
	});

	test("should create mailer instance", () => {
		expect(mailer).toBeDefined();
	});

	test("should initialize connection", async () => {
		const isConnected = await mailer.isConnected();
		expect(isConnected).toBe(true);
	});

	test("should send a single email", async () => {
		const messageId = await mailer.send(testEmailMessage);

		expect(messageId).toBeDefined();
		expect(typeof messageId).toBe("string");
	});

	test("should send multiple emails in batch", async () => {
		const messages = [testEmailMessage, testEmailWithRecipients];
		const messageIds = await mailer.sendBatch(messages);

		expect(messageIds.length).toBe(2);
		expect(messageIds[0]).toBeDefined();
		expect(messageIds[1]).toBeDefined();
	});

	test("should get mailer health status", async () => {
		const health = await mailer.getHealth();

		expect(health).toBeDefined();
		expect(health.status).toBe("healthy");
		expect(health.checkedAt).toBeInstanceOf(Date);
	});

	test("should track metrics", async () => {
		await mailer.send(testEmailMessage);
		await mailer.send(testEmailWithRecipients);

		const metrics = mailer.getMetrics();

		expect(metrics.sent).toBe(2);
		expect(metrics.failed).toBe(0);
		expect(metrics.successRate).toBe(1);
	});

	test("should handle Mailable interface", async () => {
		const mailable = {
			build: async () => testEmailMessage,
		};

		const messageId = await mailer.send(mailable);
		expect(messageId).toBeDefined();
	});

	test("should queue email (placeholder)", async () => {
		const messageId = await mailer.queue(testEmailMessage);

		// Currently returns undefined as job queue integration is not yet implemented
		expect(messageId).toBeUndefined();
	});
});

// ============= Email Message Handling Tests =============

describe("Email Message Handling", () => {
	let driver: MockMailerDriver;

	beforeEach(async () => {
		driver = new MockMailerDriver({
			driver: "mock",
			from: "noreply@example.com",
			fromName: "Bueno App",
		});
		await driver.connect();
	});

	afterEach(async () => {
		await driver.disconnect();
	});

	test("should handle string recipients", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			to: "single@example.com",
		};

		await driver.send(msg);
		const emails = driver.getEmailsTo("single@example.com");
		expect(emails.length).toBe(1);
	});

	test("should handle object recipients with name", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			to: { name: "Test User", email: "test@example.com" },
		};

		const messageId = await driver.send(msg);
		expect(messageId).toBeDefined();
	});

	test("should handle multiple recipients", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			to: [
				"user1@example.com",
				{ name: "User Two", email: "user2@example.com" },
			],
		};

		await driver.send(msg);

		const emails1 = driver.getEmailsTo("user1@example.com");
		const emails2 = driver.getEmailsTo("user2@example.com");

		expect(emails1.length).toBe(1);
		expect(emails2.length).toBe(1);
	});

	test("should include CC and BCC", async () => {
		const msg: MailMessage = {
			subject: "Test with CC/BCC",
			text: "Test",
			to: "primary@example.com",
			cc: "cc@example.com",
			bcc: "bcc@example.com",
			from: "noreply@example.com",
		};

		const email = driver.getAllEmails()[0];
		await driver.send(msg);

		const stored = driver.getLastEmail();
		expect(stored?.cc).toBeDefined();
		expect(stored?.bcc).toBeDefined();
	});

	test("should include attachments", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			attachments: [
				{
					filename: "test.txt",
					content: "File content",
					contentType: "text/plain",
				},
			],
		};

		await driver.send(msg);
		const stored = driver.getLastEmail();

		expect(stored?.attachments).toBeDefined();
		expect(stored?.attachments?.length).toBe(1);
		expect(stored?.attachments?.[0].filename).toBe("test.txt");
	});

	test("should preserve custom headers", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			headers: {
				"X-Custom-Header": "custom-value",
				"X-Tracking-ID": "12345",
			},
		};

		await driver.send(msg);
		const stored = driver.getLastEmail();

		expect(stored?.headers?.["X-Custom-Header"]).toBe("custom-value");
		expect(stored?.headers?.["X-Tracking-ID"]).toBe("12345");
	});

	test("should handle priority levels", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			priority: "high",
		};

		await driver.send(msg);
		const stored = driver.getLastEmail();

		expect(stored?.priority).toBe("high");
	});

	test("should handle metadata", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			metadata: {
				userId: 123,
				campaignId: "abc123",
			},
		};

		await driver.send(msg);
		const stored = driver.getLastEmail();

		expect(stored?.metadata?.userId).toBe(123);
		expect(stored?.metadata?.campaignId).toBe("abc123");
	});

	test("should generate message ID if not provided", async () => {
		const msg: MailMessage = { ...testEmailMessage };
		delete msg.messageId;

		await driver.send(msg);
		const stored = driver.getLastEmail();

		expect(stored?.messageId).toBeDefined();
		expect(typeof stored?.messageId).toBe("string");
	});

	test("should use provided message ID", async () => {
		const msg: MailMessage = {
			...testEmailMessage,
			messageId: "custom-id-123",
		};

		await driver.send(msg);
		const stored = driver.getLastEmail();

		expect(stored?.messageId).toBe("custom-id-123");
	});
});

// ============= Driver Instantiation Tests =============

describe("Driver Instantiation", () => {
	test("should instantiate mock driver", async () => {
		const service = new MailerService({
			driver: "mock",
			from: "test@example.com",
		});

		const driver = service.getDriver();
		expect(driver).toBeInstanceOf(MockMailerDriver);

		await service.init();
		await service.shutdown();
	});

	test("should instantiate memory driver", async () => {
		const service = new MailerService({
			driver: "mock",
			from: "test@example.com",
		});

		const driver = service.getDriver();
		// Memory driver is the fallback
		expect(driver).toBeDefined();

		await service.init();
		await service.shutdown();
	});

	test("should instantiate SMTP driver", async () => {
		const service = new MailerService({
			driver: "smtp",
			from: "test@example.com",
			host: "localhost",
			port: 587,
			dryRun: true,
		} as any);

		const driver = service.getDriver();
		expect(driver).toBeInstanceOf(SmtpMailerDriver);

		await service.init();
		await service.shutdown();
	});

	test("should instantiate Sendgrid driver", async () => {
		const service = new MailerService({
			driver: "sendgrid",
			from: "test@example.com",
			apiKey: "test-key",
			dryRun: true,
		} as any);

		const driver = service.getDriver();
		expect(driver).toBeInstanceOf(SendgridMailerDriver);

		await service.init();
		await service.shutdown();
	});

	test("should instantiate Brevo driver", async () => {
		const service = new MailerService({
			driver: "brevo",
			from: "test@example.com",
			apiKey: "test-key",
			dryRun: true,
		} as any);

		const driver = service.getDriver();
		expect(driver).toBeInstanceOf(BrevoMailerDriver);

		await service.init();
		await service.shutdown();
	});

	test("should instantiate Resend driver", async () => {
		const service = new MailerService({
			driver: "resend",
			from: "test@example.com",
			apiKey: "test-key",
			dryRun: true,
		} as any);

		const driver = service.getDriver();
		expect(driver).toBeInstanceOf(ResendMailerDriver);

		await service.init();
		await service.shutdown();
	});
});
