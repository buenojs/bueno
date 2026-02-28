export interface Event {
	id: string;
	name: string;
	timestamp: Date;
	data: Record<string, any>;
	context?: EventContext;
}

export interface EventContext {
	userId?: string;
	sessionId?: string;
	requestId?: string;
	ipAddress?: string;
	userAgent?: string;
}

export interface EventListener {
	id: string;
	name: string;
	handler: EventHandler;
	filter?: EventFilter;
	priority?: number;
	once?: boolean;
}

export type EventHandler = (event: Event) => Promise<void> | void;

export type EventFilter = (event: Event) => boolean;

export interface EventCategory {
	name: string;
	description: string;
	events: string[];
}

export interface EventManagerConfig {
	maxListeners?: number;
	eventCategories?: EventCategory[];
	middleware?: EventMiddleware[];
}

export type EventMiddleware = (
	event: Event,
	next: () => Promise<void>,
) => Promise<void>;

export interface EventRegistry {
	registerEvent(event: Event): void;
	getEvent(id: string): Event | undefined;
	getEventsByCategory(category: string): Event[];
	getAllEvents(): Event[];
}

export interface EventManager {
	emit(event: Event): Promise<void>;
	emitSync(event: Event): void;
	on(event: string, listener: EventHandler): () => void;
	once(event: string, listener: EventHandler): () => void;
	off(event: string, listener: EventHandler): void;
	addListener(listener: EventListener): void;
	removeListener(listener: EventListener): void;
	addFilter(filter: EventFilter): void;
	removeFilter(filter: EventFilter): void;
	addMiddleware(middleware: EventMiddleware): void;
	removeMiddleware(middleware: EventMiddleware): void;
	getListeners(event: string): EventListener[];
	hasListeners(event: string): boolean;
	clearListeners(event?: string): void;
	getEventCategories(): EventCategory[];
	registerEventCategory(category: EventCategory): void;
}

export interface EventError extends Error {
	event: Event;
	originalError?: Error;
}

export interface EventStats {
	totalEvents: number;
	eventsPerSecond: number;
	listenersCount: number;
	errorsCount: number;
	averageProcessingTime: number;
}

export interface EventOptions {
	context?: EventContext;
	timestamp?: Date;
	id?: string;
}

export interface EventListenerOptions {
	priority?: number;
	once?: boolean;
	filter?: EventFilter;
}

export interface EventManagerOptions {
	maxListeners?: number;
	eventCategories?: EventCategory[];
	middleware?: EventMiddleware[];
	errorHandling?: "throw" | "log" | "ignore";
}

export interface EventRegistryOptions {
	maxEvents?: number;
	retentionPeriod?: number;
	cleanupInterval?: number;
}

export interface EventManagerState {
	listeners: Map<string, EventListener[]>;
	filters: EventFilter[];
	middleware: EventMiddleware[];
	categories: EventCategory[];
	stats: EventStats;
	config: EventManagerConfig;
}

export interface EventRegistryState {
	events: Map<string, Event>;
	categories: Map<string, EventCategory>;
	config: EventRegistryOptions;
}
