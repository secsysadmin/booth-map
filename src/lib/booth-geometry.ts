import type { BoothDefinition } from "@/types"
import {
  BOOTH_WIDTH,
  BOOTH_HEIGHT,
  BOOTH_GAP,
  AISLE_GAP,
  SEGMENT_SIDE_GAP,
  ROW_GAP,
  CANVAS_PADDING,
  ALL_ROWS,
  EDGE_ROWS,
} from "./constants"

/**
 * Generates the complete booth layout with pixel coordinates for all 480 booths.
 *
 * Layout orientation (bird's-eye view):
 * - X-axis: rows arranged horizontally, Q (leftmost) → A (rightmost)
 * - Y-axis: booths stack vertically within each row
 *
 * For middle rows (B-P), each row has 4 segments in 2 columns:
 *   Left column:  Seg 3 (top), Seg 4 (bottom)
 *   Right column: Seg 2 (top), Seg 1 (bottom)
 *
 * For edge rows (A, Q): only right column (Seg 2 top, Seg 1 bottom)
 */
export function generateBoothLayout(): BoothDefinition[] {
  const booths: BoothDefinition[] = []

  // Column width: one column is BOOTH_WIDTH
  // Middle row occupies 2 columns (left + right) with SEGMENT_SIDE_GAP between
  // Edge row occupies 1 column

  let currentX = CANVAS_PADDING

  for (const row of ALL_ROWS) {
    const isEdge = EDGE_ROWS.has(row)

    if (isEdge) {
      // Edge row: single column (right side only: Seg 2 top, Seg 1 bottom)
      const colX = currentX

      // Seg 2 (Top-Right): booths 8-15, displayed top→bottom as 15,14,...,8
      for (let i = 0; i < 8; i++) {
        const boothNum = 15 - i // 15, 14, 13, ..., 8
        booths.push({
          id: `${row}-${boothNum}`,
          row,
          number: boothNum,
          segment: 2,
          x: colX,
          y: CANVAS_PADDING + i * (BOOTH_HEIGHT + BOOTH_GAP),
          width: BOOTH_WIDTH,
          height: BOOTH_HEIGHT,
        })
      }

      // Seg 1 (Bottom-Right): booths 1-7, displayed top→bottom as 7,6,...,1
      const seg1TopY =
        CANVAS_PADDING +
        8 * (BOOTH_HEIGHT + BOOTH_GAP) +
        AISLE_GAP

      for (let i = 0; i < 7; i++) {
        const boothNum = 7 - i // 7, 6, 5, ..., 1
        booths.push({
          id: `${row}-${boothNum}`,
          row,
          number: boothNum,
          segment: 1,
          x: colX,
          y: seg1TopY + i * (BOOTH_HEIGHT + BOOTH_GAP),
          width: BOOTH_WIDTH,
          height: BOOTH_HEIGHT,
        })
      }

      currentX += BOOTH_WIDTH + ROW_GAP
    } else {
      // Middle row: two columns
      const leftColX = currentX
      const rightColX = currentX + BOOTH_WIDTH + SEGMENT_SIDE_GAP

      // --- Top half ---
      // Seg 3 (Top-Left): booths 16-23, displayed top→bottom as 16,17,...,23
      for (let i = 0; i < 8; i++) {
        const boothNum = 16 + i
        booths.push({
          id: `${row}-${boothNum}`,
          row,
          number: boothNum,
          segment: 3,
          x: leftColX,
          y: CANVAS_PADDING + i * (BOOTH_HEIGHT + BOOTH_GAP),
          width: BOOTH_WIDTH,
          height: BOOTH_HEIGHT,
        })
      }

      // Seg 2 (Top-Right): booths 8-15, displayed top→bottom as 15,14,...,8
      for (let i = 0; i < 8; i++) {
        const boothNum = 15 - i
        booths.push({
          id: `${row}-${boothNum}`,
          row,
          number: boothNum,
          segment: 2,
          x: rightColX,
          y: CANVAS_PADDING + i * (BOOTH_HEIGHT + BOOTH_GAP),
          width: BOOTH_WIDTH,
          height: BOOTH_HEIGHT,
        })
      }

      // --- Bottom half ---
      const bottomTopY =
        CANVAS_PADDING +
        8 * (BOOTH_HEIGHT + BOOTH_GAP) +
        AISLE_GAP

      // Seg 4 (Bottom-Left): booths 24-30, displayed top→bottom as 24,25,...,30
      for (let i = 0; i < 7; i++) {
        const boothNum = 24 + i
        booths.push({
          id: `${row}-${boothNum}`,
          row,
          number: boothNum,
          segment: 4,
          x: leftColX,
          y: bottomTopY + i * (BOOTH_HEIGHT + BOOTH_GAP),
          width: BOOTH_WIDTH,
          height: BOOTH_HEIGHT,
        })
      }

      // Seg 1 (Bottom-Right): booths 1-7, displayed top→bottom as 7,6,...,1
      for (let i = 0; i < 7; i++) {
        const boothNum = 7 - i
        booths.push({
          id: `${row}-${boothNum}`,
          row,
          number: boothNum,
          segment: 1,
          x: rightColX,
          y: bottomTopY + i * (BOOTH_HEIGHT + BOOTH_GAP),
          width: BOOTH_WIDTH,
          height: BOOTH_HEIGHT,
        })
      }

      currentX += 2 * BOOTH_WIDTH + SEGMENT_SIDE_GAP + ROW_GAP
    }
  }

  return booths
}

