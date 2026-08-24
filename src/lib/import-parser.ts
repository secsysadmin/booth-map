import type {
  Day,
  Industry,
  ParsedRegistration,
  RegistrationStatus,
  Sponsorship,
} from "@/types"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"

const VALID_INDUSTRIES: Industry[] = [
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

const TIER_LEAD = /^\s*(maroon|diamond|gold|silver|basic)\b/i
const TIER_ONLY = /^\s*(maroon|diamond|gold|silver|basic)\s*$/i
const PRICE_MARKER = /\[\s*\$/
const DAY_LENGTH = /\b(one-day|two-day)\b/i
const STATUS_FIELD = /^\s*(confirmed|pending|cancell?ed)\s*$/i
// "Aug 10, 2026, 10:52 AM" — the report's "Registered On" column.
const DATE_FIELD = /^[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}/
const EMAIL_FIELD = /\S+@\S+\.\S+/
const PHONE_FIELD = /^[\d()\-\s.+x]{7,}$/
const BOOTH_IDS_FIELD = /^[A-Q]-?\d{1,2}(\s*,\s*[A-Q]-?\d{1,2})*$/i
const BOOTH_COUNT_FIELD = /^\d{1,2}$/

/**
 * Splits delimited text (CSV or TSV) honoring quoted fields, which may contain
 * the delimiter and even newlines (multi-major cells in the registration export
 * routinely do).
 */
export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      row.push(cur)
      cur = ""
    } else if (ch === "\n") {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ""
    } else if (ch !== "\r") {
      cur += ch
    }
  }

  if (cur !== "" || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

export interface ColumnHints {
  boothCount: number | null
  boothAssignment: number | null
}

const NO_HINTS: ColumnHints = { boothCount: null, boothAssignment: null }

function readColumnHints(fields: string[]): ColumnHints {
  const hints: ColumnHints = { boothCount: null, boothAssignment: null }
  fields.forEach((f, i) => {
    const h = f.trim().toLowerCase()
    if (
      hints.boothCount === null &&
      /^(number of booths|# of booths|booth count|booths)$/.test(h)
    ) {
      hints.boothCount = i
    }
    if (
      hints.boothAssignment === null &&
      /(booths? assigned|assigned booths?|booth assignment)/.test(h)
    ) {
      hints.boothAssignment = i
    }
  })
  return hints
}

function normalizeBoothIds(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((part) => part.trim().toUpperCase().replace(/^([A-Q])-?(\d{1,2})$/, "$1-$2"))
    .filter(Boolean)
}

function isHeaderRow(fields: string[]): boolean {
  const first = (fields[0] || "").trim().toLowerCase()
  // "Company Name", "Organization Name", "Name", "Company", "Employer" — the
  // exporters in use all label the first column some variation of this.
  if (/^(organization|company|employer|account)?\s*name$/.test(first)) return true
  if (first === "company" || first === "organization" || first === "employer")
    return true
  const joined = fields.join(" ").toLowerCase()
  if (joined.includes("representative registering")) return true
  return joined.includes("organization name") && joined.includes("package")
}

function findSponsorshipField(fields: string[]): string | null {
  // The registration report writes the package as "Gold Two-Day [$5500.00]".
  for (const f of fields) if (PRICE_MARKER.test(f) && TIER_LEAD.test(f)) return f
  for (const f of fields) if (DAY_LENGTH.test(f) && TIER_LEAD.test(f)) return f
  // Bare tier name in any column but the company name.
  for (let i = 1; i < fields.length; i++) {
    if (TIER_ONLY.test(fields[i])) return fields[i]
  }
  return null
}

function toSponsorship(pkg: string): Sponsorship | null {
  const m = pkg.match(TIER_LEAD)
  if (!m) return null
  return m[1].toUpperCase() as Sponsorship
}

function toStatus(raw: string): RegistrationStatus {
  const s = raw.trim().toLowerCase()
  if (s === "confirmed") return "CONFIRMED"
  if (s === "pending") return "PENDING"
  return "CANCELED"
}

function findIndustry(fields: string[]): Industry {
  for (let i = 1; i < fields.length; i++) {
    const candidate = fields[i].trim().toUpperCase()
    if (candidate && VALID_INDUSTRIES.includes(candidate as Industry)) {
      return candidate as Industry
    }
  }
  return "OTHER"
}

/**
 * Turns one registration's fields — lines of a pasted block, or cells of a
 * CSV/TSV/XLSX row — into a record.
 *
 * Fields are matched by shape rather than position, so extra or reordered
 * columns (Wi-Fi, booth location, majors) don't break the import. Only the
 * company name and a recognizable package are required; everything else falls
 * back to a default. That keeps the older three-column
 * "Name, Sponsorship, Industry" sheet importable alongside the full report.
 */
export function fieldsToRecord(
  rawFields: unknown[],
  warnings: string[],
  hints: ColumnHints = NO_HINTS
): ParsedRegistration | null {
  const fields = rawFields.map((f) => String(f ?? "").trim())
  const nonEmpty = fields.filter(Boolean)
  if (nonEmpty.length === 0) return null
  if (isHeaderRow(fields)) return null

  const name = fields[0]
  if (!name) {
    warnings.push("Skipped an entry with an empty organization name.")
    return null
  }

  const pkg = findSponsorshipField(fields)
  if (!pkg) {
    warnings.push(
      `“${name}”: no sponsorship package found (looked for a field like “Gold Two-Day [$5500.00]”). Skipped.`
    )
    return null
  }

  const sponsorship = toSponsorship(pkg)
  if (!sponsorship) {
    warnings.push(
      `“${name}”: couldn't identify the tier from “${pkg}”. Skipped.`
    )
    return null
  }

  let wednesday = false
  let thursday = false
  let status: RegistrationStatus | null = null
  let registeredOn = ""
  let contactEmail = ""
  let contactPhone = ""

  for (const f of fields) {
    if (!f) continue
    if (!contactEmail && f.indexOf("@") > 0 && EMAIL_FIELD.test(f) && !f.includes(","))
      contactEmail = f
    if (/\bday\s*1\s*\(/i.test(f)) wednesday = true
    if (/\bday\s*2\s*\(/i.test(f)) thursday = true
    if (STATUS_FIELD.test(f)) status = toStatus(f)
    if (!registeredOn && DATE_FIELD.test(f)) registeredOn = f
    if (!contactPhone && PHONE_FIELD.test(f) && /\d{7}/.test(f.replace(/\D/g, "")))
      contactPhone = f
  }

  // No explicit day columns — fall back to what the package text says.
  if (!wednesday && !thursday) {
    if (/two[-\s]?day/i.test(pkg)) {
      wednesday = true
      thursday = true
    } else if (/wednesday/i.test(pkg)) {
      wednesday = true
    } else if (/thursday/i.test(pkg)) {
      thursday = true
    }
  }
  // Still nothing (e.g. a bare "Gold" cell): assume the company attends both.
  if (!wednesday && !thursday) {
    wednesday = true
    thursday = true
  }

  const days: Day[] = []
  if (wednesday) days.push("WEDNESDAY")
  if (thursday) days.push("THURSDAY")

  // A sheet without a status column is a roster of companies that are going,
  // which is what the importer meant before statuses existed.
  const resolvedStatus: RegistrationStatus = status ?? "CONFIRMED"

  const assignmentField =
    hints.boothAssignment !== null
      ? fields[hints.boothAssignment] || ""
      : fields.slice(1).find((f) => f && BOOTH_IDS_FIELD.test(f)) || ""
  const assignedBooths = assignmentField ? normalizeBoothIds(assignmentField) : []

  let reportedBoothCount: number | null = null
  const countField =
    hints.boothCount !== null ? fields[hints.boothCount] || "" : ""
  if (countField && BOOTH_COUNT_FIELD.test(countField)) {
    const n = parseInt(countField, 10)
    if (n >= 1) reportedBoothCount = n
  }

  // Column 2 is the contact name in the report, but only when it isn't
  // something we already recognized as another field.
  const second = fields[1] || ""
  const contactName =
    second &&
    second !== contactEmail &&
    second !== contactPhone &&
    second !== pkg &&
    second !== registeredOn &&
    second !== assignmentField &&
    !STATUS_FIELD.test(second) &&
    !BOOTH_IDS_FIELD.test(second) &&
    !VALID_INDUSTRIES.includes(second.toUpperCase() as Industry)
      ? second
      : ""

  return {
    name,
    days,
    sponsorship,
    boothCount: reportedBoothCount ?? SPONSORSHIP_CONFIG[sponsorship].booths,
    boothCountFromReport: reportedBoothCount !== null,
    assignedBooths,
    industry: findIndustry(fields),
    status: resolvedStatus,
    contactName,
    contactEmail,
    contactPhone,
    registeredOn,
  }
}

export function parseRows(
  rows: unknown[][],
  warnings: string[]
): ParsedRegistration[] {
  let hints = NO_HINTS
  for (const row of rows) {
    const fields = row.map((f) => String(f ?? "").trim())
    if (isHeaderRow(fields)) {
      hints = readColumnHints(fields)
      break
    }
  }

  const records: ParsedRegistration[] = []
  for (const row of rows) {
    const r = fieldsToRecord(row, warnings, hints)
    if (r) records.push(r)
  }
  return records
}

/**
 * Accepts three shapes and auto-detects which one it got:
 *   1. Block format — one field per line, blank line between companies
 *   2. TSV — one company per row, tab-separated (copied out of Google Sheets)
 *   3. CSV — one company per row, comma-separated (a downloaded export)
 */
export function parseReport(text: string): {
  records: ParsedRegistration[]
  warnings: string[]
} {
  const t = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const warnings: string[] = []
  let fieldRows: string[][]

  const lines = t.split("\n").filter((l) => l.trim())
  const tabLines = lines.filter((l) => l.includes("\t"))

  if (tabLines.length > 0 && tabLines.length >= lines.length * 0.5) {
    fieldRows = parseDelimited(t, "\t")
  } else {
    // CSV data rows are wide and carry the package cell. Block-format lines
    // never combine a "[$" marker with ten or more comma-separated cells.
    const csvRows = parseDelimited(t, ",")
    const pkgRows = csvRows.filter((r) => r.some((c) => PRICE_MARKER.test(c)))
    const widePkgRows = pkgRows.filter((r) => r.length >= 10)

    if (pkgRows.length > 0 && widePkgRows.length >= pkgRows.length * 0.5) {
      fieldRows = csvRows
    } else if (t.trim().includes("\n\n")) {
      // A blank line between entries is the block format's giveaway; CSV rows
      // never have one.
      fieldRows = t.split(/\n\s*\n+/).map((b) => b.split("\n"))
    } else {
      // One entry with no blank line to split on. Narrow CSV rows carry a comma
      // on essentially every line; block-format lines mostly don't (only the
      // date and day fields do), so comma density tells them apart.
      const commaLines = lines.filter((l) => l.includes(",")).length
      fieldRows =
        commaLines >= lines.length * 0.5 ? csvRows : [lines.map((l) => l.trim())]
    }
  }

  return { records: parseRows(fieldRows, warnings), warnings }
}

/**
 * Identifies a registration by company name plus its "Registered On" text, so a
 * company that cancels and re-registers stays two rows instead of overwriting
 * itself. Reports without a date column collapse to one row per company.
 */
export function registrationKey(name: string, registeredOn: string | null): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, " ")}|${registeredOn || ""}`
}

function dayLabel(days: Day[]): string {
  const wed = days.includes("WEDNESDAY")
  const thu = days.includes("THURSDAY")
  if (wed && thu) return "Wed+Thu"
  if (wed) return "Wed only"
  if (thu) return "Thu only"
  return "no days"
}

/** Human-readable list of what an import would change about an existing row. */
export function diffRegistration(
  existing: {
    sponsorship: Sponsorship
    status: RegistrationStatus
    days: Day[]
    industry: Industry
  },
  incoming: ParsedRegistration
): string[] {
  const changes: string[] = []
  if (existing.sponsorship !== incoming.sponsorship) {
    changes.push(`package ${existing.sponsorship} → ${incoming.sponsorship}`)
  }
  if (existing.status !== incoming.status) {
    changes.push(`status ${existing.status} → ${incoming.status}`)
  }
  if (dayLabel(existing.days) !== dayLabel(incoming.days)) {
    changes.push(`days ${dayLabel(existing.days)} → ${dayLabel(incoming.days)}`)
  }
  if (existing.industry !== incoming.industry && incoming.industry !== "OTHER") {
    changes.push(`industry ${existing.industry} → ${incoming.industry}`)
  }
  return changes
}
