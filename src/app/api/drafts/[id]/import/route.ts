import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getAuthUser } from "@/lib/auth"
import * as XLSX from "xlsx"
import type {
  ImportPreviewItem,
  ParsedRegistration,
} from "@/types"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"
import {
  diffRegistration,
  fieldsToRecord,
  parseReport,
  registrationKey,
} from "@/lib/import-parser"

type ImportMode = "merge" | "replace"

/**
 * Reads the request body in either shape:
 *   - multipart/form-data with a `file` (plus optional `mode` / `preview`)
 *   - JSON `{ text, mode, preview }` for a pasted report
 */
async function readInput(req: NextRequest): Promise<
  | { error: string }
  | { records: ParsedRegistration[]; warnings: string[]; mode: ImportMode; preview: boolean }
> {
  const contentType = req.headers.get("content-type") || ""

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return { error: "No file provided" }

    const mode = (String(formData.get("mode") || "merge") as ImportMode) === "replace"
      ? "replace"
      : "merge"
    const preview = String(formData.get("preview") || "") === "true"
    const warnings: string[] = []

    // Spreadsheets go through SheetJS; anything text-shaped goes through the
    // report parser so block-format pastes saved as .txt still work.
    if (/\.xlsx?$/i.test(file.name)) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const workbook = XLSX.read(buffer, { type: "buffer" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
      const records: ParsedRegistration[] = []
      for (const row of rows) {
        const r = fieldsToRecord(row, warnings)
        if (r) records.push(r)
      }
      return { records, warnings, mode, preview }
    }

    const parsed = parseReport(await file.text())
    return { records: parsed.records, warnings: parsed.warnings, mode, preview }
  }

  const body = await req.json().catch(() => ({}))
  if (typeof body.text !== "string" || !body.text.trim()) {
    return { error: "No report text provided" }
  }
  const parsed = parseReport(body.text)
  return {
    records: parsed.records,
    warnings: parsed.warnings,
    mode: body.mode === "replace" ? "replace" : "merge",
    preview: body.preview === true,
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const draft = await prisma.draft.findFirst({ where: { id, userId: user.id } })
  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const input = await readInput(req)
  if ("error" in input) {
    return NextResponse.json({ error: input.error }, { status: 400 })
  }

  const { records, warnings, mode, preview } = input

  // Placeholders are blocked booths, not registrations — they never take part
  // in an import diff and are never removed by replace mode.
  const existingCompanies = await prisma.company.findMany({
    where: { draftId: id, isPlaceholder: false },
  })
  const existingByKey = new Map(
    existingCompanies.map((c) => [registrationKey(c.name, c.registeredOn), c])
  )

  // Last row wins if a report lists the same registration twice. That silently
  // shrinks the count against the file, so each collapsed row is called out.
  const incomingByKey = new Map<string, ParsedRegistration>()
  for (const r of records) {
    const key = registrationKey(r.name, r.registeredOn)
    if (incomingByKey.has(key)) {
      warnings.push(
        `“${r.name}” appears twice with the same registration date${
          r.registeredOn ? ` (${r.registeredOn})` : ""
        }. Only the last row was kept.`
      )
    }
    incomingByKey.set(key, r)
  }

  const items: ImportPreviewItem[] = []
  let createdCount = 0
  let updatedCount = 0
  let unchangedCount = 0

  for (const [key, r] of incomingByKey) {
    const existing = existingByKey.get(key)
    if (!existing) {
      createdCount++
      items.push({ name: r.name, registeredOn: r.registeredOn, kind: "new", changes: [] })
      continue
    }
    const changes = diffRegistration(existing, r)
    if (changes.length) {
      updatedCount++
      items.push({ name: r.name, registeredOn: r.registeredOn, kind: "updated", changes })
    } else {
      unchangedCount++
    }
  }

  const removedCompanies =
    mode === "replace"
      ? existingCompanies.filter(
          (c) => !incomingByKey.has(registrationKey(c.name, c.registeredOn))
        )
      : []

  if (preview) {
    return NextResponse.json({
      parsed: incomingByKey.size,
      created: createdCount,
      updated: updatedCount,
      unchanged: unchangedCount,
      removed: removedCompanies.map((c) => c.name),
      items,
      warnings,
    })
  }

  if (incomingByKey.size === 0) {
    return NextResponse.json(
      { error: "Nothing could be parsed from that report" },
      { status: 400 }
    )
  }

  // Companies whose assignment no longer makes sense after the import.
  const invalidatedCompanyIds: string[] = []

  // Writes are collected and sent in batches. One round-trip per registration
  // meant a 500-row report spent about a minute in pure network latency.
  const toCreate: Prisma.CompanyCreateManyInput[] = []
  const toUpdate: Prisma.PrismaPromise<unknown>[] = []

  for (const [key, r] of incomingByKey) {
    const existing = existingByKey.get(key)

    if (!existing) {
      toCreate.push({
        name: r.name,
        days: r.days,
        sponsorship: r.sponsorship,
        boothCount: r.boothCount,
        industry: r.industry,
        status: r.status,
        contactName: r.contactName || null,
        contactEmail: r.contactEmail || null,
        contactPhone: r.contactPhone || null,
        registeredOn: r.registeredOn || null,
        draftId: id,
      })
      continue
    }

    // A hand-set booth count survives a re-import, since the report has no idea
    // about special deals. It's dropped when the tier changes, because the old
    // custom number almost certainly no longer applies.
    const wasCustomized =
      existing.boothCount !== SPONSORSHIP_CONFIG[existing.sponsorship].booths
    const keepCustomCount =
      wasCustomized && existing.sponsorship === r.sponsorship
    const boothCount = keepCustomCount ? existing.boothCount : r.boothCount

    if (boothCount !== existing.boothCount || r.status !== "CONFIRMED") {
      invalidatedCompanyIds.push(existing.id)
    }

    toUpdate.push(
      prisma.company.update({
        where: { id: existing.id },
        data: {
          days: r.days,
          sponsorship: r.sponsorship,
          boothCount,
          industry: r.industry,
          status: r.status,
          // Only overwrite contact details the report actually carried.
          ...(r.contactName && { contactName: r.contactName }),
          ...(r.contactEmail && { contactEmail: r.contactEmail }),
          ...(r.contactPhone && { contactPhone: r.contactPhone }),
        },
      })
    )
  }

  if (toCreate.length) {
    await prisma.company.createMany({ data: toCreate })
  }

  // Chunked so a very large report doesn't build one oversized statement.
  const UPDATE_CHUNK = 100
  for (let i = 0; i < toUpdate.length; i += UPDATE_CHUNK) {
    await prisma.$transaction(toUpdate.slice(i, i + UPDATE_CHUNK))
  }

  if (removedCompanies.length) {
    await prisma.company.deleteMany({
      where: { id: { in: removedCompanies.map((c) => c.id) } },
    })
  }

  // Drop placements that the new data invalidated: a company that is no longer
  // confirmed can't hold booths, and a changed booth count no longer matches
  // the booths it was given.
  let droppedAssignments = 0
  if (invalidatedCompanyIds.length) {
    const result = await prisma.boothAssignment.deleteMany({
      where: { draftId: id, companyId: { in: invalidatedCompanyIds } },
    })
    droppedAssignments = result.count
  }

  return NextResponse.json({
    success: true,
    created: createdCount,
    updated: updatedCount,
    unchanged: unchangedCount,
    removed: removedCompanies.length,
    droppedAssignments,
    errors: warnings,
    total: incomingByKey.size,
  })
}
