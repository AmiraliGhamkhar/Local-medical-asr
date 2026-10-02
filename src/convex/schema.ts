import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex is the system of record for everything except the audio itself.
 *
 * No audio and no raw patient identifiers are stored: an utterance keeps the
 * text the acoustic model produced and the text the clinician accepted, which
 * is what an audit trail needs and what a data-minimisation policy can live
 * with.
 */
export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    /** PBKDF2-SHA256, hex encoded. Never returned by a public query. */
    passwordHash: v.string(),
    salt: v.string(),
    role: v.union(v.literal("clinician"), v.literal("admin")),
    createdAt: v.number(),
  })
    .index("email", ["email"]),

  authTokens: defineTable({
    token: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("token", ["token"])
    .index("userId", ["userId"]),

  dictationSessions: defineTable({
    userId: v.id("users"),
    title: v.string(),
    engine: v.string(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index("userId", ["userId"]),

  utterances: defineTable({
    userId: v.id("users"),
    sessionId: v.optional(v.id("dictationSessions")),
    /** Exactly what the acoustic model returned. */
    raw: v.string(),
    /** Script-normalised text, before terminology substitution. */
    normalized: v.string(),
    /** What the clinician copied into the chart. */
    final: v.string(),
    flags: v.array(
      v.object({
        kind: v.string(),
        severity: v.string(),
        term: v.string(),
        detail: v.string(),
        value: v.optional(v.number()),
        unit: v.optional(v.string()),
      }),
    ),
    pipelineMs: v.number(),
    createdAt: v.number(),
  })
    .index("userId", ["userId", "createdAt"])
    .index("sessionId", ["sessionId"]),

  customTerms: defineTable({
    userId: v.id("users"),
    source: v.string(),
    en: v.string(),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    category: v.string(),
    createdAt: v.number(),
  }).index("userId", ["userId"]),
});
