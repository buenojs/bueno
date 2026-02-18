/**
 * Island Architecture Implementation
 *
 * Provides partial hydration capabilities:
 * - Mark components as interactive islands
 * - Framework-agnostic island definitions
 * - Lazy/eager/visible hydration strategies
 * - State serialization for islands
 */

import { createLogger, type Logger } from "../logger/index.js";
import type {
	IslandConfig,
	IslandDefinition,
	IslandHydrationStrategy,
	IslandRegistry,
	IslandRenderResult,
	IslandState,
	IslandHydrationScript,
	FrontendFramework,
	SSRElement,
} from "./types.js";

// ============= Constants =============

const ISLAND_MARKER = "data-island";
const ISLAND_ID = "data-island-id";
const ISLAND_COMPONENT = "data-island-component";
const ISLAND_PROPS = "data-island-props";
const ISLAND_STRATEGY = "data-island-strategy";

// ============= Island Manager Class =============

/**
 * Island Manager handles partial hydration of components
 *
 * Features:
 * - Register interactive components as islands
 * - Multiple hydration strategies (lazy, eager, visible, idle)
 * - Framework-agnostic island definitions
 * - State serialization for client hydration
 */
export class IslandManager {
	private registry: IslandRegistry = new Map();
	private logger: Logger;
	private islandCounter = 0;
	private framework: FrontendFramework;

	constructor(framework: FrontendFramework) {
		this.framework = framework;
		this.logger = createLogger({
			level: "debug",
			pretty: true,
			context: { component: "IslandManager" },
		});
	}

	/**
	 * Register an island component
	 */
	register(definition: IslandDefinition): string {
		const id = definition.id || `island-${++this.islandCounter}`;

		this.registry.set(id, {
			...definition,
			id,
		});

		this.logger.debug(`Registered island: ${id} (${definition.component})`);
		return id;
	}

	/**
	 * Register multiple islands
	 */
	registerAll(definitions: IslandDefinition[]): string[] {
		return definitions.map(def => this.register(def));
	}

	/**
	 * Unregister an island
	 */
	unregister(id: string): boolean {
		return this.registry.delete(id);
	}

	/**
	 * Get island by ID
	 */
	getIsland(id: string): IslandDefinition | undefined {
		return this.registry.get(id);
	}

	/**
	 * Get all registered islands
	 */
	getAllIslands(): IslandDefinition[] {
		return Array.from(this.registry.values());
	}

	/**
	 * Render an island to HTML
	 */
	renderIsland(
		componentName: string,
		props: Record<string, unknown> = {},
		options: Partial<IslandConfig> = {}
	): IslandRenderResult {
		const id = options.id || `island-${++this.islandCounter}`;
		const strategy = options.strategy || "lazy";

		// Find the island definition
		const definition = this.findIslandByComponent(componentName);

		if (!definition) {
			this.logger.warn(`Island not found: ${componentName}`);
			return {
				html: `<!-- Island not found: ${componentName} -->`,
				id,
				component: componentName,
				hydrated: false,
			};
		}

		// Generate the island HTML wrapper
		const propsJson = JSON.stringify(props);
		const escapedProps = this.escapeHtml(propsJson);

		const wrapperAttrs = {
			[ISLAND_MARKER]: "true",
			[ISLAND_ID]: id,
			[ISLAND_COMPONENT]: componentName,
			[ISLAND_PROPS]: escapedProps,
			[ISLAND_STRATEGY]: strategy,
		};

		const attrString = Object.entries(wrapperAttrs)
			.map(([key, value]) => `${key}="${value}"`)
			.join(" ");

		// Generate placeholder or SSR content
		const placeholder = options.placeholder || this.generatePlaceholder(componentName, props);

		const html = `<div ${attrString}>${placeholder}</div>`;

		return {
			html,
			id,
			component: componentName,
			hydrated: false,
			props,
			strategy,
		};
	}

	/**
	 * Render island with SSR content
	 */
	renderIslandSSR(
		componentName: string,
		ssrContent: string,
		props: Record<string, unknown> = {},
		options: Partial<IslandConfig> = {}
	): IslandRenderResult {
		const id = options.id || `island-${++this.islandCounter}`;
		const strategy = options.strategy || "lazy";

		const propsJson = JSON.stringify(props);
		const escapedProps = this.escapeHtml(propsJson);

		const wrapperAttrs = {
			[ISLAND_MARKER]: "true",
			[ISLAND_ID]: id,
			[ISLAND_COMPONENT]: componentName,
			[ISLAND_PROPS]: escapedProps,
			[ISLAND_STRATEGY]: strategy,
		};

		const attrString = Object.entries(wrapperAttrs)
			.map(([key, value]) => `${key}="${value}"`)
			.join(" ");

		const html = `<div ${attrString}>${ssrContent}</div>`;

		return {
			html,
			id,
			component: componentName,
			hydrated: false,
			props,
			strategy,
			ssrContent,
		};
	}

