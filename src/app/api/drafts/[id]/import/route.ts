import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getAuthUser } from "@/lib/auth"
import * as XLSX from "xlsx"
import type {
  Day,
  ImportPreviewItem,
  ParsedRegistration,
} from "@/types"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"
import { getBoothById } from "@/lib/booth-geometry"
import {
  diffRegistration,
  parseReport,
  parseRows,
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
      return { records: parseRows(rows, warnings), warnings, mode, preview }
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

function assignmentDay(days: Day[]): Day | null {
  const wed = days.includes("WEDNESDAY")
  const thu = days.includes("THURSDAY")
  if (wed && thu) return null
  if (wed) return "WEDNESDAY"
  if (thu) return "THURSDAY"
  return null
}

function daysOverlap(a: Day | null, b: Day | null): boolean {
  return a === null || b === null || a === b
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

  type Resolved = {
    key: string
    r: ParsedRegistration
    existing: (typeof existingCompanies)[number] | undefined
    boothCount: number
    dropsAssignment: boolean
  }

  const resolved: Resolved[] = []

  for (const [key, r] of incomingByKey) {
    const existing = existingByKey.get(key)

    if (!existing) {
      createdCount++
      items.push({
        name: r.name,
        registeredOn: r.registeredOn,
        kind: "new",
        changes: [],
        booths: r.assignedBooths,
      })
      resolved.push({
        key,
        r,
        existing: undefined,
        boothCount: r.boothCount,
        dropsAssignment: false,
      })
      continue
    }

    // A hand-set booth count survives a re-import, since a report without a
    // booth column has no idea about special deals. It's dropped when the tier
    // changes, because the old custom number almost certainly no longer
    // applies — and a count the report states outright beats both.
    const wasCustomized =
      existing.boothCount !== SPONSORSHIP_CONFIG[existing.sponsorship].booths
    const keepCustomCount =
      wasCustomized &&
      existing.sponsorship === r.sponsorship &&
      !r.boothCountFromReport
    const boothCount = keepCustomCount ? existing.boothCount : r.boothCount

    const changes = diffRegistration(existing, r)
    if (boothCount !== existing.boothCount) {
      changes.push(`booths ${existing.boothCount} → ${boothCount}`)
    }

    if (changes.length) {
      updatedCount++
      items.push({
        name: r.name,
        registeredOn: r.registeredOn,
        kind: "updated",
        changes,
        booths: r.assignedBooths,
      })
    } else {
      unchangedCount++
    }

    resolved.push({
      key,
      r,
      existing,
      boothCount,
      dropsAssignment:
        boothCount !== existing.boothCount || r.status !== "CONFIRMED",
    })
  }

  const removedCompanies =
    mode === "replace"
      ? existingCompanies.filter(
          (c) => !incomingByKey.has(registrationKey(c.name, c.registeredOn))
        )
      : []

  const existingAssignments = await prisma.boothAssignment.findMany({
    where: { draftId: id },
    select: { companyId: true, boothIds: true, day: true },
  })

  const losingAssignment = new Set<string>(
    resolved.filter((x) => x.existing && x.dropsAssignment).map((x) => x.existing!.id)
  )
  for (const c of removedCompanies) losingAssignment.add(c.id)

  const surviving = existingAssignments.filter(
    (a) => !losingAssignment.has(a.companyId)
  )
  const alreadyPlaced = new Set(surviving.map((a) => a.companyId))
  const claimed: { boothIds: string[]; day: Day | null }[] = surviving.map((a) => ({
    boothIds: a.boothIds,
    day: a.day as Day | null,
  }))

  const placements: { key: string; boothIds: string[]; day: Day | null }[] = []
  let unconfirmedWithBooths = 0
  let alreadyOnMap = 0

  for (const x of resolved) {
    const { r } = x
    if (r.assignedBooths.length === 0) continue
    const list = r.assignedBooths.join(", ")

    if (r.status !== "CONFIRMED") {
      unconfirmedWithBooths++
      continue
    }

    const unknown = r.assignedBooths.filter((b) => !getBoothById(b))
    if (unknown.length) {
      warnings.push(
        `“${r.name}”: ${unknown.join(", ")} is not on this floor plan, so the placement was skipped.`
      )
      continue
    }

    if (r.assignedBooths.length !== x.boothCount) {
      warnings.push(
        `“${r.name}”: ${r.assignedBooths.length} booths assigned but ${x.boothCount} booked, so ${list} was left unplaced.`
      )
      continue
    }

    if (x.existing && alreadyPlaced.has(x.existing.id)) {
      alreadyOnMap++
      continue
    }

    const day = assignmentDay(r.days)
    const taken = r.assignedBooths.filter((b) =>
      claimed.some((c) => daysOverlap(c.day, day) && c.boothIds.includes(b))
    )
    if (taken.length) {
      warnings.push(
        `“${r.name}”: ${taken.join(", ")} already taken, so the placement was skipped.`
      )
      continue
    }

    placements.push({ key: x.key, boothIds: r.assignedBooths, day })
    claimed.push({ boothIds: r.assignedBooths, day })
  }

  if (unconfirmedWithBooths) {
    warnings.push(
      `${unconfirmedWithBooths} registrations that aren't confirmed came with booth assignments. Only confirmed companies can hold booths, so those were left unplaced.`
    )
  }
  if (alreadyOnMap) {
    warnings.push(
      `${alreadyOnMap} companies are already placed on the map, so the booths the report gave them were ignored. Unassign them first to re-place from a report.`
    )
  }

  if (preview) {
    return NextResponse.json({
      parsed: incomingByKey.size,
      created: createdCount,
      updated: updatedCount,
      unchanged: unchangedCount,
      removed: removedCompanies.map((c) => c.name),
      placed: placements.length,
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

  // Writes are collected and sent in batches. One round-trip per registration
  // meant a 500-row report spent about a minute in pure network latency.
  const toCreate: Prisma.CompanyCreateManyInput[] = []
  const toUpdate: Prisma.PrismaPromise<unknown>[] = []

  for (const x of resolved) {
    const { r, existing, boothCount } = x

    if (!existing) {
      toCreate.push({
        name: r.name,
        days: r.days,
        sponsorship: r.sponsorship,
        boothCount,
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

  const createdCompanies = toCreate.length
    ? await prisma.company.createManyAndReturn({
        data: toCreate,
        select: { id: true, name: true, registeredOn: true },
      })
    : []

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

  let droppedAssignments = 0
  const invalidatedCompanyIds = resolved
    .filter((x) => x.existing && x.dropsAssignment)
    .map((x) => x.existing!.id)
  if (invalidatedCompanyIds.length) {
    const result = await prisma.boothAssignment.deleteMany({
      where: { draftId: id, companyId: { in: invalidatedCompanyIds } },
    })
    droppedAssignments = result.count
  }

  const companyIdByKey = new Map<string, string>()
  for (const c of createdCompanies) {
    companyIdByKey.set(registrationKey(c.name, c.registeredOn), c.id)
  }
  for (const x of resolved) {
    if (x.existing) companyIdByKey.set(x.key, x.existing.id)
  }

  const assignmentRows = placements
    .map((p) => {
      const companyId = companyIdByKey.get(p.key)
      return companyId
        ? { companyId, draftId: id, boothIds: p.boothIds, day: p.day }
        : null
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)

  let placedCount = 0
  if (assignmentRows.length) {
    const result = await prisma.boothAssignment.createMany({ data: assignmentRows })
    placedCount = result.count
  }

  return NextResponse.json({
    success: true,
    created: createdCount,
    updated: updatedCount,
    unchanged: unchangedCount,
    removed: removedCompanies.length,
    placed: placedCount,
    droppedAssignments,
    errors: warnings,
    total: incomingByKey.size,
  })
}
