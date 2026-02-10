import type { Sponsorship } from "@/types"

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
  DIAMOND: "#1a1a1a",
  GOLD: "#1a1a1a",
  SILVER: "#1a1a1a",
  BASIC: "#1a1a1a",
}

// Row letters from left (Q) to right (A) as rendered on screen
export const ALL_ROWS = ["Q", "P", "O", "N", "M", "L", "K", "J", "I", "H", "G", "F", "E", "D", "C", "B", "A"] as const
export const EDGE_ROWS = new Set(["A", "Q"])
export const MIDDLE_ROWS = ALL_ROWS.filter((r) => !EDGE_ROWS.has(r))
