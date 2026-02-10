import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { companyId, draftId, boothIds, day } = await req.json()

  // Verify draft belongs to user
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId: user.id },
  })
  if (!draft)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Check for booth conflicts
  const existingAssignments = await prisma.boothAssignment.findMany({
    where: { draftId },
  })

  for (const existing of existingAssignments) {
    // Check day overlap
    const daysOverlap =
      existing.day === null ||
      day === null ||
      existing.day === day

    if (daysOverlap) {
      const conflict = existing.boothIds.some((bid: string) =>
        boothIds.includes(bid)
      )
      if (conflict) {
        return NextResponse.json(
          { error: "Booth conflict: one or more booths are already assigned" },
          { status: 409 }
        )
      }
    }
  }

  // Upsert: if company already assigned in this draft, update
  const assignment = await prisma.boothAssignment.upsert({
    where: {
      companyId_draftId: { companyId, draftId },
    },
    create: { companyId, draftId, boothIds, day },
    update: { boothIds, day },
  })

  return NextResponse.json(assignment, { status: 201 })
}
