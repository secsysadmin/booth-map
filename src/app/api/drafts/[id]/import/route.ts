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

/**
 * Parse the sponsorship column which contains tier + day info.
 * Formats:
 *   "Basic One-Day: Wednesday, January 28th [$1000.00]"
 *   "Gold Two-Day [$5500.00]"
 *   "Maroon Two-Day [$12500.00]"
 *   "Diamond One-Day: Thursday, January 29th [$4000.00]"
 */
function parseSponsorshipColumn(value: string): { sponsorship: Sponsorship; days: Day[] } | null {
  const v = value.trim()

  // Extract the tier name (first word before "One-Day" or "Two-Day")
  const tierMatch = v.match(/^(\w+)\s+(One-Day|Two-Day)/i)
  if (!tierMatch) return null

  const tierRaw = tierMatch[1].toUpperCase()
  if (!VALID_SPONSORSHIPS.includes(tierRaw as Sponsorship)) return null
  const sponsorship = tierRaw as Sponsorship

  const isTwoDay = tierMatch[2].toLowerCase() === "two-day"

  if (isTwoDay) {
    return { sponsorship, days: ["WEDNESDAY", "THURSDAY"] }
  }

  // One-Day: extract which day from the rest of the string
  if (/wednesday/i.test(v)) return { sponsorship, days: ["WEDNESDAY"] }
  if (/thursday/i.test(v)) return { sponsorship, days: ["THURSDAY"] }

  // Fallback: one-day but can't determine which — default to both
  return { sponsorship, days: ["WEDNESDAY", "THURSDAY"] }
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

  console.log("[import] Starting import for draft:", id)
  console.log("[import] File:", file.name, `(${file.size} bytes)`)

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  // Parse as array-of-arrays to support headerless CSVs (positional columns)
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

  console.log("[import] Total rows:", rows.length)

  const errors: string[] = []
  const companies: { name: string; days: Day[]; sponsorship: Sponsorship }[] =
    []

  // Detect if first row is a header (check if col B looks like a sponsorship value)
  let startIdx = 0
  if (rows.length > 0) {
    const firstSponsor = String(rows[0][1] || "")
    if (!parseSponsorshipColumn(firstSponsor)) {
      console.log("[import] Header row detected, skipping:", rows[0].slice(0, 3).join(" | "))
      startIdx = 1 // skip header row
    }
  }

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    const name = String(row[0] || "").trim()
    if (!name) {
      console.log(`[import] Row ${rowNum}: skipped (no name)`)
      errors.push(`Row ${rowNum}: missing company name`)
      continue
    }

    const sponsorshipRaw = String(row[1] || "").trim()
    const parsed = parseSponsorshipColumn(sponsorshipRaw)

    if (!parsed) {
      console.error(`[import] Row ${rowNum}: failed to parse "${sponsorshipRaw}"`)
      errors.push(`Row ${rowNum}: could not parse sponsorship "${sponsorshipRaw}"`)
      continue
    }

    console.log(`[import] Row ${rowNum}: ${name} → ${parsed.sponsorship} [${parsed.days.join(", ")}]`)
    companies.push({ name, days: parsed.days, sponsorship: parsed.sponsorship })
  }

  console.log("[import] Parsed", companies.length, "companies,", errors.length, "errors")

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

  console.log("[import] Done — created:", created, "updated:", updated, "errors:", errors.length)

  return NextResponse.json({
    success: true,
    created,
    updated,
    errors,
    total: companies.length,
  })
}
