import { TextDecoder, TextEncoder } from "ext:bueno/web/encoding.js";
import { CustomEvent, Event, EventTarget } from "ext:bueno/web/events.js";
import {
	ByteLengthQueuingStrategy,
	CountQueuingStrategy,
} from "ext:bueno/web/streams.js";

globalThis.navigator = {};

// Event API
globalThis.Event = Event;
globalThis.CustomEvent = CustomEvent;
globalThis.EventTarget = EventTarget;

// Streams API
globalThis.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
globalThis.CountQueuingStrategy = CountQueuingStrategy;

// Text Encoding API
globalThis.TextDecoder = TextDecoder;
globalThis.TextEncoder = TextEncoder;
