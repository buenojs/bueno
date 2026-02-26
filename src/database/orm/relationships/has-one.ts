/**
 * HasOne Relationship
 *
 * Model has one related model (1:1)
 */

import type { Model } from "../model";
import { Relationship } from "./base";

export class HasOne<TRelated extends Model> extends Relationship<any, TRelated> {
	addConstraints(): void {
		const parentId = this.parentModel.getAttribute(this.localKey as any);
		this.query.where(this.foreignKey, parentId);
	}

	addEagerConstraints(parents: Model[]): void {
		const ids = parents.map((p) => p.getAttribute(this.localKey as any));
		this.query.whereIn(this.foreignKey, ids);
	}

	match(parents: Model[], results: TRelated[], relation: string): void {
		const grouped = new Map<unknown, TRelated>();
		for (const result of results) {
			const key = result.getAttribute(this.foreignKey as any);
			grouped.set(key, result);
		}

		for (const parent of parents) {
			const key = parent.getAttribute(this.localKey as any);
			const related = grouped.get(key) ?? null;
			(parent as any)._relations.set(relation, related);
		}
	}

	async getResults(): Promise<TRelated | null> {
		return this.first();
	}
}
