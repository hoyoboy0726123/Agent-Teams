// In-process pub/sub that fans out realtime events to WebSocket clients.
// Events are filtered per-connection by channel visibility in ws.js.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(0);

// kind: message.created | message.delta | message.updated | message.deleted | typing |
//       channel.updated | artifact.updated | memory.updated | workflow.updated | agent.updated
export const emit = (kind, payload) => bus.emit('event', { kind, ...payload });
