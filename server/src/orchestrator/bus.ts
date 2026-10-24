import { EventEmitter } from "node:events";
import type { SseEvent } from "@chotu/shared";

/** In-process SSE fan-out keyed by chat id. */
class ChatBus {
  private readonly emitters = new Map<string, EventEmitter>();

  private bus(chatId: string): EventEmitter {
    let emitter = this.emitters.get(chatId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(50);
      this.emitters.set(chatId, emitter);
    }
    return emitter;
  }

  publish(chatId: string, event: SseEvent): void {
    this.bus(chatId).emit("event", event);
  }

  subscribe(chatId: string, listener: (event: SseEvent) => void): () => void {
    const emitter = this.bus(chatId);
    emitter.on("event", listener);
    return () => {
      emitter.off("event", listener);
    };
  }
}

export const chatBus = new ChatBus();
