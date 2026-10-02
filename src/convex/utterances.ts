import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./_auth";

/**
 * The audit trail.
 *
 * For every utterance the clinician commits, we keep three things: the raw
 * acoustic output, the script-normalised form, and the text that was actually
 * accepted. A reviewer can always reconstruct what the model heard versus what
 * the rules did to it, which is the only way a clinical user can build trust
 * in an automatic rewrite.
 */
export const recordUtterance = mutation({
  args: {
    token: v.string(),
    sessionId: v.optional(v.id("dictationSessions")),
    raw: v.string(),
    normalized: v.string(),
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
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    return await ctx.db.insert("utterances", {
      userId: user._id,
      sessionId: args.sessionId,
      raw: args.raw.slice(0, 4000),
      normalized: args.normalized.slice(0, 4000),
      final: args.final.slice(0, 4000),
      flags: args.flags.slice(0, 40),
      pipelineMs: Math.max(0, Math.round(args.pipelineMs)),
      createdAt: Date.now(),
    });
  },
});

export const listUtterances = query({
  args: { token: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const rows = await ctx.db
      .query("utterances")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));

    return rows.map((row) => ({
      id: row._id,
      sessionId: row.sessionId ?? null,
      raw: row.raw,
      normalized: row.normalized,
      final: row.final,
      flags: row.flags,
      pipelineMs: row.pipelineMs,
      createdAt: row.createdAt,
    }));
  },
});

export const auditSummary = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const rows = await ctx.db
      .query("utterances")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);

    let flagged = 0;
    let dangerous = 0;
    let totalMs = 0;
    for (const row of rows) {
      if (row.flags.length > 0) flagged += 1;
      if (row.flags.some((f) => f.severity === "danger")) dangerous += 1;
      totalMs += row.pipelineMs;
    }

    return {
      utterances: rows.length,
      flagged,
      dangerous,
      avgPipelineMs: rows.length === 0 ? 0 : Math.round((totalMs / rows.length) * 10) / 10,
    };
  },
});

export const clearUtterances = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const rows = await ctx.db
      .query("utterances")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
