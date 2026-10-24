import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import type {
  CreateChatRequest,
  CreateUserRequest,
  PostMessageRequest,
  RejectArtefactRequest,
  RegenerateRequest,
} from "@chotu/shared";
import { grantSignupCredits } from "../credits/stub.js";
import type { SqlClient } from "../db/client.js";
import { chatBus } from "../orchestrator/bus.js";
import {
  approveAllRemaining,
  approveArtefact,
  createOrchestratorContext,
  handleAnswer,
  regenerateArtefact,
  rejectArtefact,
  startChat,
  type OrchestratorContext,
} from "../orchestrator/machine.js";
import * as store from "../orchestrator/store.js";

export type V1Deps = {
  db: SqlClient;
  mock: boolean;
  /** Demo: single active user id for /v1/me until auth exists. */
  session: { userId: string | null };
};

export function createV1Router(deps: V1Deps): Router {
  const router = Router();
  const ctx: OrchestratorContext = createOrchestratorContext(deps.db, deps.mock);

  function requireUser(res: Response): string | null {
    if (!deps.session.userId) {
      res.status(401).json({ error: "signup_required" });
      return null;
    }
    return deps.session.userId;
  }

  router.post("/users", async (req, res) => {
    try {
      const body = req.body as CreateUserRequest;
      if (!body?.displayName?.trim()) {
        res.status(400).json({ error: "displayName required" });
        return;
      }
      const user = await store.insertUser(deps.db, {
        displayName: body.displayName.trim(),
        phoneOrEmail: body.phoneOrEmail?.trim(),
      });
      await grantSignupCredits(deps.db, {
        userId: user.id,
        amount: store.STARTER_CREDITS,
        ref: `signup:${user.id}`,
      });
      await store.logEvent(deps.db, { userId: user.id, kind: "signup", payload: {} });
      deps.session.userId = user.id;
      const refreshed = (await store.getUser(deps.db, user.id))!;
      res.status(201).json(refreshed);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "signup_failed" });
    }
  });

  router.get("/me", async (_req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    const user = await store.getUser(deps.db, userId);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(user);
  });

  router.post("/chats", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    try {
      const body = (req.body ?? {}) as CreateChatRequest;
      const opened = await startChat(ctx, {
        userId,
        title: body.title,
        initialMessage: body.initialMessage,
      });
      res.status(201).json(opened);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "chat_failed" });
    }
  });

  router.get("/chats/:id", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    const meta = await store.getChatMeta(deps.db, req.params.id);
    if (!meta || meta.userId !== userId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const video = await store.getVideoRow(deps.db, meta.videoId);
    const messages = await store.listMessages(deps.db, meta.chatId);
    const artefacts = await store.listArtefacts(deps.db, meta.videoId);
    res.json({
      chatId: meta.chatId,
      videoId: meta.videoId,
      stage: video?.stage ?? "brief",
      messages,
      artefacts,
    });
  });

  router.get("/chats/:id/messages", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    const meta = await store.getChatMeta(deps.db, req.params.id);
    if (!meta || meta.userId !== userId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ messages: await store.listMessages(deps.db, meta.chatId) });
  });

  router.post("/chats/:id/messages", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    const meta = await store.getChatMeta(deps.db, req.params.id);
    if (!meta || meta.userId !== userId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const body = (req.body ?? {}) as PostMessageRequest;
      if (body.answer) {
        const message = await handleAnswer(ctx, meta.chatId, body.answer, body.text);
        res.json({ accepted: true, message });
        return;
      }
      // Free text outside brief: acknowledge.
      const { appendMessage } = store;
      const message = await appendMessage(deps.db, {
        id: randomUUID(),
        chatId: meta.chatId,
        role: "user",
        kind: "text",
        text: body.text?.trim() || "…",
        createdAt: new Date().toISOString(),
      });
      chatBus.publish(meta.chatId, { type: "message", message });
      res.json({ accepted: true, message });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "message_failed" });
    }
  });

  router.get("/chats/:id/events", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    const meta = await store.getChatMeta(deps.db, req.params.id);
    if (!meta || meta.userId !== userId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: "heartbeat", ts: new Date().toISOString() });
    const unsubscribe = chatBus.subscribe(meta.chatId, send);
    const heartbeat = setInterval(() => {
      send({ type: "heartbeat", ts: new Date().toISOString() });
    }, 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  router.post("/artefacts/:id/approve", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    try {
      const artefact = await approveArtefact(ctx, { artefactId: req.params.id, userId });
      res.json({ artefact });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "approve_failed" });
    }
  });

  router.post("/artefacts/:id/reject", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    try {
      const body = (req.body ?? {}) as RejectArtefactRequest;
      if (!body.rejectNote?.trim()) {
        res.status(400).json({ error: "rejectNote required" });
        return;
      }
      const artefact = await rejectArtefact(ctx, {
        artefactId: req.params.id,
        userId,
        rejectNote: body.rejectNote.trim(),
      });
      res.json({ artefact });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "reject_failed" });
    }
  });

  router.post("/artefacts/:id/regenerate", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    try {
      const body = (req.body ?? {}) as RegenerateRequest;
      const confirmQuery = req.query.confirm;
      const confirm =
        body.confirm === true || confirmQuery === "1" || confirmQuery === "true";
      const result = await regenerateArtefact(ctx, {
        artefactId: req.params.id,
        userId,
        confirm,
        feedback: body.feedback,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "regenerate_failed" });
    }
  });

  router.post("/videos/:id/approve-all-remaining", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    try {
      const result = await approveAllRemaining(ctx, { videoId: req.params.id, userId });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "approve_all_failed" });
    }
  });

  router.get("/videos/:id", async (req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    const video = await store.getVideoRow(deps.db, req.params.id);
    if (!video || video.userId !== userId) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({
      video,
      scenes: await store.listScenes(deps.db, video.id),
      artefacts: await store.listArtefacts(deps.db, video.id),
    });
  });

  router.get("/cast", async (_req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    res.json({ items: await store.listCastMembers(deps.db) });
  });

  router.get("/voices", async (_req, res) => {
    const userId = requireUser(res);
    if (!userId) return;
    res.json({ items: await store.listVoices(deps.db) });
  });

  router.get("/packs", (_req, res) => {
    res.json({
      packs: [
        { id: "pack_100", label: "100 credits", credits: 100, amountInr: 99 },
        { id: "pack_300", label: "300 credits", credits: 300, amountInr: 249 },
      ],
    });
  });

  return router;
}

export type { Request };
