import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { env } from "../env.js";
import { logEvent } from "../events/store.js";

export const SignupBodySchema = z.object({
  name: z.string().min(1).max(80),
  contact: z.string().min(5).max(120), // email or phone
});
export type SignupBody = z.infer<typeof SignupBodySchema>;

export interface User {
  id: string;
  name: string;
  contact: string;
  credits: number;
  createdAt: string;
}

const users = new Map<string, User>();

export function signup(body: SignupBody): User {
  const existing = [...users.values()].find(
    (u) => u.contact.toLowerCase() === body.contact.trim().toLowerCase(),
  );
  if (existing) return existing;

  const user: User = {
    id: uuidv4(),
    name: body.name.trim(),
    contact: body.contact.trim(),
    credits: env.starterCredits,
    createdAt: new Date().toISOString(),
  };
  users.set(user.id, user);
  logEvent("signup", `Signup: ${user.name} <${user.contact}> (+${env.starterCredits} starter credits)`, {
    userId: user.id,
    meta: { starterCredits: env.starterCredits },
  });
  if (env.starterCredits > 0) {
    logEvent("credit_granted", `Starter pack: ${env.starterCredits} credit(s)`, {
      userId: user.id,
      meta: { credits: env.starterCredits, reason: "starter" },
    });
  }
  return user;
}

export function getUser(id: string): User | undefined {
  return users.get(id);
}

export function listUsers(): User[] {
  return [...users.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addCredits(userId: string, amount: number, reason: string): User {
  const user = users.get(userId);
  if (!user) throw new Error("User not found");
  user.credits += amount;
  logEvent("credit_granted", `${reason}: +${amount} credit(s) (balance ${user.credits})`, {
    userId,
    meta: { amount, balance: user.credits, reason },
  });
  return user;
}

export function spendCredit(userId: string, jobId: string): User {
  const user = users.get(userId);
  if (!user) throw new Error("User not found");
  if (user.credits < 1) throw new Error("No video credits left — buy a pack");
  user.credits -= 1;
  logEvent("credit_spent", `Spent 1 credit on job (balance ${user.credits})`, {
    userId,
    jobId,
    meta: { balance: user.credits },
  });
  return user;
}

export function toPublicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    contact: u.contact,
    credits: u.credits,
    createdAt: u.createdAt,
  };
}
