/**
 * HasMany Relationship
 *
 * Model has many related models (1:n)
 */

import type { Model } from "../model";
import { Relationship } from "./base";

export class HasMany<TRelated extends Model> extends Relationship<
	any,
	TRelated
> {
	addConstraints(): void {
		const parentId = this.parentModel.getAttribute(this.localKey as any);
		this.query.where(this.foreignKey, parentId);
	}

	addEagerConstraints(parents: Model[]): void {
		const ids = parents.map((p) => p.getAttribute(this.localKey as any));
		this.query.whereIn(this.foreignKey, ids);
	}

	match(parents: Model[], results: TRelated[], relation: string): void {
		const grouped = new Map<unknown, TRelated[]>();

		for (const result of results) {
			const key = result.getAttribute(this.foreignKey as any);
			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(result);
		}

		for (const parent of parents) {
			const key = parent.getAttribute(this.localKey as any);
			const related = grouped.get(key) ?? [];
			(parent as any)._relations.set(relation, related);
		}
	}

	async getResults(): Promise<TRelated[]> {
		return this.get();
	}
}
