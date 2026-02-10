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
  const body = await req.json()
  const boothIds = body.boothIds
  const dayUpdate = body.day !== undefined ? body.day : undefined // null = both, "WEDNESDAY"/"THURSDAY" = single

  // Verify assignment belongs to user's draft
  const assignment = await prisma.boothAssignment.findUnique({
    where: { id },
    include: { draft: true },
  })

  if (!assignment || assignment.draft.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Check for booth conflicts (excluding this assignment)
  const existingAssignments = await prisma.boothAssignment.findMany({
    where: {
      draftId: assignment.draftId,
      id: { not: id },
    },
  })

  const effectiveDay = dayUpdate !== undefined ? dayUpdate : assignment.day
  const effectiveBooths = boothIds || assignment.boothIds

  for (const existing of existingAssignments) {
    const daysOverlap =
      existing.day === null ||
      effectiveDay === null ||
      existing.day === effectiveDay

    if (daysOverlap) {
      const conflict = existing.boothIds.some((bid: string) =>
        effectiveBooths.includes(bid)
      )
      if (conflict) {
        return NextResponse.json(
          { error: "Booth conflict" },
          { status: 409 }
        )
      }
    }
  }

  const data: Record<string, unknown> = {}
  if (boothIds) data.boothIds = effectiveBooths
  if (dayUpdate !== undefined) data.day = effectiveDay

  const updated = await prisma.boothAssignment.update({
    where: { id },
    data,
  })

  return NextResponse.json(updated)
}
