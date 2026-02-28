/**
 * BelongsTo Relationship
 *
 * Model belongs to a parent model (reverse of HasOne/HasMany)
 */

import type { Model } from "../model";
import { Relationship } from "./base";

export class BelongsTo<TRelated extends Model> extends Relationship<
	any,
	TRelated
> {
	constructor(
		parentModel: Model,
		relatedClass: { new (): TRelated } & typeof Model,
		foreignKey: string,
		ownerKey = "id",
	) {
		// Pass ownerKey as localKey so addConstraints() (called inside super())
		// can access it via this.localKey before ownerKey is assigned as a field.
		super(parentModel, relatedClass, foreignKey, ownerKey);
	}

	addConstraints(): void {
		const parentForeignId = this.parentModel.getAttribute(
			this.foreignKey as any,
		);
		// this.localKey holds the ownerKey value (e.g. "id")
		this.query.where(this.localKey, parentForeignId);
	}

	addEagerConstraints(parents: Model[]): void {
		const ids = parents.map((p) => p.getAttribute(this.foreignKey as any));
		this.query.whereIn(this.localKey, ids);
	}

	match(parents: Model[], results: TRelated[], relation: string): void {
		const grouped = new Map<unknown, TRelated>();

		for (const result of results) {
			const key = result.getAttribute(this.localKey as any);
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
