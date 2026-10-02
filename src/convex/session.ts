import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { lookupUser, publicUser, requireUser } from "./_auth";

/**
 * "Who am I?" has a legitimate answer of "nobody".
 *
 * An expired or forged token returns null rather than throwing, so the client
 * can sign the clinician out cleanly instead of surfacing a server error in
 * the middle of a consultation. Every function that actually writes still
 * throws via requireUser, so nothing fails silently.
 */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await lookupUser(ctx, args.token);
    return user ? publicUser(user) : null;
  },
});

export const startSession = mutation({
  args: { token: v.string(), title: v.string(), engine: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    return await ctx.db.insert("dictationSessions", {
      userId: user._id,
      title: args.title.trim().slice(0, 120) || "Untitled dictation",
      engine: args.engine,
      startedAt: Date.now(),
    });
  },
});

export const endSession = mutation({
  args: { token: v.string(), sessionId: v.id("dictationSessions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== user._id) return null;
    await ctx.db.patch(args.sessionId, { endedAt: Date.now() });
    return args.sessionId;
  },
});

export const listSessions = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const sessions = await ctx.db
      .query("dictationSessions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(20);

    return Promise.all(
      sessions.map(async (session) => {
        const utterances = await ctx.db
          .query("utterances")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .collect();
        return {
          id: session._id,
          title: session.title,
          engine: session.engine,
          startedAt: session.startedAt,
          endedAt: session.endedAt ?? null,
          utteranceCount: utterances.length,
        };
      }),
    );
  },
});

export const signOut = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("authTokens")
      .withIndex("token", (q) => q.eq("token", args.token))
      .unique();
    if (record) await ctx.db.delete(record._id);
    return true;
  },
});
