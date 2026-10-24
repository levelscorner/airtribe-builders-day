import { Router } from "express";
import { SignupBodySchema, getUser, listUsers, signup, toPublicUser } from "../users/store.js";

export const usersRouter = Router();

usersRouter.post("/signup", (req, res) => {
  const parsed = SignupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const user = signup(parsed.data);
  res.status(201).json(toPublicUser(user));
});

usersRouter.get("/users/:id", (req, res) => {
  const user = getUser(req.params.id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(toPublicUser(user));
});

usersRouter.get("/users", (_req, res) => {
  res.json({ users: listUsers().map(toPublicUser) });
});
