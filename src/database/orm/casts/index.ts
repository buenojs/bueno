/**
 * Cast Registry and Built-in Casts
 */

import type { CastDefinition, CastObject } from "./types";

export type { CastDefinition, CastObject, BuiltInCastName } from "./types";

const builtInCasts: Record<string, CastObject> = {
	json: {
		get(value: unknown): unknown {
			if (typeof value === "string") {
				try {
					return JSON.parse(value);
				} catch {
					return value;
				}
			}
			return value;
		},
		set(value: unknown): unknown {
			if (typeof value === "string") return value;
			return JSON.stringify(value);
		},
	},

	boolean: {
		get(value: unknown): boolean | null {
			if (value === null || value === undefined) return null;
			if (typeof value === "boolean") return value;
			if (typeof value === "number") return value !== 0;
			if (typeof value === "string") return value !== "0" && value !== "false";
			return Boolean(value);
		},
		set(value: unknown): number {
			return value ? 1 : 0;
		},
	},

	integer: {
		get(value: unknown): number {
			return Number(value);
		},
		set(value: unknown): number {
			return Number(value);
		},
	},

	float: {
		get(value: unknown): number {
			return Number(value);
		},
		set(value: unknown): number {
			return Number(value);
		},
	},

	date: {
		get(value: unknown): Date | null {
			if (!value) return null;
			if (value instanceof Date) return value;
			return new Date(String(value));
		},
		set(value: unknown): string {
			if (value instanceof Date) {
				return value.toISOString().split("T")[0];
			}
			return String(value);
		},
	},

	datetime: {
		get(value: unknown): Date | null {
			if (!value) return null;
			if (value instanceof Date) return value;
			return new Date(String(value));
		},
		set(value: unknown): string {
			if (value instanceof Date) {
				return value.toISOString();
			}
			return String(value);
		},
	},

	timestamp: {
		get(value: unknown): Date | null {
			if (!value) return null;
			if (value instanceof Date) return value;
			if (typeof value === "number") return new Date(value);
			return new Date(Number(value));
		},
		set(value: unknown): number {
			if (value instanceof Date) {
				return value.getTime();
			}
			return Number(value);
		},
	},
};

export class CastRegistry {
	/**
	 * Deserialize a value from database using a cast definition
	 */
	static deserialize(castDef: CastDefinition, value: unknown): unknown {
		if (typeof castDef === "string") {
			const castObj = builtInCasts[castDef];
			if (!castObj) {
				throw new Error(`Unknown cast: ${castDef}`);
			}
			return castObj.get(value);
		}
		return castDef.get(value);
	}

	/**
	 * Serialize a value to database using a cast definition
	 */
	static serialize(castDef: CastDefinition, value: unknown): unknown {
		if (typeof castDef === "string") {
			const castObj = builtInCasts[castDef];
			if (!castObj) {
				throw new Error(`Unknown cast: ${castDef}`);
			}
			return castObj.set(value);
		}
		return castDef.set(value);
	}
}
