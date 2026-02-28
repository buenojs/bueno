/**
 * SQLite Database Template
 */

import type { DatabaseTemplateResult } from "../project/types";

export function sqliteTemplate(): DatabaseTemplateResult {
	return {
		files: [],
		directories: [],
		envConfig: "DATABASE_URL=sqlite:./data.db",
		configCode: `{ url: 'sqlite:./data.db' }`,
	};
}
