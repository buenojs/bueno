/**
 * BelongsTo Relationship
 *
 * Model belongs to a parent model (reverse of HasOne/HasMany)
 */

import type { Model } from "../model";
import { Relationship } from "./base";

export class BelongsTo<TRelated extends Model> extends Relationship<any, TRelated> {
	constructor(
		parentModel: Model,
		relatedClass: { new(): TRelated } & typeof Model,
		foreignKey: string,
		private ownerKey: string = "id",
	) {
		super(parentModel, relatedClass, foreignKey, foreignKey);
	}

	addConstraints(): void {
		const parentForeignId = this.parentModel.getAttribute(
			this.foreignKey as any,
		);
		this.query.where(this.ownerKey, parentForeignId);
	}

	addEagerConstraints(parents: Model[]): void {
		const ids = parents.map((p) => p.getAttribute(this.foreignKey as any));
		this.query.whereIn(this.ownerKey, ids);
	}

	match(parents: Model[], results: TRelated[], relation: string): void {
		const grouped = new Map<unknown, TRelated>();

		for (const result of results) {
			const key = result.getAttribute(this.ownerKey as any);
			grouped.set(key, result);
		}

		for (const parent of parents) {
			const key = parent.getAttribute(this.foreignKey as any);
			const related = grouped.get(key) ?? null;
			(parent as any)._relations.set(relation, related);
		}
	}

	async getResults(): Promise<TRelated | null> {
		return this.first();
	}
}
