/**
 * String Utility Functions for Bueno CLI
 *
 * Provides string transformation helpers for code generation
 */

/**
 * Convert string to camelCase
 */
export function camelCase(str: string): string {
	return str
		.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
		.replace(/^(.)/, (c) => c.toLowerCase());
}

/**
 * Convert string to PascalCase
 */
export function pascalCase(str: string): string {
	return str
		.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
		.replace(/^(.)/, (c) => c.toUpperCase());
}

/**
 * Convert string to kebab-case
 */
export function kebabCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.replace(/[-_\s]+/g, '-')
		.toLowerCase();
}

/**
 * Convert string to snake_case
 */
export function snakeCase(str: string): string {
	return str
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.replace(/[-\s]+/g, '_')
		.toLowerCase();
}

/**
 * Convert string to UPPER_CASE
 */
export function upperCase(str: string): string {
	return snakeCase(str).toUpperCase();
}

/**
 * Convert string to lower_case
 */
export function lowerCase(str: string): string {
	return snakeCase(str).toLowerCase();
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Pluralize a word (simple implementation)
 */
export function pluralize(word: string): string {
	if (word.endsWith('y') && !['ay', 'ey', 'iy', 'oy', 'uy'].some((e) => word.endsWith(e))) {
		return word.slice(0, -1) + 'ies';
	}
	if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') || word.endsWith('ch') || word.endsWith('sh')) {
		return word + 'es';
	}
	return word + 's';
}

/**
 * Singularize a word (simple implementation)
 */
export function singularize(word: string): string {
	if (word.endsWith('ies')) {
		return word.slice(0, -3) + 'y';
	}
	if (word.endsWith('es')) {
		// Check for s, x, z, ch, sh endings
		const withoutEs = word.slice(0, -2);
		if (withoutEs.endsWith('s') || withoutEs.endsWith('x') || withoutEs.endsWith('z') ||
			withoutEs.endsWith('ch') || withoutEs.endsWith('sh')) {
			return withoutEs;
		}
	}
	if (word.endsWith('s') && !word.endsWith('ss')) {
		return word.slice(0, -1);
	}
	return word;
}

/**
 * Check if string is a valid identifier
 */
export function isValidIdentifier(str: string): boolean {
	return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

/**
 * Check if string is a valid file name
 */
export function isValidFileName(str: string): boolean {
	return !/[<>:"/\\|?*\x00-\x1f]/.test(str);
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return str.slice(0, maxLength - 3) + '...';
}

/**
 * Pad string to center
 */
export function padCenter(str: string, length: number, char = ' '): string {
	const padding = length - str.length;
	if (padding <= 0) return str;
	const left = Math.floor(padding / 2);
	const right = padding - left;
	return char.repeat(left) + str + char.repeat(right);
}

/**
 * Remove file extension
 */
export function removeExtension(filename: string): string {
	const lastDot = filename.lastIndexOf('.');
	if (lastDot === -1 || lastDot === 0) return filename;
	return filename.slice(0, lastDot);
}

/**
 * Get file extension
 */
export function getExtension(filename: string): string {
	const lastDot = filename.lastIndexOf('.');
	if (lastDot === -1 || lastDot === 0) return '';
	return filename.slice(lastDot + 1);
}

/**
 * Generate a unique ID
 */
export function generateId(length = 8): string {
	const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

/**
 * Escape string for use in template literals
 */
export function escapeTemplateString(str: string): string {
	return str.replace(/[`\\$]/g, '\\$&');
}

/**
 * Escape string for use in regular expressions
 */
export function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Indent a multiline string
 */
export function indent(str: string, spaces = 2): string {
	const indentation = ' '.repeat(spaces);
	return str
		.split('\n')
		.map((line) => (line.trim() ? indentation + line : line))
		.join('\n');
}

/**
 * Strip leading/trailing whitespace from each line
 */
export function stripLines(str: string): string {
	return str
		.split('\n')
		.map((line) => line.trim())
		.join('\n')
		.replace(/\n{3,}/g, '\n\n');
}