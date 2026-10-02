import type { DatabaseReader, DatabaseWriter } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type Ctx = { db: DatabaseReader } | { db: DatabaseWriter };

export interface AuthedUser {
  _id: Id<"users">;
  name: string;
  email: string;
  role: "clinician" | "admin";
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;

/**
 * Resolve a bearer token to a live user, or null.
 *
 * Tokens are looked up through an index rather than by document id, so a token
 * is never a guessable reference, and an expired token fails closed.
 */
export async function lookupUser(ctx: Ctx, token: string): Promise<AuthedUser | null> {
  if (!token) return null;

  const record = await ctx.db
    .query("authTokens")
    .withIndex("token", (q) => q.eq("token", token))
    .unique();

  if (!record || record.expiresAt < Date.now()) return null;

  return ((await ctx.db.get(record.userId)) as Doc<"users"> | null) ?? null;
}

/**
 * Same lookup, but for the functions that act on behalf of a clinician.
 *
 * An expired token must fail loudly here rather than silently doing nothing,
 * so the caller is told to sign in again instead of believing the write landed.
 */
export async function requireUser(ctx: Ctx, token: string): Promise<AuthedUser> {
  const user = await lookupUser(ctx, token);
  if (!user) throw new Error("Your session has expired. Sign in again.");
  return user;
}

export function publicUser(user: AuthedUser) {
  return { id: user._id as string, name: user.name, email: user.email, role: user.role };
}

const PBKDF2_ITERATIONS = 210_000;

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) {
    throw new Error("This deployment cannot hash passwords securely.");
  }
  return api;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** PBKDF2-SHA256 over a random per-user salt, using the runtime's WebCrypto. */
export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await subtle().importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "PBKDF2", salt: encoder.encode(saltHex), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

export function newSalt(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export function newToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

export function tokenExpiry(): number {
  return Date.now() + TOKEN_TTL_MS;
}

export { timingSafeEqualHex };
