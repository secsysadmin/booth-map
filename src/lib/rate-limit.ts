import { NextRequest, NextResponse } from "next/server"

const windowMs = 60 * 1000 // 1 minute
const maxRequests = 60 // 60 requests per minute per IP

const hits = new Map<string, { count: number; resetAt: number }>()

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of hits) {
    if (now > val.resetAt) hits.delete(key)
  }
}, 5 * 60 * 1000)

function getIP(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

export function rateLimit(req: NextRequest): NextResponse | null {
  const ip = getIP(req)
  const now = Date.now()
  const entry = hits.get(ip)

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + windowMs })
    return null
  }

  entry.count++
  if (entry.count > maxRequests) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    )
  }

  return null
}
