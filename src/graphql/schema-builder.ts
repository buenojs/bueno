/**
 * Schema Builder
 *
 * Reads GraphQL decorator metadata from resolver and type classes,
 * generates SDL (Schema Definition Language), and builds the internal
 * ResolvedSchema used by the built-in engine.
 */

import type {
	Constructor,
	TypeFn,
	FieldMetadata,
	ResolverFieldMetadata,
	ResolvedField,
	ResolvedSchema,
	ResolverFieldsByType,
	GraphQLID,
	GraphQLInt,
	GraphQLFloat,
} from "./types";
import {
	getResolverMetadata,
	getTypeMetadata,
	getQueryFields,
	getMutationFields,
	getSubscriptionFields,
	getGqlClassMetadata,
	getAllGqlPropertyMetadata,
	GQL_OBJECTTYPE_KEY,
	GQL_INPUTTYPE_KEY,
} from "./metadata";

// ============= Scalar Helpers =============

/** Map JS constructors to GraphQL scalar names */
export function typeFnToScalarName(typeFn: TypeFn): string | null {
	const type = typeFn();
	const resolved = Array.isArray(type) ? type[0] : type;
	if (resolved === String) return "String";
	if (resolved === Number) return "Float";
	if (resolved === Boolean) return "Boolean";
	// Check sentinel classes by name (avoids import cycle)
	const name = (resolved as Constructor).name;
	if (name === "GraphQLID") return "ID";
	if (name === "GraphQLInt") return "Int";
	if (name === "GraphQLFloat") return "Float";
	return null;
}

/** Convert a TypeFn to an SDL type string */
export function typeFnToSDL(typeFn: TypeFn, nullable: boolean): string {
	const type = typeFn();
	const isArray = Array.isArray(type);
	const inner = isArray ? (type as Constructor[])[0] : (type as Constructor);

	let innerName: string;
	const scalarName = typeFnToScalarName(() => inner);
	if (scalarName) {
		innerName = scalarName;
	} else {
		// Use the class name for object / input types
		innerName = (inner as Constructor).name;
		// Strip any __type marker (for sentinel classes already handled above)
	}

	// Inner type is always non-null (items in list are non-null)
	const innerSdl = isArray ? `[${innerName}!]` : innerName;
	return nullable ? innerSdl : `${innerSdl}!`;
}

// ============= Schema Builder =============

export interface BuiltSchema {
	sdl: string;
	resolvedSchema: ResolvedSchema;
	resolverFields: ResolverFieldsByType;
	typeFields: Map<string, FieldMetadata[]>;
}

export class SchemaBuilder {
	private resolverInstances: Map<Constructor, unknown>;
	private typeClasses: Set<Constructor> = new Set();

	constructor(
		private resolverClasses: Constructor[],
		resolverInstances: Map<Constructor, unknown>,
	) {
		this.resolverInstances = resolverInstances;
	}

	build(): BuiltSchema {
		// Collect query/mutation/subscription fields across all resolvers
		const queries = new Map<string, ResolvedField>();
		const mutations = new Map<string, ResolvedField>();
		const subscriptions = new Map<string, ResolvedField>();

		for (const ResolverClass of this.resolverClasses) {
			const instance = this.resolverInstances.get(ResolverClass);

			const qFields = getQueryFields(ResolverClass.prototype);
			for (const f of qFields) {
				queries.set(f.fieldName, this.toResolvedField(f, instance));
				this.collectReturnType(f.typeFn);
			}

			const mFields = getMutationFields(ResolverClass.prototype);
			for (const f of mFields) {
				mutations.set(f.fieldName, this.toResolvedField(f, instance));
				this.collectReturnType(f.typeFn);
			}

			const sFields = getSubscriptionFields(ResolverClass.prototype);
			for (const f of sFields) {
				subscriptions.set(f.fieldName, this.toResolvedField(f, instance));
				this.collectReturnType(f.typeFn);
			}
		}

		// Also collect types referenced from @Field decorators
		this.collectNestedTypes();

		// Build type field map
		const typeFields = this.buildTypeFields();

		// Generate SDL
		const sdl = this.generateSDL(queries, mutations, subscriptions, typeFields);

		const resolverFields: ResolverFieldsByType = {
			queries,
			mutations,
			subscriptions,
		};

		const resolvedSchema: ResolvedSchema = {
			queryFields: queries,
			mutationFields: mutations,
			subscriptionFields: subscriptions,
		};

		return { sdl, resolvedSchema, resolverFields, typeFields };
	}

	private toResolvedField(
		field: ResolverFieldMetadata,
		instance: unknown,
	): ResolvedField {
		return {
			resolverInstance: instance,
			methodName: field.methodName,
			paramMetadata: field.paramMetadata,
			typeFn: field.typeFn,
			nullable: field.nullable,
		};
	}

	private collectReturnType(typeFn: TypeFn): void {
		const type = typeFn();
		const resolved = Array.isArray(type) ? type[0] : type;
		if (typeof resolved === "function") {
			const meta = getTypeMetadata(resolved as Constructor);
			if (meta) {
				this.typeClasses.add(resolved as Constructor);
			}
		}
	}

