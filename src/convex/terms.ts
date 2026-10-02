import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./_auth";
import { segmentWords } from "../processing/normalize";

/**
 * Per-clinician terminology overrides.
 *
 * The bundled lexicon is a floor, not a ceiling. Every real ward has local
 * vocabulary — a specific insulin brand, a local shorthand — and the fastest
 * way to capture it is for the clinician to type it once. Overrides keep the
 * same three safety tiers as the built-in list.
 */
export const listTerms = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const rows = await ctx.db
      .query("customTerms")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    return rows
      .map((row) => ({
        id: row._id,
        source: row.source,
        en: row.en,
        tier: row.tier as 1 | 2 | 3,
        category: row.category,
        createdAt: row.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const addTerm = mutation({
  args: {
    token: v.string(),
    source: v.string(),
    en: v.string(),
    tier: v.union(v.literal(1), v.literal(2), v.literal(3)),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const normalized = segmentWords(args.source).join(" ");
    const en = args.en.trim();

    if (normalized.length === 0) throw new Error("Enter the Persian form you hear in clinic.");
    if (!/^[A-Za-z][A-Za-z0-9 .%/-]*$/.test(en)) {
      throw new Error("The replacement must be a Latin clinical term.");
    }

    const duplicate = await ctx.db
      .query("customTerms")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("source"), normalized) && q.eq(q.field("en"), en))
      .first();
    if (duplicate) return duplicate._id;

    return await ctx.db.insert("customTerms", {
      userId: user._id,
      source: normalized,
      en,
      tier: args.tier,
      category: args.category,
      createdAt: Date.now(),
    });
  },
});

export const removeTerm = mutation({
  args: { token: v.string(), id: v.id("customTerms") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.token);
    const row = await ctx.db.get(args.id);
    if (!row || row.userId !== user._id) return false;
    await ctx.db.delete(args.id);
    return true;
  },
});
