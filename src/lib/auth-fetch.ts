import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

export async function authFetch(url: string, options: RequestInit = {}) {
  const supabase = getSupabaseBrowserClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    await supabase.auth.signOut()
    window.location.href = "/"
    throw error
  }
  const token = data.session?.access_token
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  // Only set Content-Type for non-FormData bodies
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json"
  }
  return fetch(url, { ...options, headers })
}
