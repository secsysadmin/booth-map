"use client"

import { useCallback } from "react"
import { useAuth } from "./use-auth"

export function useApi() {
  const { getToken } = useAuth()

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getToken()
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
    },
    [getToken]
  )

  return { apiFetch }
}