	private collectNestedTypes(): void {
		// Iterate type classes and collect nested types from @Field typeFns
		let changed = true;
		while (changed) {
			changed = false;
			for (const TypeClass of Array.from(this.typeClasses)) {
				const fields = getAllGqlPropertyMetadata(TypeClass.prototype);
				for (const field of fields) {
					const type = field.typeFn();
					const inner = Array.isArray(type) ? type[0] : type;
					if (typeof inner === "function") {
						const meta = getTypeMetadata(inner as Constructor);
						if (meta && !this.typeClasses.has(inner as Constructor)) {
							this.typeClasses.add(inner as Constructor);
							changed = true;
						}
					}
				}
			}
		}
	}

	private buildTypeFields(): Map<string, FieldMetadata[]> {
		const result = new Map<string, FieldMetadata[]>();
		for (const TypeClass of this.typeClasses) {
			const meta = getTypeMetadata(TypeClass);
			if (!meta) continue;
			const fields = getAllGqlPropertyMetadata(TypeClass.prototype);
			result.set(meta.name, fields);
		}
		return result;
	}

	private generateSDL(
		queries: Map<string, ResolvedField>,
		mutations: Map<string, ResolvedField>,
		subscriptions: Map<string, ResolvedField>,
		typeFields: Map<string, FieldMetadata[]>,
	): string {
		const lines: string[] = [];

		// Object types and input types
		for (const TypeClass of this.typeClasses) {
			const meta = getTypeMetadata(TypeClass);
			if (!meta) continue;

			const fields = getAllGqlPropertyMetadata(TypeClass.prototype);
			if (fields.length === 0) continue;

			const keyword = meta.kind === "input" ? "input" : "type";
			if (meta.description) {
				lines.push(`"""${meta.description}"""`);
			}
			lines.push(`${keyword} ${meta.name} {`);
			for (const f of fields) {
				if (f.description) {
					lines.push(`  """${f.description}"""`);
				}
				const typeSdl = typeFnToSDL(f.typeFn, f.nullable);
				let fieldLine = `  ${f.propertyKey}: ${typeSdl}`;
				if (f.defaultValue !== undefined) {
					fieldLine += ` = ${JSON.stringify(f.defaultValue)}`;
				}
				lines.push(fieldLine);
				if (f.deprecationReason) {
					lines[lines.length - 1] += ` @deprecated(reason: "${f.deprecationReason}")`;
				}
			}
			lines.push("}");
			lines.push("");
		}

		// Query type
		if (queries.size > 0) {
			lines.push("type Query {");
			for (const [fieldName, field] of queries) {
				const args = this.buildArgsSDL(fieldName, queries);
				const typeSdl = typeFnToSDL(field.typeFn, field.nullable);
				lines.push(`  ${fieldName}${args}: ${typeSdl}`);
			}
			lines.push("}");
			lines.push("");
		}

		// Mutation type
		if (mutations.size > 0) {
			lines.push("type Mutation {");
			for (const [fieldName, field] of mutations) {
				const args = this.buildArgsSDL(fieldName, mutations);
				const typeSdl = typeFnToSDL(field.typeFn, field.nullable);
				lines.push(`  ${fieldName}${args}: ${typeSdl}`);
			}
			lines.push("}");
			lines.push("");
		}

		// Subscription type
		if (subscriptions.size > 0) {
			lines.push("type Subscription {");
			for (const [fieldName, field] of subscriptions) {
				const typeSdl = typeFnToSDL(field.typeFn, field.nullable);
				lines.push(`  ${fieldName}: ${typeSdl}`);
			}
			lines.push("}");
			lines.push("");
		}

		return lines.join("\n").trim();
	}

	private buildArgsSDL(
		fieldName: string,
		fields: Map<string, ResolvedField>,
	): string {
		const field = fields.get(fieldName);
		if (!field || field.paramMetadata.length === 0) return "";

		const args: string[] = [];
		for (const param of field.paramMetadata) {
			if (param.kind === "context") continue;
			if (param.kind === "args" && param.argName) {
				// We don't know the type from paramMetadata alone for SDL args.
				// For simple scalars this would need annotation — skip for now
				// (built-in engine resolves by name from incoming args object)
				continue;
			}
			if (param.kind === "argsObject" && param.inputTypeFn) {
				const inputType = param.inputTypeFn();
				const typeName = Array.isArray(inputType)
					? (inputType[0] as Constructor).name
					: (inputType as Constructor).name;
				if (param.argName) {
					args.push(`${param.argName}: ${typeName}!`);
				}
			}
		}

		return args.length > 0 ? `(${args.join(", ")})` : "";
	}
}

// ============= Registry of known @ObjectType / @InputType classes =============

// Global registry populated by @ObjectType / @InputType at decoration time
const registeredTypeClasses = new Set<Constructor>();

export function registerTypeClass(ctor: Constructor): void {
	registeredTypeClasses.add(ctor);
}

export function getRegisteredTypeClasses(): Constructor[] {
	return Array.from(registeredTypeClasses);
}
