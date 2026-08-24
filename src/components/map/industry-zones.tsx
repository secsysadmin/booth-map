"use client"

import { Fragment } from "react"
import { Rect, Text } from "react-konva"
import { useMapStore } from "@/store/map-store"

/** The eight resize grips, in the order they're drawn around a zone. */
export const ZONE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
export type ZoneHandle = (typeof ZONE_HANDLES)[number]

const HANDLE_SIZE = 9

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex)
  return `rgba(${r},${g},${b},${alpha})`
}

/** The palette is pastel, so labels need a much darker version to stay legible. */
function darken(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex).map((c) => Math.round(c * factor))
  return `rgb(${r},${g},${b})`
}

/** Handle positions relative to a zone's top-left corner. */
export function handleRects(region: { x: number; y: number; w: number; h: number }) {
  const half = HANDLE_SIZE / 2
  const midX = region.x + region.w / 2
  const midY = region.y + region.h / 2
  const right = region.x + region.w
  const bottom = region.y + region.h
  const at: Record<ZoneHandle, { x: number; y: number }> = {
    nw: { x: region.x, y: region.y },
    n: { x: midX, y: region.y },
    ne: { x: right, y: region.y },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: region.x, y: bottom },
    w: { x: region.x, y: midY },
  }
  return ZONE_HANDLES.map((handle) => ({
    handle,
    x: at[handle].x - half,
    y: at[handle].y - half,
    size: HANDLE_SIZE,
  }))
}

/**
 * The industry guide: free-form colored boxes drawn over the grid as a planning
 * aid. Purely visual — zones never constrain where a company can be placed.
 *
 * Zones only take pointer events while a zone tool is armed, so with the guide
 * merely visible you can still click straight through to the booths underneath.
 */
export function IndustryZones() {
  const { industryZones, zoneTool, selectedZoneId } = useMapStore()

  if (!industryZones.show) return null

  const interactive = zoneTool !== null
  const labelById = new Map(industryZones.labels.map((l) => [l.id, l]))

  return (
    <>
      {industryZones.regions.map((region) => {
        const label = labelById.get(region.labelId)
        if (!label) return null

        const isSelected = selectedZoneId === region.id
        const fontSize = Math.max(
          14,
          Math.min(42, Math.min(region.w, region.h) * 0.22)
        )

        return (
          <Fragment key={region.id}>
            <Rect
              name="zone-region"
              regionId={region.id}
              x={region.x}
              y={region.y}
              width={region.w}
              height={region.h}
              fill={rgba(label.color, 0.32)}
              stroke={isSelected ? "#500000" : rgba(label.color, 0.85)}
              strokeWidth={isSelected ? 3 : 2}
              cornerRadius={6}
              listening={interactive}
            />
            <Text
              x={region.x}
              y={region.y + region.h / 2 - fontSize * 0.7}
              width={region.w}
              height={fontSize * 1.4}
              text={label.name.toUpperCase()}
              fontSize={fontSize}
              fontFamily="Inter, sans-serif"
              fontStyle="bold"
              fill={darken(label.color, 0.42)}
              align="center"
              verticalAlign="middle"
              ellipsis
              wrap="none"
              listening={false}
            />
            {interactive &&
              isSelected &&
              handleRects(region).map((h) => (
                <Rect
                  key={`${region.id}-${h.handle}`}
                  name="zone-handle"
                  regionId={region.id}
                  handle={h.handle}
                  x={h.x}
                  y={h.y}
                  width={h.size}
                  height={h.size}
                  fill="#ffffff"
                  stroke="#500000"
                  strokeWidth={1.5}
                />
              ))}
          </Fragment>
        )
      })}
    </>
  )
}
