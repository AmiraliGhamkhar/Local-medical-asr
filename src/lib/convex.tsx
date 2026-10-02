import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import type { ReactNode } from "react";

/**
 * Point the Convex client at the current origin by default.
 *
 * `VITE_CONVEX_PUBLIC_URL` wins when it is set to a real deployment, which is
 * how a hosted build would reach a cloud deployment. In the workspace the
 * backend is local and reached through the dev proxy at `/convex`, and the
 * client requires an absolute URL, so we resolve it against the origin the app
 * is actually served from.
 */
function resolveConvexUrl(): string {
  const configured = import.meta.env.VITE_CONVEX_PUBLIC_URL as string | undefined;
  if (configured && /^https?:\/\//.test(configured)) return configured;
  return `${window.location.origin}/convex`;
}

export const convex = new ConvexReactClient(resolveConvexUrl());

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

export { useMutation, useQuery };
