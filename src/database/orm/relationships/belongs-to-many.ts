/**
 * BelongsToMany Relationship
 *
 * Model belongs to many related models through a pivot table (n:m)
 */

import type { Database } from "../../index";
import { OrmQueryBuilder } from "../builder";
import type { Model } from "../model";
import { getModelDatabase } from "../model-registry";
import { Relationship } from "./base";

export class BelongsToMany<TRelated extends Model> extends Relationship<
	any,
	TRelated
> {
	private pivotData: Set<string> = new Set();

	constructor(
		parentModel: Model,
		relatedClass: { new(): TRelated } & typeof Model,
		private pivotTable: string,
		private foreignPivotKey: string,
		private relatedPivotKey: string,
		private parentKey: string = "id",
		private relatedKey: string = "id",
	) {
		super(parentModel, relatedClass, foreignPivotKey, parentKey);
	}

	addConstraints(): void {
		const parentId = this.parentModel.getAttribute(this.parentKey as any);

		this.query.join(
			this.pivotTable,
			`${this.pivotTable}.${this.relatedPivotKey} = ${(this.relatedClass as any).table}.${this.relatedKey}`,
		);
		this.query.where(
			`${this.pivotTable}.${this.foreignPivotKey}`,
			parentId,
		);
	}

	addEagerConstraints(parents: Model[]): void {
		const ids = parents.map((p) => p.getAttribute(this.parentKey as any));
		this.query.whereIn(
			`${this.pivotTable}.${this.foreignPivotKey}`,
			ids,
		);
	}

	match(parents: Model[], results: TRelated[], relation: string): void {
		const grouped = new Map<unknown, TRelated[]>();

		for (const result of results) {
			// The JOIN puts the pivot FK column in the result row as a regular attribute
			const parentId = result.getAttribute(
				this.foreignPivotKey as any,
			);
			if (!grouped.has(parentId)) {
				grouped.set(parentId, []);
			}
			grouped.get(parentId)!.push(result);
		}

		for (const parent of parents) {
			const key = parent.getAttribute(this.parentKey as any);
			const related = grouped.get(key) ?? [];
			(parent as any)._relations.set(relation, related);
		}
	}

	/**
	 * Include specific pivot columns in results
	 */
	withPivot(...columns: string[]): this {
		for (const col of columns) {
			this.pivotData.add(col);
		}
		return this;
	}

	/**
	 * Attach related models to the pivot table
	 */
	async attach(
		ids: unknown | unknown[],
		pivotData?: Record<string, unknown>,
	): Promise<void> {
		const idArray = Array.isArray(ids) ? ids : [ids];
		const parentId = this.parentModel.getAttribute(
			this.parentKey as any,
		);

		const db = getModelDatabase(this.relatedClass.name);

		for (const id of idArray) {
			const data = {
				[this.foreignPivotKey]: parentId,
				[this.relatedPivotKey]: id,
				...pivotData,
			};

			await new OrmQueryBuilder(db, this.pivotTable).insert(data);
		}
	}

	/**
	 * Detach related models from the pivot table
	 */
	async detach(ids?: unknown | unknown[]): Promise<void> {
		const parentId = this.parentModel.getAttribute(
			this.parentKey as any,
		);

		const db = getModelDatabase(this.relatedClass.name);
		let builder = new OrmQueryBuilder(db, this.pivotTable).where(
			this.foreignPivotKey,
			parentId,
		);

		if (ids) {
			const idArray = Array.isArray(ids) ? ids : [ids];
			builder = builder.whereIn(this.relatedPivotKey, idArray) as any;
		}

		await builder.delete();
	}

	/**
	 * Sync related models (replace all with given IDs)
	 */
	async sync(ids: unknown[], detaching = true): Promise<void> {
		if (detaching) {
			await this.detach();
		}
		await this.attach(ids);
	}

	/**
	 * Toggle related models
	 */
	async toggle(ids: unknown | unknown[]): Promise<void> {
		const idArray = Array.isArray(ids) ? ids : [ids];
		const attached = await this.get();
		const attachedIds = attached.map((m) =>
			m.getAttribute(this.relatedKey as any),
		);

		const toAttach = idArray.filter((id) => !attachedIds.includes(id));
		const toDetach = attachedIds.filter((id) => idArray.includes(id));

		await Promise.all([
			this.attach(toAttach),
			this.detach(toDetach),
		]);
	}

	/**
	 * Update pivot data
	 */
	async updateExistingPivot(
		id: unknown,
		data: Record<string, unknown>,
	): Promise<void> {
		const parentId = this.parentModel.getAttribute(
			this.parentKey as any,
		);

		const db = getModelDatabase(this.relatedClass.name);
		await new OrmQueryBuilder(db, this.pivotTable)
			.where(this.foreignPivotKey, parentId)
			.where(this.relatedPivotKey, id)
			.update(data);
	}

	async getResults(): Promise<TRelated[]> {
		return this.get();
	}
}
