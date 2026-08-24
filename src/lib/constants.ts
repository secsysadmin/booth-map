import type { RegistrationStatus, Sponsorship } from "@/types"

// Booth geometry constants (pixels)
export const BOOTH_WIDTH = 48
export const BOOTH_HEIGHT = 48
export const BOOTH_GAP = 2
export const AISLE_GAP = 40
export const SEGMENT_SIDE_GAP = 8
export const ROW_GAP = 16
export const CANVAS_PADDING = 40

// Sponsorship configuration
export const SPONSORSHIP_CONFIG: Record<
  Sponsorship,
  { booths: number; color: string; label: string }
> = {
  MAROON:  { booths: 4, color: "#500000", label: "Maroon" },
  DIAMOND: { booths: 3, color: "#B9D9EB", label: "Diamond" },
  GOLD:    { booths: 2, color: "#CFB53B", label: "Gold" },
  SILVER:  { booths: 1, color: "#C0C0C0", label: "Silver" },
  BASIC:   { booths: 1, color: "#E8E8E8", label: "Basic" },
}

// Text colors for readability on each sponsorship background
export const SPONSORSHIP_TEXT_COLOR: Record<Sponsorship, string> = {
  MAROON: "#FFFFFF",
  DIAMOND: "#0f2b3d",
  GOLD: "#3d2e00",
  SILVER: "#2a2a2a",
  BASIC: "#2a2a2a",
}

// Registration lifecycle. Only CONFIRMED companies can be placed on the map;
// PENDING still counts toward the capacity forecast, CANCELED counts for nothing.
export const REGISTRATION_STATUS_ORDER: RegistrationStatus[] = [
  "CONFIRMED",
  "PENDING",
  "CANCELED",
]

export const REGISTRATION_STATUS_CONFIG: Record<
  RegistrationStatus,
  { label: string; color: string; badgeClass: string }
> = {
  CONFIRMED: {
    label: "Confirmed",
    color: "#15803d",
    badgeClass: "border-green-200 bg-green-50 text-green-700",
  },
  PENDING: {
    label: "Pending",
    color: "#a16207",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
  },
  CANCELED: {
    label: "Canceled",
    color: "#71717a",
    badgeClass: "border-border bg-muted text-muted-foreground line-through",
  },
}

// Booths available per day before the floor is full. Editable per draft.
export const DEFAULT_CAPACITY_PER_DAY = 480

// Palette handed out to industry guide zones in order, so consecutive
// industries never share a color until the list wraps.
export const INDUSTRY_ZONE_COLORS = [
  "#93c5fd",
  "#86efac",
  "#fcd34d",
  "#f9a8d4",
  "#c4b5fd",
  "#fdba74",
  "#67e8f9",
  "#fca5a5",
  "#a3e635",
  "#d8b4fe",
]

// Row letters from left (Q) to right (A) as rendered on screen
export const ALL_ROWS = ["Q", "P", "O", "N", "M", "L", "K", "J", "I", "H", "G", "F", "E", "D", "C", "B", "A"] as const
export const EDGE_ROWS = new Set(["A", "Q"])
export const MIDDLE_ROWS = ALL_ROWS.filter((r) => !EDGE_ROWS.has(r))
