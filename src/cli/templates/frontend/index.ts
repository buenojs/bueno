/**
 * Frontend Templates
 *
 * Frontend framework-specific configuration templates
 */

import type { FrontendFramework, FrontendTemplateResult } from '../project/types';
import { reactTemplate } from './react';
import { vueTemplate } from './vue';
import { svelteTemplate } from './svelte';
import { solidTemplate } from './solid';
import { noneTemplate } from './none';

/**
 * Frontend template registry
 */
const frontendTemplates: Record<FrontendFramework, () => FrontendTemplateResult> = {
	react: reactTemplate,
	vue: vueTemplate,
	svelte: svelteTemplate,
	solid: solidTemplate,
	none: noneTemplate,
};

/**
 * Get frontend template based on framework
 */
export function getFrontendTemplate(framework: FrontendFramework): FrontendTemplateResult {
	return frontendTemplates[framework]();
}

/**
 * Get frontend selection options for prompts
 */
export function getFrontendOptions(): { value: FrontendFramework; name: string; description: string }[] {
	return [
		{ value: 'none', name: 'None', description: 'Static website or API only' },
		{ value: 'react', name: 'React', description: 'React with SSR support' },
		{ value: 'vue', name: 'Vue', description: 'Vue 3 with SSR support' },
		{ value: 'svelte', name: 'Svelte', description: 'Svelte with SSR support' },
		{ value: 'solid', name: 'Solid', description: 'SolidJS with SSR support' },
	];
}

export { reactTemplate, vueTemplate, svelteTemplate, solidTemplate, noneTemplate };