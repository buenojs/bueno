/**
 * Console Output Utilities for Bueno CLI
 *
 * Provides colored output, formatted tables, and progress indicators
 * using ANSI escape codes without external dependencies
 */

// ANSI color codes
const COLORS = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	italic: '\x1b[3m',
	underline: '\x1b[4m',
	
	// Foreground colors
	black: '\x1b[30m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	
	// Bright foreground colors
	brightRed: '\x1b[91m',
	brightGreen: '\x1b[92m',
	brightYellow: '\x1b[93m',
	brightBlue: '\x1b[94m',
	brightMagenta: '\x1b[95m',
	brightCyan: '\x1b[96m',
	brightWhite: '\x1b[97m',
	
	// Background colors
	bgBlack: '\x1b[40m',
	bgRed: '\x1b[41m',
	bgGreen: '\x1b[42m',
	bgYellow: '\x1b[43m',
	bgBlue: '\x1b[44m',
	bgMagenta: '\x1b[45m',
	bgCyan: '\x1b[46m',
	bgWhite: '\x1b[47m',
} as const;

// Check if colors should be disabled
let colorEnabled = !process.env.NO_COLOR && process.env.BUENO_NO_COLOR !== 'true' && process.stdout.isTTY;

/**
 * Enable or disable colored output
 */
export function setColorEnabled(enabled: boolean): void {
	colorEnabled = enabled;
}

/**
 * Check if colors are enabled
 */
export function isColorEnabled(): boolean {
	return colorEnabled;
}

/**
 * Apply color to text
 */
function colorize(text: string, color: keyof typeof COLORS): string {
	if (!colorEnabled) return text;
	return `${COLORS[color]}${text}${COLORS.reset}`;
}

/**
 * Color helper functions
 */
export const colors = {
	red: (text: string) => colorize(text, 'red'),
	green: (text: string) => colorize(text, 'green'),
	yellow: (text: string) => colorize(text, 'yellow'),
	blue: (text: string) => colorize(text, 'blue'),
	magenta: (text: string) => colorize(text, 'magenta'),
	cyan: (text: string) => colorize(text, 'cyan'),
	white: (text: string) => colorize(text, 'white'),
	brightRed: (text: string) => colorize(text, 'brightRed'),
	brightGreen: (text: string) => colorize(text, 'brightGreen'),
	brightYellow: (text: string) => colorize(text, 'brightYellow'),
	brightBlue: (text: string) => colorize(text, 'brightBlue'),
	brightCyan: (text: string) => colorize(text, 'brightCyan'),
	dim: (text: string) => colorize(text, 'dim'),
	bold: (text: string) => colorize(text, 'bold'),
	underline: (text: string) => colorize(text, 'underline'),
	italic: (text: string) => colorize(text, 'italic'),
};

/**
 * Console output helpers
 */
export const cliConsole = {
	/**
	 * Log a message
	 */
	log(message: string, ...args: unknown[]): void {
		globalThis.console.log(message, ...args);
	},

	/**
	 * Log an info message
	 */
	info(message: string, ...args: unknown[]): void {
		globalThis.console.log(colors.cyan('ℹ'), message, ...args);
	},

	/**
	 * Log a success message
	 */
	success(message: string, ...args: unknown[]): void {
		globalThis.console.log(colors.green('✓'), message, ...args);
	},

	/**
	 * Log a warning message
	 */
	warn(message: string, ...args: unknown[]): void {
		globalThis.console.log(colors.yellow('⚠'), message, ...args);
	},

	/**
	 * Log an error message
	 */
	error(message: string, ...args: unknown[]): void {
		globalThis.console.error(colors.red('✗'), message, ...args);
	},

	/**
	 * Log a debug message (only in verbose mode)
	 */
	debug(message: string, ...args: unknown[]): void {
		if (process.env.BUENO_VERBOSE === 'true') {
			globalThis.console.log(colors.dim('⋯'), colors.dim(message), ...args);
		}
	},

	/**
	 * Log a header/title
	 */
	header(title: string): void {
		globalThis.console.log();
		globalThis.console.log(colors.bold(colors.cyan(title)));
		globalThis.console.log();
	},

	/**
	 * Log a subheader
	 */
	subheader(title: string): void {
		globalThis.console.log();
		globalThis.console.log(colors.bold(title));
	},

	/**
	 * Log a newline
	 */
	newline(): void {
		globalThis.console.log();
	},

	/**
	 * Clear the console
	 */
	clear(): void {
		process.stdout.write('\x1b[2J\x1b[0f');
	},
};

