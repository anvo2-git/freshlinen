"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useSession } from "@clerk/nextjs";
import { useMemo } from "react";

function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "public-anon-key",
  };
}

// Browser-side Supabase client authed with the Clerk session token.
// Clerk issues a JWT whose `sub` claim Supabase maps to auth.jwt() ->> 'sub',
// which RLS policies on `favorites` / `perfume_notes` rely on.
//
// Requires: Clerk → Supabase Third-Party Auth integration configured in both
// dashboards. The `accessToken` callback is called on every request.
export function useSupabase(): SupabaseClient {
  const { session } = useSession();
  const { url, key } = getSupabaseConfig();

  return useMemo(
    () =>
      createClient(url, key, {
        accessToken: async () => (await session?.getToken()) ?? null,
      }),
    [session, url, key]
  );
}