// Cached layout
let _cachedLayout: BoothDefinition[] | null = null
export function getBoothLayout(): BoothDefinition[] {
  if (!_cachedLayout) {
    _cachedLayout = generateBoothLayout()
  }
  return _cachedLayout
}

// Lookup map
let _boothMap: Map<string, BoothDefinition> | null = null
function getBoothMap(): Map<string, BoothDefinition> {
  if (!_boothMap) {
    _boothMap = new Map(getBoothLayout().map((b) => [b.id, b]))
  }
  return _boothMap
}

export function getBoothById(id: string): BoothDefinition | undefined {
  return getBoothMap().get(id)
}

export function getSegmentBooths(
  row: string,
  segment: number
): BoothDefinition[] {
  return getBoothLayout()
    .filter((b) => b.row === row && b.segment === segment)
    .sort((a, b) => a.y - b.y) // sorted top to bottom visually
}

/**
 * Returns the booth numbers that appear in a segment, in visual order (top→bottom).
 */
function getSegmentBoothNumbers(row: string, segment: number): number[] {
  return getSegmentBooths(row, segment).map((b) => b.number)
}

/**
 * Returns array of `count` contiguous booth IDs in the same segment,
 * starting from the given booth and going downward visually.
 * Returns null if not enough space.
 */
export function getContiguousGroup(
  boothId: string,
  count: number
): string[] | null {
  const booth = getBoothById(boothId)
  if (!booth) return null

  const segmentBooths = getSegmentBooths(booth.row, booth.segment)
  const idx = segmentBooths.findIndex((b) => b.id === boothId)
  if (idx === -1) return null

  // Try centering the group on the given booth
  const halfBefore = Math.floor((count - 1) / 2)
  let startIdx = idx - halfBefore

  // Clamp to segment bounds
  if (startIdx < 0) startIdx = 0
  if (startIdx + count > segmentBooths.length)
    startIdx = segmentBooths.length - count
  if (startIdx < 0) return null // segment too small

  return segmentBooths.slice(startIdx, startIdx + count).map((b) => b.id)
}

/**
 * Returns all valid contiguous groups of `count` booths in the given segment,
 * excluding occupied booths.
 */
