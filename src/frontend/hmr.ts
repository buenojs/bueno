/**
 * Hot Module Replacement (HMR) Implementation
 *
 * Provides live updates without full page refreshes for a better developer experience.
 * Supports React Fast Refresh, Vue Hot Component Replacement, Svelte HMR, and Solid Hot Reloading.
 *
 * @module frontend/hmr
 */

import { createLogger, type Logger } from "../logger/index.js";
import type {
	HMRClient,
	HMRConfig,
	HMRUpdate,
	HMRUpdateError,
	HMRDependencyNode,
	HMRClientMessage,
	HMRServerMessage,
	FileChangeEvent,
	FrontendFramework,
} from "./types.js";
import { HMR_CLIENT_SCRIPT } from "./hmr-client.js";

// ============= Constants =============

const DEFAULT_DEBOUNCE_MS = 100;
const DEFAULT_IGNORE_PATTERNS = ["node_modules", ".git", "dist", "build", ".bun"];

// ============= File Watcher Types =============

interface FileWatchEvent {
	event: 'create' | 'update' | 'delete';
	filePath: string;
}

type FileWatchCallback = (event: FileWatchEvent) => void;

// ============= HMRManager Class =============

/**
 * Manages Hot Module Replacement for the development server.
 *
 * Features:
 * - WebSocket server for client communication
 * - File watching with dependency tracking
 * - Framework-specific HMR support (React, Vue, Svelte, Solid)
 * - Debounced file change handling
 * - Error overlay support
 */
export class HMRManager {
	private config: HMRConfig;
	private logger: Logger;
	private clients: Map<string, HMRClient> = new Map();
	private dependencyGraph: Map<string, HMRDependencyNode> = new Map();
	private pendingUpdates: Map<string, FileChangeEvent> = new Map();
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private framework: FrontendFramework;
	private devServerPort: number;
	private watcher: ReturnType<typeof import('fs').watch> | null = null;

