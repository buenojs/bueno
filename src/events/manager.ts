import { Event, EventListener, EventFilter, EventMiddleware, EventManager, EventManagerConfig, EventManagerOptions, EventManagerState, EventError, EventStats, EventOptions, EventListenerOptions, EventHandler } from './types';

export class EventManagerImpl implements EventManager {
  private state: EventManagerState;

  constructor(options: EventManagerOptions = {}) {
    this.state = {
      listeners: new Map(),
      filters: [],
      middleware: [],
      categories: [],
      stats: {
        totalEvents: 0,
        eventsPerSecond: 0,
        listenersCount: 0,
        errorsCount: 0,
        averageProcessingTime: 0
      },
      config: {
        maxListeners: options.maxListeners || 100,
        eventCategories: options.eventCategories || [],
        middleware: options.middleware || []
      }
    };
  }

  async emit(event: Event): Promise<void> {
    // Validate event input - throw for null/undefined
    if (!event || typeof event !== 'object') {
      throw new Error('Event must be a valid object');
    }
    
    if (!event.name || typeof event.name !== 'string' || event.name.trim() === '') {
      this.handleError(event, new Error('Event name must be a non-empty string'));
      return;
    }
    
    if (!event.timestamp || !(event.timestamp instanceof Date)) {
      this.handleError(event, new Error('Event timestamp must be a valid Date object'));
      return;
    }
    
    if (!event.data || typeof event.data !== 'object') {
      this.handleError(event, new Error('Event data must be a valid object'));
      return;
    }
    
    this.state.stats.totalEvents++;
    const startTime = Date.now();

    try {
      // Apply middleware - if it fails, stop processing
      const middlewareSuccess = await this.applyMiddleware(event);
      if (!middlewareSuccess) {
        return; // Middleware failed, don't process handlers
      }

      // Filter event
      if (!this.shouldProcessEvent(event)) {
        return;
      }

      // Get listeners for this event
      const listeners = this.getListeners(event.name);

      // Process listeners
      await Promise.all(listeners.map(listener => this.processListener(event, listener)));

      // Update stats
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime);
    } catch (error) {
      this.handleError(event, error as Error);
      // Swallow error - don't rethrow
    }
  }

  private async applyMiddleware(event: Event): Promise<boolean> {
    const middleware = [...this.state.middleware];
    let index = 0;
    let middlewareFailed = false;
  
    const next = async (): Promise<void> => {
      if (index < middleware.length && !middlewareFailed) {
        const currentMiddleware = middleware[index];
        index++;
        try {
          await currentMiddleware(event, next);
        } catch (error) {
          middlewareFailed = true;
          this.handleError(event, error as Error);
          // Stop processing middleware but don't rethrow
          return;
        }
      }
    };
  
    await next();
    return !middlewareFailed; // Return false if middleware failed
  }

  emitSync(event: Event): void {
    this.emit(event).catch(error => {
      console.error('Error in synchronous event emission:', error);
    });
  }

  on(event: string, listener: EventHandler, options: EventListenerOptions = {}): () => void {
      // Validate listener input
      if (!listener || typeof listener !== 'function') {
        throw new Error('Listener must be a valid function');
      }
      
      // Validate event name
      if (!event || typeof event !== 'string' || event.trim() === '') {
        throw new Error('Event name must be a non-empty string');
      }
      
      const listenerId = this.generateListenerId();
      const eventListener: EventListener = {
        id: listenerId,
        name: event,
        handler: listener,
        priority: options.priority || 0,
        once: options.once || false,
        filter: options.filter
      };
  
      this.addListener(eventListener);
      return () => this.removeListener(eventListener);
    }
  
    once(event: string, listener: EventHandler): () => void {
      return this.on(event, listener, { once: true });
    }

  off(event: string, listener: EventHandler): void {
    const listeners = this.state.listeners.get(event) || [];
    const index = listeners.findIndex(l => l.handler === listener);

    if (index !== -1) {
      listeners.splice(index, 1);
      this.state.listeners.set(event, listeners);
      this.state.stats.listenersCount = this.getTotalListeners();
    }
  }

  addListener(listener: EventListener): void {
    const listeners = this.state.listeners.get(listener.name) || [];
    listeners.push(listener);
    this.state.listeners.set(listener.name, listeners);
    this.state.stats.listenersCount = this.getTotalListeners();
  }

  removeListener(listener: EventListener): void {
    const listeners = this.state.listeners.get(listener.name) || [];
    const index = listeners.findIndex(l => l.id === listener.id);

    if (index !== -1) {
      listeners.splice(index, 1);
      this.state.listeners.set(listener.name, listeners);
      this.state.stats.listenersCount = this.getTotalListeners();
    }
  }

  addFilter(filter: EventFilter): void {
    this.state.filters.push(filter);
  }

  removeFilter(filter: EventFilter): void {
    const index = this.state.filters.indexOf(filter);
    if (index !== -1) {
      this.state.filters.splice(index, 1);
    }
  }

  addMiddleware(middleware: EventMiddleware): void {
    this.state.middleware.push(middleware);
  }

  removeMiddleware(middleware: EventMiddleware): void {
    const index = this.state.middleware.indexOf(middleware);
    if (index !== -1) {
      this.state.middleware.splice(index, 1);
    }
  }

  getListeners(event: string): EventListener[] {
    return this.state.listeners.get(event) || [];
  }

  hasListeners(event: string): boolean {
    return this.getListeners(event).length > 0;
  }

  clearListeners(event?: string): void {
    if (event) {
      this.state.listeners.delete(event);
    } else {
      this.state.listeners.clear();
    }
    this.state.stats.listenersCount = this.getTotalListeners();
  }

  getEventCategories(): EventCategory[] {
    return [...this.state.categories];
  }
  
  registerEventCategory(category: EventCategory): void {
    if (!this.state.categories.find(c => c.name === category.name)) {
      this.state.categories.push(category);
    }
  }
  
  getEventsByCategory(categoryName: string): Event[] {
    return this.state.listeners.values().flatMap(listeners =>
      listeners.filter(listener => listener.name.startsWith(categoryName))
    ).map(listener => listener.handler);
  }

  private shouldProcessEvent(event: Event): boolean {
    try {
      return this.state.filters.every(filter => filter(event));
    } catch (error) {
      this.handleError(event, error as Error);
      return false;
    }
  }

  private async processListener(event: Event, listener: EventListener): Promise<void> {
    try {
      // Apply listener-level filter if present
      if (listener.filter) {
        const shouldProcess = listener.filter(event);
        if (!shouldProcess) {
          return;
        }
      }
      
      await listener.handler(event);
      if (listener.once) {
        this.removeListener(listener);
      }
    } catch (error) {
      this.handleError(event, error as Error, listener);
    }
  }

  private handleError(event: Event, error: Error, listener?: EventListener): void {
    this.state.stats.errorsCount++;
  
    const eventError: EventError = {
      ...error,
      event,
      originalError: error
    };
  
    // Log errors for debugging purposes (skip in test environment)
    // Check for common test environment indicators
    const isTestEnv = 
      process.env.NODE_ENV === 'test' || 
      typeof (globalThis as any).jest !== 'undefined' ||
      typeof (globalThis as any).describe !== 'undefined' && typeof (globalThis as any).it !== 'undefined';
    
    if (!isTestEnv) {
      console.error('Event error:', eventError);
    }
  
    // If listener is provided, remove it if it's a one-time listener that failed
    if (listener && listener.once) {
      this.removeListener(listener);
    }
  }
  
  
  // Event throttling utilities
  createEventThrottler(maxEvents: number, timeWindow: number): (event: Event) => boolean {
    let eventCount = 0;
    let lastResetTime = Date.now();

    return (event: Event) => {
      const currentTime = Date.now();
      if (currentTime - lastResetTime > timeWindow) {
        eventCount = 0;
        lastResetTime = currentTime;
      }

      if (eventCount < maxEvents) {
        eventCount++;
        return true;
      }

      return false;
    };
  }

  // Event debouncing utilities
  createEventDebouncer(waitTime: number): (event: Event) => Promise<void> {
    let timeout: NodeJS.Timeout | null = null;
    let lastEvent: Event | null = null;

    return (event: Event) => {
      lastEvent = event;
      return new Promise((resolve) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        timeout = setTimeout(async () => {
          if (lastEvent) {
            await this.emit(lastEvent);
            lastEvent = null;
            timeout = null;
          }
          resolve();
        }, waitTime);
      });
    };
  }

  private updateStats(processingTime: number): void {
    const stats = this.state.stats;
    stats.averageProcessingTime = (stats.averageProcessingTime + processingTime) / 2;
  }

  private getTotalListeners(): number {
    return Array.from(this.state.listeners.values()).reduce((total, listeners) => total + listeners.length, 0);
  }

  private generateListenerId(): string {
    return `lid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export function createEventManager(options?: EventManagerOptions): EventManager {
  return new EventManagerImpl(options);
}