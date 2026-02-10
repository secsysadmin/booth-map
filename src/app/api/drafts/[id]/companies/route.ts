import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(req)
  if (limited) return limited
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const draft = await prisma.draft.findFirst({
    where: { id, userId: user.id },
  })
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const companies = await prisma.company.findMany({
    where: { draftId: id },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(companies)
}
