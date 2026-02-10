import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        cookie: cookieStore.toString(),
      },
    },
  })
}
