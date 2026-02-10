"use client"

import { useMemo, Fragment } from "react"
import { Rect, Text, Line } from "react-konva"
import { useMapStore } from "@/store/map-store"
import {
  getCanvasDimensions,
} from "@/lib/booth-geometry"
import {
  BOOTH_WIDTH,
  BOOTH_HEIGHT,
  BOOTH_GAP,
  AISLE_GAP,
  CANVAS_PADDING,
  ALL_ROWS,
  EDGE_ROWS,
  SPONSORSHIP_CONFIG,
  SPONSORSHIP_TEXT_COLOR,
  SEGMENT_SIDE_GAP,
  ROW_GAP,
} from "@/lib/constants"
import type { BoothDefinition } from "@/types"

export function BoothGrid() {
  const {
    booths,
    activeDay,
    hoveredBooths,
    hoveredValid,
    selectedCompany,
    assignments,
    companies,
    setSelectedCompany,
    unassignCompany,
    setTooltip,
    repositioning,
    startRepositioning,
    cancelRepositioning,
    moveCompany,
    getAssignmentForCompany,
  } = useMapStore()

  const hoveredSet = useMemo(() => new Set(hoveredBooths), [hoveredBooths])

  // Build occupancy map for active day
  const occupancyMap = useMemo(() => {
    const map = new Map<
      string,
      { companyName: string; sponsorship: string; companyId: string; assignmentId: string; isBothDays: boolean }
    >()
    for (const a of assignments) {
      if (a.day === null || a.day === activeDay) {
        const company = companies.find((c) => c.id === a.companyId)
        if (company) {
          for (const bid of a.boothIds) {
            map.set(bid, {
              companyName: company.name,
              sponsorship: company.sponsorship,
              companyId: company.id,
              assignmentId: a.id,
              isBothDays: a.day === null,
            })
          }
        }
      }
    }
    return map
  }, [assignments, companies, activeDay])

  // Aisle Y position
  const aisleY =
    CANVAS_PADDING +
    8 * (BOOTH_HEIGHT + BOOTH_GAP) -
    BOOTH_GAP / 2

  const dims = getCanvasDimensions()

  // Compute row label positions
  const rowLabels = useMemo(() => {
    const labels: { row: string; x: number }[] = []
    let currentX = CANVAS_PADDING
    for (const row of ALL_ROWS) {
      const isEdge = EDGE_ROWS.has(row)
      if (isEdge) {
        labels.push({ row, x: currentX + BOOTH_WIDTH / 2 })
        currentX += BOOTH_WIDTH + ROW_GAP
      } else {
        labels.push({
          row,
          x: currentX + BOOTH_WIDTH + SEGMENT_SIDE_GAP / 2,
        })
        currentX += 2 * BOOTH_WIDTH + SEGMENT_SIDE_GAP + ROW_GAP
      }
    }
    return labels
  }, [])

  // Group assignments to find label positions for multi-booth companies
  const companyLabels = useMemo(() => {
    const labels: {
      companyId: string
      name: string
      x: number
      y: number
      width: number
      height: number
    }[] = []

    const seen = new Set<string>()
    for (const a of assignments) {
      if (a.day !== null && a.day !== activeDay) continue
      if (seen.has(a.companyId)) continue
      seen.add(a.companyId)

      const company = companies.find((c) => c.id === a.companyId)
      if (!company) continue

      // Get booth definitions for this assignment
      const assignedBooths = a.boothIds
        .map((bid) => booths.find((b) => b.id === bid))
        .filter(Boolean) as BoothDefinition[]

      if (assignedBooths.length === 0) continue

      const minX = Math.min(...assignedBooths.map((b) => b.x))
      const minY = Math.min(...assignedBooths.map((b) => b.y))
      const maxX = Math.max(...assignedBooths.map((b) => b.x + b.width))
      const maxY = Math.max(...assignedBooths.map((b) => b.y + b.height))

      labels.push({
        companyId: company.id,
        name: company.name,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      })
    }

    return labels
  }, [assignments, companies, activeDay, booths])

  return (
    <>
      {/* Row labels */}
      {rowLabels.map(({ row, x }) => (
        <Text
          key={`label-${row}`}
          x={x - 8}
          y={CANVAS_PADDING - 20}
          text={row}
          fontSize={14}
          fontStyle="bold"
          fill="#333"
        />
      ))}

      {/* Aisle line */}
      <Line
        points={[CANVAS_PADDING - 10, aisleY + AISLE_GAP / 2, dims.width - CANVAS_PADDING + 10, aisleY + AISLE_GAP / 2]}
        stroke="#ddd"
        strokeWidth={1}
        dash={[8, 4]}
      />
      <Text
        x={dims.width / 2 - 20}
        y={aisleY + AISLE_GAP / 2 - 6}
        text="AISLE"
        fontSize={10}
        fill="#999"
      />

      {/* Booths */}
      {booths.map((booth) => {
        const occupant = occupancyMap.get(booth.id)
        const isHovered = hoveredSet.has(booth.id)
        const isSelected = occupant && selectedCompany === occupant.companyId

        // Determine fill color
        let fill = "#ffffff"
        let stroke = "#d4d4d4"
        let strokeWidth = 1

        if (occupant) {
          fill =
            SPONSORSHIP_CONFIG[
              occupant.sponsorship as keyof typeof SPONSORSHIP_CONFIG
            ]?.color || "#E8E8E8"
          stroke = "#999"
        }

        // Fade the selected company's booths during repositioning
        if (isSelected && repositioning) {
          fill = "#e5e7eb"
          stroke = "#3b82f6"
          strokeWidth = 2
        }

        if (isHovered) {
          fill = hoveredValid ? "#3b82f6" : "#ef4444"
          stroke = hoveredValid ? "#1d4ed8" : "#b91c1c"
          strokeWidth = 2
        }

        if (isSelected && !repositioning) {
          stroke = "#000"
          strokeWidth = 2
        }

        return (
          <Fragment key={booth.id}>
            <Rect
              x={booth.x}
              y={booth.y}
              width={booth.width}
              height={booth.height}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              cornerRadius={2}
              onClick={() => {
                if (repositioning && selectedCompany) {
                  // During repositioning, clicking an empty booth is handled by BoothMap's onMouseMove+click
                  // Clicking the same company again cancels
                  if (occupant && occupant.companyId === selectedCompany) {
                    cancelRepositioning()
                  }
                  return
                }
                if (occupant) {
                  startRepositioning(occupant.companyId)
                } else {
                  setSelectedCompany(null)
                }
              }}
              onMouseEnter={(e) => {
                if (!occupant) return
                const stage = e.target.getStage()
                if (!stage) return
                const pointer = stage.getPointerPosition()
                if (!pointer) return
                const assignment = assignments.find((a) => a.companyId === occupant.companyId)
                setTooltip({
                  x: pointer.x,
                  y: pointer.y,
                  boothId: booth.id,
                  companyName: occupant.companyName,
                  sponsorship: occupant.sponsorship,
                  boothIds: assignment?.boothIds || [booth.id],
                })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
            {/* Booth number (show when not occupied) */}
            {!occupant && (
              <Text
                x={booth.x + 2}
                y={booth.y + booth.height / 2 - 5}
                width={booth.width - 4}
                text={String(booth.number)}
                fontSize={9}
                fill="#999"
                align="center"
                listening={false}
              />
            )}
          </Fragment>
        )
      })}

      {/* Company name labels on assigned booths */}
      {companyLabels.map((label) => {
        const company = companies.find((c) => c.id === label.companyId)
        if (!company) return null

        const textColor =
          SPONSORSHIP_TEXT_COLOR[company.sponsorship] || "#1a1a1a"

        return (
          <Text
            key={`company-label-${label.companyId}`}
            x={label.x + 2}
            y={label.y + label.height / 2 - 5}
            width={label.width - 4}
            height={label.height}
            text={label.name}
            fontSize={8}
            fill={textColor}
            align="center"
            verticalAlign="middle"
            ellipsis
            wrap="none"
            listening={false}
          />
        )
      })}

      {/* Both-days indicator */}
      {companyLabels
        .filter((l) => {
          const a = assignments.find((a) => a.companyId === l.companyId)
          return a?.day === null
        })
        .map((label) => (
          <Text
            key={`both-${label.companyId}`}
            x={label.x + label.width - 18}
            y={label.y + 2}
            text="W+T"
            fontSize={7}
            fill="#666"
            fontStyle="bold"
            listening={false}
          />
        ))}
    </>
  )
}
