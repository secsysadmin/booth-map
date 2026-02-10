import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const original = await prisma.draft.findFirst({
    where: { id, userId: user.id },
    include: { companies: true, assignments: true },
  })

  if (!original)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Create new draft with copied data
  const newDraft = await prisma.draft.create({
    data: {
      name: `${original.name} (Copy)`,
      userId: user.id,
      companies: {
        create: original.companies.map((c) => ({
          name: c.name,
          days: c.days,
          sponsorship: c.sponsorship,
        })),
      },
    },
    include: { companies: true },
  })

  // Map old company IDs to new ones (by name)
  const companyMap = new Map<string, string>()
  for (const oldCompany of original.companies) {
    const newCompany = newDraft.companies.find(
      (c) => c.name === oldCompany.name
    )
    if (newCompany) {
      companyMap.set(oldCompany.id, newCompany.id)
    }
  }

  // Copy assignments
  for (const a of original.assignments) {
    const newCompanyId = companyMap.get(a.companyId)
    if (newCompanyId) {
      await prisma.boothAssignment.create({
        data: {
          companyId: newCompanyId,
          draftId: newDraft.id,
          boothIds: a.boothIds,
          day: a.day,
        },
      })
    }
  }

  return NextResponse.json(newDraft, { status: 201 })
}
