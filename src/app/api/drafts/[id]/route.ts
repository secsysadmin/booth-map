import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getAuthUser } from "@/lib/auth"
import { getBoothById } from "@/lib/booth-geometry"
import { ALL_ROWS } from "@/lib/constants"
import type {
  Industry,
  IndustryRangeConfig,
  IndustryRangeSpec,
  IndustryZoneConfig,
} from "@/types"

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

function normalizeBoothId(raw: string): string | null {
  const value = raw.trim().toUpperCase()
  const match = value.match(/^([A-Q])\s*-?\s*(\d{1,2})$/)
  if (!match) return null
  const row = match[1]
  const num = parseInt(match[2], 10)
  const id = `${row}-${num}`
  return getBoothById(id) ? id : null
}

function normalizeIndustryRanges(raw: unknown): {
  value?: IndustryRangeConfig | null
  error?: string
} {
  if (raw === undefined) return { value: undefined }
  if (raw === null) return { value: null }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "industryRanges must be an object or null" }
  }

  const input = raw as Record<string, unknown>
  const output: IndustryRangeConfig = {}

  for (const [key, value] of Object.entries(input)) {
    if (!INDUSTRIES.includes(key as Industry)) {
      return { error: `Invalid industry key: ${key}` }
    }

    if (!Array.isArray(value)) {
      return { error: `Ranges for ${key} must be an array` }
    }

    const normalizedSpecs: IndustryRangeSpec[] = []
    for (const spec of value) {
      if (!spec || typeof spec !== "object") {
        return { error: `Invalid range entry for ${key}` }
      }

      const typed = spec as IndustryRangeSpec
      if (typed.type === "booth") {
        if (typeof typed.from !== "string" || typeof typed.to !== "string") {
          return { error: `Invalid booth range for ${key}` }
        }

        const fromId = normalizeBoothId(typed.from)
        const toId = normalizeBoothId(typed.to)
        if (!fromId || !toId) {
          return { error: `Invalid booth ID in ${key} ranges` }
        }

        normalizedSpecs.push({ type: "booth", from: fromId, to: toId })
      } else if (typed.type === "row") {
        if (typeof typed.from !== "string" || typeof typed.to !== "string") {
          return { error: `Invalid row range for ${key}` }
        }

        const fromRow = typed.from.trim().toUpperCase()
        const toRow = typed.to.trim().toUpperCase()
        if (!(ALL_ROWS as readonly string[]).includes(fromRow)) {
          return { error: `Invalid row in ${key} ranges` }
        }
        if (!(ALL_ROWS as readonly string[]).includes(toRow)) {
          return { error: `Invalid row in ${key} ranges` }
        }

        normalizedSpecs.push({ type: "row", from: fromRow, to: toRow })
      } else if (typed.type === "boothList") {
        const booths = Array.isArray(typed.booths) ? typed.booths : null
        if (!booths || booths.length === 0) {
          return { error: `Invalid booth list for ${key}` }
        }

        const normalized: string[] = []
        for (const boothRaw of booths) {
          if (typeof boothRaw !== "string") {
            return { error: `Invalid booth list for ${key}` }
          }
          const boothId = normalizeBoothId(boothRaw)
          if (!boothId) {
            return { error: `Invalid booth ID in ${key} list` }
          }
          normalized.push(boothId)
        }

        normalizedSpecs.push({ type: "boothList", booths: normalized })
      } else {
        return { error: `Invalid range type for ${key}` }
      }
    }

    output[key as Industry] = normalizedSpecs
  }

  return { value: output }
}

/**
 * The industry guide is presentation-only, so this checks shape rather than
 * validating rectangles against the booth layout — a zone is allowed to hang
 * over an aisle or off the edge of the grid.
 */
function normalizeIndustryZones(raw: unknown): {
  value?: IndustryZoneConfig | null
  error?: string
} {
  if (raw === undefined) return { value: undefined }
  if (raw === null) return { value: null }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "industryZones must be an object or null" }
  }

  const input = raw as Partial<IndustryZoneConfig>
  if (!Array.isArray(input.labels) || !Array.isArray(input.regions)) {
    return { error: "industryZones needs labels and regions arrays" }
  }

  const labels = input.labels.map((l) => ({
    id: String(l?.id ?? ""),
    name: String(l?.name ?? "").slice(0, 40),
    color: String(l?.color ?? "#93c5fd"),
  }))
  if (labels.some((l) => !l.id || !l.name)) {
    return { error: "Every industry zone label needs an id and a name" }
  }

  const labelIds = new Set(labels.map((l) => l.id))
  const regions = []
  for (const r of input.regions) {
    const id = String(r?.id ?? "")
    const labelId = String(r?.labelId ?? "")
    if (!id || !labelIds.has(labelId)) {
      return { error: "Every zone must reference an existing industry label" }
    }
    const nums = [r.x, r.y, r.w, r.h].map(Number)
    if (nums.some((n) => !Number.isFinite(n))) {
      return { error: "Zone coordinates must be numbers" }
    }
    regions.push({ id, labelId, x: nums[0], y: nums[1], w: nums[2], h: nums[3] })
  }

  return { value: { show: input.show === true, labels, regions } }
}

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
      googleConnection: {
        select: {
          email: true,
          googleUserId: true,
        },
      },
    },
  })

  if (!draft) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const userGoogleConnection = await prisma.googleConnection.findUnique({
    where: { userId: user.id },
    select: {
      email: true,
      googleUserId: true,
    },
  })

  return NextResponse.json({
    ...draft,
    googleConnection: draft.googleConnection ?? userGoogleConnection ?? null,
  })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: {
    name?: string
    capacityPerDay?: number
    industryRanges?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
    industryZones?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
    googleSheetUrl?: string | null
    googleWorksheetName?: string | null
  } = {}

  if (typeof body.name === "string") {
    data.name = body.name
  }

  if (body.capacityPerDay !== undefined) {
    const capacity = Number(body.capacityPerDay)
    if (!Number.isInteger(capacity) || capacity < 1) {
      return NextResponse.json(
        { error: "Capacity per day must be a positive whole number" },
        { status: 400 }
      )
    }
    data.capacityPerDay = capacity
  }

  if (Object.prototype.hasOwnProperty.call(body, "industryRanges")) {
    const normalized = normalizeIndustryRanges(body.industryRanges)
    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }
    if (normalized.value === null) {
      data.industryRanges = Prisma.JsonNull
    } else if (normalized.value !== undefined) {
      data.industryRanges = normalized.value as Prisma.InputJsonValue
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "industryZones")) {
    const normalized = normalizeIndustryZones(body.industryZones)
    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 })
    }
    if (normalized.value === null) {
      data.industryZones = Prisma.JsonNull
    } else if (normalized.value !== undefined) {
      data.industryZones = normalized.value as unknown as Prisma.InputJsonValue
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "googleSheetUrl")) {
    if (typeof body.googleSheetUrl === "string") {
      data.googleSheetUrl = body.googleSheetUrl.trim() || null
    } else if (body.googleSheetUrl === null) {
      data.googleSheetUrl = null
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "googleWorksheetName")) {
    if (typeof body.googleWorksheetName === "string") {
      data.googleWorksheetName = body.googleWorksheetName.trim() || null
    } else if (body.googleWorksheetName === null) {
      data.googleWorksheetName = null
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 })
  }

  const draft = await prisma.draft.updateMany({
    where: { id, userId: user.id },
    data,
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
