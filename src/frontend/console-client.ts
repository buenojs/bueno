/**
 * Client-side Console Interception Script
 *
 * This script is injected into the browser to capture console.* calls
 * and send them to the server via WebSocket for terminal output.
 *
 * @module frontend/console-client
 */

// This is the client-side script that will be injected into HTML pages
// It's stored as a string constant for injection

export const CONSOLE_CLIENT_SCRIPT = `
(function() {
	'use strict';

	// Configuration
	const WS_PORT = typeof CONSOLE_PORT !== 'undefined' ? CONSOLE_PORT : 3002;
	const WS_URL = 'ws://localhost:' + WS_PORT + '/_console';
	const MAX_ARGS_LENGTH = 10;  // Maximum number of args to send
	const MAX_STRING_LENGTH = 10000;  // Maximum string length before truncation
	const MAX_OBJECT_DEPTH = 5;  // Maximum depth for object serialization
	const RECONNECT_DELAY = 1000;  // Delay before reconnecting (ms)
	const MAX_RECONNECT_ATTEMPTS = 10;  // Maximum reconnection attempts

	// State
	let ws = null;
	let clientId = null;
	let reconnectAttempts = 0;
	let isConnected = false;
	let messageQueue = [];
	let originalConsole = {};

	// Console methods to intercept
	const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace', 'table'];

	/**
	 * Serialize a value for transmission
	 * Handles circular references and truncates large values
	 */
	function serializeValue(value, depth, seen) {
		depth = depth || 0;
		seen = seen || new WeakSet();

		// Handle depth limit
		if (depth > MAX_OBJECT_DEPTH) {
			return { __type: 'truncated', reason: 'max-depth' };
		}

		// Handle null and undefined
		if (value === null) return null;
		if (value === undefined) return { __type: 'undefined' };

		// Handle primitives
		if (typeof value === 'string') {
			if (value.length > MAX_STRING_LENGTH) {
				return value.substring(0, MAX_STRING_LENGTH) + '... [truncated]';
			}
			return value;
		}
		if (typeof value === 'number') {
			if (Number.isNaN(value)) return { __type: 'NaN' };
			if (!Number.isFinite(value)) return { __type: 'Infinity', negative: value < 0 };
			return value;
		}
		if (typeof value === 'boolean') return value;
		if (typeof value === 'symbol') return { __type: 'symbol', value: value.toString() };
		if (typeof value === 'function') return { __type: 'function', name: value.name || 'anonymous' };
		if (typeof value === 'bigint') return { __type: 'bigint', value: value.toString() };

		// Handle circular references
		if (typeof value === 'object') {
			if (seen.has(value)) {
				return { __type: 'circular' };
			}
			seen.add(value);
		}

		// Handle Error objects
		if (value instanceof Error) {
			return {
				__type: 'Error',
				name: value.name,
				message: value.message,
				stack: value.stack
			};
		}

		// Handle Date objects
		if (value instanceof Date) {
			return { __type: 'Date', value: value.toISOString() };
		}

		// Handle RegExp
		if (value instanceof RegExp) {
			return { __type: 'RegExp', value: value.toString() };
		}

		// Handle Map
		if (value instanceof Map) {
			const entries = [];
			let count = 0;
			for (const [k, v] of value) {
				if (count++ >= 20) break; // Limit entries
				entries.push([serializeValue(k, depth + 1, seen), serializeValue(v, depth + 1, seen)]);
			}
			return { __type: 'Map', entries: entries, size: value.size };
		}

		// Handle Set
		if (value instanceof Set) {
			const values = [];
			let count = 0;
			for (const v of value) {
				if (count++ >= 20) break; // Limit values
				values.push(serializeValue(v, depth + 1, seen));
			}
			return { __type: 'Set', values: values, size: value.size };
		}

		// Handle Array
		if (Array.isArray(value)) {
			const arr = [];
			const len = Math.min(value.length, 100); // Limit array length
			for (let i = 0; i < len; i++) {
				arr.push(serializeValue(value[i], depth + 1, seen));
			}
			if (value.length > len) {
				arr.push({ __type: 'truncated', count: value.length - len });
			}
			return arr;
		}

		// Handle ArrayBuffer / TypedArray
		if (value instanceof ArrayBuffer) {
			return { __type: 'ArrayBuffer', byteLength: value.byteLength };
		}
		if (ArrayBuffer.isView(value)) {
			return { 
				__type: 'TypedArray', 
				constructor: value.constructor.name,
				length: value.length,
				byteLength: value.byteLength
			};
		}

		// Handle DOM elements (simplified)
		if (typeof Element !== 'undefined' && value instanceof Element) {
			return {
				__type: 'Element',
				tagName: value.tagName,
				id: value.id,
				className: value.className
			};
		}

		// Handle plain objects
		try {
			const obj = {};
			const keys = Object.keys(value).slice(0, 50); // Limit keys
			for (const key of keys) {
				obj[key] = serializeValue(value[key], depth + 1, seen);
			}
			const symbolKeys = Object.getOwnPropertySymbols(value).slice(0, 10);
			for (const sym of symbolKeys) {
				obj['Symbol(' + sym.toString() + ')'] = serializeValue(value[sym], depth + 1, seen);
			}
			return obj;
		} catch (e) {
			return { __type: 'unserializable', error: String(e) };
		}
	}

	/**
	 * Parse stack trace to extract file, line, column
	 */
	function parseStackTrace(stack) {
		if (!stack) return null;

		// Get the first non-console line from the stack
		const lines = stack.split('\\n');
		
		for (const line of lines) {
			// Skip internal console-stream lines
			if (line.includes('/_console') || line.includes('console-client')) continue;
			
			// Match various stack trace formats
			// Chrome: "    at functionName (file:line:col)"
			// Firefox: "functionName@file:line:col"
			// Safari: "functionName@file:line:col"
			
			const chromeMatch = line.match(/at\\s+(?:(.+?)\\s+\\()?(.+?):(\\d+):(\\d+)\\)?/);
			if (chromeMatch) {
				return {
					file: chromeMatch[2],
					line: parseInt(chromeMatch[3], 10),
					column: parseInt(chromeMatch[4], 10)
				};
			}

			const firefoxMatch = line.match(/(?:([^@]+)@)?(.+?):(\\d+):(\\d+)/);
			if (firefoxMatch) {
				return {
					file: firefoxMatch[2],
					line: parseInt(firefoxMatch[3], 10),
					column: parseInt(firefoxMatch[4], 10)
				};
			}
		}

		return null;
	}

	/**
	 * Get caller location from stack trace
	 */
	function getCallerLocation() {
		try {
			throw new Error();
		} catch (e) {
			return parseStackTrace(e.stack);
		}
		return null;
	}

	/**
	 * Send a console message to the server
	 */
	function sendConsoleMessage(type, args) {
		const location = getCallerLocation();
		
		const message = {
			type: 'console',
			consoleType: type,
			args: Array.from(args).slice(0, MAX_ARGS_LENGTH).map(function(arg) {
				return serializeValue(arg, 0, new WeakSet());
			}),
			timestamp: Date.now(),
			url: window.location.href
		};

		// Add location info
		if (location) {
			message.file = location.file;
			message.line = location.line;
			message.column = location.column;
		}

		// Add stack trace for errors
		if (type === 'error' && args[0] instanceof Error) {
			message.stack = args[0].stack;
		}
		if (type === 'trace') {
			try {
				message.stack = new Error().stack;
			} catch (e) {}
		}

		// Send or queue the message
		if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		} else {
			messageQueue.push(message);
			// Limit queue size
			if (messageQueue.length > 100) {
				messageQueue.shift();
			}
		}
	}

	/**
	 * Intercept console methods
	 */
	function interceptConsole() {
		CONSOLE_METHODS.forEach(function(method) {
			originalConsole[method] = console[method];
			
			console[method] = function() {
				// Call original method first
				try {
					originalConsole[method].apply(console, arguments);
				} catch (e) {}

				// Send to server
				try {
					sendConsoleMessage(method, arguments);
				} catch (e) {}
			};
		});
	}

	/**
	 * Restore original console methods
	 */
	function restoreConsole() {
		CONSOLE_METHODS.forEach(function(method) {
			if (originalConsole[method]) {
				console[method] = originalConsole[method];
			}
		});
	}

	/**
	 * Process queued messages
	 */
	function processQueue() {
		while (messageQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
			const message = messageQueue.shift();
			ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Connect to WebSocket server
	 */
	function connect() {
		if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
			return;
		}

		try {
			ws = new WebSocket(WS_URL);

			ws.onopen = function() {
				isConnected = true;
				reconnectAttempts = 0;
				originalConsole.log && originalConsole.log('[Console Stream] Connected to server');
				processQueue();
			};

			ws.onclose = function() {
				isConnected = false;
				ws = null;

				// Attempt to reconnect
				if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
					reconnectAttempts++;
					setTimeout(connect, RECONNECT_DELAY * reconnectAttempts);
				} else {
					originalConsole.warn && originalConsole.warn('[Console Stream] Max reconnection attempts reached');
				}
			};

			ws.onerror = function(error) {
				originalConsole.error && originalConsole.error('[Console Stream] WebSocket error', error);
			};

			ws.onmessage = function(event) {
				try {
					const data = JSON.parse(event.data);
					if (data.type === 'connected') {
						clientId = data.clientId;
					}
				} catch (e) {}
			};
		} catch (e) {
			originalConsole.error && originalConsole.error('[Console Stream] Failed to connect', e);
		}
	}

	/**
	 * Initialize console streaming
	 */
	function init() {
		// Don't initialize in iframes unless specifically enabled
		if (window !== window.top && !window.__CONSOLE_STREAM_ENABLED__) {
			return;
		}

		// Don't initialize in service workers
		if (typeof ServiceWorkerGlobalScope !== 'undefined' && self instanceof ServiceWorkerGlobalScope) {
			return;
		}

		interceptConsole();
		connect();

		// Handle page unload
		window.addEventListener('beforeunload', function() {
			if (ws) {
				ws.close();
			}
		});

		// Handle visibility change for reconnection
		document.addEventListener('visibilitychange', function() {
			if (document.visibilityState === 'visible' && (!ws || ws.readyState !== WebSocket.OPEN)) {
				connect();
			}
		});
	}

	// Start initialization
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	// Expose for debugging
	window.__CONSOLE_STREAM__ = {
		connect: connect,
		disconnect: function() {
			if (ws) ws.close();
		},
		restore: restoreConsole,
		getClientId: function() { return clientId; },
		isConnected: function() { return isConnected; }
	};
})();
`;

// Export a function to get the client script with custom port
export function getConsoleClientScript(port: number): string {
	return CONSOLE_CLIENT_SCRIPT.replace(
		/typeof CONSOLE_PORT !== 'undefined' \? CONSOLE_PORT : \d+/,
		`typeof CONSOLE_PORT !== 'undefined' ? CONSOLE_PORT : ${port}`
	);
}