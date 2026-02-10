import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Verify assignment belongs to user's draft
  const assignment = await prisma.boothAssignment.findUnique({
    where: { id },
    include: { draft: true },
  })

  if (!assignment || assignment.draft.userId !== user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.boothAssignment.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
