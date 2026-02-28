/**
 * No Frontend Template
 *
 * Template for API-only or static website projects
 */

import type { FrontendTemplateResult } from "../project/types";

export function noneTemplate(): FrontendTemplateResult {
	return {
		files: [],
		directories: [],
		dependencies: {},
		devDependencies: {},
		scripts: {},
	};
}
