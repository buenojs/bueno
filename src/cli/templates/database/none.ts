/**
 * No Database Template
 *
 * Template for projects that don't need a database
 */

import type { DatabaseTemplateResult } from "../project/types";

export function noneTemplate(): DatabaseTemplateResult {
	return {
		files: [],
		directories: [],
		envConfig: undefined,
		configCode: undefined,
	};
}
