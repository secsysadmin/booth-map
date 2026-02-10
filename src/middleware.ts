import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  // Public routes that don't require auth
  const publicPaths = ["/", "/api/auth"]
  const isPublic = publicPaths.some((path) =>
    request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith("/api/auth")
  )

  if (isPublic) {
    return NextResponse.next()
  }

  // API routes check auth via the auth helper, not middleware
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  // For dashboard routes, we let the client-side auth hook handle redirects
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
