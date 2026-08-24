import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import type { RegistrationStatus } from "@/types"

const VALID_STATUSES = new Set<RegistrationStatus>([
  "CONFIRMED",
  "PENDING",
  "CANCELED",
])

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const updates = await req.json()

  if (
    updates.boothCount !== undefined &&
    (!Number.isInteger(updates.boothCount) || updates.boothCount < 1)
  ) {
    return NextResponse.json(
      { error: "Booth count must be a positive whole number" },
      { status: 400 }
    )
  }

  if (
    updates.status !== undefined &&
    !VALID_STATUSES.has(updates.status as RegistrationStatus)
  ) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

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
      ...(updates.boothCount !== undefined && {
        boothCount: updates.boothCount,
      }),
      ...(updates.hasQueue !== undefined && {
        hasQueue: updates.hasQueue,
      }),
      ...(updates.industry !== undefined && { industry: updates.industry }),
      ...(updates.status !== undefined && { status: updates.status }),
      ...(updates.contactName !== undefined && {
        contactName: updates.contactName || null,
      }),
      ...(updates.contactEmail !== undefined && {
        contactEmail: updates.contactEmail || null,
      }),
      ...(updates.contactPhone !== undefined && {
        contactPhone: updates.contactPhone || null,
      }),
    },
  })

  // A company that is no longer confirmed can't hold booths.
  if (updates.status !== undefined && updates.status !== "CONFIRMED") {
    await prisma.boothAssignment.deleteMany({ where: { companyId: id } })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const company = await prisma.company.findUnique({
    where: { id },
    include: { draft: true },
  })

  if (!company || company.draft.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Assignments cascade with the company.
  await prisma.company.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
