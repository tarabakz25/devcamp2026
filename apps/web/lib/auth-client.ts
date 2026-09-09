import { createAuthClient } from "better-auth/react";
import type { auth } from "./auth";

export const authClient = createAuthClient();

export type Session = typeof auth.$Infer.Session;
export type User = Session["user"];

export const { signIn, signOut } = authClient;

export function useSession() {
  const sessionStore = authClient.useSession();
  return sessionStore as unknown as {
    data: Session | null;
    isPending: boolean;
    isRefetching: boolean;
    error: any;
    refetch: () => Promise<void>;
  };
}
