/**
 * Built-in GraphQL Engine
 *
 * A lightweight, zero-dependency GraphQL query/mutation executor.
 * Suitable for development and simple use cases.
 *
 * ## Supported
 * - Queries and mutations
 * - Nested field selection
 * - Arguments (string, number, boolean, null literals)
 * - Variable substitution (bare $varName in query string)
 *
 * ## NOT Supported (use GraphQLJsAdapter for these)
 * - Named operations: query MyQuery { ... }
 * - Fragments and fragment spreads
 * - Directives (@skip, @include, @deprecated)
 * - Introspection (__schema, __type)
 * - Union and interface types
 * - Subscriptions
 *
 * The playground (GraphiQL) requires introspection and is auto-disabled
 * when using this engine. The SDL is still served at GET <path>/schema.
 */

import type {
	GraphQLEngine,
	GraphQLContext,
	GraphQLResult,
	GraphQLError,
	ResolvedField,
	ResolverFieldsByType,
	FieldMetadata,
} from "./types";

// ============= AST Types =============

interface GQLArgument {
	name: string;
	value: unknown;
}

interface GQLSelection {
	name: string;
	alias?: string;
	arguments: GQLArgument[];
	selections: GQLSelection[];
}

interface GQLDocument {
	operation: "query" | "mutation";
	selections: GQLSelection[];
}

// ============= Parser =============

class GraphQLParser {
	private pos = 0;

	constructor(private input: string) {}

	parse(): GQLDocument {
		this.skipWhitespaceAndComments();

		// Detect operation type
		let operation: "query" | "mutation" = "query";

		if (this.peek("mutation")) {
			this.pos += 8;
			operation = "mutation";
			this.skipWhitespaceAndComments();
			// Skip optional operation name
			if (this.input[this.pos] !== "{") {
				this.skipName();
				this.skipWhitespaceAndComments();
			}
		} else if (this.peek("query")) {
			this.pos += 5;
			operation = "query";
			this.skipWhitespaceAndComments();
			// Skip optional operation name
			if (this.input[this.pos] !== "{") {
				this.skipName();
				this.skipWhitespaceAndComments();
			}
		}

		// Skip variable definitions if present: (...)
		if (this.input[this.pos] === "(") {
			this.skipBalanced("(", ")");
			this.skipWhitespaceAndComments();
		}

		const selections = this.parseSelectionSet();

		return { operation, selections };
	}

	private parseSelectionSet(): GQLSelection[] {
		this.expect("{");
		this.skipWhitespaceAndComments();
		const selections: GQLSelection[] = [];

		while (this.pos < this.input.length && this.input[this.pos] !== "}") {
			// Check for fragment spread (not supported)
			if (this.input[this.pos] === "." && this.input[this.pos + 1] === "." && this.input[this.pos + 2] === ".") {
				throw new Error(
					"Fragment spreads are not supported by the built-in GraphQL engine. " +
					"Install the 'graphql' package and use GraphQLJsAdapter for full spec support.",
				);
			}

			// Check for inline fragment (not supported)
			if (this.peek("on ") || (this.peek("on\t")) || (this.peek("on{"))) {
				throw new Error(
					"Inline fragments are not supported by the built-in GraphQL engine. " +
					"Install the 'graphql' package and use GraphQLJsAdapter for full spec support.",
				);
			}

			const sel = this.parseSelection();
			selections.push(sel);
			this.skipWhitespaceAndComments();
			// Optional comma
			if (this.input[this.pos] === ",") {
				this.pos++;
				this.skipWhitespaceAndComments();
			}
		}

		this.expect("}");
		return selections;
	}

