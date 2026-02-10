import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const drafts = await prisma.draft.findMany({
    where: { userId: user.id },
    include: {
      _count: { select: { companies: true, assignments: true } },
    },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(drafts)
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { name } = await req.json()

  const draft = await prisma.draft.create({
    data: {
      name: name || "Untitled Draft",
      userId: user.id,
    },
  })

  return NextResponse.json(draft, { status: 201 })
}
