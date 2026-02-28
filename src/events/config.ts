import {
	EventManagerConfig,
	type EventManagerOptions,
	type EventRegistryOptions,
} from "./types";

export interface EventSystemConfig {
	manager: EventManagerOptions;
	registry: EventRegistryOptions;
	defaultContext?: EventContext;
	errorHandling?: "throw" | "log" | "ignore";
	maxEventSize?: number;
	eventCategories?: EventCategory[];
}

export const defaultEventSystemConfig: EventSystemConfig = {
	manager: {
		maxListeners: 100,
		errorHandling: "log",
	},
	registry: {
		maxEvents: 1000,
		retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
		cleanupInterval: 60 * 60 * 1000, // 1 hour
	},
	defaultContext: {
		userId: undefined,
		sessionId: undefined,
		requestId: undefined,
		ipAddress: undefined,
		userAgent: undefined,
	},
	errorHandling: "log",
	maxEventSize: 1024 * 1024, // 1MB
	eventCategories: [
		{
			name: "database",
			description: "Database operations and query lifecycle",
			events: ["query", "mutation", "connection", "transaction"],
		},
		{
			name: "job-queue",
			description: "Background job processing and queue management",
			events: ["job.created", "job.started", "job.completed", "job.failed"],
		},
		{
			name: "notification",
			description: "Multi-channel notification system",
			events: [
				"notification.sent",
				"notification.delivered",
				"notification.failed",
			],
		},
		{
			name: "websocket",
			description: "Real-time WebSocket communication",
			events: ["connection", "message", "disconnection", "error"],
		},
		{
			name: "http-rpc",
			description: "HTTP and RPC request/response handling",
			events: ["request.received", "response.sent", "error"],
		},
		{
			name: "system",
			description: "System-level events and health checks",
			events: ["startup", "shutdown", "health.check"],
		},
		{
			name: "cache",
			description: "Caching operations and invalidation",
			events: ["cache.set", "cache.get", "cache.delete", "cache.miss"],
		},
		{
			name: "validation",
			description: "Data validation and sanitization",
			events: ["validation.passed", "validation.failed"],
		},
		{
			name: "security",
			description: "Security and authentication events",
			events: ["login", "logout", "permission.granted", "permission.denied"],
		},
		{
			name: "logging",
			description: "Application logging and monitoring",
			events: ["log.info", "log.warn", "log.error", "log.debug"],
		},
	],
};

export function createEventSystemConfig(
	customConfig: Partial<EventSystemConfig> = {},
): EventSystemConfig {
	return {
		...defaultEventSystemConfig,
		...customConfig,
		manager: {
			...defaultEventSystemConfig.manager,
			...customConfig.manager,
		},
		registry: {
			...defaultEventSystemConfig.registry,
			...customConfig.registry,
		},
		defaultContext: {
			...defaultEventSystemConfig.defaultContext,
			...customConfig.defaultContext,
		},
	};
}

export function validateEventSystemConfig(config: EventSystemConfig): boolean {
	if (!config || typeof config !== "object") return false;

	// Validate manager config
	if (!config.manager || typeof config.manager !== "object") return false;
	if (
		config.manager.maxListeners !== undefined &&
		(typeof config.manager.maxListeners !== "number" ||
			config.manager.maxListeners < 0)
	) {
		return false;
	}

	// Validate registry config
	if (!config.registry || typeof config.registry !== "object") return false;
	if (
		config.registry.maxEvents !== undefined &&
		(typeof config.registry.maxEvents !== "number" ||
			config.registry.maxEvents < 0)
	) {
		return false;
	}
	if (
		config.registry.retentionPeriod !== undefined &&
		(typeof config.registry.retentionPeriod !== "number" ||
			config.registry.retentionPeriod < 0)
	) {
		return false;
	}
	if (
		config.registry.cleanupInterval !== undefined &&
		(typeof config.registry.cleanupInterval !== "number" ||
			config.registry.cleanupInterval < 0)
	) {
		return false;
	}

	// Validate error handling
	if (
		config.errorHandling &&
		!["throw", "log", "ignore"].includes(config.errorHandling)
	) {
		return false;
	}

	// Validate max event size
	if (
		config.maxEventSize !== undefined &&
		(typeof config.maxEventSize !== "number" || config.maxEventSize < 0)
	) {
		return false;
	}

	// Validate event categories
	if (config.eventCategories) {
		for (const category of config.eventCategories) {
			if (!category.name || typeof category.name !== "string") return false;
			if (!category.description || typeof category.description !== "string")
				return false;
			if (category.events && !Array.isArray(category.events)) return false;
		}
	}

	return true;
}

export function loadEventSystemConfig(
	configPath = "./config/event-system.json",
): EventSystemConfig {
	try {
		const config = require(configPath);
		if (validateEventSystemConfig(config)) {
			return config;
		}
		console.warn("Invalid event system config, using defaults");
	} catch (error) {
		console.warn("Could not load event system config, using defaults");
	}

	return defaultEventSystemConfig;
}

export function saveEventSystemConfig(
	config: EventSystemConfig,
	configPath = "./config/event-system.json",
): boolean {
	try {
		const fs = require("fs");
		const path = require("path");

		const dir = path.dirname(configPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		return true;
	} catch (error) {
		console.error("Failed to save event system config:", error);
		return false;
	}
}

export function mergeEventSystemConfigs(
	...configs: Partial<EventSystemConfig>[]
): EventSystemConfig {
	return configs.reduce((merged, config) => {
		return {
			...merged,
			...config,
			manager: {
				...merged.manager,
				...config.manager,
			},
			registry: {
				...merged.registry,
				...config.registry,
			},
			defaultContext: {
				...merged.defaultContext,
				...config.defaultContext,
			},
		};
	}, defaultEventSystemConfig);
}
