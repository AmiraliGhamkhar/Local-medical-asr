import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  hashPassword,
  newSalt,
  newToken,
  publicUser,
  timingSafeEqualHex,
  tokenExpiry,
} from "./_auth";

/**
 * Credentials and session tokens.
 *
 * Registration is a single mutation, so two concurrent sign-ups for the same
 * address cannot both win. Passwords are stretched with PBKDF2-SHA256 and
 * compared in constant time; a missing account and a wrong password take the
 * same code path so neither reveals which one failed.
 */

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const register = mutation({
  args: { name: v.string(), email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const email = normaliseEmail(args.email);
    const name = args.name.trim();

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (name.length < 2) throw new Error("Enter your full name.");
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters.");

    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("An account with that email already exists.");

    const salt = newSalt();
    const passwordHash = await hashPassword(args.password, salt);
    const userId = await ctx.db.insert("users", {
      name,
      email,
      salt,
      passwordHash,
      role: "clinician",
      createdAt: Date.now(),
    });

    const token = newToken();
    await ctx.db.insert("authTokens", { token, userId, expiresAt: tokenExpiry(), createdAt: Date.now() });

    return { token, user: { id: userId as string, name, email, role: "clinician" as const } };
  },
});

export const login = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const email = normaliseEmail(args.email);
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();

    const salt = user?.salt ?? "decoy-salt-for-constant-time-login";
    const candidate = await hashPassword(args.password, salt);
    const matches = timingSafeEqualHex(candidate, user?.passwordHash ?? candidate);

    if (!user || !matches) throw new Error("Incorrect email or password.");

    const token = newToken();
    await ctx.db.insert("authTokens", { token, userId: user._id, expiresAt: tokenExpiry(), createdAt: Date.now() });

    return { token, user: publicUser(user) };
  },
});
