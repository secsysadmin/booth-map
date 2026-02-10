import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const draft = await prisma.draft.findFirst({
    where: { id, userId: user.id },
    include: {
      companies: true,
      assignments: true,
    },
  })

  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(draft)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { name } = await req.json()

  const draft = await prisma.draft.updateMany({
    where: { id, userId: user.id },
    data: { name },
  })

  if (draft.count === 0)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ success: true })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  await prisma.draft.deleteMany({
    where: { id, userId: user.id },
  })

  return NextResponse.json({ success: true })
}
