/**
 * PostgreSQL Database Template
 */

import type { DatabaseTemplateResult } from "../project/types";

export function postgresqlTemplate(): DatabaseTemplateResult {
	return {
		files: [],
		directories: [],
		envConfig: "DATABASE_URL=postgresql://user:password@localhost:5432/dbname",
		configCode: `{ url: process.env.DATABASE_URL ?? 'postgresql://localhost/dbname' }`,
	};
}