	private parseSelection(): GQLSelection {
		// May have alias: field: realField
		const firstName = this.parseName();
		this.skipWhitespaceAndComments();

		let name = firstName;
		let alias: string | undefined;

		if (this.input[this.pos] === ":") {
			// firstName is alias
			alias = firstName;
			this.pos++;
			this.skipWhitespaceAndComments();
			name = this.parseName();
			this.skipWhitespaceAndComments();
		}

		// Check for introspection fields
		if (name.startsWith("__")) {
			throw new Error(
				`Introspection field '${name}' is not supported by the built-in GraphQL engine. ` +
				"Install the 'graphql' package and use GraphQLJsAdapter for introspection support.",
			);
		}

		// Arguments
		const args: GQLArgument[] = [];
		if (this.input[this.pos] === "(") {
			args.push(...this.parseArguments());
			this.skipWhitespaceAndComments();
		}

		// Sub-selections
		let selections: GQLSelection[] = [];
		if (this.input[this.pos] === "{") {
			selections = this.parseSelectionSet();
			this.skipWhitespaceAndComments();
		}

		return { name, alias, arguments: args, selections };
	}

	private parseArguments(): GQLArgument[] {
		this.expect("(");
		this.skipWhitespaceAndComments();
		const args: GQLArgument[] = [];

		while (this.pos < this.input.length && this.input[this.pos] !== ")") {
			const argName = this.parseName();
			this.skipWhitespaceAndComments();
			this.expect(":");
			this.skipWhitespaceAndComments();
			const value = this.parseValue();
			args.push({ name: argName, value });
			this.skipWhitespaceAndComments();
			if (this.input[this.pos] === ",") {
				this.pos++;
				this.skipWhitespaceAndComments();
			}
		}

		this.expect(")");
		return args;
	}

	private parseValue(): unknown {
		const ch = this.input[this.pos];

		// String
		if (ch === '"') {
			return this.parseString();
		}

		// Number
		if (ch === "-" || (ch >= "0" && ch <= "9")) {
			return this.parseNumber();
		}

		// Boolean / null
		if (this.peek("true")) {
			this.pos += 4;
			return true;
		}
		if (this.peek("false")) {
			this.pos += 5;
			return false;
		}
		if (this.peek("null")) {
			this.pos += 4;
			return null;
		}

		// Variable reference
		if (ch === "$") {
			this.pos++;
			const varName = this.parseName();
			// Variable value must be resolved from the variables map at execution time
			// Return as a special marker
			return { __variable: varName };
		}

		// Object literal (for inline input objects)
		if (ch === "{") {
			return this.parseObjectLiteral();
		}

		// List literal
		if (ch === "[") {
			return this.parseListLiteral();
		}

		// Enum value (treat as string)
		if (ch && /[A-Z_a-z]/.test(ch)) {
			return this.parseName();
		}

		throw new Error(`Unexpected character '${ch}' at position ${this.pos}`);
	}

	private parseString(): string {
		this.expect('"');
		let result = "";
		while (this.pos < this.input.length && this.input[this.pos] !== '"') {
			if (this.input[this.pos] === "\\") {
				this.pos++;
				const esc = this.input[this.pos];
				const escapes: Record<string, string> = {
					'"': '"', "\\": "\\", "/": "/",
					n: "\n", r: "\r", t: "\t", b: "\b", f: "\f",
				};
				result += escapes[esc] ?? esc;
			} else {
				result += this.input[this.pos];
			}
			this.pos++;
		}
		this.expect('"');
		return result;
	}

	private parseNumber(): number {
		let numStr = "";
		if (this.input[this.pos] === "-") {
			numStr += "-";
			this.pos++;
		}
		while (this.pos < this.input.length && /[\d.]/.test(this.input[this.pos])) {
			numStr += this.input[this.pos++];
		}
		return Number(numStr);
	}

	private parseObjectLiteral(): Record<string, unknown> {
		this.expect("{");
		this.skipWhitespaceAndComments();
		const obj: Record<string, unknown> = {};
		while (this.pos < this.input.length && this.input[this.pos] !== "}") {
			const key = this.parseName();
			this.skipWhitespaceAndComments();
			this.expect(":");
			this.skipWhitespaceAndComments();
			obj[key] = this.parseValue();
			this.skipWhitespaceAndComments();
			if (this.input[this.pos] === ",") {
				this.pos++;
				this.skipWhitespaceAndComments();
			}
		}
		this.expect("}");
		return obj;
	}

