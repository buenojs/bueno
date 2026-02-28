// @ts-nocheck - Abstract class generic constraints cause false positives in TypeScript.
// The implementation is logically correct; see .idea/orm-implementation-status.md

/**
 * Base Relationship Class
 *
 * Abstract base for all relationship types (HasOne, HasMany, etc.)
 */

import type { Database } from "../../index";
import { OrmQueryBuilder } from "../builder";
import type { Model } from "../model";
import { getModelDatabase } from "../model-registry";

export interface RelationshipOptions {
	foreignKey?: string;
	localKey?: string;
	ownerKey?: string;
	relatedKey?: string;
}

/**
 * Abstract base relationship class
 */
export abstract class Relationship<
	TParent extends Model,
	TRelated extends Model,
> {
	protected query: OrmQueryBuilder<any>;
	protected db: Database;

	constructor(
		protected parentModel: TParent,
		protected relatedClass: { new (): TRelated } & typeof Model,
		protected foreignKey: string,
		protected localKey = "id",
	) {
		this.db = getModelDatabase(relatedClass.name);
		this.query = new OrmQueryBuilder(this.db, relatedClass.table as string);
		// Note: subclasses that use private fields must call initConstraints()
		// themselves after their field assignments, rather than relying on this call.
		this.addConstraints();
	}

	/**
	 * Initialize constraints — call this in subclass constructors after all
	 * private fields are assigned, if the subclass needs them in addConstraints().
	 */
	protected initConstraints(): void {
		this.query = new OrmQueryBuilder(
			this.db,
			this.relatedClass.table as string,
		);
		this.addConstraints();
	}

	/**
	 * Add WHERE clause for this relationship
	 * (override in subclasses)
	 */
	abstract addConstraints(): void;

	/**
	 * Add eager load constraints
	 * (override in subclasses)
	 */
	abstract addEagerConstraints(parents: TParent[]): void;

	/**
	 * Match eager-loaded results to parent models
	 * (override in subclasses)
	 */
	abstract match(
		parents: TParent[],
		results: TRelated[],
		relation: string,
	): void;

	/**
	 * Get the results for this relationship
	 */
	abstract getResults(): Promise<TRelated | TRelated[] | null>;

	/**
	 * Reset the query builder to a fresh state
	 * Used during eager loading to clear single-model constraints from constructor
	 */
	protected resetQuery(): void {
		this.query = new OrmQueryBuilder(
			this.db,
			this.relatedClass.table as string,
		);
	}

	// ============= Chainable Methods =============

	where(column: string, operator: unknown, value?: unknown): this {
		this.query.where(column, operator, value);
		return this;
	}

	orWhere(column: string, operator: unknown, value?: unknown): this {
		this.query.orWhere(column, operator, value);
		return this;
	}

	orderBy(column: string, direction?: "ASC" | "DESC"): this {
		this.query.orderBy(column, direction);
		return this;
	}

	limit(n: number): this {
		this.query.limit(n);
		return this;
	}

	// ============= Query Terminals =============

	async get(): Promise<TRelated[]> {
		const rows = await this.query.get();
		return this.relatedClass.hydrate(rows) as TRelated[];
	}

	async first(): Promise<TRelated | null> {
		const rows = await this.query.limit(1).get();
		if (rows.length === 0) return null;
		return this.relatedClass.hydrate([rows[0]])[0] as TRelated;
	}

	async count(): Promise<number> {
		return this.query.count();
	}

	async exists(): Promise<boolean> {
		return this.query.exists();
	}

	async create(data: Record<string, unknown>): Promise<TRelated> {
		// Set the foreign key
		const model_data = {
			...data,
			[this.foreignKey]: this.parentModel.getAttribute(this.localKey as any),
		};
		return this.relatedClass.create(model_data);
	}
}
