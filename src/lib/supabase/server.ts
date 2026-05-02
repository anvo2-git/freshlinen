import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

function getSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "public-anon-key",
  };
}

// Server-side Supabase client for React Server Components and route handlers.
// Pulls the Clerk token from the incoming request via auth().getToken().
export async function createServerSupabaseClient() {
  const { getToken } = await auth();
  const { url, key } = getSupabaseConfig();

  return createClient(url, key, {
    accessToken: async () => (await getToken()) ?? null,
  });
}
