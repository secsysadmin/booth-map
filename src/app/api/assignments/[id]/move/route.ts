import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { boothIds } = await req.json()

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

  for (const existing of existingAssignments) {
    const daysOverlap =
      existing.day === null ||
      assignment.day === null ||
      existing.day === assignment.day

    if (daysOverlap) {
      const conflict = existing.boothIds.some((bid: string) =>
        boothIds.includes(bid)
      )
      if (conflict) {
        return NextResponse.json(
          { error: "Booth conflict" },
          { status: 409 }
        )
      }
    }
  }

  const updated = await prisma.boothAssignment.update({
    where: { id },
    data: { boothIds },
  })

  return NextResponse.json(updated)
}
