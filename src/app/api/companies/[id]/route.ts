import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(req)
  if (limited) return limited
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const updates = await req.json()

  // Verify company belongs to user's draft
  const company = await prisma.company.findUnique({
    where: { id },
    include: { draft: true },
  })

  if (!company || company.draft.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updated = await prisma.company.update({
    where: { id },
    data: {
      name: updates.name,
      days: updates.days,
      sponsorship: updates.sponsorship,
    },
  })

  return NextResponse.json(updated)
}
