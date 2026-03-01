/**
 * Fullstack Project Template
 *
 * Two-stage fullstack creation:
 * Stage 1: Creates API template (backend)
 * Stage 2: Runs add:frontend command (frontend)
 *
 * This template is actually just the API template.
 * The frontend is added via the add:frontend command,
 * making fullstack setup transparent and reusable.
 */

import { apiTemplate } from "./api";
import type { ProjectConfig, ProjectTemplateResult } from "./types";

export function fullstackTemplate(config: ProjectConfig): ProjectTemplateResult {
	// Stage 1: Return API template
	// Stage 2 will be handled by handleNew() in new.ts
	// which will automatically call add:frontend with the selected framework
	return apiTemplate(config);
}
