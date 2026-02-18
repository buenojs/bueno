/**
 * HMR Client Script
 *
 * This script is injected into HTML pages to enable Hot Module Replacement.
 * It handles WebSocket communication, module updates, and framework-specific HMR.
 *
 * The script is kept minimal (< 5KB) for fast injection.
 *
 * @module frontend/hmr-client
 */

// Client script as a string for injection into HTML
export const HMR_CLIENT_SCRIPT = `
(function() {
	'use strict';

	// ============= Configuration =============
	const HMR_CONFIG = {
		reconnectInterval: 1000,
		maxReconnectAttempts: 10,
		heartbeatInterval: 30000,
	};

	// ============= State =============
	let ws = null;
	let clientId = null;
	let reconnectAttempts = 0;
	let reconnectTimer = null;
	let heartbeatTimer = null;
	let subscribedFiles = new Set();
	let moduleCache = new Map();
	let isConnecting = false;

	// ============= Framework Detection =============
	const framework = detectFramework();

	function detectFramework() {
		if (typeof window === 'undefined') return 'unknown';
		
		// Check for React
		if (window.React || document.querySelector('[data-reactroot]') || 
			document.querySelector('[data-reactid]')) {
			return 'react';
		}
		
		// Check for Vue
		if (window.Vue || document.querySelector('[data-v-]') ||
			document.querySelector('[data-vue-app]')) {
			return 'vue';
		}
		
		// Check for Svelte
		if (window.__SVELTE_HMR__ || document.querySelector('[data-svelte]')) {
			return 'svelte';
		}
		
		// Check for Solid
		if (window.Solid$$ || document.querySelector('[data-solid]')) {
			return 'solid';
		}
		
		return 'unknown';
	}

	// ============= WebSocket Connection =============
	function connect() {
		if (isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
			return;
		}
		
		isConnecting = true;
		
		// Build WebSocket URL
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.hostname;
		const port = getHMRPort();
		const url = protocol + '//' + host + ':' + port + '/_hmr';
		
		try {
			ws = new WebSocket(url);
			
			ws.onopen = handleOpen;
			ws.onclose = handleClose;
			ws.onerror = handleError;
			ws.onmessage = handleMessage;
		} catch (e) {
			console.error('[HMR] Failed to create WebSocket:', e);
			isConnecting = false;
			scheduleReconnect();
		}
	}

	function getHMRPort() {
		// Try to get port from script tag or default to dev server port + 1
		const scripts = document.querySelectorAll('script[data-hmr-port]');
		if (scripts.length > 0) {
			return parseInt(scripts[0].getAttribute('data-hmr-port'), 10);
		}
		return parseInt(window.location.port || '3000', 10) + 1;
	}

	function handleOpen() {
		isConnecting = false;
		reconnectAttempts = 0;
		console.log('[HMR] Connected');
		
		// Start heartbeat
		startHeartbeat();
		
		// Re-subscribe to files
		subscribedFiles.forEach(function(fileId) {
			sendMessage({ type: 'subscribe', fileId: fileId });
		});
	}

	function handleClose(event) {
		isConnecting = false;
		stopHeartbeat();
		
		if (event.code !== 1000) {
			console.log('[HMR] Connection closed, attempting to reconnect...');
			scheduleReconnect();
		}
	}

	function handleError(error) {
		isConnecting = false;
		console.error('[HMR] WebSocket error:', error);
	}

	function scheduleReconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
		}
		
		if (reconnectAttempts >= HMR_CONFIG.maxReconnectAttempts) {
			console.error('[HMR] Max reconnect attempts reached. Please refresh the page.');
			showOverlay({
				message: 'HMR connection lost. Please refresh the page.',
				type: 'error'
			});
			return;
		}
		
		reconnectAttempts++;
		var delay = HMR_CONFIG.reconnectInterval * reconnectAttempts;
		
		reconnectTimer = setTimeout(function() {
			console.log('[HMR] Reconnecting... (attempt ' + reconnectAttempts + ')');
			connect();
		}, delay);
	}

	// ============= Heartbeat =============
	function startHeartbeat() {
		stopHeartbeat();
		heartbeatTimer = setInterval(function() {
			if (ws && ws.readyState === WebSocket.OPEN) {
				sendMessage({ type: 'ping' });
			}
		}, HMR_CONFIG.heartbeatInterval);
	}

	function stopHeartbeat() {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	// ============= Message Handling =============
	function sendMessage(message) {
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(message));
		}
	}

	function handleMessage(event) {
		try {
			var message = JSON.parse(event.data);
			
			switch (message.type) {
				case 'connected':
					clientId = message.clientId;
					console.log('[HMR] Client ID:', clientId);
					break;
					
				case 'pong':
					// Heartbeat response
					break;
					
				case 'update':
					handleUpdate(message);
					break;
					
				case 'reload':
					handleReload(message);
					break;
					
				case 'error':
					handleError(message);
					break;
			}
		} catch (e) {
			console.error('[HMR] Failed to parse message:', e);
		}
	}

	// ============= Update Handling =============
	function handleUpdate(message) {
		console.log('[HMR] Update received:', message.fileId);
		
		// Hide any existing error overlay
		hideOverlay();
		
		var changes = message.changes || [];
		var hasCSSUpdate = changes.some(function(file) {
			return file.endsWith('.css') || file.endsWith('.scss') || 
				   file.endsWith('.sass') || file.endsWith('.less');
		});
		
		if (hasCSSUpdate) {
			// Handle CSS updates without flash
			updateCSS(changes);
		}
		
		// Check if we can do hot update
		if (canHotUpdate(changes)) {
			performHotUpdate(message);
		} else {
			// Fall back to full reload
			console.log('[HMR] Cannot hot update, reloading page...');
			window.location.reload();
		}
	}

	function handleReload(message) {
		console.log('[HMR] Full reload requested');
		hideOverlay();
		window.location.reload();
	}

	function handleError(message) {
		console.error('[HMR] Error:', message.error);
		showOverlay({
			message: message.error.message,
			stack: message.error.stack,
			file: message.error.file,
			line: message.error.line,
			column: message.error.column,
			type: 'error'
		});
	}

	// ============= CSS Hot Update =============
	function updateCSS(changedFiles) {
		var links = document.querySelectorAll('link[rel="stylesheet"]');
		
		links.forEach(function(link) {
			var href = link.getAttribute('href');
			if (!href) return;
			
			// Check if this stylesheet is affected
			var isAffected = changedFiles.some(function(file) {
				return href.includes(file.replace(/^.*\\//, '')) ||
					   file.includes(href.replace(/^.*\\//, ''));
			});
			
			if (isAffected) {
				// Add timestamp to force reload
				var newHref = href.split('?')[0] + '?v=' + Date.now();
				
				// Create new link and swap
				var newLink = document.createElement('link');
				newLink.rel = 'stylesheet';
				newLink.href = newHref;
				
				newLink.onload = function() {
					link.remove();
				};
				
				newLink.onerror = function() {
					console.error('[HMR] Failed to reload CSS:', newHref);
					link.remove();
				};
				
				link.parentNode.insertBefore(newLink, link);
			}
		});
	}

	// ============= Hot Update Logic =============
	function canHotUpdate(changes) {
		// Check if all changed files can be hot updated
		return changes.every(function(file) {
			var ext = file.split('.').pop().toLowerCase();
			
			// CSS files can always be hot updated
			if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less') {
				return true;
			}
			
			// JS/TS files need HMR boundary
			if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') {
				return hasHMRBoundary(file);
			}
			
			// Framework-specific files
			if (ext === 'vue' || ext === 'svelte') {
				return true; // Vue and Svelte have built-in HMR
			}
			
			return false;
		});
	}

	function hasHMRBoundary(file) {
		// Check if the module accepts hot updates
		// This is a simplified check - in production, we'd track this from the server
		return true; // For now, assume all modules can be hot updated
	}

	function performHotUpdate(message) {
		var changes = message.changes || [];
		
		// Framework-specific update handling
		switch (framework) {
			case 'react':
				performReactUpdate(message);
				break;
			case 'vue':
				performVueUpdate(message);
				break;
			case 'svelte':
				performSvelteUpdate(message);
				break;
			case 'solid':
				performSolidUpdate(message);
				break;
			default:
				// Generic update - reload scripts
				performGenericUpdate(message);
		}
	}

	// ============= React Fast Refresh =============
	function performReactUpdate(message) {
		if (!window.__HMR_REACT_REFRESH__) {
			// React Refresh not available, fall back to reload
			window.location.reload();
			return;
		}
		
		console.log('[HMR] Applying React Fast Refresh...');
		
		// Signal to React Refresh that an update is coming
		if (window.__REACT_REFRESH__) {
			try {
				changes.forEach(function(file) {
					// Invalidate the module
					invalidateModule(file);
				});
				
				// Trigger React Refresh
				window.__REACT_REFRESH__.performReactRefresh();
			} catch (e) {
				console.error('[HMR] React Fast Refresh failed:', e);
				window.location.reload();
			}
		} else {
			// Fallback: reload the page
			window.location.reload();
		}
	}

	// ============= Vue HMR =============
	function performVueUpdate(message) {
		console.log('[HMR] Applying Vue HMR...');
		
		// Vue's HMR is handled by vue-loader and vue-hot-reload-api
		if (window.__VUE_HMR__) {
			try {
				message.changes.forEach(function(file) {
					if (file.endsWith('.vue')) {
						window.__VUE_HMR__.rerender(file);
					}
				});
			} catch (e) {
				console.error('[HMR] Vue HMR failed:', e);
				window.location.reload();
			}
		} else {
			window.location.reload();
		}
	}

	// ============= Svelte HMR =============
	function performSvelteUpdate(message) {
		console.log('[HMR] Applying Svelte HMR...');
		
		if (window.__SVELTE_HMR__) {
			try {
				message.changes.forEach(function(file) {
					if (file.endsWith('.svelte')) {
						// Svelte HMR preserves component state
						window.__SVELTE_HMR__.update(file);
					}
				});
			} catch (e) {
				console.error('[HMR] Svelte HMR failed:', e);
				window.location.reload();
			}
		} else {
			window.location.reload();
		}
	}

	// ============= Solid HMR =============
	function performSolidUpdate(message) {
		console.log('[HMR] Applying Solid HMR...');
		
		if (window.__SOLID_HMR__) {
			try {
				message.changes.forEach(function(file) {
					invalidateModule(file);
				});
				
				window.__SOLID_HMR__.update();
			} catch (e) {
				console.error('[HMR] Solid HMR failed:', e);
				window.location.reload();
			}
		} else {
			window.location.reload();
		}
	}

	// ============= Generic Update =============
	function performGenericUpdate(message) {
		console.log('[HMR] Performing generic update...');
		
		// For unknown frameworks, reload scripts
		message.changes.forEach(function(file) {
			invalidateModule(file);
		});
		
		// Reload the page as a fallback
		window.location.reload();
	}

	// ============= Module Management =============
	function invalidateModule(fileId) {
		moduleCache.delete(fileId);
		
		// Find and reload script tags
		var scripts = document.querySelectorAll('script[src]');
		scripts.forEach(function(script) {
			var src = script.getAttribute('src');
			if (src && src.includes(fileId)) {
				reloadScript(script);
			}
		});
	}

	function reloadScript(oldScript) {
		var src = oldScript.getAttribute('src');
		var newSrc = src.split('?')[0] + '?v=' + Date.now();
		
		var newScript = document.createElement('script');
		newScript.src = newSrc;
		newScript.type = oldScript.type || 'text/javascript';
		newScript.async = false;
		
		// Copy attributes
		Array.from(oldScript.attributes).forEach(function(attr) {
			if (attr.name !== 'src') {
				newScript.setAttribute(attr.name, attr.value);
			}
		});
		
		oldScript.parentNode.replaceChild(newScript, oldScript);
	}

	// ============= Error Overlay =============
	function showOverlay(options) {
		// Remove existing overlay
		hideOverlay();
		
		var overlay = document.createElement('div');
		overlay.id = '__hmr-overlay__';
		overlay.style.cssText = [
			'position: fixed',
			'top: 0',
			'left: 0',
			'right: 0',
			'bottom: 0',
			'background: rgba(0, 0, 0, 0.85)',
			'z-index: 99999',
			'display: flex',
			'align-items: center',
			'justify-content: center',
			'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
			'color: white',
			'padding: 20px'
		].join(';');
		
		var content = document.createElement('div');
		content.style.cssText = [
			'max-width: 800px',
			'max-height: 80vh',
			'overflow: auto',
			'background: #1a1a1a',
			'border-radius: 8px',
			'padding: 20px',
			'box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5)'
		].join(';');
		
		var title = document.createElement('h2');
		title.style.cssText = 'color: #ff5555; margin: 0 0 15px 0; font-size: 18px;';
		title.textContent = 'HMR Error';
		
		var message = document.createElement('pre');
		message.style.cssText = [
			'background: #282828',
			'padding: 15px',
			'border-radius: 4px',
			'overflow-x: auto',
			'font-size: 13px',
			'line-height: 1.5',
			'white-space: pre-wrap',
			'word-break: break-word'
		].join(';');
		message.textContent = options.message;
		
		content.appendChild(title);
		content.appendChild(message);
		
		if (options.stack) {
			var stack = document.createElement('pre');
			stack.style.cssText = [
				'background: #282828',
				'padding: 15px',
				'border-radius: 4px',
				'margin-top: 10px',
				'font-size: 12px',
				'color: #888',
				'overflow-x: auto'
			].join(';');
			stack.textContent = options.stack;
			content.appendChild(stack);
		}
		
		if (options.file) {
			var file = document.createElement('div');
			file.style.cssText = 'margin-top: 15px; color: #888; font-size: 12px;';
			file.textContent = 'File: ' + options.file + 
				(options.line ? ':' + options.line + (options.column ? ':' + options.column : '') : '');
			content.appendChild(file);
		}
		
		var closeBtn = document.createElement('button');
		closeBtn.style.cssText = [
			'position: absolute',
			'top: 10px',
			'right: 10px',
			'background: transparent',
			'border: none',
			'color: #888',
			'font-size: 20px',
			'cursor: pointer',
			'padding: 5px'
		].join(';');
		closeBtn.textContent = '×';
		closeBtn.onclick = hideOverlay;
		
		overlay.style.position = 'relative';
		overlay.appendChild(closeBtn);
		overlay.appendChild(content);
		
		document.body.appendChild(overlay);
	}

	function hideOverlay() {
		var overlay = document.getElementById('__hmr-overlay__');
		if (overlay) {
			overlay.remove();
		}
	}

	// ============= Subscription Management =============
	function subscribe(fileId) {
		subscribedFiles.add(fileId);
		sendMessage({ type: 'subscribe', fileId: fileId });
	}

	function unsubscribe(fileId) {
		subscribedFiles.delete(fileId);
		sendMessage({ type: 'unsubscribe', fileId: fileId });
	}

	// ============= Initialization =============
	function init() {
		// Connect to HMR server
		connect();
		
		// Subscribe to current page
		var currentFile = window.location.pathname;
		subscribe(currentFile);
		
		// Expose HMR API
		window.__HMR__ = {
			subscribe: subscribe,
			unsubscribe: unsubscribe,
			connect: connect,
			clientId: function() { return clientId; },
			framework: framework
		};
		
		console.log('[HMR] Client initialized (framework: ' + framework + ')');
	}

	// Start when DOM is ready
	if (document.readyState === 'complete') {
		init();
	} else {
		document.addEventListener('DOMContentLoaded', init);
	}
})();
`;

/**
 * Get the HMR client script with optional configuration
 */
export function getHMRClientScript(options?: {
	port?: number;
}): string {
	if (options?.port) {
		return HMR_CLIENT_SCRIPT.replace(
			"return parseInt(window.location.port || '3000', 10) + 1;",
			`return ${options.port};`
		);
	}
	return HMR_CLIENT_SCRIPT;
}

/**
 * Inject HMR client script into HTML content
 */
export function injectHMRScript(html: string, port?: number): string {
	const script = getHMRClientScript({ port });
	
	// Find the </head> or </body> tag to inject before
	const headMatch = html.match(/<\/head>/i);
	const bodyMatch = html.match(/<\/body>/i);
	
	const injectionPoint = headMatch ? headMatch.index! + headMatch[0].length : 
							bodyMatch ? bodyMatch.index! + bodyMatch[0].length : 
							html.length;
	
	const scriptTag = `<script data-hmr-port="${port || ''}">${script}</script>`;
	
	return html.slice(0, injectionPoint) + scriptTag + html.slice(injectionPoint);
}