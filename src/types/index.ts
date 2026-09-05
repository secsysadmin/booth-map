export type Day = "WEDNESDAY" | "THURSDAY"
export type Sponsorship = "MAROON" | "DIAMOND" | "GOLD" | "SILVER" | "BASIC"
export type Industry = 
  "AEROSPACE" |
  "MECHANICAL" |
  "ENERGY" |
  "CHEMICALS" |
  "OIL" |
  "CIVIL" |
  "TECH" |
  "SEMICONDUCTORS" |
  "OTHER"

export type IndustryRangeSpec =
  | { type: "row"; from: string; to: string }
  | { type: "booth"; from: string; to: string }
  | { type: "boothList"; booths: string[] }

export type IndustryRangeConfig = Partial<Record<Industry, IndustryRangeSpec[]>>

export type RegistrationStatus = "CONFIRMED" | "PENDING" | "CANCELED"

// A named color used by the visual industry guide overlay. Distinct from the
// `Industry` enum, which is a fixed taxonomy used for auto-placement ranges.
export interface IndustryZoneLabel {
  id: string
  name: string
  color: string
}

// A rectangle drawn over the map in canvas coordinates.
export interface IndustryZoneRegion {
  id: string
  labelId: string
  x: number
  y: number
  w: number
  h: number
}

export interface IndustryZoneConfig {
  show: boolean
  labels: IndustryZoneLabel[]
  regions: IndustryZoneRegion[]
}

export interface Company {
  id: string
  name: string
  days: Day[]
  sponsorship: Sponsorship
  boothCount: number
  hasQueue: boolean
  industry: Industry
  isPlaceholder: boolean
  status: RegistrationStatus
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  registeredOn: string | null
  draftId: string
}

// What the "Add company" form collects; everything else takes its default.
export interface NewCompanyInput {
  name: string
  sponsorship: Sponsorship
  days: Day[]
  boothCount: number
  industry: Industry
}

export interface BoothAssignment {
  id: string
  companyId: string
  draftId: string
  boothIds: string[]
  day: Day | null // null = both days
}

export interface Draft {
  id: string
  name: string
  userId: string
  companies: Company[]
  assignments: BoothAssignment[]
  industryRanges?: IndustryRangeConfig | null
  industryZones?: IndustryZoneConfig | null
  capacityPerDay: number
  googleSheetUrl?: string | null
  googleWorksheetName?: string | null
  googleAutoSync?: boolean
  googleSyncedAt?: string | null
  googleSyncError?: string | null
  createdAt: string
  updatedAt: string
}

// One parsed registration from an imported report, before it hits the database.
export interface ParsedRegistration {
  name: string
  days: Day[]
  sponsorship: Sponsorship
  boothCount: number
  boothCountFromReport: boolean
  assignedBooths: string[]
  industry: Industry
  status: RegistrationStatus
  contactName: string
  contactEmail: string
  contactPhone: string
  registeredOn: string
}

export interface ImportPreviewItem {
  name: string
  registeredOn: string
  kind: "new" | "updated" | "unchanged"
  changes: string[]
  booths?: string[]
}

export interface ImportPreview {
  parsed: number
  created: number
  updated: number
  unchanged: number
  removed: string[]
  items: ImportPreviewItem[]
  warnings: string[]
  placed: number
}

export interface BoothDefinition {
  id: string        // e.g. "G-14"
  row: string       // "A" through "Q"
  number: number    // 1-30 (or 1-15 for edge)
  segment: 1 | 2 | 3 | 4
  x: number         // pixel x on canvas
  y: number         // pixel y on canvas
  width: number
  height: number
}

export interface SidebarFilter {
  search: string
  sponsorship: Sponsorship | "all"
  assignmentStatus: "assigned" | "unassigned" | "all"
}

// Booths per day, split the way the capacity dashboard reports them.
export interface DayCapacity {
  confirmed: number
  pending: number
  blocked: number
}
