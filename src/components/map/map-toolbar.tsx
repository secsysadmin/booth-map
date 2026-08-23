"use client"

import { useEffect, useRef, useState } from "react"
import { useMapStore } from "@/store/map-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"
import type { Sponsorship } from "@/types"
import { Ban, Eraser, Minus, Plus, Maximize, Palette, X } from "lucide-react"
import { toast } from "sonner"

const TIER_ORDER: Sponsorship[] = ["MAROON", "DIAMOND", "GOLD", "SILVER", "BASIC"]

interface MapToolbarProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomFit: () => void
}

export function MapToolbar({ onZoomIn, onZoomOut, onZoomFit }: MapToolbarProps) {
  const {
    activeDay,
    industryZones,
    zoneTool,
    blockMode,
    toggleIndustryZones,
    addZoneLabel,
    removeZoneLabel,
    clearZoneRegions,
    setZoneTool,
    setBlockMode,
    clearBlockedForDay,
    getBlockedBoothIds,
    getDayCapacity,
    companies,
    assignments,
  } = useMapStore()

  const [addingLabel, setAddingLabel] = useState(false)
  const [labelName, setLabelName] = useState("")
  const [confirmingClearZones, setConfirmingClearZones] = useState(false)
  const [confirmingClearBlocks, setConfirmingClearBlocks] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingLabel) addInputRef.current?.focus()
  }, [addingLabel])

  const dayLabel = activeDay === "WEDNESDAY" ? "Wednesday" : "Thursday"
  const blockedCount = getBlockedBoothIds(activeDay).size
  const capacity = getDayCapacity(activeDay)

  // Booths placed vs. booths owed, for confirmed companies on this day.
  const assignedCompanyIds = new Set(assignments.map((a) => a.companyId))
  let placedBooths = 0
  for (const c of companies) {
    if (c.isPlaceholder || c.status !== "CONFIRMED") continue
    if (!c.days.includes(activeDay)) continue
    if (assignedCompanyIds.has(c.id)) placedBooths += c.boothCount
  }

  function commitLabel() {
    const name = labelName.trim()
    if (!name) {
      setAddingLabel(false)
      setLabelName("")
      return
    }
    if (addZoneLabel(name)) {
      toast.success(`Added “${name}” — drag on the map to draw its zone`)
    }
    setLabelName("")
    setAddingLabel(false)
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col gap-2 p-3">
      <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto rounded-md border bg-white/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
          {placedBooths} of {capacity.confirmed} booths placed &middot; {blockedCount} blocked &middot; {dayLabel}
        </span>

        <Button
          size="sm"
          variant={industryZones.show ? "default" : "outline"}
          className="h-8 bg-white/90 text-xs shadow-sm backdrop-blur data-[active=true]:bg-primary"
          data-active={industryZones.show}
          onClick={toggleIndustryZones}
          title="Show or hide industry color zones. They are a visual guide only and do not affect booth assignments."
        >
          <Palette className="mr-1 h-3.5 w-3.5" />
          Industry guide
        </Button>

        <Button
          size="sm"
          variant={blockMode ? "default" : "outline"}
          className="h-8 bg-white/90 text-xs shadow-sm backdrop-blur data-[active=true]:bg-primary"
          data-active={blockMode}
          onClick={() => setBlockMode(!blockMode)}
          title="Block booths so they can't be assigned. Blocks apply only to the day you're viewing."
        >
          <Ban className="mr-1 h-3.5 w-3.5" />
          Block booths
        </Button>

        <div className="flex items-center gap-1 rounded-md border bg-white/90 p-0.5 shadow-sm backdrop-blur">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onZoomOut} title="Zoom out">
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onZoomFit} title="Fit map to window">
            <Maximize className="mr-1 h-3.5 w-3.5" />
            Fit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onZoomIn} title="Zoom in">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {industryZones.show && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur">
          {industryZones.labels.length === 0 && !addingLabel && (
            <span className="text-xs text-muted-foreground">No industries yet.</span>
          )}

          {industryZones.labels.map((label) => {
            const armed = zoneTool?.kind === "draw" && zoneTool.labelId === label.id
            return (
              <span
                key={label.id}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm ${
                  armed ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5"
                  onClick={() =>
                    setZoneTool(armed ? null : { kind: "draw", labelId: label.id })
                  }
                >
                  <span
                    className="inline-block h-3 w-3 rounded-sm border border-black/15"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title={`Remove ${label.name} and its zones`}
                  onClick={() => {
                    removeZoneLabel(label.id)
                    toast.success(`Removed “${label.name}”`)
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}

          {addingLabel ? (
            <span className="inline-flex items-center gap-1">
              <Input
                ref={addInputRef}
                value={labelName}
                onChange={(e) => setLabelName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitLabel()
                  if (e.key === "Escape") {
                    setAddingLabel(false)
                    setLabelName("")
                  }
                }}
                onBlur={commitLabel}
                placeholder="Tech, Energy, Construction…"
                className="h-7 w-48 text-xs"
              />
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setAddingLabel(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Industry
            </Button>
          )}

          <Button
            size="sm"
            variant={zoneTool?.kind === "erase" ? "destructive" : "outline"}
            className="h-7 text-xs"
            onClick={() =>
              setZoneTool(zoneTool?.kind === "erase" ? null : { kind: "erase" })
            }
          >
            <Eraser className="mr-1 h-3 w-3" />
            Erase
          </Button>

          {industryZones.regions.length > 0 &&
            (confirmingClearZones ? (
              <span className="inline-flex items-center gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  onClick={() => {
                    clearZoneRegions()
                    setConfirmingClearZones(false)
                    toast.success("Cleared all industry zones")
                  }}
                >
                  Clear {industryZones.regions.length}?
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setConfirmingClearZones(false)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setConfirmingClearZones(true)}
              >
                Clear zones
              </Button>
            ))}

          <span className="text-xs text-muted-foreground">
            {zoneTool?.kind === "draw"
              ? "Drag on the map to draw a zone. Drag a zone to move it, use the corners to resize, Delete to remove."
              : zoneTool?.kind === "erase"
                ? "Click a zone to delete it."
                : "Pick an industry to start drawing."}
          </span>
        </div>
      )}

      {blockMode && (
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border bg-white/95 px-2.5 py-2 shadow-sm backdrop-blur">
          <span className="text-xs text-muted-foreground">
            Click or drag across booths to block them for {dayLabel} only. Drag from a
            blocked booth to unblock. The other day isn&apos;t affected.
          </span>
          {blockedCount > 0 &&
            (confirmingClearBlocks ? (
              <span className="inline-flex items-center gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  onClick={async () => {
                    try {
                      const n = await clearBlockedForDay(activeDay)
                      toast.success(`Unblocked ${n} booths on ${dayLabel}`)
                    } catch {
                      // Store already showed the error
                    }
                    setConfirmingClearBlocks(false)
                  }}
                >
                  Unblock all {blockedCount}?
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setConfirmingClearBlocks(false)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setConfirmingClearBlocks(true)}
              >
                Clear blocked for {dayLabel}
              </Button>
            ))}
        </div>
      )}
    </div>
  )
}

export function MapLegend() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-1 bg-gradient-to-t from-white/95 to-transparent px-4 py-2 text-[11px] text-muted-foreground">
      {TIER_ORDER.map((tier) => (
        <span key={tier} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm border border-black/15"
            style={{ backgroundColor: SPONSORSHIP_CONFIG[tier].color }}
          />
          {SPONSORSHIP_CONFIG[tier].label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-black bg-white" />
        Blocked (this day only)
      </span>
      <span className="ml-auto">
        Drag a company onto the map &middot; click a placement to move it &middot; right-click for options
      </span>
    </div>
  )
}
