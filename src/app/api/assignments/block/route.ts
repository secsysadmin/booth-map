import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { getBoothById } from "@/lib/booth-geometry"
import type { Day, BoothAssignment, Company } from "@/types"

const VALID_DAYS = new Set<Day>(["WEDNESDAY", "THURSDAY"])

function getBlockedName(boothId: string, day: Day) {
  return `Blocked Booth ${boothId} ${day}`
}

/** Accepts either a single `boothId` or a `boothIds` array. */
function readBoothIds(body: { boothId?: unknown; boothIds?: unknown }): string[] {
  if (Array.isArray(body.boothIds)) {
    return body.boothIds.filter((b): b is string => typeof b === "string")
  }
  if (typeof body.boothId === "string") return [body.boothId]
  return []
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { draftId, day } = body
  const boothIds = readBoothIds(body)

  if (!draftId || boothIds.length === 0 || !VALID_DAYS.has(day)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  if (boothIds.some((b) => !getBoothById(b))) {
    return NextResponse.json({ error: "Invalid booth" }, { status: 400 })
  }

  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId: user.id },
  })
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const existingAssignments = await prisma.boothAssignment.findMany({
    where: { draftId },
  })

  const takenOnDay = new Set<string>()
  for (const existing of existingAssignments) {
    if (existing.day === null || existing.day === day) {
      for (const bid of existing.boothIds) takenOnDay.add(bid)
    }
  }

  // Painting a block across a row will cross booths that are already taken.
  // Those are skipped rather than failing the whole stroke.
  const toBlock = [...new Set(boothIds)].filter((b) => !takenOnDay.has(b))

  if (toBlock.length === 0) {
    return NextResponse.json({ companies: [], assignments: [], skipped: boothIds.length })
  }

  const created = await prisma.$transaction(async (tx) => {
    const companies: Company[] = []
    const assignments: BoothAssignment[] = []

    for (const boothId of toBlock) {
      const company = await tx.company.create({
        data: {
          name: getBlockedName(boothId, day),
          days: [day],
          sponsorship: "BASIC",
          hasQueue: false,
          industry: "OTHER",
          isPlaceholder: true,
          draftId,
        },
      })
      const assignment = await tx.boothAssignment.create({
        data: { companyId: company.id, draftId, boothIds: [boothId], day },
      })
      companies.push(company as Company)
      assignments.push(assignment as BoothAssignment)
    }

    return { companies, assignments }
  })

  return NextResponse.json(
    { ...created, skipped: boothIds.length - toBlock.length },
    { status: 201 }
  )
}

/**
 * Unblocks booths. Three shapes:
 *   { assignmentId }            — one specific block
 *   { draftId, day, boothIds }  — the blocks covering those booths on that day
 *   { draftId, day, all: true } — every block on that day
 */
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { assignmentId, draftId, day } = body

  if (assignmentId) {
    const assignment = await prisma.boothAssignment.findUnique({
      where: { id: assignmentId },
      include: { draft: true, company: true },
    })

    if (!assignment || assignment.draft.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    if (assignment.company.isPlaceholder) {
      await prisma.company.delete({ where: { id: assignment.companyId } })
    } else {
      await prisma.boothAssignment.delete({ where: { id: assignmentId } })
    }

    return NextResponse.json({ success: true, removedCompanyIds: [assignment.companyId] })
  }

  if (!draftId || !VALID_DAYS.has(day)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId: user.id },
  })
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const blocked = await prisma.boothAssignment.findMany({
    where: { draftId, day, company: { isPlaceholder: true } },
  })

  const boothIds = readBoothIds(body)
  const targets =
    body.all === true
      ? blocked
      : blocked.filter((a) => a.boothIds.some((b) => boothIds.includes(b)))

  if (targets.length === 0) {
    return NextResponse.json({ success: true, removedCompanyIds: [] })
  }

  const removedCompanyIds = targets.map((a) => a.companyId)
  // Deleting the placeholder company cascades to its assignment.
  await prisma.company.deleteMany({ where: { id: { in: removedCompanyIds } } })

  return NextResponse.json({ success: true, removedCompanyIds })
}
