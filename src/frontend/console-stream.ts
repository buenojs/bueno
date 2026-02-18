/**
 * Browser Console Streaming Implementation
 *
 * Captures console.* calls from the browser and streams them to the terminal,
 * providing a unified debugging experience.
 *
 * @module frontend/console-stream
 */

import { createLogger, type Logger } from "../logger/index.js";
import type {
	ConsoleMessage,
	ConsoleStreamConfig,
	ConsoleStreamClient,
	ConsoleClientMessage,
	ConsoleServerMessage,
	ConsoleMessageType,
	PartialConsoleStreamConfig,
} from "./types.js";
import { CONSOLE_CLIENT_SCRIPT } from "./console-client.js";

// ============= Constants =============

const DEFAULT_PORT_OFFSET = 2; // Console stream port = dev server port + 2

// ANSI color codes for terminal output
const ANSI_COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	white: "\x1b[37m",
	gray: "\x1b[90m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	magenta: "\x1b[35m",
	blue: "\x1b[34m",
};

// Console type colors
const CONSOLE_TYPE_COLORS: Record<ConsoleMessageType, string> = {
	log: ANSI_COLORS.white,
	info: ANSI_COLORS.cyan,
	warn: ANSI_COLORS.yellow,
	error: ANSI_COLORS.red,
	debug: ANSI_COLORS.gray,
	trace: ANSI_COLORS.magenta,
	table: ANSI_COLORS.blue,
};

// ============= ConsoleStreamManager Class =============

/**
 * Manages browser console streaming to the terminal.
 *
 * Features:
 * - WebSocket server for receiving console messages from browser
 * - Color-coded terminal output
 * - File:line clickable links for VSCode
 * - Object/array pretty printing
 * - Stack traces for errors
 * - Source map support for original file references
 */
export class ConsoleStreamManager {
	private config: ConsoleStreamConfig;
	private logger: Logger;
	private clients: Map<string, ConsoleStreamClient> = new Map();
	private devServerPort: number;
	private port: number;
	private server: ReturnType<typeof Bun.serve> | null = null;