export function findValidPlacements(
  row: string,
  segment: number,
  count: number,
  occupied: Set<string>
): string[][] {
  const segmentBooths = getSegmentBooths(row, segment)
  const results: string[][] = []

  for (let i = 0; i <= segmentBooths.length - count; i++) {
    const group = segmentBooths.slice(i, i + count)
    if (group.every((b) => !occupied.has(b.id))) {
      results.push(group.map((b) => b.id))
    }
  }

  return results
}

/**
 * Finds the best contiguous group of `count` booths near a target Y position
 * in the given row and segment, avoiding occupied booths.
 * Returns the group closest to the target, or null if none available.
 */
export function findBestPlacement(
  row: string,
  segment: number,
  count: number,
  targetY: number,
  occupied: Set<string>
): string[] | null {
  const valid = findValidPlacements(row, segment, count, occupied)
  if (valid.length === 0) return null

  // Find the group whose center is closest to targetY
  let bestGroup: string[] | null = null
  let bestDist = Infinity

  for (const group of valid) {
    const firstBooth = getBoothById(group[0])!
    const lastBooth = getBoothById(group[group.length - 1])!
    const centerY = (firstBooth.y + lastBooth.y + BOOTH_HEIGHT) / 2
    const dist = Math.abs(centerY - targetY)
    if (dist < bestDist) {
      bestDist = dist
      bestGroup = group
    }
  }

  return bestGroup
}

/**
 * Given a canvas position, determines which row and segment the cursor is over.
 */
export function getRowAndSegmentAt(
  canvasX: number,
  canvasY: number
): { row: string; segment: number } | null {
  const layout = getBoothLayout()

  // Group booths by row to find X ranges
  const rowBounds = new Map<
    string,
    { minX: number; maxX: number }
  >()

  for (const b of layout) {
    const existing = rowBounds.get(b.row)
    if (!existing) {
      rowBounds.set(b.row, { minX: b.x, maxX: b.x + b.width })
    } else {
      existing.minX = Math.min(existing.minX, b.x)
      existing.maxX = Math.max(existing.maxX, b.x + b.width)
    }
  }

  // Find which row the X falls in (with some tolerance)
  const tolerance = ROW_GAP / 2
  let targetRow: string | null = null

  for (const [row, bounds] of rowBounds) {
    if (
      canvasX >= bounds.minX - tolerance &&
      canvasX <= bounds.maxX + tolerance
    ) {
      targetRow = row
      break
    }
  }

  if (!targetRow) return null

  // Determine segment based on Y position and column (left/right)
  const isEdge = EDGE_ROWS.has(targetRow)
  const rowBooths = layout.filter((b) => b.row === targetRow)

  // Find column x-centers
  const xValues = [...new Set(rowBooths.map((b) => b.x))].sort(
    (a, b) => a - b
  )

  // Calculate aisle Y boundary
  const aisleY =
    CANVAS_PADDING + 8 * (BOOTH_HEIGHT + BOOTH_GAP) + AISLE_GAP / 2

  const isTopHalf = canvasY < aisleY

  if (isEdge) {
    // Edge rows: only segments 1 and 2
    return { row: targetRow, segment: isTopHalf ? 2 : 1 }
  }

  // Middle row: determine left vs right column
  const midX = (xValues[0] + xValues[xValues.length - 1] + BOOTH_WIDTH) / 2
  const isRightCol = canvasX >= midX

  if (isTopHalf) {
    return { row: targetRow, segment: isRightCol ? 2 : 3 }
  } else {
    return { row: targetRow, segment: isRightCol ? 1 : 4 }
  }
}

/**
 * Computes total canvas dimensions needed for the layout.
 */
export function getCanvasDimensions(): { width: number; height: number } {
  const layout = getBoothLayout()
  let maxX = 0
  let maxY = 0
  for (const b of layout) {
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return {
    width: maxX + CANVAS_PADDING,
    height: maxY + CANVAS_PADDING,
  }
}
