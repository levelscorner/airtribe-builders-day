import { EventEmitter } from "node:events";
import type { SseEvent } from "@chotu/shared";

export type BusFrame = {
  id: string;
  event: SseEvent;
};

const RING = 200;

/** In-process SSE fan-out keyed by chat id, with a small replay ring. */
class ChatBus {
  private readonly emitters = new Map<string, EventEmitter>();
  private readonly rings = new Map<string, BusFrame[]>();
  private seq = 0;

  private bus(chatId: string): EventEmitter {
    let emitter = this.emitters.get(chatId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(50);
      this.emitters.set(chatId, emitter);
    }
    return emitter;
  }

  private ring(chatId: string): BusFrame[] {
    let frames = this.rings.get(chatId);
    if (!frames) {
      frames = [];
      this.rings.set(chatId, frames);
    }
    return frames;
  }

  publish(chatId: string, event: SseEvent): BusFrame {
    this.seq += 1;
    const frame: BusFrame = { id: String(this.seq), event };
    const frames = this.ring(chatId);
    frames.push(frame);
    if (frames.length > RING) frames.splice(0, frames.length - RING);
    this.bus(chatId).emit("event", frame);
    return frame;
  }

  /** Frames after lastEventId (exclusive). Empty lastEventId → nothing (hydrate via GET). */
  replay(chatId: string, lastEventId: string | undefined): BusFrame[] {
    if (!lastEventId) return [];
    const frames = this.rings.get(chatId) ?? [];
    const idx = frames.findIndex((frame) => frame.id === lastEventId);
    if (idx === -1) return [...frames];
    return frames.slice(idx + 1);
  }

  subscribe(chatId: string, listener: (frame: BusFrame) => void): () => void {
    const emitter = this.bus(chatId);
    emitter.on("event", listener);
    return () => {
      emitter.off("event", listener);
    };
  }
}

export const chatBus = new ChatBus();
