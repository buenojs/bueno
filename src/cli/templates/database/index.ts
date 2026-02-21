/**
 * Database Templates
 *
 * Database-specific configuration templates
 */

import type { DatabaseDriver, DatabaseTemplateResult } from '../project/types';
import { sqliteTemplate } from './sqlite';
import { postgresqlTemplate } from './postgresql';
import { mysqlTemplate } from './mysql';
import { noneTemplate } from './none';

/**
 * Database template registry
 */
const databaseTemplates: Record<DatabaseDriver, () => DatabaseTemplateResult> = {
	sqlite: sqliteTemplate,
	postgresql: postgresqlTemplate,
	mysql: mysqlTemplate,
	none: noneTemplate,
};

/**
 * Get database template based on driver
 */
export function getDatabaseTemplate(driver: DatabaseDriver): DatabaseTemplateResult {
	return databaseTemplates[driver]();
}

/**
 * Get database selection options for prompts
 */
export function getDatabaseOptions(): { value: DatabaseDriver; name: string; description: string }[] {
	return [
		{ value: 'none', name: 'None', description: 'No database required' },
		{ value: 'sqlite', name: 'SQLite', description: 'Local file-based database' },
		{ value: 'postgresql', name: 'PostgreSQL', description: 'Production-ready relational database' },
		{ value: 'mysql', name: 'MySQL', description: 'Popular relational database' },
	];
}

export { sqliteTemplate, postgresqlTemplate, mysqlTemplate, noneTemplate };