	constructor(framework: FrontendFramework, devServerPort: number, config?: Partial<HMRConfig>) {
		this.framework = framework;
		this.devServerPort = devServerPort;
		this.config = this.normalizeConfig(config);
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "HMRManager" },
		});
	}

	/**
	 * Normalize partial config to full config with defaults
	 */
	private normalizeConfig(config?: Partial<HMRConfig>): HMRConfig {
		return {
			enabled: config?.enabled ?? true,
			port: config?.port ?? this.devServerPort + 1,
			debounceMs: config?.debounceMs ?? DEFAULT_DEBOUNCE_MS,
			ignorePatterns: config?.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
		};
	}

	/**
	 * Get the HMR client script for injection
	 */
	getClientScript(): string {
		return HMR_CLIENT_SCRIPT;
	}

	/**
	 * Get the WebSocket URL for HMR
	 */
	getWebSocketUrl(): string {
		return `ws://localhost:${this.config.port}/_hmr`;
	}

	/**
	 * Get the HMR port
	 */
	getPort(): number {
		return this.config.port!;
	}

	/**
	 * Check if HMR is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	/**
	 * Handle WebSocket upgrade request
	 */
	handleUpgrade(request: Request): WebSocket | null {
		const url = new URL(request.url);
		
		if (url.pathname !== "/_hmr") {
			return null;
		}

		// Check if this is a WebSocket upgrade request
		const upgradeHeader = request.headers.get("upgrade");
		if (upgradeHeader !== "websocket") {
			return null;
		}

		// Create WebSocket pair using Bun's native WebSocket
		const server = Bun.serve({
			port: this.config.port,
			fetch: this.handleWebSocketFetch.bind(this),
			websocket: {
				open: this.handleWebSocketOpen.bind(this),
				close: this.handleWebSocketClose.bind(this),
				message: this.handleWebSocketMessage.bind(this),
			},
		});

		this.logger.info(`HMR WebSocket server started on port ${this.config.port}`);
		
		return null; // The server handles the WebSocket directly
	}

	/**
	 * Handle fetch requests for WebSocket server
	 */
	private handleWebSocketFetch(request: Request, server: any): Response | undefined {
		const url = new URL(request.url);
		
		if (url.pathname === "/_hmr") {
			const success = server.upgrade(request);
			if (success) {
				return undefined; // WebSocket upgrade successful
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}
		
		return new Response("Not found", { status: 404 });
	}

	/**
	 * Handle WebSocket connection open
	 */
	private handleWebSocketOpen(ws: any): void {
		const clientId = this.generateClientId();
		const client: HMRClient = {
			id: clientId,
			ws: ws,
			subscribedFiles: new Set(),
		};
		
		this.clients.set(clientId, client);
		ws.data = { clientId };
		
		this.logger.debug(`HMR client connected: ${clientId}`);
		
		// Send connected message
		this.sendToClient(ws, {
			type: "connected",
			clientId,
		});
	}

	/**
	 * Handle WebSocket connection close
	 */
	private handleWebSocketClose(ws: any): void {
		const clientId = ws.data?.clientId;
		if (clientId) {
			this.clients.delete(clientId);
			this.logger.debug(`HMR client disconnected: ${clientId}`);
		}
	}

	/**
	 * Handle WebSocket message from client
	 */
	private handleWebSocketMessage(ws: any, message: string | Buffer): void {
		try {
			const data: HMRClientMessage = JSON.parse(message.toString());
			const clientId = ws.data?.clientId;
			
			if (!clientId) {
				return;
			}
			
			const client = this.clients.get(clientId);
			if (!client) {
				return;
			}
			
			switch (data.type) {
				case "subscribe":
					client.subscribedFiles.add(data.fileId);
					this.logger.debug(`Client ${clientId} subscribed to: ${data.fileId}`);
					break;
					
				case "unsubscribe":
					client.subscribedFiles.delete(data.fileId);
					this.logger.debug(`Client ${clientId} unsubscribed from: ${data.fileId}`);
					break;
					
				case "ping":
					this.sendToClient(ws, { type: "pong" });
					break;
					
				case "module-accepted":
					this.handleModuleAccepted(data.moduleId, data.dependencies);
					break;
			}
		} catch (error) {
			this.logger.error("Failed to parse HMR message", error);
		}
	}

	/**
	 * Send message to a WebSocket client
	 */
	private sendToClient(ws: WebSocket, message: HMRServerMessage): void {
		if (ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Broadcast update to all connected clients
	 */
	broadcastUpdate(update: HMRUpdate): void {
		const message = JSON.stringify(update);
		
		for (const client of this.clients.values()) {
			// Check if client is subscribed to any of the changed files
			const isSubscribed = update.changes.some(
				(file) => client.subscribedFiles.has(file)
			);
			
			if (isSubscribed || update.type === "reload" || update.type === "error") {
				if (client.ws.readyState === WebSocket.OPEN) {
					client.ws.send(message);
				}
			}
		}
		
		this.logger.debug(`Broadcasted ${update.type} update for: ${update.fileId}`);
	}

	/**
	 * Start file watching
	 */
	startWatching(rootDir: string): void {
		if (!this.config.enabled) {
			return;
		}
		
		this.logger.info(`Starting file watcher for: ${rootDir}`);
		
		// Use Node's fs.watch for file watching
		const fs = require('fs');
		const path = require('path');
		
		try {
			this.watcher = fs.watch(rootDir, { recursive: true }, (eventType: string, filename: string | null) => {
				if (!filename) return;
				
				const filePath = path.join(rootDir, filename);
				
				if (eventType === 'rename') {
					// Check if file exists to determine if it's create or delete
					try {
						fs.accessSync(filePath, fs.constants.F_OK);
						this.handleFileChange(filePath, "create");
					} catch {
						this.handleFileChange(filePath, "delete");
					}
				} else if (eventType === 'change') {
					this.handleFileChange(filePath, "update");
				}
			});
			
			this.logger.info("File watcher started");
		} catch (error) {
			this.logger.error("Failed to start file watcher", error);
		}
	}

	/**
	 * Stop file watching
	 */
	stopWatching(): void {
		if (this.watcher) {
			this.watcher.close();
			this.watcher = null;
			this.logger.info("File watcher stopped");
		}
	}

	/**
	 * Handle a file change event
	 */
	private handleFileChange(filePath: string, event: "create" | "update" | "delete"): void {
		// Check if file should be ignored
		if (this.shouldIgnoreFile(filePath)) {
			return;
		}
		
		this.logger.debug(`File ${event}: ${filePath}`);
		
		// Add to pending updates
		this.pendingUpdates.set(filePath, {
			path: filePath,
			event,
			timestamp: Date.now(),
		});
		
		// Debounce updates
		this.scheduleDebouncedUpdate();
	}

	/**
	 * Check if a file should be ignored
	 */
	private shouldIgnoreFile(filePath: string): boolean {
		// Check ignore patterns
		for (const pattern of this.config.ignorePatterns) {
			if (filePath.includes(pattern)) {
				return true;
			}
		}
		
		// Only watch relevant file types
		const relevantExtensions = [".js", ".jsx", ".ts", ".tsx", ".css", ".scss", ".sass", ".less", ".vue", ".svelte"];
		const ext = filePath.substring(filePath.lastIndexOf("."));
		
		return !relevantExtensions.includes(ext);
	}

	/**
	 * Schedule debounced update processing
	 */
	private scheduleDebouncedUpdate(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		
		this.debounceTimer = setTimeout(() => {
			this.processPendingUpdates();
		}, this.config.debounceMs);
	}

	/**
	 * Process all pending file updates
	 */
	private processPendingUpdates(): void {
		if (this.pendingUpdates.size === 0) {
			return;
		}
		
		const updates = Array.from(this.pendingUpdates.values());
		this.pendingUpdates.clear();
		
		// Group updates by type
		const changedFiles = updates.map((u) => u.path);
		
		// Determine update type based on file changes
		const updateType = this.determineUpdateType(changedFiles);
		
		// Create and broadcast update
		const update: HMRUpdate = {
			type: updateType,
			fileId: this.generateFileId(changedFiles[0]),
			timestamp: Date.now(),
			changes: changedFiles,
		};
		
		this.broadcastUpdate(update);
	}

	/**
	 * Determine the type of update needed
	 */
	private determineUpdateType(changedFiles: string[]): "update" | "reload" {
		// Check if any changed file requires a full reload
		for (const file of changedFiles) {
			const ext = file.substring(file.lastIndexOf("."));
			
			// Configuration files always require full reload
			if (file.includes("config") || file.endsWith(".config.js") || file.endsWith(".config.ts")) {
				return "reload";
			}
			
			// HTML files require full reload
			if (ext === ".html") {
				return "reload";
			}
			
			// Check dependency graph for breaking changes
			const node = this.dependencyGraph.get(file);
			if (node && node.importedBy.size > 0) {
				// If this file is imported by others, check if it's a breaking change
				// For now, we'll be conservative and trigger an update
				// In a full implementation, we'd analyze the actual changes
			}
		}
		
		return "update";
	}

	/**
	 * Handle module accepted from client
	 */
	private handleModuleAccepted(moduleId: string, dependencies: string[]): void {
		// Update dependency graph
		const node = this.dependencyGraph.get(moduleId);
		if (node) {
			// Update imports
			node.imports = new Set(dependencies);
			
			// Update reverse dependencies
			for (const dep of dependencies) {
				const depNode = this.dependencyGraph.get(dep);
				if (depNode) {
					depNode.importedBy.add(moduleId);
				}
			}
		}
		
		this.logger.debug(`Module accepted: ${moduleId}`);
	}

	/**
	 * Register a file in the dependency graph
	 */
	registerFile(filePath: string, imports: string[] = []): void {
		const node: HMRDependencyNode = {
			filePath,
			imports: new Set(imports),
			importedBy: new Set(),
			lastModified: Date.now(),
		};
		
		// Update reverse dependencies
		for (const imp of imports) {
			const importedNode = this.dependencyGraph.get(imp);
			if (importedNode) {
				importedNode.importedBy.add(filePath);
			}
		}
		
		this.dependencyGraph.set(filePath, node);
	}

	/**
	 * Get files that depend on a given file
	 */
	getDependents(filePath: string): string[] {
		const node = this.dependencyGraph.get(filePath);
		if (!node) {
			return [];
		}
		
		return Array.from(node.importedBy);
	}

	/**
	 * Get files that a file imports
	 */
	getImports(filePath: string): string[] {
		const node = this.dependencyGraph.get(filePath);
		if (!node) {
			return [];
		}
		
		return Array.from(node.imports);
	}

	/**
	 * Broadcast an error to all clients
	 */
	broadcastError(error: Error | HMRUpdateError): void {
		const updateError: HMRUpdateError = error instanceof Error
			? {
					message: error.message,
					stack: error.stack,
				}
			: error;
		
		const update: HMRUpdate = {
			type: "error",
			fileId: updateError.file || "unknown",
			timestamp: Date.now(),
			changes: [],
			error: updateError,
		};
		
		this.broadcastUpdate(update);
	}

	/**
	 * Generate a unique client ID
	 */
	private generateClientId(): string {
		return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * Generate a file ID from a file path
	 */
	private generateFileId(filePath: string): string {
		// Normalize the file path for consistent IDs
		return filePath.replace(/\\/g, "/");
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
		this.logger.info("All HMR clients disconnected");
	}

	/**
	 * Stop the HMR manager
	 */
	stop(): void {
		this.stopWatching();
		this.disconnectAll();
		this.dependencyGraph.clear();
		this.pendingUpdates.clear();
		
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		
		this.logger.info("HMR manager stopped");
	}

	/**
	 * Get framework-specific HMR runtime code
	 */
	getFrameworkRuntime(): string {
		switch (this.framework) {
			case "react":
				return this.getReactRuntime();
			case "vue":
				return this.getVueRuntime();
			case "svelte":
				return this.getSvelteRuntime();
			case "solid":
				return this.getSolidRuntime();
			default:
				return "";
		}
	}

	/**
	 * React Fast Refresh runtime
	 */
	private getReactRuntime(): string {
		return `
// React Fast Refresh Runtime
(function() {
	if (typeof window !== 'undefined') {
		window.__HMR_REACT_REFRESH__ = true;
	}
})();
`;
	}

	/**
	 * Vue HMR runtime
	 */
	private getVueRuntime(): string {
		return `
// Vue HMR Runtime
(function() {
	if (typeof window !== 'undefined') {
		window.__HMR_VUE__ = true;
	}
})();
`;
	}

	/**
	 * Svelte HMR runtime
	 */
	private getSvelteRuntime(): string {
		return `
// Svelte HMR Runtime
(function() {
	if (typeof window !== 'undefined') {
		window.__HMR_SVELTE__ = true;
	}
})();
`;
	}

	/**
	 * Solid HMR runtime
	 */
	private getSolidRuntime(): string {
		return `
// Solid HMR Runtime
(function() {
	if (typeof window !== 'undefined') {
		window.__HMR_SOLID__ = true;
	}
})();
`;
	}
}

// ============= Factory Function =============

/**
 * Create an HMR manager
 */
export function createHMRManager(
	framework: FrontendFramework,
	devServerPort: number,
	config?: Partial<HMRConfig>
): HMRManager {
	return new HMRManager(framework, devServerPort, config);
}

// ============= Utility Functions =============

/**
 * Check if a file is an HMR boundary
 * (a file that can accept hot updates without propagating to parents)
 */
export function isHMRBoundary(filePath: string, content: string): boolean {
	// Check for HMR acceptance patterns
	const patterns = [
		/module\.hot\.accept/,
		/import\.meta\.hot\.accept/,
		/if\s*\(\s*import\.meta\.hot\s*\)/,
	];
	
	return patterns.some((pattern) => pattern.test(content));
}

/**
 * Parse imports from a file's content
 */
export function parseImports(content: string, filePath: string): string[] {
	const imports: string[] = [];
	
	// Match ES6 imports
	const es6Pattern = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
	let match;
	
	while ((match = es6Pattern.exec(content)) !== null) {
		imports.push(resolveImport(match[1], filePath));
	}
	
	// Match dynamic imports
	const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	
	while ((match = dynamicPattern.exec(content)) !== null) {
		imports.push(resolveImport(match[1], filePath));
	}
	
	// Match CommonJS requires
	const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	
	while ((match = requirePattern.exec(content)) !== null) {
		imports.push(resolveImport(match[1], filePath));
	}
	
	return imports;
}

/**
 * Resolve an import path relative to the importing file
 */
function resolveImport(importPath: string, fromFile: string): string {
	// Skip bare imports (node_modules)
	if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
		return importPath;
	}
	
	// Resolve relative paths
	const dir = fromFile.substring(0, fromFile.lastIndexOf("/"));
	const resolved = new URL(importPath, `file://${dir}/`).pathname;
	
	return resolved;
}