	private parseListLiteral(): unknown[] {
		this.expect("[");
		this.skipWhitespaceAndComments();
		const items: unknown[] = [];
		while (this.pos < this.input.length && this.input[this.pos] !== "]") {
			items.push(this.parseValue());
			this.skipWhitespaceAndComments();
			if (this.input[this.pos] === ",") {
				this.pos++;
				this.skipWhitespaceAndComments();
			}
		}
		this.expect("]");
		return items;
	}

	private parseName(): string {
		const start = this.pos;
		while (
			this.pos < this.input.length &&
			/[\w]/.test(this.input[this.pos])
		) {
			this.pos++;
		}
		if (this.pos === start) {
			throw new Error(
				`Expected name at position ${this.pos}, got '${this.input[this.pos]}'`,
			);
		}
		return this.input.slice(start, this.pos);
	}

	private skipName(): void {
		while (
			this.pos < this.input.length &&
			/[\w]/.test(this.input[this.pos])
		) {
			this.pos++;
		}
	}

	private skipBalanced(open: string, close: string): void {
		this.expect(open);
		let depth = 1;
		while (this.pos < this.input.length && depth > 0) {
			if (this.input[this.pos] === open) depth++;
			else if (this.input[this.pos] === close) depth--;
			this.pos++;
		}
	}

	private skipWhitespaceAndComments(): void {
		while (this.pos < this.input.length) {
			// Whitespace
			if (/\s/.test(this.input[this.pos])) {
				this.pos++;
				continue;
			}
			// Line comments
			if (this.input[this.pos] === "#") {
				while (this.pos < this.input.length && this.input[this.pos] !== "\n") {
					this.pos++;
				}
				continue;
			}
			break;
		}
	}

	private expect(char: string): void {
		if (this.input[this.pos] !== char) {
			throw new Error(
				`Expected '${char}' at position ${this.pos}, got '${this.input[this.pos] ?? "EOF"}'`,
			);
		}
		this.pos++;
	}

	private peek(str: string): boolean {
		return this.input.startsWith(str, this.pos);
	}
}

// ============= Built-in Engine Schema =============

interface BuiltinSchema {
	queries: Map<string, ResolvedField>;
	mutations: Map<string, ResolvedField>;
	sdl: string;
}

// ============= Built-in Engine =============

export class BuiltinGraphQLEngine implements GraphQLEngine {
	readonly supportsIntrospection = false;
	readonly supportsSubscriptions = false;

	buildSchema(
		resolvers: ResolverFieldsByType,
		_types: Map<string, FieldMetadata[]>,
		sdl: string,
	): unknown {
		const schema: BuiltinSchema = {
			queries: resolvers.queries,
			mutations: resolvers.mutations,
			sdl,
		};
		return schema;
	}

	async execute(
		schema: unknown,
		query: string,
		variables: Record<string, unknown>,
		context: GraphQLContext,
		_operationName?: string,
	): Promise<GraphQLResult> {
		const s = schema as BuiltinSchema;

		// Parse the query
		let doc: GQLDocument;
		try {
			doc = new GraphQLParser(query).parse();
		} catch (err) {
			return {
				data: null,
				errors: [{ message: String((err as Error).message) }],
			};
		}

		const fields = doc.operation === "mutation" ? s.mutations : s.queries;
		const data: Record<string, unknown> = {};
		const errors: GraphQLError[] = [];

		for (const sel of doc.selections) {
			try {
				const resolvedValue = await this.resolveSelection(
					sel,
					fields,
					variables,
					context,
				);
				const resultKey = sel.alias ?? sel.name;
				data[resultKey] = resolvedValue;
			} catch (err) {
				const resultKey = sel.alias ?? sel.name;
				data[resultKey] = null;
				errors.push({
					message: String((err as Error).message),
					path: [resultKey],
				});
			}
		}

		const result: GraphQLResult = { data };
		if (errors.length > 0) {
			result.errors = errors;
		}
		return result;
	}

