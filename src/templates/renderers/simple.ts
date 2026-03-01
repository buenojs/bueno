/**
 * Simple Template Renderer
 *
 * Lightweight renderer for:
 * - Variable interpolation: {{ variable }}
 * - Filters: {{ value | uppercase | trim }}
 * - Conditionals: {{ if condition }} ... {{ endif }}
 *
 * No dependencies, ~180 lines
 */

import type { FilterRegistry, TemplateData } from "../types";

/**
 * Built-in filters
 */
const builtinFilters: FilterRegistry = {
	uppercase: (value) => String(value).toUpperCase(),
	lowercase: (value) => String(value).toLowerCase(),
	capitalize: (value) => {
		const str = String(value);
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	},
	trim: (value) => String(value).trim(),
	reverse: (value) => String(value).split("").reverse().join(""),
	length: (value) => {
		if (Array.isArray(value)) return value.length;
		if (typeof value === "string") return value.length;
		return 0;
	},
	join: (value, separator = ",") => {
		if (Array.isArray(value)) return value.join(String(separator));
		return String(value);
	},
	slice: (value, start = 0, end = undefined) => {
		const str = String(value);
		return str.slice(Number(start), end ? Number(end) : undefined);
	},
	default: (value, defaultVal) => {
		if (value === null || value === undefined || value === "") {
			return defaultVal;
		}
		return value;
	},
	isEmpty: (value) => {
		if (Array.isArray(value)) return value.length === 0;
		if (value === null || value === undefined || value === "") return true;
		return false;
	},
	date: (value, format = "YYYY-MM-DD") => {
		let dateObj: Date;
		if (value instanceof Date) {
			dateObj = value;
		} else {
			dateObj = new Date(value as string | number);
		}
		if (isNaN(dateObj.getTime())) return String(value);

		const year = dateObj.getFullYear();
		const month = String(dateObj.getMonth() + 1).padStart(2, "0");
		const date = String(dateObj.getDate()).padStart(2, "0");
		const hours = String(dateObj.getHours()).padStart(2, "0");
		const minutes = String(dateObj.getMinutes()).padStart(2, "0");
		const seconds = String(dateObj.getSeconds()).padStart(2, "0");

		return (format as string)
			.replace("YYYY", String(year))
			.replace("MM", month)
			.replace("DD", date)
			.replace("HH", hours)
			.replace("mm", minutes)
			.replace("ss", seconds);
	},
};

/**
 * Safely get nested property from object
 */
function getNestedValue(obj: unknown, path: string): unknown {
	const parts = path.split(".");
	let current = obj;

	for (const part of parts) {
		if (current === null || current === undefined) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}

	return current;
}

/**
 * Evaluate simple conditions
 * Supports: variable, !variable, var1 && var2, var1 || var2
 */
function evaluateCondition(condition: string, data: TemplateData): boolean {
	condition = condition.trim();

	// Handle logical operators (simple parsing, left-to-right)
	if (condition.includes("||")) {
		return condition
			.split("||")
			.map((c) => evaluateCondition(c.trim(), data))
			.some((result) => result);
	}

	if (condition.includes("&&")) {
		return condition
			.split("&&")
			.map((c) => evaluateCondition(c.trim(), data))
			.every((result) => result);
	}

	// Handle negation
	if (condition.startsWith("!")) {
		return !evaluateCondition(condition.slice(1).trim(), data);
	}

	// Get variable value
	const value = getNestedValue(data, condition);

	// Truthy check
	return Boolean(value);
}

/**
 * Simple template renderer
 */
export class SimpleRenderer {
	private filters: FilterRegistry;

	constructor(customFilters?: FilterRegistry) {
		this.filters = { ...builtinFilters, ...(customFilters || {}) };
	}

	/**
	 * Render template with data
	 */
	render(template: string, data: TemplateData): string {
		let result = template;

		// First, handle conditionals ({{ if ... }} ... {{ endif }})
		result = this._processConditionals(result, data);

		// Then, handle variables and filters ({{ var | filter1 | filter2 }})
		result = this._processVariables(result, data);

		return result;
	}

	/**
	 * Process conditional blocks
	 */
	private _processConditionals(template: string, data: TemplateData): string {
		// Match: {{ if condition }} ... {{ else }} ... {{ endif }}
		// Handle else blocks properly
		let result = template;

		// Process nested if blocks (inside-out)
		const ifRegex = /\{\{\s*if\s+([^}]+)\s*\}\}([\s\S]*?)\{\{\s*endif\s*\}\}/;

		while (ifRegex.test(result)) {
			result = result.replace(ifRegex, (match, condition, content) => {
				// Check for else block
				const elseRegex = /\{\{\s*else\s*\}\}([\s\S]*)$/;
				let thenBlock = content;
				let elseBlock = "";

				const elseMatch = content.match(elseRegex);
				if (elseMatch) {
					thenBlock = content.substring(0, elseMatch.index);
					elseBlock = elseMatch[1];
				}

				// Evaluate condition
				if (evaluateCondition(condition, data)) {
					return thenBlock;
				} else {
					return elseBlock;
				}
			});
		}

		return result;
	}

	/**
	 * Process variable interpolation and filters
	 */
	private _processVariables(template: string, data: TemplateData): string {
		// Match: {{ var | filter1(arg) | filter2 }}
		const varRegex = /\{\{\s*([^|}\s][^}]*?)\s*(?:\|([^}]*?))?\s*\}\}/g;

		return template.replace(varRegex, (match, varPath, filterChain) => {
			// Get variable value
			let value = getNestedValue(data, varPath.trim());

			// If undefined, return empty string
			if (value === undefined || value === null) {
				return "";
			}

			// Apply filters if present
			if (filterChain) {
				const filters = filterChain.split("|").map((f) => f.trim());

				for (const filterStr of filters) {
					// Parse filter and arguments: "uppercase" or "slice(1, 5)"
					const filterMatch = filterStr.match(/^(\w+)(?:\(([^)]*)\))?$/);
					if (!filterMatch) continue;

					const filterName = filterMatch[1];
					const argsStr = filterMatch[2];
					const filterFn = this.filters[filterName];

					if (!filterFn) {
						console.warn(`Unknown filter: ${filterName}`);
						continue;
					}

					// Parse arguments (simple string splitting)
					const args: unknown[] = [];
					if (argsStr) {
						// Simple parsing: split by comma, handle quoted strings
						let current = "";
						let inQuotes = false;
						let quoteChar = "";
						for (const char of argsStr) {
							if ((char === '"' || char === "'") && !inQuotes) {
								inQuotes = true;
								quoteChar = char;
							} else if (char === quoteChar && inQuotes) {
								inQuotes = false;
								quoteChar = "";
							} else if (char === "," && !inQuotes) {
								const trimmed = current.trim();
								// Remove quotes if present
								const unquoted = trimmed.replace(/^["']|["']$/g, "");
								args.push(unquoted);
								current = "";
							} else {
								current += char;
							}
						}
						if (current) {
							const trimmed = current.trim();
							const unquoted = trimmed.replace(/^["']|["']$/g, "");
							args.push(unquoted);
						}
					}

					// Apply filter
					value = filterFn(value, ...args);
				}
			}

			// Convert to string
			return String(value);
		});
	}

	/**
	 * Register custom filter
	 */
	registerFilter(
		name: string,
		fn: (value: unknown, ...args: unknown[]) => unknown,
	): void {
		this.filters[name] = fn;
	}
}
