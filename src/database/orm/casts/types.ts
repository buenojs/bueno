/**
 * Cast Type Definitions
 */

export type BuiltInCastName =
	| "json"
	| "boolean"
	| "integer"
	| "float"
	| "date"
	| "datetime"
	| "timestamp";

export interface CastObject {
	/**
	 * Transform value from database to model attribute
	 */
	get(value: unknown): unknown;
	/**
	 * Transform value from model attribute to database
	 */
	set(value: unknown): unknown;
}

export type CastDefinition = BuiltInCastName | CastObject;
