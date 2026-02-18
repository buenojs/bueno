import { describe, test, expect } from 'bun:test';
import {
  Span,
  SpanEvent,
  SpanKind,
  StatusCode,
  SpanStatus,
  SpanOptions,
  OTLPExporterOptions,
  SamplerType,
  TracerOptions,
  TraceContext,
  OTLPExporter,
  Tracer,
  generateTraceId,
  generateSpanId,
  nowNanoseconds,
  createTracer,
  traceMiddleware,
  traceDatabase,
  createTracedFetch,
  SpanBuilder,
  span,
} from '../../src/telemetry/index.ts';

describe('Telemetry Module', () => {
  test('generateTraceId should return 32 hex characters', () => {
    const traceId = generateTraceId();
    expect(traceId).toHaveLength(32);
    expect(/^[0-9a-f]{32}$/.test(traceId)).toBe(true);
  });

  test('generateSpanId should return 16 hex characters', () => {
    const spanId = generateSpanId();
    expect(spanId).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(spanId)).toBe(true);
  });

  test('nowNanoseconds should return a number', () => {
    const now = nowNanoseconds();
    expect(typeof now).toBe('number');
    expect(now).toBeGreaterThan(0);
  });

  test('Tracer should create spans', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation', { kind: 'internal' });
    
    expect(span.name).toBe('test-operation');
    expect(span.kind).toBe('internal');
    expect(span.traceId).toHaveLength(32);
    expect(span.spanId).toHaveLength(16);
    expect(span.ended).toBe(false);
  });

  test('Tracer should end spans', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    tracer.endSpan(span);
    
    expect(span.ended).toBe(true);
    expect(span.endTime).toBeDefined();
    expect(span.duration).toBeDefined();
    expect(span.duration).toBeGreaterThanOrEqual(0);
  });

  test('Tracer should add attributes', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    tracer.setAttribute(span, 'key1', 'value1');
    tracer.setAttribute(span, 'key2', 123);
    tracer.setAttribute(span, 'key3', true);
    
    expect(span.attributes['key1']).toBe('value1');
    expect(span.attributes['key2']).toBe(123);
    expect(span.attributes['key3']).toBe(true);
  });

  test('Tracer should add events', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    tracer.addEvent(span, 'event1', { detail: 'test' });
    
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('event1');
    expect(span.events[0].attributes).toEqual({ detail: 'test' });
  });

  test('Tracer should set status', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    tracer.setStatus(span, 'ok');
    expect(span.status.code).toBe('ok');
    
    tracer.setStatus(span, 'error', 'Something went wrong');
    expect(span.status.code).toBe('error');
    expect(span.status.message).toBe('Something went wrong');
  });

  test('Tracer should record errors', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    const error = new Error('Test error');
    tracer.setError(span, error);
    
    expect(span.status.code).toBe('error');
    expect(span.status.message).toBe('Test error');
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('exception');
  });

  test('Tracer.withSpan should manage span lifecycle', async () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    const result = await tracer.withSpan('test-operation', async (span) => {
      tracer.setAttribute(span, 'test', 'value');
      return 'success';
    });
    
    expect(result).toBe('success');
  });

  test('Tracer.withSpan should record errors', async () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    try {
      await tracer.withSpan('test-operation', async () => {
        throw new Error('Test error');
      });
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      expect((e as Error).message).toBe('Test error');
    }
  });

  test('Tracer should inject context', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    const carrier: Record<string, string> = {};
    tracer.injectContext(carrier, span);
    
    expect(carrier['traceparent']).toBeDefined();
    expect(carrier['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  test('Tracer should extract context', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    const carrier = {
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    };
    
    const context = tracer.extractContext(carrier);
    
    expect(context).not.toBeNull();
    expect(context!.traceId).toBe('0123456789abcdef0123456789abcdef');
    expect(context!.spanId).toBe('0123456789abcdef');
    expect(context!.traceFlags).toBe(1);
  });

  test('Tracer should return null for invalid traceparent', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    expect(tracer.extractContext({})).toBeNull();
    expect(tracer.extractContext({ traceparent: 'invalid' })).toBeNull();
  });

  test('createTracer should create a configured tracer', () => {
    const tracer = createTracer('my-service', {
      sampler: 'always',
    });
    
    expect(tracer).toBeInstanceOf(Tracer);
  });

  test('Tracer should support never sampler', () => {
    const tracer = new Tracer({ serviceName: 'test-service', sampler: 'never' });
    const span = tracer.startSpan('test-operation');
    
    // Span should still be created but not exported
    expect(span.name).toBe('test-operation');
  });

  test('Tracer should support probabilistic sampler', () => {
    const tracer = new Tracer({ 
      serviceName: 'test-service', 
      sampler: 'probabilistic',
      probability: 0.5,
    });
    
    // Create multiple spans and verify some are sampled
    const spans = [];
    for (let i = 0; i < 10; i++) {
      spans.push(tracer.startSpan('test-operation'));
    }
    
    // All spans should be created
    expect(spans).toHaveLength(10);
  });

  test('Tracer should create child spans', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const parentSpan = tracer.startSpan('parent-operation');
    
    const childSpan = tracer.startSpan('child-operation', { parent: parentSpan });
    
    expect(childSpan.traceId).toBe(parentSpan.traceId);
    expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
  });

  test('Tracer should set multiple attributes at once', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    tracer.setAttributes(span, {
      key1: 'value1',
      key2: 123,
      key3: true,
    });
    
    expect(span.attributes['key1']).toBe('value1');
    expect(span.attributes['key2']).toBe(123);
    expect(span.attributes['key3']).toBe(true);
  });

  test('Tracer should update span name', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    tracer.updateName(span, 'updated-operation');
    
    expect(span.name).toBe('updated-operation');
  });

  test('Tracer should not modify ended spans', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const span = tracer.startSpan('test-operation');
    
    tracer.endSpan(span);
    
    // These should be no-ops
    tracer.setAttribute(span, 'key', 'value');
    tracer.addEvent(span, 'event');
    tracer.setStatus(span, 'error');
    
    expect(span.attributes).toEqual({});
    expect(span.events).toHaveLength(0);
    expect(span.status.code).toBe('unset');
  });

  test('Tracer should get current span', async () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    expect(tracer.getCurrentSpan()).toBeNull();
    
    await tracer.withSpan('test-operation', async (span) => {
      expect(tracer.getCurrentSpan()).toBe(span);
    });
    
    expect(tracer.getCurrentSpan()).toBeNull();
  });

  test('SpanBuilder should provide fluent API', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    const spanObj = span(tracer, 'test-operation', { kind: 'server' })
      .setAttribute('key1', 'value1')
      .setAttributes({ key2: 123, key3: true })
      .addEvent('event1', { detail: 'test' })
      .setStatus('ok')
      .end();
    
    expect(spanObj.name).toBe('test-operation');
    expect(spanObj.kind).toBe('server');
    expect(spanObj.attributes['key1']).toBe('value1');
    expect(spanObj.attributes['key2']).toBe(123);
    expect(spanObj.events).toHaveLength(1);
    expect(spanObj.status.code).toBe('ok');
    expect(spanObj.ended).toBe(true);
  });

  test('OTLPExporter should be created with options', () => {
    const exporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      headers: { 'Authorization': 'Bearer token' },
      exportInterval: 5000,
      maxBatchSize: 100,
    });
    
    expect(exporter).toBeInstanceOf(OTLPExporter);
  });

  test('OTLPExporter should set service name', () => {
    const exporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
    });
    
    exporter.setServiceName('test-service');
    exporter.setResourceAttributes({ version: '1.0.0' });
  });

  test('OTLPExporter should handle empty flush', async () => {
    const exporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
    });
    
    // Should not throw
    await exporter.flush();
    await exporter.close();
  });

  test('traceDatabase should wrap database methods', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    const db = {
      query: async (sql: string) => [{ id: 1 }],
      execute: async (sql: string) => { },
    };
    
    const tracedDb = traceDatabase(tracer, db, 'postgresql');
    
    expect(typeof tracedDb.query).toBe('function');
    expect(typeof tracedDb.execute).toBe('function');
  });

  test('createTracedFetch should create traced fetch function', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    const tracedFetch = createTracedFetch(tracer);
    
    expect(typeof tracedFetch).toBe('function');
  });

  test('Tracer should start span from extracted context', () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    const context: TraceContext = {
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 1,
    };
    
    const span = tracer.startSpanFromContext('child-operation', context);
    
    expect(span.traceId).toBe(context.traceId);
    expect(span.parentSpanId).toBe(context.spanId);
  });

  test('Tracer should handle nested withSpan calls', async () => {
    const tracer = new Tracer({ serviceName: 'test-service' });
    
    await tracer.withSpan('parent', async (parentSpan) => {
      expect(tracer.getCurrentSpan()).toBe(parentSpan);
      
      await tracer.withSpan('child', async (childSpan) => {
        expect(tracer.getCurrentSpan()).toBe(childSpan);
        expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
        expect(childSpan.traceId).toBe(parentSpan.traceId);
      });
      
      expect(tracer.getCurrentSpan()).toBe(parentSpan);
    });
    
    expect(tracer.getCurrentSpan()).toBeNull();
  });
});