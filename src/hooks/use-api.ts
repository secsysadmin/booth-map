"use client"

import { useCallback } from "react"
import { authFetch } from "@/lib/auth-fetch"

export function useApi() {
  const apiFetch = useCallback(
    (url: string, options: RequestInit = {}) => authFetch(url, options),
    []
  )

  return { apiFetch }
}