	/**
	 * Find island by component name
	 */
	private findIslandByComponent(componentName: string): IslandDefinition | undefined {
		for (const island of this.registry.values()) {
			if (island.component === componentName) {
				return island;
			}
		}
		return undefined;
	}

	/**
	 * Generate placeholder content
	 */
	private generatePlaceholder(
		componentName: string,
		props: Record<string, unknown>
	): string {
		// Generate a simple placeholder based on component type
		if (props.children && typeof props.children === "string") {
			return props.children;
		}

		// Return empty placeholder - will be filled on hydration
		return "";
	}

	/**
	 * Escape HTML in JSON string
	 */
	private escapeHtml(str: string): string {
		return str
			.replace(/&/g, "&")
			.replace(/</g, "<")
			.replace(/>/g, ">")
			.replace(/"/g, "\"")
			.replace(/'/g, "'");
	}

	/**
	 * Get hydration script for all islands
	 */
	getHydrationScript(): string {
		const islands = this.getAllIslands();
		const framework = this.framework;

		const islandData = islands.map(island => ({
			id: island.id,
			component: island.component,
			entry: island.entry,
			strategy: island.strategy,
		}));

		return `
(function() {
  const islands = ${JSON.stringify(islandData)};
  const framework = "${framework}";

  // Island hydration manager
  window.__ISLANDS__ = {
    pending: new Map(),
    hydrated: new Set(),
    registry: new Map(islands.map(i => [i.id, i])),

    // Hydrate a single island
    async hydrate(islandId) {
      if (this.hydrated.has(islandId)) return;

      const island = this.registry.get(islandId);
      if (!island) return;

      const element = document.querySelector('[data-island-id="' + islandId + '"]');
      if (!element) return;

      try {
        const props = JSON.parse(element.getAttribute('data-island-props') || '{}');
        const module = await import(island.entry);

        if (framework === 'react') {
          const { hydrate } = await import('react-dom/client');
          hydrate(module.default(element, props), element);
        } else if (framework === 'vue') {
          const { createApp } = await import('vue');
          createApp(module.default, props).mount(element, true);
        } else if (framework === 'svelte') {
          module.mount(element, { props, hydrate: true });
        } else if (framework === 'solid') {
          const { hydrate } = await import('solid-js/web');
          hydrate(() => module.default(props), element);
        }

        this.hydrated.add(islandId);
        console.log('[Islands] Hydrated:', islandId);
      } catch (error) {
        console.error('[Islands] Hydration failed:', islandId, error);
      }
    },

    // Hydrate all islands with eager strategy
    async hydrateEager() {
      for (const [id, island] of this.registry) {
        if (island.strategy === 'eager') {
          await this.hydrate(id);
        }
      }
    },

    // Hydrate islands when visible
    hydrateVisible() {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-island-id');
            if (id) this.hydrate(id);
            observer.unobserve(entry.target);
          }
        }
      }, { rootMargin: '50px' });

      for (const [id, island] of this.registry) {
        if (island.strategy === 'visible') {
          const element = document.querySelector('[data-island-id="' + id + '"]');
          if (element) observer.observe(element);
        }
      }
    },

    // Hydrate islands when idle
    hydrateIdle() {
      for (const [id, island] of this.registry) {
        if (island.strategy === 'idle') {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(() => this.hydrate(id));
          } else {
            setTimeout(() => this.hydrate(id), 1);
          }
        }
      }
    },

    // Hydrate lazy islands on interaction
    hydrateLazy() {
      for (const [id, island] of this.registry) {
        if (island.strategy === 'lazy') {
          const element = document.querySelector('[data-island-id="' + id + '"]');
          if (element) {
            const events = ['mouseenter', 'focus', 'touchstart', 'click'];
            const handler = () => {
              this.hydrate(id);
              events.forEach(e => element.removeEventListener(e, handler));
            };
            events.forEach(e => element.addEventListener(e, handler, { once: true }));
          }
        }
      }
    },

    // Initialize all islands
    init() {
      this.hydrateEager();
      this.hydrateVisible();
      this.hydrateIdle();
      this.hydrateLazy();
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.__ISLANDS__.init());
  } else {
    window.__ISLANDS__.init();
  }
})();
`;
	}

	/**
	 * Get client island script (minimal)
	 */
	getClientScript(): string {
		return `
import { createIslandHydrator } from 'bueno/frontend/islands-client';

const hydrator = createIslandHydrator('${this.framework}');
hydrator.init();
`;
	}

	/**
	 * Get island count
	 */
	getIslandCount(): number {
		return this.registry.size;
	}

	/**
	 * Clear all islands
	 */
	clear(): void {
		this.registry.clear();
		this.islandCounter = 0;
	}

	/**
	 * Get framework
	 */
	getFramework(): FrontendFramework {
		return this.framework;
	}

	/**
	 * Set framework
	 */
	setFramework(framework: FrontendFramework): void {
		this.framework = framework;
	}
}

// ============= Factory Function =============

/**
 * Create an island manager
 */
export function createIslandManager(framework: FrontendFramework): IslandManager {
	return new IslandManager(framework);
}

// ============= Utility Functions =============

/**
 * Create an island definition
 */
export function defineIsland(
	component: string,
	entry: string,
	options: Partial<IslandDefinition> = {}
): IslandDefinition {
	return {
		id: options.id || `island-${component}`,
		component,
		entry,
		strategy: options.strategy || "lazy",
		...options,
	};
}

/**
 * Element-like interface for DOM elements (for type checking without DOM lib)
 */
interface ElementLike {
	hasAttribute(name: string): boolean;
	getAttribute(name: string): string | null;
}

/**
 * Check if an element is an island
 */
export function isIslandElement(element: ElementLike): boolean {
	return element.hasAttribute(ISLAND_MARKER);
}

/**
 * Get island data from element
 */
export function getIslandData(element: ElementLike): IslandState | null {
	if (!isIslandElement(element)) {
		return null;
	}

	return {
		id: element.getAttribute(ISLAND_ID) || "",
		component: element.getAttribute(ISLAND_COMPONENT) || "",
		props: JSON.parse(element.getAttribute(ISLAND_PROPS) || "{}"),
		strategy: (element.getAttribute(ISLAND_STRATEGY) as IslandHydrationStrategy) || "lazy",
		hydrated: false,
	};
}

/**
 * Generate island wrapper attributes
 */
export function getIslandAttributes(
	id: string,
	component: string,
	props: Record<string, unknown>,
	strategy: IslandHydrationStrategy = "lazy"
): Record<string, string> {
	return {
		[ISLAND_MARKER]: "true",
		[ISLAND_ID]: id,
		[ISLAND_COMPONENT]: component,
		[ISLAND_PROPS]: JSON.stringify(props),
		[ISLAND_STRATEGY]: strategy,
	};
}

/**
 * Create island SSR element
 */
export function createIslandElement(
	id: string,
	component: string,
	props: Record<string, unknown>,
	strategy: IslandHydrationStrategy = "lazy",
	children?: SSRElement[]
): SSRElement {
	return {
		tag: "div",
		attrs: getIslandAttributes(id, component, props, strategy),
		children,
	};
}

/**
 * Parse islands from HTML string
 */
export function parseIslandsFromHTML(html: string): IslandState[] {
	const islands: IslandState[] = [];
	const regex = /data-island-id="([^"]+)"[^>]*data-island-component="([^"]+)"[^>]*data-island-props="([^"]+)"[^>]*data-island-strategy="([^"]+)"/g;

	let match;
	while ((match = regex.exec(html)) !== null) {
		islands.push({
			id: match[1],
			component: match[2],
			props: JSON.parse(match[3].replace(/"/g, '"').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')),
			strategy: match[4] as IslandHydrationStrategy,
			hydrated: false,
		});
	}

	return islands;
}

/**
 * Get hydration priority
 */
export function getHydrationPriority(strategy: IslandHydrationStrategy): number {
	const priorities: Record<IslandHydrationStrategy, number> = {
		eager: 1,
		visible: 2,
		idle: 3,
		lazy: 4,
	};

	return priorities[strategy] || 4;
}

/**
 * Sort islands by hydration priority
 */
export function sortIslandsByPriority(islands: IslandDefinition[]): IslandDefinition[] {
	return [...islands].sort(
		(a, b) => getHydrationPriority(a.strategy) - getHydrationPriority(b.strategy)
	);
}