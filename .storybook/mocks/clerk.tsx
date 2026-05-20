import type { ReactNode } from "react";

type AuthState = {
  isLoaded: boolean;
  userId: string | null;
};

type SessionState = {
  session: null;
};

const signedOutAuthState: AuthState = {
  isLoaded: true,
  userId: null,
};

const signedOutSessionState: SessionState = {
  session: null,
};

export function ClerkProvider({
  children,
  ..._props
}: {
  children: ReactNode;
  publishableKey?: string;
  [key: string]: unknown;
}) {
  return <>{children}</>;
}

export function useAuth(): AuthState {
  return signedOutAuthState;
}

export function useSession(): SessionState {
  return signedOutSessionState;
}

export function Show({
  when,
  children,
}: {
  when: "signed-in" | "signed-out";
  children: ReactNode;
}) {
  return when === "signed-out" ? <>{children}</> : null;
}

export function SignInButton({
  children,
  ..._props
}: {
  children: ReactNode;
  mode?: string;
  [key: string]: unknown;
}) {
  return <>{children}</>;
}

export function UserButton() {
  return null;
}

export function SignedIn({ children }: { children: ReactNode }) {
  return null;
}

export function SignedOut({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SignUp({ children }: { children?: ReactNode }) {
  return <>{children ?? null}</>;
}

export function SignIn({ children }: { children?: ReactNode }) {
  return <>{children ?? null}</>;
}
