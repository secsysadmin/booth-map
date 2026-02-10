import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import * as XLSX from "xlsx"
import type { Day, Sponsorship } from "@/types"

const VALID_SPONSORSHIPS: Sponsorship[] = [
  "MAROON",
  "DIAMOND",
  "GOLD",
  "SILVER",
  "BASIC",
]

function normalizeDays(value: string): Day[] {
  const v = value.trim().toUpperCase()
  if (v === "BOTH" || v === "WEDNESDAY AND THURSDAY" || v === "WED & THU" || v === "W+T" || v === "W/TH") {
    return ["WEDNESDAY", "THURSDAY"]
  }
  if (v === "WEDNESDAY" || v === "WED" || v === "W") return ["WEDNESDAY"]
  if (v === "THURSDAY" || v === "THU" || v === "T" || v === "THURS") return ["THURSDAY"]
  return ["WEDNESDAY", "THURSDAY"] // default to both
}

function normalizeSponsorship(value: string): Sponsorship | null {
  const v = value.trim().toUpperCase()
  if (VALID_SPONSORSHIPS.includes(v as Sponsorship)) return v as Sponsorship
  return null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const draft = await prisma.draft.findFirst({
    where: { id, userId: user.id },
  })
  if (!draft)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file)
    return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)

  const errors: string[] = []
  const companies: { name: string; days: Day[]; sponsorship: Sponsorship }[] =
    []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2 // 1-indexed + header

    // Find name column (case-insensitive)
    const nameKey = Object.keys(row).find((k) =>
      k.toLowerCase().includes("name")
    )
    const dayKey = Object.keys(row).find(
      (k) =>
        k.toLowerCase().includes("day") ||
        k.toLowerCase().includes("days")
    )
    const sponsorKey = Object.keys(row).find(
      (k) =>
        k.toLowerCase().includes("sponsor") ||
        k.toLowerCase().includes("tier")
    )

    const name = nameKey ? row[nameKey]?.trim() : ""
    if (!name) {
      errors.push(`Row ${rowNum}: missing company name`)
      continue
    }

    const days = dayKey ? normalizeDays(row[dayKey] || "") : ["WEDNESDAY" as Day, "THURSDAY" as Day]

    const sponsorship = sponsorKey
      ? normalizeSponsorship(row[sponsorKey] || "")
      : "BASIC" as Sponsorship

    if (!sponsorship) {
      errors.push(
        `Row ${rowNum}: unknown sponsorship tier "${sponsorKey ? row[sponsorKey] : ""}"`
      )
      continue
    }

    companies.push({ name, days, sponsorship })
  }

  // Upsert companies
  let created = 0
  let updated = 0

  for (const c of companies) {
    const existing = await prisma.company.findFirst({
      where: { name: c.name, draftId: id },
    })

    if (existing) {
      await prisma.company.update({
        where: { id: existing.id },
        data: { days: c.days, sponsorship: c.sponsorship },
      })
      updated++
    } else {
      await prisma.company.create({
        data: { ...c, draftId: id },
      })
      created++
    }
  }

  return NextResponse.json({
    success: true,
    created,
    updated,
    errors,
    total: companies.length,
  })
}
