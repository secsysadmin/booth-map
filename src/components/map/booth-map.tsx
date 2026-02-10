"use client"

import { useRef, useCallback, useState, useEffect } from "react"
import { Stage, Layer } from "react-konva"
import { useMapStore } from "@/store/map-store"
import { getCanvasDimensions } from "@/lib/booth-geometry"
import { BoothGrid } from "./booth-grid"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"
import {
  findBestPlacement,
  getRowAndSegmentAt,
} from "@/lib/booth-geometry"
import { Button } from "@/components/ui/button"
import { X, Move, Check } from "lucide-react"
import type Konva from "konva"
import type { Sponsorship, Day } from "@/types"
import { toast } from "sonner"

export function BoothMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  // Use refs for values needed in drag handler to avoid re-creating callbacks
  const scaleRef = useRef(scale)
  const positionRef = useRef(position)
  const activeDayRef = useRef(useMapStore.getState().activeDay)
  scaleRef.current = scale
  positionRef.current = position
  activeDayRef.current = useMapStore.getState().activeDay

  // Cache occupied booths during a drag session
  const occupiedCacheRef = useRef<Set<string> | null>(null)
  const lastHoverResultRef = useRef<string>("")
  const rafRef = useRef<number | null>(null)
  const pendingDragEvent = useRef<{ x: number; y: number } | null>(null)

  const {
    setDraggedCompany,
    setHoveredBooths,
    assignCompany,
    tooltip,
    contextMenu,
    setContextMenu,
    repositioning,
    selectedCompany,
    cancelRepositioning,
    unassignCompany,
    moveCompany,
    updateCompany,
    companies,
    startRepositioning,
    getAssignmentForCompany,
  } = useMapStore()

  const canvasDims = getCanvasDimensions()

  // Fit container
  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        setStageSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }
    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [])

  // Initial fit
  useEffect(() => {
    if (stageSize.width > 0 && stageSize.height > 0) {
      const scaleX = stageSize.width / canvasDims.width
      const scaleY = stageSize.height / canvasDims.height
      const fitScale = Math.min(scaleX, scaleY, 1) * 0.95
      setScale(fitScale)
      setPosition({
        x: (stageSize.width - canvasDims.width * fitScale) / 2,
        y: (stageSize.height - canvasDims.height * fitScale) / 2,
      })
    }
  }, [stageSize.width, stageSize.height, canvasDims.width, canvasDims.height])

  // Escape key to cancel repositioning or close context menu
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (useMapStore.getState().contextMenu) {
          setContextMenu(null)
        } else if (repositioning) {
          cancelRepositioning()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [repositioning, cancelRepositioning, setContextMenu])

  // Register PNG export function
  useEffect(() => {
    const exportFn = () => {
      const stage = stageRef.current
      if (!stage) return

      // Save current transform
      const prevScale = { x: stage.scaleX(), y: stage.scaleY() }
      const prevPos = { x: stage.x(), y: stage.y() }
      const prevSize = { width: stage.width(), height: stage.height() }

      // Set stage to fit full canvas
      const padding = 20
      const exportWidth = canvasDims.width + padding * 2
      const exportHeight = canvasDims.height + padding * 2

      stage.width(exportWidth)
      stage.height(exportHeight)
      stage.scaleX(1)
      stage.scaleY(1)
      stage.x(padding)
      stage.y(padding)
      stage.draw()

      const dataUrl = stage.toDataURL({ pixelRatio: 2 })

      // Restore
      stage.width(prevSize.width)
      stage.height(prevSize.height)
      stage.scaleX(prevScale.x)
      stage.scaleY(prevScale.y)
      stage.x(prevPos.x)
      stage.y(prevPos.y)
      stage.draw()

      // Download
      const a = document.createElement("a")
      a.href = dataUrl
      a.download = "booth-map.png"
      a.click()
    }

    useMapStore.getState().setExportMapFn(exportFn)
    return () => useMapStore.getState().setExportMapFn(null)
  }, [canvasDims.width, canvasDims.height])

  // Zoom with scroll wheel (also close context menu)
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault()
      useMapStore.getState().setContextMenu(null)
      const stage = stageRef.current
      if (!stage) return

      const oldScale = scaleRef.current
      const pointer = stage.getPointerPosition()
      if (!pointer) return

      const scaleBy = 1.08
      const newScale =
        e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
      const clampedScale = Math.max(0.2, Math.min(3, newScale))

      const mousePointTo = {
        x: (pointer.x - positionRef.current.x) / oldScale,
        y: (pointer.y - positionRef.current.y) / oldScale,
      }

      setScale(clampedScale)
      setPosition({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      })
    },
    []
  )

  // Helper: convert page coords to canvas coords
  function pageToCanvas(pageX: number, pageY: number) {
    const container = containerRef.current
    if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    return {
      x: (pageX - rect.left - positionRef.current.x) / scaleRef.current,
      y: (pageY - rect.top - positionRef.current.y) / scaleRef.current,
    }
  }

  // Process drag hover on rAF (for sidebar → canvas drag)
  const processDragHover = useCallback(() => {
    rafRef.current = null
    const coords = pendingDragEvent.current
    if (!coords) return

    const { draggedCompany } = useMapStore.getState()
    if (!draggedCompany) return

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const canvasX = (coords.x - rect.left - positionRef.current.x) / scaleRef.current
    const canvasY = (coords.y - rect.top - positionRef.current.y) / scaleRef.current

    const target = getRowAndSegmentAt(canvasX, canvasY)

    if (!target) {
      if (lastHoverResultRef.current !== "") {
        lastHoverResultRef.current = ""
        setHoveredBooths([], false)
      }
      return
    }

    const boothCount = SPONSORSHIP_CONFIG[draggedCompany.sponsorship].booths

    // Cache occupied set for the duration of the drag
    if (!occupiedCacheRef.current) {
      occupiedCacheRef.current = useMapStore.getState().getOccupiedBoothIds(activeDayRef.current)
    }

    const placement = findBestPlacement(
      target.row,
      target.segment,
      boothCount,
      canvasY,
      occupiedCacheRef.current
    )

    // Only update store if result changed
    const resultKey = placement ? placement.join(",") : "none"
    if (resultKey !== lastHoverResultRef.current) {
      lastHoverResultRef.current = resultKey
      if (placement) {
        setHoveredBooths(placement, true)
      } else {
        setHoveredBooths([], false)
      }
    }
  }, [setHoveredBooths])

  // Repositioning hover (mousemove on canvas during repositioning mode)
  const repoRafRef = useRef<number | null>(null)
  const repoLastResult = useRef<string>("")

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!repositioning || !selectedCompany) return

      const coords = { x: e.clientX, y: e.clientY }

      if (repoRafRef.current) return
      repoRafRef.current = requestAnimationFrame(() => {
        repoRafRef.current = null
        const { selectedCompany: sc, repositioning: repo } = useMapStore.getState()
        if (!sc || !repo) return

        const company = companies.find((c) => c.id === sc)
        if (!company) return

        const canvasPos = pageToCanvas(coords.x, coords.y)
        const target = getRowAndSegmentAt(canvasPos.x, canvasPos.y)

        if (!target) {
          if (repoLastResult.current !== "") {
            repoLastResult.current = ""
            setHoveredBooths([], false)
          }
          return
        }

        const boothCount = SPONSORSHIP_CONFIG[company.sponsorship].booths

        // Get occupied, excluding current company's booths
        const occupied = useMapStore.getState().getOccupiedBoothIds(activeDayRef.current)
        const assignment = useMapStore.getState().getAssignmentForCompany(sc)
        if (assignment) {
          for (const bid of assignment.boothIds) {
            occupied.delete(bid)
          }
        }

        const placement = findBestPlacement(
          target.row,
          target.segment,
          boothCount,
          canvasPos.y,
          occupied
        )

        const resultKey = placement ? placement.join(",") : "none"
        if (resultKey !== repoLastResult.current) {
          repoLastResult.current = resultKey
          if (placement) {
            setHoveredBooths(placement, true)
          } else {
            setHoveredBooths([], false)
          }
        }
      })
    },
    [repositioning, selectedCompany, companies, setHoveredBooths]
  )

  // Click to place during repositioning
  const handleCanvasClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!repositioning || !selectedCompany) return

      const { hoveredBooths, hoveredValid } = useMapStore.getState()
      if (!hoveredValid || hoveredBooths.length === 0) return

      const assignment = getAssignmentForCompany(selectedCompany)
      if (!assignment) return

      moveCompany(assignment.id, hoveredBooths).catch(() => {})
      cancelRepositioning()
      repoLastResult.current = ""
    },
    [repositioning, selectedCompany, getAssignmentForCompany, moveCompany, cancelRepositioning]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"

      // Store latest position and schedule rAF
      pendingDragEvent.current = { x: e.clientX, y: e.clientY }
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(processDragHover)
      }
    },
    [processDragHover]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      // Cancel any pending rAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }

      const { draggedCompany, hoveredBooths, hoveredValid, activeDay } =
        useMapStore.getState()

      // Clear caches
      occupiedCacheRef.current = null
      lastHoverResultRef.current = ""
      pendingDragEvent.current = null

      if (!draggedCompany || !hoveredValid || hoveredBooths.length === 0) {
        setDraggedCompany(null)
        setHoveredBooths([], true)
        return
      }

      const isBothDays =
        draggedCompany.days.includes("WEDNESDAY") &&
        draggedCompany.days.includes("THURSDAY")
      const assignDay = isBothDays ? null : activeDay

      assignCompany(draggedCompany.id, hoveredBooths, assignDay).catch(() => {})
      setDraggedCompany(null)
      setHoveredBooths([], true)
    },
    [assignCompany, setDraggedCompany, setHoveredBooths]
  )

  const handleDragLeave = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    occupiedCacheRef.current = null
    lastHoverResultRef.current = ""
    pendingDragEvent.current = null
    setHoveredBooths([], true)
  }, [setHoveredBooths])

  // Get selected company name for the action bar
  const selectedCompanyData = selectedCompany
    ? companies.find((c) => c.id === selectedCompany)
    : null

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
      onMouseMove={handleMouseMove}
    >
      {/* Repositioning action bar */}
      {repositioning && selectedCompanyData && (
        <div className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-4 py-2 shadow-lg">
          <Move className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">
            Moving {selectedCompanyData.name}
          </span>
          <span className="text-xs text-muted-foreground">
            Click a new spot or
          </span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            onClick={() => {
              unassignCompany(selectedCompany!)
              cancelRepositioning()
            }}
          >
            Unassign
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={cancelRepositioning}
          >
            <X className="mr-1 h-3 w-3" />
            Cancel
          </Button>
        </div>
      )}

      <Stage
        ref={stageRef as React.RefObject<Konva.Stage>}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        draggable={!repositioning}
        onWheel={handleWheel}
        onDragEnd={(e) => {
          setContextMenu(null)
          setPosition({ x: e.target.x(), y: e.target.y() })
        }}
        onClick={(e) => {
          if (e.evt.button !== 0) return
          setContextMenu(null)
          handleCanvasClick(e)
        }}
      >
        <Layer>
          <BoothGrid />
        </Layer>
      </Stage>

      {/* Tooltip overlay (hide when context menu is open) */}
      {tooltip && !repositioning && !contextMenu && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border bg-white px-3 py-2 shadow-md"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
          }}
        >
          <p className="text-sm font-medium">{tooltip.companyName}</p>
          <p className="text-xs text-muted-foreground">
            {tooltip.sponsorship} &middot; {[...tooltip.boothIds].sort((a, b) => {
              const numA = parseInt(a.split("-")[1])
              const numB = parseInt(b.split("-")[1])
              return numA - numB
            }).map(id => id.replace("-", "")).join(", ")}
          </p>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <BoothContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          companyId={contextMenu.companyId}
          assignmentId={contextMenu.assignmentId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

const SPONSORSHIP_OPTIONS: Sponsorship[] = ["MAROON", "DIAMOND", "GOLD", "SILVER", "BASIC"]

function BoothContextMenu({
  x,
  y,
  companyId,
  assignmentId,
  onClose,
}: {
  x: number
  y: number
  companyId: string
  assignmentId: string
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const { companies, updateCompany, unassignCompany, moveCompany, startRepositioning, getAssignmentForCompany } = useMapStore()
  const company = companies.find((c) => c.id === companyId)

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [onClose])

  if (!company) return null

  const isBothDays = company.days.includes("WEDNESDAY") && company.days.includes("THURSDAY")

  async function handleSponsorshipChange(sponsorship: Sponsorship) {
    if (sponsorship === company!.sponsorship) { onClose(); return }
    try {
      await unassignCompany(company!.id)
      await updateCompany(company!.id, { sponsorship })
      toast.success(`Updated to ${SPONSORSHIP_CONFIG[sponsorship].label}`)
    } catch { /* store showed toast */ }
    onClose()
  }

  async function handleDaysChange(days: Day[]) {
    if (JSON.stringify(days) === JSON.stringify(company!.days)) { onClose(); return }
    const assignment = getAssignmentForCompany(company!.id)
    if (assignment) {
      const newAssignmentDay = days.length === 2 ? null : days[0]
      try {
        await moveCompany(assignment.id, undefined, newAssignmentDay)
      } catch { onClose(); return }
    }
    try {
      await updateCompany(company!.id, { days })
      toast.success("Days updated")
    } catch { /* store showed toast */ }
    onClose()
  }

  async function handleQueueToggle() {
    const newVal = !company!.hasQueue
    try {
      await updateCompany(company!.id, { hasQueue: newVal })
      toast.success(newVal ? "Queue added" : "Queue removed")
    } catch { /* store showed toast */ }
    onClose()
  }

  function handleReposition() {
    onClose()
    startRepositioning(company!.id)
  }

  async function handleUnassign() {
    try {
      await unassignCompany(company!.id)
      toast.success("Company unassigned")
    } catch { /* store showed toast */ }
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="absolute z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        Sponsorship
      </div>
      {SPONSORSHIP_OPTIONS.map((s) => (
        <button
          key={s}
          onClick={() => handleSponsorshipChange(s)}
          className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
        >
          <span
            className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: SPONSORSHIP_CONFIG[s].color }}
          />
          {SPONSORSHIP_CONFIG[s].label}
          {s === company.sponsorship && <span className="ml-auto">✓</span>}
        </button>
      ))}

      <div className="-mx-1 my-1 h-px bg-border" />

      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
        Days
      </div>
      <button
        onClick={() => handleDaysChange(["WEDNESDAY"])}
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
      >
        Wednesday
        {company.days.length === 1 && company.days[0] === "WEDNESDAY" && <span className="ml-auto">✓</span>}
      </button>
      <button
        onClick={() => handleDaysChange(["THURSDAY"])}
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
      >
        Thursday
        {company.days.length === 1 && company.days[0] === "THURSDAY" && <span className="ml-auto">✓</span>}
      </button>
      <button
        onClick={() => handleDaysChange(["WEDNESDAY", "THURSDAY"])}
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
      >
        Both
        {isBothDays && <span className="ml-auto">✓</span>}
      </button>

      <div className="-mx-1 my-1 h-px bg-border" />

      <button
        onClick={handleQueueToggle}
        className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
      >
        Company Queue
        {company.hasQueue && <Check className="h-3.5 w-3.5" />}
      </button>

      <div className="-mx-1 my-1 h-px bg-border" />

      <button
        onClick={handleReposition}
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
      >
        <Move className="mr-2 h-3.5 w-3.5" />
        Reposition
      </button>
      <button
        onClick={handleUnassign}
        className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
      >
        <X className="mr-2 h-3.5 w-3.5" />
        Unassign
      </button>
    </div>
  )
}