	private async resolveSelection(
		sel: GQLSelection,
		fields: Map<string, ResolvedField>,
		variables: Record<string, unknown>,
		context: GraphQLContext,
	): Promise<unknown> {
		const field = fields.get(sel.name);
		if (!field) {
			throw new Error(`Field '${sel.name}' does not exist on type`);
		}

		// Build args from selection
		const args = this.buildArgsFromSelection(sel, variables);

		// Call resolver method
		const instance = field.resolverInstance as Record<string, (...a: unknown[]) => unknown>;
		const methodArgs = this.buildMethodArgs(field, args, context);
		const rawResult = await instance[field.methodName](...methodArgs);

		// If sub-selections, recursively resolve object fields
		if (sel.selections.length > 0 && rawResult !== null && rawResult !== undefined) {
			if (Array.isArray(rawResult)) {
				return Promise.all(
					rawResult.map((item) =>
						this.resolveObject(item, sel.selections, variables, context),
					),
				);
			}
			return this.resolveObject(rawResult, sel.selections, variables, context);
		}

		return rawResult;
	}

	private async resolveObject(
		obj: unknown,
		selections: GQLSelection[],
		variables: Record<string, unknown>,
		context: GraphQLContext,
	): Promise<Record<string, unknown>> {
		const result: Record<string, unknown> = {};
		const record = obj as Record<string, unknown>;

		for (const sel of selections) {
			if (sel.name.startsWith("__")) {
				throw new Error(
					`Introspection field '${sel.name}' is not supported by the built-in engine.`,
				);
			}

			const resultKey = sel.alias ?? sel.name;
			const fieldValue = record[sel.name];

			if (sel.selections.length > 0 && fieldValue !== null && fieldValue !== undefined) {
				if (Array.isArray(fieldValue)) {
					result[resultKey] = await Promise.all(
						fieldValue.map((item) =>
							this.resolveObject(item, sel.selections, variables, context),
						),
					);
				} else {
					result[resultKey] = await this.resolveObject(
						fieldValue,
						sel.selections,
						variables,
						context,
					);
				}
			} else {
				result[resultKey] = fieldValue ?? null;
			}
		}

		return result;
	}

	private buildArgsFromSelection(
		sel: GQLSelection,
		variables: Record<string, unknown>,
	): Record<string, unknown> {
		const args: Record<string, unknown> = {};
		for (const arg of sel.arguments) {
			args[arg.name] = this.resolveValue(arg.value, variables);
		}
		return args;
	}

	private resolveValue(
		value: unknown,
		variables: Record<string, unknown>,
	): unknown {
		if (
			value !== null &&
			typeof value === "object" &&
			"__variable" in (value as object)
		) {
			const varName = (value as { __variable: string }).__variable;
			return variables[varName];
		}
		if (Array.isArray(value)) {
			return value.map((v) => this.resolveValue(v, variables));
		}
		if (value !== null && typeof value === "object") {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				result[k] = this.resolveValue(v, variables);
			}
			return result;
		}
		return value;
	}

	private buildMethodArgs(
		field: ResolvedField,
		args: Record<string, unknown>,
		context: GraphQLContext,
	): unknown[] {
		const methodArgs: unknown[] = [];

		for (const param of field.paramMetadata) {
			if (param.kind === "context") {
				methodArgs[param.index] = context;
			} else if (param.kind === "args" && param.argName) {
				methodArgs[param.index] = args[param.argName];
			} else if (param.kind === "argsObject" && param.argName) {
				methodArgs[param.index] = args[param.argName];
			}
		}

		return methodArgs;
	}
}
