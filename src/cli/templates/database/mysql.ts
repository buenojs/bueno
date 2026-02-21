/**
 * MySQL Database Template
 */

import type { DatabaseTemplateResult } from '../project/types';

export function mysqlTemplate(): DatabaseTemplateResult {
	return {
		files: [],
		directories: [],
		envConfig: 'DATABASE_URL=mysql://user:password@localhost:3306/dbname',
		configCode: `{ url: process.env.DATABASE_URL ?? 'mysql://localhost/dbname' }`,
	};
}