import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"
import type { Day, Industry, Sponsorship } from "@/types"

const VALID_DAYS = new Set<Day>(["WEDNESDAY", "THURSDAY"])
const VALID_INDUSTRIES = new Set<Industry>([
  "AEROSPACE",
  "MECHANICAL",
  "ENERGY",
  "CHEMICALS",
  "OIL",
  "CIVIL",
  "TECH",
  "SEMICONDUCTORS",
  "OTHER",
])

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 })
  }

  const sponsorship = body.sponsorship as Sponsorship
  if (!(sponsorship in SPONSORSHIP_CONFIG)) {
    return NextResponse.json({ error: "Invalid sponsorship tier" }, { status: 400 })
  }

  const days: Day[] = Array.isArray(body.days)
    ? Array.from(new Set(body.days.filter((d: unknown) => VALID_DAYS.has(d as Day))))
    : ["WEDNESDAY", "THURSDAY"]
  if (days.length === 0) {
    return NextResponse.json({ error: "Pick at least one day" }, { status: 400 })
  }

  const boothCount =
    body.boothCount === undefined ? SPONSORSHIP_CONFIG[sponsorship].booths : Number(body.boothCount)
  if (!Number.isInteger(boothCount) || boothCount < 1) {
    return NextResponse.json(
      { error: "Booth count must be a positive whole number" },
      { status: 400 }
    )
  }

  const industry: Industry = VALID_INDUSTRIES.has(body.industry) ? body.industry : "OTHER"

  const draft = await prisma.draft.findFirst({ where: { id, userId: user.id } })
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const company = await prisma.company.create({
    data: {
      name,
      sponsorship,
      days,
      boothCount,
      industry,
      status: "CONFIRMED",
      draftId: id,
    },
  })

  return NextResponse.json(company, { status: 201 })
}
