import { Event, EventContext, EventCategory, EventRegistry, EventRegistryOptions, EventRegistryState, EventError, EventStats } from './types';

export class EventRegistryImpl implements EventRegistry {
  private state: EventRegistryState;

  constructor(options: EventRegistryOptions = {}) {
    this.state = {
      events: new Map(),
      categories: new Map(),
      config: {
        maxEvents: options.maxEvents || 1000,
        retentionPeriod: options.retentionPeriod || 24 * 60 * 60 * 1000, // 24 hours
        cleanupInterval: options.cleanupInterval || 60 * 60 * 1000 // 1 hour
      }
    };

    this.setupCleanup();
  }

  registerEvent(event: Event): void {
    if (this.state.events.size >= this.state.config.maxEvents) {
      this.cleanupOldEvents();
    }

    this.state.events.set(event.id, event);
  }

  getEvent(id: string): Event | undefined {
    return this.state.events.get(id);
  }

  getEventsByCategory(category: string): Event[] {
    return Array.from(this.state.events.values()).filter(event => 
      event.context?.category === category
    );
  }

  getAllEvents(): Event[] {
    return Array.from(this.state.events.values());
  }

  getEventCategories(): EventCategory[] {
    return Array.from(this.state.categories.values());
  }

  registerEventCategory(category: EventCategory): void {
    this.state.categories.set(category.name, category);
  }

  getEventStats(): EventStats {
    return {
      totalEvents: this.state.events.size,
      eventsPerSecond: this.calculateEventsPerSecond(),
      listenersCount: 0, // Not tracked in registry
      errorsCount: 0, // Not tracked in registry
      averageProcessingTime: 0 // Not tracked in registry
    };
  }

  clearEvents(): void {
    this.state.events.clear();
  }

  private setupCleanup(): void {
    setInterval(() => {
      this.cleanupOldEvents();
    }, this.state.config.cleanupInterval);
  }

  private cleanupOldEvents(): void {
    const now = Date.now();
    const retentionTime = now - this.state.config.retentionPeriod;

    for (const [id, event] of this.state.events.entries()) {
      if (event.timestamp.getTime() < retentionTime) {
        this.state.events.delete(id);
      }
    }
  }

  private calculateEventsPerSecond(): number {
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    let count = 0;

    for (const event of this.state.events.values()) {
      if (event.timestamp.getTime() > oneSecondAgo) {
        count++;
      }
    }

    return count;
  }

  getEventHistory(options: {
    category?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Event[] {
    let events = Array.from(this.state.events.values());

    if (options.category) {
      events = events.filter(event => event.context?.category === options.category);
    }

    if (options.startTime) {
      events = events.filter(event => event.timestamp >= options.startTime);
    }

    if (options.endTime) {
      events = events.filter(event => event.timestamp <= options.endTime);
    }

    // Sort first before applying limit
    events = events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  searchEvents(query: string): Event[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.state.events.values()).filter(event => 
      event.name.toLowerCase().includes(lowerQuery) ||
      event.data && JSON.stringify(event.data).toLowerCase().includes(lowerQuery)
    );
  }

  exportEvents(): Event[] {
    return Array.from(this.state.events.values());
  }

  importEvents(events: Event[]): void {
    events.forEach(event => this.registerEvent(event));
  }

  getEventTimeline(): { timestamp: Date; eventCount: number }[] {
    const timeline: { timestamp: Date; eventCount: number }[] = [];
    const eventsByTime = new Map();

    for (const event of this.state.events.values()) {
      const timeKey = new Date(event.timestamp.getTime() - (event.timestamp.getTime() % (60 * 1000)));
      const count = eventsByTime.get(timeKey) || 0;
      eventsByTime.set(timeKey, count + 1);
    }

    for (const [time, count] of eventsByTime.entries()) {
      timeline.push({ timestamp: time, eventCount: count });
    }

    return timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }
}

export function createEventRegistry(options?: EventRegistryOptions): EventRegistry {
  return new EventRegistryImpl(options);
}