/**
 * Format a table
 */
export function formatTable(
	headers: string[],
	rows: string[][],
	options: { padding?: number } = {},
): string {
	const padding = options.padding ?? 2;
	const widths: number[] = headers.map((h, i) => {
		const maxRowWidth = Math.max(...rows.map((r) => r[i]?.length ?? 0));
		return Math.max(h.length, maxRowWidth);
	});

	const pad = ' '.repeat(padding);

	// Header
	const headerLine = headers
		.map((h, i) => h.padEnd(widths[i] ?? 0))
		.join(pad);

	// Separator
	const separator = widths
		.map((w) => '─'.repeat(w))
		.join(pad);

	// Rows
	const rowLines = rows.map((row) =>
		row
			.map((cell, i) => (cell ?? '').padEnd(widths[i] ?? 0))
			.join(pad)
	);

	return [
		colors.bold(headerLine),
		colors.dim(separator),
		...rowLines,
	].join('\n');
}

/**
 * Print a table to console
 */
export function printTable(
	headers: string[],
	rows: string[][],
	options?: { padding?: number },
): void {
	globalThis.console.log(formatTable(headers, rows, options));
}

/**
 * Format a list
 */
export function formatList(
	items: string[],
	options: { bullet?: string; indent?: number } = {},
): string {
	const bullet = options.bullet ?? '•';
	const indent = ' '.repeat(options.indent ?? 2);

	return items.map((item) => `${indent}${colors.cyan(bullet)} ${item}`).join('\n');
}

/**
 * Print a list to console
 */
export function printList(
	items: string[],
	options?: { bullet?: string; indent?: number },
): void {
	globalThis.console.log(formatList(items, options));
}

/**
 * Format a tree structure
 */
export interface TreeNode {
	label: string;
	children?: TreeNode[];
}

export function formatTree(
	node: TreeNode,
	prefix = '',
	isLast = true,
): string {
	const connector = isLast ? '└── ' : '├── ';
	const childPrefix = isLast ? '    ' : '│   ';

	let result = prefix + connector + node.label + '\n';

	if (node.children) {
		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			if (child) {
				result += formatTree(
					child,
					prefix + childPrefix,
					i === node.children.length - 1,
				);
			}
		}
	}

	return result;
}

/**
 * Print a tree to console
 */
export function printTree(node: TreeNode): void {
	globalThis.console.log(node.label);
	if (node.children) {
		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			if (child) {
				globalThis.console.log(
					formatTree(child, '', i === node.children.length - 1),
				);
			}
		}
	}
}

/**
 * Format file size
 */
export function formatSize(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB'];
	let size = bytes;
	let unitIndex = 0;

	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex++;
	}

	return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format duration
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format a relative file path
 */
export function formatPath(path: string, baseDir?: string): string {
	if (baseDir && path.startsWith(baseDir)) {
		return '.' + path.slice(baseDir.length);
	}
	return path;
}

/**
 * Highlight code
 */
export function highlightCode(code: string): string {
	// Simple syntax highlighting for TypeScript
	return code
		.replace(/\b(import|export|from|const|let|var|function|class|interface|type|async|await|return|if|else|for|while|switch|case|break|continue|new|this|extends|implements)\b/g, 
			(match) => colors.magenta(match))
		.replace(/\b(string|number|boolean|void|any|unknown|never|null|undefined|true|false)\b/g,
			(match) => colors.yellow(match))
		.replace(/'([^']*)'|"([^"]*)"|`([^`]*)`/g,
			(match) => colors.green(match))
		.replace(/\/\/.*$/gm,
			(match) => colors.dim(match))
		.replace(/\/\*[\s\S]*?\*\//g,
			(match) => colors.dim(match));
}