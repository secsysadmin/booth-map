import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { ALL_ROWS, EDGE_ROWS } from "@/lib/constants"
import { getBoothById, getBoothLayout, getSegmentBooths } from "@/lib/booth-geometry"
import type { Day, BoothAssignment, Industry } from "@/types"

const VALID_DAYS = new Set<Day>(["WEDNESDAY", "THURSDAY"])
const INDUSTRIES: Industry[] = [
  "AEROSPACE",
  "MECHANICAL",
  "ENERGY",
  "CHEMICALS",
  "OIL",
  "CIVIL",
  "TECH",
  "SEMICONDUCTORS",
  "OTHER",
]

type RangeSpec =
  | { type: "row"; from: string; to: string }
  | { type: "booth"; from: string; to: string }
  | { type: "boothList"; booths: string[] }

function getSegmentOrder(row: string): number[] {
  return EDGE_ROWS.has(row) ? [2, 1] : [3, 2, 4, 1]
}

function findNextPlacement(
  count: number,
  occupied: Set<string>,
  allowed: Set<string>
): string[] | null {
  if (allowed.size === 0) return null

  const candidates: string[][] = []

  for (const row of ALL_ROWS) {
    const segmentOrder = getSegmentOrder(row)
    for (const segment of segmentOrder) {
      const segmentBooths = getSegmentBooths(row, segment)
      if (segmentBooths.length < count) continue

      for (let i = 0; i <= segmentBooths.length - count; i += 1) {
        const group = segmentBooths.slice(i, i + count)
        if (group.every((b) => !occupied.has(b.id) && allowed.has(b.id))) {
          candidates.push(group.map((b) => b.id))
        }
      }
    }
  }

  if (candidates.length === 0) return null
  const randomIndex = Math.floor(Math.random() * candidates.length)
  return candidates[randomIndex]
}

function normalizeBoothId(raw: string): string | null {
  const value = raw.trim().toUpperCase()
  const match = value.match(/^([A-Q])\s*-?\s*(\d{1,2})$/)
  if (!match) return null
  const row = match[1]
  const num = parseInt(match[2], 10)
  const id = `${row}-${num}`
  return getBoothById(id) ? id : null
}

function expandIndustryRanges(rawRanges: unknown): Map<Industry, Set<string>> {
  const layout = getBoothLayout()
  const rowIndex = new Map<string, number>(ALL_ROWS.map((row, idx) => [row, idx]))
  const rowNumbers = new Map<string, number[]>()
  for (const booth of layout) {
    const list = rowNumbers.get(booth.row) ?? []
    list.push(booth.number)
    rowNumbers.set(booth.row, list)
  }
  for (const [row, nums] of rowNumbers) {
    nums.sort((a, b) => a - b)
    rowNumbers.set(row, nums)
  }
  const result = new Map<Industry, Set<string>>()

  for (const industry of INDUSTRIES) {
    const allowed = new Set<string>()
    const specs = (rawRanges as Record<string, RangeSpec[]>)?.[industry] || []

    for (const spec of specs) {
      if (spec.type === "row") {
        const startIdx = rowIndex.get(spec.from.toUpperCase())
        const endIdx = rowIndex.get(spec.to.toUpperCase())
        if (startIdx === undefined || endIdx === undefined) continue
        const minIdx = Math.min(startIdx, endIdx)
        const maxIdx = Math.max(startIdx, endIdx)
        const allowedRows = new Set<string>(ALL_ROWS.slice(minIdx, maxIdx + 1))
        for (const booth of layout) {
          if (allowedRows.has(booth.row)) allowed.add(booth.id)
        }
      } else if (spec.type === "booth") {
        const fromId = normalizeBoothId(spec.from)
        const toId = normalizeBoothId(spec.to)
        if (!fromId || !toId) continue

        const fromBooth = getBoothById(fromId)
        const toBooth = getBoothById(toId)
        if (!fromBooth || !toBooth) continue

        const addRowRange = (row: string, start: number, end: number) => {
          const nums = rowNumbers.get(row)
          if (!nums) return
          const min = Math.min(start, end)
          const max = Math.max(start, end)
          for (const num of nums) {
            if (num >= min && num <= max) {
              allowed.add(`${row}-${num}`)
            }
          }
        }

        const addFullRow = (row: string) => {
          const nums = rowNumbers.get(row)
          if (!nums) return
          for (const num of nums) {
            allowed.add(`${row}-${num}`)
          }
        }

        if (fromBooth.row === toBooth.row) {
          addRowRange(fromBooth.row, fromBooth.number, toBooth.number)
        } else {
          const fromIdx = rowIndex.get(fromBooth.row)
          const toIdx = rowIndex.get(toBooth.row)
          if (fromIdx === undefined || toIdx === undefined) continue

          const [startRow, endRow, startNum, endNum] =
            fromIdx <= toIdx
              ? [fromBooth.row, toBooth.row, fromBooth.number, toBooth.number]
              : [toBooth.row, fromBooth.row, toBooth.number, fromBooth.number]

          const startNums = rowNumbers.get(startRow)
          const endNums = rowNumbers.get(endRow)
          if (!startNums || !endNums) continue

          addRowRange(startRow, startNum, startNums[startNums.length - 1])

          for (let idx = rowIndex.get(startRow)! + 1; idx < rowIndex.get(endRow)!; idx += 1) {
            addFullRow(ALL_ROWS[idx])
          }

          addRowRange(endRow, endNums[0], endNum)
        }
      } else if (spec.type === "boothList") {
        for (const boothRaw of spec.booths) {
          const id = normalizeBoothId(boothRaw)
          if (id) allowed.add(id)
        }
      }
    }

    result.set(industry, allowed)
  }

  return result
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { draftId, day } = await req.json()
  if (!draftId || !VALID_DAYS.has(day)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const draft = await prisma.draft.findFirst({
    where: { id: draftId, userId: user.id },
    include: { companies: true, assignments: true },
  })

  if (!draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const assignedCompanyIds = new Set(draft.assignments.map((a) => a.companyId))
  const occupied = new Set<string>()

  for (const assignment of draft.assignments) {
    if (assignment.day === null || assignment.day === day) {
      for (const boothId of assignment.boothIds) {
        occupied.add(boothId)
      }
    }
  }

  // Only confirmed registrations get a booth; pending ones are still a forecast.
  const unassignedCompanies = draft.companies.filter(
    (company) =>
      !company.isPlaceholder &&
      company.status === "CONFIRMED" &&
      !assignedCompanyIds.has(company.id) &&
      company.days.includes(day)
  )

  const industryRanges = expandIndustryRanges(draft.industryRanges)

  const assignmentData: Array<{
    companyId: string
    draftId: string
    boothIds: string[]
    day: Day | null
  }> = []

  for (const company of unassignedCompanies) {
    const boothCount = company.boothCount
    const allowed = industryRanges.get(company.industry) || new Set<string>()
    const placement = findNextPlacement(boothCount, occupied, allowed)
    if (!placement) continue

    const assignmentDay = company.days.length === 2 ? null : day
    assignmentData.push({
      companyId: company.id,
      draftId,
      boothIds: placement,
      day: assignmentDay,
    })

    for (const boothId of placement) {
      occupied.add(boothId)
    }
  }

  const created: BoothAssignment[] = assignmentData.length
    ? await prisma.$transaction(
        assignmentData.map((data) =>
          prisma.boothAssignment.create({ data })
        )
      )
    : []

  return NextResponse.json({
    created,
    placedCount: created.length,
    unassignedCount: unassignedCompanies.length,
    skippedCount: unassignedCompanies.length - created.length,
  })
}
