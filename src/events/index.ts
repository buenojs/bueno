export * from './types';
export * from './manager';
export * from './registry';

// Event creation utilities
export function createEvent<T = Record<string, any>>(
  name: string,
  data: T,
  options: EventOptions = {}
): Event {
  return {
    id: options.id || generateEventId(),
    name,
    timestamp: options.timestamp || new Date(),
    data,
    context: options.context
  };
}

export function createEventContext(context: Partial<EventContext> = {}): EventContext {
  return {
    userId: context.userId,
    sessionId: context.sessionId,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent
  };
}

// Event listener utilities
export function createEventListener(
  name: string,
  handler: EventHandler,
  options: EventListenerOptions = {}
): EventListener {
  return {
    id: generateListenerId(),
    name,
    handler,
    priority: options.priority || 0,
    once: options.once || false,
    filter: options.filter
  };
}

// Event filter utilities
export function createEventFilter(predicate: (event: Event) => boolean): EventFilter {
  return predicate;
}

// Event middleware utilities
export function createEventMiddleware(
  handler: (event: Event, next: () => Promise<void>) => Promise<void>
): EventMiddleware {
  return handler;
}

// Event category utilities
export function createEventCategory(
  name: string,
  description: string,
  events: string[] = []
): EventCategory {
  return { name, description, events };
}

// Helper functions
function generateEventId(): string {
  return `eid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateListenerId(): string {
  return `lid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Event validation utilities
export function validateEvent(event: Event): boolean {
  if (!event || typeof event !== 'object') return false;
  if (typeof event.id !== 'string' || !event.id) return false;
  if (typeof event.name !== 'string' || !event.name || event.name.trim() === '') {
    throw new Error('Event name must be a non-empty string');
  }
  if (!(event.timestamp instanceof Date)) return false;
  if (typeof event.data !== 'object') return false;
  return true;
}

export function validateEventListener(listener: EventListener): boolean {
  if (!listener || typeof listener !== 'object') return false;
  if (typeof listener.id !== 'string' || !listener.id) return false;
  if (typeof listener.name !== 'string' || !listener.name) return false;
  if (typeof listener.handler !== 'function') return false;
  if (listener.priority !== undefined && typeof listener.priority !== 'number') return false;
  if (listener.once !== undefined && typeof listener.once !== 'boolean') return false;
  if (listener.filter !== undefined && typeof listener.filter !== 'function') return false;
  return true;
}

// Event serialization utilities
export function serializeEvent(event: Event): string {
  return JSON.stringify({
    ...event,
    timestamp: event.timestamp.toISOString()
  });
}

export function deserializeEvent(serializedEvent: string): Event {
  const eventData = JSON.parse(serializedEvent);
  return {
    ...eventData,
    timestamp: new Date(eventData.timestamp)
  };
}

// Event timing utilities
export function measureEventProcessingTime(event: Event, callback: () => Promise<void>): Promise<number> {
  const startTime = Date.now();
  return callback().then(() => Date.now() - startTime);
}

// Event batching utilities
export function batchEvents(events: Event[], batchSize: number): Event[][] {
  const batches: Event[][] = [];
  for (let i = 0; i < events.length; i += batchSize) {
    batches.push(events.slice(i, i + batchSize));
  }
  return batches;
}

// Event throttling utilities
export function createEventThrottler(
  limit: number,
  windowMs: number
): (event: Event) => boolean {
  const events: Event[] = [];

  return (event: Event) => {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Remove old events
    while (events.length > 0 && events[0].timestamp.getTime() < windowStart) {
      events.shift();
    }

    if (events.length < limit) {
      events.push(event);
      return true;
    }

    return false;
  };
}

// Event debouncing utilities
export function createEventDebouncer(waitMs: number, emitFn: (event: Event) => Promise<void>): (event: Event) => Promise<void> {
  let timeout: NodeJS.Timeout;
  let lastEvent: Event | null = null;

  return (event: Event) => {
    lastEvent = event;

    return new Promise((resolve) => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        if (lastEvent) {
          await emitFn(lastEvent);
        }
        resolve();
      }, waitMs);
    });
  };
}

// Event priority utilities
export function sortListenersByPriority(listeners: EventListener[]): EventListener[] {
  return listeners.sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

// Event context utilities
export function mergeEventContexts(
  baseContext: EventContext,
  additionalContext: Partial<EventContext>
): EventContext {
  return {
    ...baseContext,
    ...additionalContext
  };
}

// Event error handling utilities
export function createEventError(
  event: Event,
  message: string,
  originalError?: Error
): EventError {
  const error = new Error(message) as EventError;
  error.event = event;
  error.originalError = originalError;
  return error;
}

// Event statistics utilities
export function calculateEventThroughput(events: Event[], timeWindowMs: number): number {
  const now = Date.now();
  const windowStart = now - timeWindowMs;
  const eventsInWindow = events.filter(event => event.timestamp.getTime() >= windowStart);
  return eventsInWindow.length / (timeWindowMs / 1000);
}

// Event filtering utilities
export function createCategoryFilter(category: string): EventFilter {
  return (event: Event) => event.context?.category === category;
}

export function createNameFilter(name: string | RegExp): EventFilter {
  return (event: Event) => {
    if (typeof name === 'string') {
      return event.name === name;
    }
    return name.test(event.name);
  };
}

// Event transformation utilities
export function transformEventData<T, U>(
  event: Event,
  transformer: (data: T) => U
): Event {
  return {
    ...event,
    data: transformer(event.data as T)
  };
}

// Event cloning utilities
export function cloneEvent(event: Event): Event {
  return {
    ...event,
    timestamp: new Date(event.timestamp.getTime())
  };
}

// Event comparison utilities
export function areEventsEqual(event1: Event, event2: Event): boolean {
  if (!event1 || !event2) return false;
  return (
    event1.id === event2.id &&
    event1.name === event2.name &&
    event1.timestamp.getTime() === event2.timestamp.getTime() &&
    JSON.stringify(event1.data) === JSON.stringify(event2.data) &&
    JSON.stringify(event1.context) === JSON.stringify(event2.context)
  );
}