	constructor(devServerPort: number, config?: PartialConsoleStreamConfig) {
		this.devServerPort = devServerPort;
		this.port = devServerPort + DEFAULT_PORT_OFFSET;
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "ConsoleStream" },
		});
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config?: PartialConsoleStreamConfig): ConsoleStreamConfig {
		return {
			enabled: config?.enabled ?? true,
			showTimestamps: config?.showTimestamps ?? true,
			showFile: config?.showFile ?? true,
			colorize: config?.colorize ?? true,
			filter: config?.filter ?? ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table'],
		};
	}

	/**
	 * Get the console client script for injection
	 */
	getClientScript(): string {
		return CONSOLE_CLIENT_SCRIPT;
	}

	/**
	 * Get the WebSocket URL for console streaming
	 */
	getWebSocketUrl(): string {
		return `ws://localhost:${this.port}/_console`;
	}

	/**
	 * Get the console stream port
	 */
	getPort(): number {
		return this.port;
	}

	/**
	 * Check if console streaming is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	/**
	 * Start the console stream WebSocket server
	 */
	start(): void {
		if (!this.config.enabled) {
			return;
		}

		if (this.server) {
			this.logger.warn("Console stream server already running");
			return;
		}

		this.server = Bun.serve({
			port: this.port,
			fetch: this.handleFetch.bind(this),
			websocket: {
				open: this.handleOpen.bind(this),
				close: this.handleClose.bind(this),
				message: this.handleMessage.bind(this),
			},
		});

		this.logger.info(`Console stream server started on port ${this.port}`);
	}

	/**
	 * Stop the console stream server
	 */
	stop(): void {
		if (this.server) {
			// Disconnect all clients
			for (const client of this.clients.values()) {
				if (client.ws.readyState === WebSocket.OPEN) {
					client.ws.close();
				}
			}
			this.clients.clear();

			this.server.stop();
			this.server = null;
			this.logger.info("Console stream server stopped");
		}
	}

	/**
	 * Handle fetch requests for WebSocket server
	 */
	private handleFetch(request: Request, server: any): Response | undefined {
		const url = new URL(request.url);

		if (url.pathname === "/_console") {
			const upgradeHeader = request.headers.get("upgrade");
			if (upgradeHeader !== "websocket") {
				return new Response("Expected WebSocket upgrade", { status: 426 });
			}

			const success = server.upgrade(request);
			if (success) {
				return undefined;
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		return new Response("Not found", { status: 404 });
	}

	/**
	 * Handle WebSocket connection open
	 */
	private handleOpen(ws: any): void {
		const clientId = this.generateClientId();
		const client: ConsoleStreamClient = {
			id: clientId,
			ws: ws,
		};

		this.clients.set(clientId, client);
		ws.data = { clientId };

		this.logger.debug(`Console client connected: ${clientId}`);

		// Send connected message
		this.sendToClient(ws, {
			type: "connected",
			clientId,
		});
	}

	/**
	 * Handle WebSocket connection close
	 */
	private handleClose(ws: any): void {
		const clientId = ws.data?.clientId;
		if (clientId) {
			this.clients.delete(clientId);
			this.logger.debug(`Console client disconnected: ${clientId}`);
		}
	}

	/**
	 * Handle WebSocket message from client
	 */
	private handleMessage(ws: any, message: string | Buffer): void {
		try {
			const data: ConsoleClientMessage = JSON.parse(message.toString());

			if (data.type === "console") {
				// Update client URL if provided
				const clientId = ws.data?.clientId;
				if (clientId && data.url) {
					const client = this.clients.get(clientId);
					if (client) {
						client.url = data.url;
					}
				}

				// Process and display the console message
				this.processConsoleMessage(data);
			}
		} catch (error) {
			this.logger.error("Failed to parse console message", error);
		}
	}

	/**
	 * Send message to a WebSocket client
	 */
	private sendToClient(ws: WebSocket, message: ConsoleServerMessage): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Process and display a console message
	 */
	private processConsoleMessage(message: ConsoleClientMessage): void {
		// Check if this message type should be filtered
		if (!this.config.filter.includes(message.consoleType)) {
			return;
		}

		// Format and output the message
		const formatted = this.formatMessage(message);
		this.output(formatted, message.consoleType);
	}

	/**
	 * Format a console message for terminal output
	 */
	private formatMessage(message: ConsoleClientMessage): string {
		const parts: string[] = [];

		// Timestamp
		if (this.config.showTimestamps) {
			const timestamp = this.formatTimestamp(message.timestamp);
			if (this.config.colorize) {
				parts.push(`${ANSI_COLORS.dim}[${timestamp}]${ANSI_COLORS.reset}`);
			} else {
				parts.push(`[${timestamp}]`);
			}
		}

		// Message type with color
		const typeColor = this.config.colorize ? CONSOLE_TYPE_COLORS[message.consoleType] : "";
		const typeReset = this.config.colorize ? ANSI_COLORS.reset : "";
		const typeLabel = message.consoleType.toUpperCase().padEnd(5);
		parts.push(`${typeColor}${typeLabel}${typeReset}`);

		// Message arguments
		const formattedArgs = this.formatArgs(message.args, message.consoleType);
		parts.push(formattedArgs);

		// File:line information
		if (this.config.showFile && message.file) {
			const fileLink = this.formatFileLink(message.file, message.line, message.column);
			parts.push(`\n  at ${fileLink}`);
		}

		// Stack trace for errors
		if (message.stack) {
			const formattedStack = this.formatStackTrace(message.stack);
			parts.push(`\n${formattedStack}`);
		}

		return parts.join(" ");
	}

	/**
	 * Format timestamp for display
	 */
	private formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		const hours = date.getHours().toString().padStart(2, "0");
		const minutes = date.getMinutes().toString().padStart(2, "0");
		const seconds = date.getSeconds().toString().padStart(2, "0");
		const ms = date.getMilliseconds().toString().padStart(3, "0");
		return `${hours}:${minutes}:${seconds}.${ms}`;
	}

	/**
	 * Format console arguments for display
	 */
	private formatArgs(args: unknown[], type: ConsoleMessageType): string {
		if (type === "table") {
			return this.formatTable(args);
		}

		if (type === "trace") {
			// Trace already includes the stack in the args
			return args.map(arg => this.formatValue(arg)).join(" ");
		}

		return args.map(arg => this.formatValue(arg)).join(" ");
	}

	/**
	 * Format a single value for display
	 */
	private formatValue(value: unknown, depth: number = 0): string {
		if (depth > 3) {
			return this.config.colorize ? `${ANSI_COLORS.dim}[...]${ANSI_COLORS.reset}` : "[...]";
		}

		if (value === null) {
			return this.config.colorize ? `${ANSI_COLORS.gray}null${ANSI_COLORS.reset}` : "null";
		}

		if (value === undefined) {
			return this.config.colorize ? `${ANSI_COLORS.gray}undefined${ANSI_COLORS.reset}` : "undefined";
		}

		if (typeof value === "string") {
			// Check if it's a long string
			if (value.length > 200) {
				const truncated = value.substring(0, 200) + "...";
				return this.config.colorize ? `${ANSI_COLORS.green}"${truncated}"${ANSI_COLORS.reset}` : `"${truncated}"`;
			}
			return this.config.colorize ? `${ANSI_COLORS.green}"${value}"${ANSI_COLORS.reset}` : `"${value}"`;
		}

		if (typeof value === "number") {
			return this.config.colorize ? `${ANSI_COLORS.yellow}${value}${ANSI_COLORS.reset}` : `${value}`;
		}

		if (typeof value === "boolean") {
			return this.config.colorize ? `${ANSI_COLORS.magenta}${value}${ANSI_COLORS.reset}` : `${value}`;
		}

		if (value instanceof Error) {
			const errorStr = `${value.name}: ${value.message}`;
			return this.config.colorize ? `${ANSI_COLORS.red}${errorStr}${ANSI_COLORS.reset}` : errorStr;
		}

		if (Array.isArray(value)) {
			if (value.length === 0) {
				return "[]";
			}
			if (value.length > 10) {
				const items = value.slice(0, 10).map(v => this.formatValue(v, depth + 1));
				return `[${items.join(", ")}, ... ${value.length - 10} more items]`;
			}
			const items = value.map(v => this.formatValue(v, depth + 1));
			return `[${items.join(", ")}]`;
		}

		if (typeof value === "object") {
			try {
				const entries = Object.entries(value as Record<string, unknown>);
				if (entries.length === 0) {
					return "{}";
				}
				if (entries.length > 5) {
					const shown = entries.slice(0, 5).map(([k, v]) => `${k}: ${this.formatValue(v, depth + 1)}`);
					return `{${shown.join(", ")}, ... ${entries.length - 5} more keys}`;
				}
				const formatted = entries.map(([k, v]) => `${k}: ${this.formatValue(v, depth + 1)}`);
				return `{${formatted.join(", ")}}`;
			} catch {
				return "[Object]";
			}
		}

		return String(value);
	}

	/**
	 * Format console.table output
	 */
	private formatTable(args: unknown[]): string {
		if (args.length === 0) return "";

		const [data, columns] = args;

		if (!Array.isArray(data) && typeof data !== "object") {
			return this.formatValue(data);
		}

		// Simple table formatting
		const entries = Array.isArray(data) ? data : Object.entries(data as object);
		
		if (entries.length === 0) {
			return this.config.colorize ? `${ANSI_COLORS.dim}(empty table)${ANSI_COLORS.reset}` : "(empty table)";
		}

		const lines: string[] = [];
		lines.push(this.config.colorize ? `${ANSI_COLORS.blue}┌─────────${ANSI_COLORS.reset}` : "┌─────────");

		const maxRows = 10;
		const shown = entries.slice(0, maxRows);
		
		for (const entry of shown) {
			const row = this.formatValue(entry, 1);
			lines.push(this.config.colorize ? `${ANSI_COLORS.blue}│${ANSI_COLORS.reset} ${row}` : `│ ${row}`);
		}

		if (entries.length > maxRows) {
			lines.push(this.config.colorize ? `${ANSI_COLORS.blue}│${ANSI_COLORS.reset} ... ${entries.length - maxRows} more rows` : `│ ... ${entries.length - maxRows} more rows`);
		}

		lines.push(this.config.colorize ? `${ANSI_COLORS.blue}└─────────${ANSI_COLORS.reset}` : "└─────────");

		return "\n" + lines.join("\n");
	}

	/**
	 * Format file link for VSCode clickable links
	 */
	private formatFileLink(file: string, line?: number, column?: number): string {
		const location = line ? `:${line}${column ? `:${column}` : ""}` : "";
		const link = `${file}${location}`;
		
		if (this.config.colorize) {
			return `${ANSI_COLORS.cyan}${link}${ANSI_COLORS.reset}`;
		}
		return link;
	}

	/**
	 * Format stack trace for display
	 */
	private formatStackTrace(stack: string): string {
		const lines = stack.split("\n");
		const formatted = lines.map((line, index) => {
			if (index === 0) {
				// First line is usually the error message
				return this.config.colorize 
					? `  ${ANSI_COLORS.red}${line}${ANSI_COLORS.reset}`
					: `  ${line}`;
			}
			
			// Try to make file paths clickable
			const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
			if (match) {
				const [, fn, file, lineNum, col] = match;
				if (this.config.colorize) {
					return `    at ${fn} (${ANSI_COLORS.cyan}${file}:${lineNum}:${col}${ANSI_COLORS.reset})`;
				}
				return `    at ${fn} (${file}:${lineNum}:${col})`;
			}

			return this.config.colorize 
				? `  ${ANSI_COLORS.gray}${line}${ANSI_COLORS.reset}`
				: `  ${line}`;
		});

		return formatted.join("\n");
	}

	/**
	 * Output formatted message to terminal
	 */
	private output(formatted: string, type: ConsoleMessageType): void {
		switch (type) {
			case "error":
				console.error(formatted);
				break;
			case "warn":
				console.warn(formatted);
				break;
			default:
				console.log(formatted);
		}
	}

	/**
	 * Generate a unique client ID
	 */
	private generateClientId(): string {
		return `console_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Get the number of connected clients
	 */
	getClientCount(): number {
		return this.clients.size;
	}

	/**
	 * Get all connected client IDs
	 */
	getClientIds(): string[] {
		return Array.from(this.clients.keys());
	}

	/**
	 * Disconnect all clients
	 */
	disconnectAll(): void {
		for (const client of this.clients.values()) {
			if (client.ws.readyState === WebSocket.OPEN) {
				client.ws.close();
			}
		}

		this.clients.clear();
		this.logger.info("All console clients disconnected");
	}
}

// ============= Factory Function =============

/**
 * Create a console stream manager
 */
export function createConsoleStreamManager(
	devServerPort: number,
	config?: PartialConsoleStreamConfig
): ConsoleStreamManager {
	return new ConsoleStreamManager(devServerPort, config);
}

// ============= Utility Functions =============

/**
 * Inject console client script into HTML
 */
export function injectConsoleScript(html: string, port: number): string {
	const script = `
<script>
(function() {
	const CONSOLE_PORT = ${port};
	${CONSOLE_CLIENT_SCRIPT}
})();
</script>
`;

	// Inject before closing </head> or <body>
	const headMatch = html.match(/<\/head>/i);
	if (headMatch) {
		return html.replace(/<\/head>/i, `${script}</head>`);
	}

	const bodyMatch = html.match(/<body/i);
	if (bodyMatch) {
		return html.replace(/<body/i, `${script}<body`);
	}

	// If no head or body, prepend
	return script + html;
}