import { create } from "zustand"
import type {
  Company,
  BoothAssignment,
  BoothDefinition,
  Day,
  DayCapacity,
  IndustryZoneConfig,
  IndustryZoneRegion,
  Sponsorship,
  SidebarFilter,
} from "@/types"
import { getBoothLayout } from "@/lib/booth-geometry"
import { authFetch } from "@/lib/auth-fetch"
import {
  DEFAULT_CAPACITY_PER_DAY,
  INDUSTRY_ZONE_COLORS,
} from "@/lib/constants"
import { toast } from "sonner"

const EMPTY_ZONES: IndustryZoneConfig = { show: false, labels: [], regions: [] }

// Dragging a zone fires a change per frame, so writes are coalesced.
let zonePersistTimer: ReturnType<typeof setTimeout> | null = null

/** Which zone tool the pointer is currently armed with, if any. */
export type ZoneTool = { kind: "draw"; labelId: string } | { kind: "erase" } | null

interface MapStore {
  // Data
  draftId: string | null
  companies: Company[]
  assignments: BoothAssignment[]
  booths: BoothDefinition[]
  capacityPerDay: number
  industryZones: IndustryZoneConfig

  // UI State
  activeDay: Day
  draggedCompany: Company | null
  hoveredBooths: string[]
  hoveredValid: boolean
  selectedCompany: string | null
  repositioning: boolean  // true when a selected company is being moved
  blockMode: boolean      // painting blocked booths instead of placing companies
  zoneTool: ZoneTool
  selectedZoneId: string | null
  tooltip: { x: number; y: number; boothId: string; companyName: string; sponsorship: string; boothIds: string[] } | null
  contextMenu: { x: number; y: number; boothId: string; companyId: string | null; assignmentId: string | null } | null

  // Export
  exportMapFn: (() => void) | null
  setExportMapFn: (fn: (() => void) | null) => void

  // Filters
  sidebarFilter: SidebarFilter

  // Data actions
  setDraftId: (id: string) => void
  setCompanies: (companies: Company[]) => void
  setAssignments: (assignments: BoothAssignment[]) => void
  addCompany: (company: Company) => void
  updateCompany: (id: string, updates: Partial<Company>) => Promise<void>
  deleteCompany: (id: string) => Promise<void>
  setCapacityPerDay: (capacity: number) => void
  saveCapacityPerDay: (capacity: number) => Promise<void>

  // Industry guide overlay
  setIndustryZones: (zones: IndustryZoneConfig | null | undefined) => void
  toggleIndustryZones: () => void
  addZoneLabel: (name: string) => string | null
  removeZoneLabel: (labelId: string) => void
  addZoneRegion: (region: IndustryZoneRegion) => void
  updateZoneRegion: (id: string, patch: Partial<IndustryZoneRegion>) => void
  removeZoneRegion: (id: string) => void
  clearZoneRegions: () => void
  setZoneTool: (tool: ZoneTool) => void
  setSelectedZoneId: (id: string | null) => void

  // Assignment actions
  assignCompany: (companyId: string, boothIds: string[], day: Day | null) => Promise<void>
  unassignCompany: (companyId: string) => Promise<void>
  unassignAll: () => Promise<void>
  moveCompany: (assignmentId: string, newBoothIds?: string[], newDay?: Day | null) => Promise<void>
  autoPlaceCompanies: (day: Day) => Promise<{
    created: BoothAssignment[]
    placedCount: number
    unassignedCount: number
    skippedCount: number
  }>
  blockBooth: (boothId: string, day: Day) => Promise<void>
  unblockBooth: (assignmentId: string) => Promise<void>
  blockBooths: (boothIds: string[], day: Day) => Promise<void>
  unblockBooths: (boothIds: string[], day: Day) => Promise<void>
  clearBlockedForDay: (day: Day) => Promise<number>

  // UI actions
  setBlockMode: (on: boolean) => void
  setActiveDay: (day: Day) => void
  setDraggedCompany: (company: Company | null) => void
  setHoveredBooths: (boothIds: string[], valid: boolean) => void
  setSelectedCompany: (companyId: string | null) => void
  startRepositioning: (companyId: string) => void
  cancelRepositioning: () => void
  setTooltip: (tooltip: MapStore["tooltip"]) => void
  setContextMenu: (menu: MapStore["contextMenu"]) => void
  setSidebarFilter: (filter: Partial<SidebarFilter>) => void

  // Derived helpers
  getAssignmentsForDay: (day: Day) => BoothAssignment[]
  getUnassignedCompanies: (day: Day) => Company[]
  getBoothOccupant: (boothId: string, day: Day) => { company: Company; assignment: BoothAssignment } | null
  isBoothAvailable: (boothId: string, day: Day) => boolean
  getOccupiedBoothIds: (day: Day) => Set<string>
  getAssignmentForCompany: (companyId: string) => BoothAssignment | undefined
  getBlockedBoothIds: (day: Day) => Set<string>
  getDayCapacity: (day: Day) => DayCapacity
}

/**
 * Writes the industry guide back to the draft. Debounced because resizing a
 * zone updates state on every pointer move.
 */
function persistZones(get: () => MapStore) {
  if (zonePersistTimer) clearTimeout(zonePersistTimer)
  zonePersistTimer = setTimeout(async () => {
    zonePersistTimer = null
    const { draftId, industryZones } = get()
    if (!draftId) return
    try {
      const res = await authFetch(`/api/drafts/${draftId}`, {
        method: "PUT",
        body: JSON.stringify({ industryZones }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save industry zones")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save industry zones")
    }
  }, 600)
}

export const useMapStore = create<MapStore>((set, get) => ({
  // Initial state
  draftId: null,
  companies: [],
  assignments: [],
  booths: getBoothLayout(),
  capacityPerDay: DEFAULT_CAPACITY_PER_DAY,
  industryZones: EMPTY_ZONES,

  activeDay: "WEDNESDAY",
  draggedCompany: null,
  hoveredBooths: [],
  hoveredValid: true,
  selectedCompany: null,
  repositioning: false,
  blockMode: false,
  zoneTool: null,
  selectedZoneId: null,
  tooltip: null,
  contextMenu: null,
  exportMapFn: null,

  sidebarFilter: {
    search: "",
    sponsorship: "all",
    assignmentStatus: "all",
  },

  // Data actions
  setDraftId: (id) => set({ draftId: id }),
  setCompanies: (companies) => set({ companies }),
  setAssignments: (assignments) => set({ assignments }),

  addCompany: (company) =>
    set((state) => ({ companies: [...state.companies, company] })),

  updateCompany: async (id, updates) => {
    const snapshot = get().companies
    // Optimistic update
    set((state) => ({
      companies: state.companies.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }))
    try {
      const res = await authFetch(`/api/companies/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to update company")
      }
      const updated = await res.json()
      set((state) => ({
        companies: state.companies.map((c) =>
          c.id === id ? { ...c, ...updated } : c
        ),
      }))
    } catch (e) {
      set({ companies: snapshot })
      toast.error(e instanceof Error ? e.message : "Failed to update company")
      throw e
    }
  },

  deleteCompany: async (id) => {
    const snapshotCompanies = get().companies
    const snapshotAssignments = get().assignments
    set((state) => ({
      companies: state.companies.filter((c) => c.id !== id),
      assignments: state.assignments.filter((a) => a.companyId !== id),
      selectedCompany: state.selectedCompany === id ? null : state.selectedCompany,
    }))
    try {
      const res = await authFetch(`/api/companies/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to delete company")
      }
    } catch (e) {
      set({ companies: snapshotCompanies, assignments: snapshotAssignments })
      toast.error(e instanceof Error ? e.message : "Failed to delete company")
      throw e
    }
  },

  setCapacityPerDay: (capacity) => set({ capacityPerDay: capacity }),

  saveCapacityPerDay: async (capacity) => {
    const { draftId, capacityPerDay } = get()
    if (!draftId || capacity === capacityPerDay) return
    set({ capacityPerDay: capacity })
    try {
      const res = await authFetch(`/api/drafts/${draftId}`, {
        method: "PUT",
        body: JSON.stringify({ capacityPerDay: capacity }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save capacity")
      }
    } catch (e) {
      set({ capacityPerDay })
      toast.error(e instanceof Error ? e.message : "Failed to save capacity")
    }
  },

  // Industry guide overlay
  setIndustryZones: (zones) =>
    set({
      industryZones: zones
        ? {
            show: zones.show === true,
            labels: zones.labels ?? [],
            regions: zones.regions ?? [],
          }
        : EMPTY_ZONES,
    }),

  toggleIndustryZones: () => {
    const next = !get().industryZones.show
    set((state) => ({
      industryZones: { ...state.industryZones, show: next },
      // Leaving the overlay drops whatever tool was armed.
      zoneTool: next ? state.zoneTool : null,
      selectedZoneId: next ? state.selectedZoneId : null,
    }))
    persistZones(get)
  },

  addZoneLabel: (name) => {
    const trimmed = name.trim().slice(0, 40)
    if (!trimmed) return null
    const { industryZones } = get()
    const used = new Set(industryZones.labels.map((l) => l.color))
    const color =
      INDUSTRY_ZONE_COLORS.find((c) => !used.has(c)) ??
      INDUSTRY_ZONE_COLORS[industryZones.labels.length % INDUSTRY_ZONE_COLORS.length]
    const id = `zl-${Math.random().toString(36).slice(2, 10)}`
    set((state) => ({
      industryZones: {
        ...state.industryZones,
        show: true,
        labels: [...state.industryZones.labels, { id, name: trimmed, color }],
      },
      zoneTool: { kind: "draw", labelId: id },
      blockMode: false,
    }))
    persistZones(get)
    return id
  },

  removeZoneLabel: (labelId) => {
    set((state) => ({
      industryZones: {
        ...state.industryZones,
        labels: state.industryZones.labels.filter((l) => l.id !== labelId),
        regions: state.industryZones.regions.filter((r) => r.labelId !== labelId),
      },
      zoneTool:
        state.zoneTool?.kind === "draw" && state.zoneTool.labelId === labelId
          ? null
          : state.zoneTool,
      selectedZoneId: null,
    }))
    persistZones(get)
  },

  addZoneRegion: (region) => {
    set((state) => ({
      industryZones: {
        ...state.industryZones,
        regions: [...state.industryZones.regions, region],
      },
      selectedZoneId: region.id,
    }))
    persistZones(get)
  },

  updateZoneRegion: (id, patch) => {
    set((state) => ({
      industryZones: {
        ...state.industryZones,
        regions: state.industryZones.regions.map((r) =>
          r.id === id ? { ...r, ...patch } : r
        ),
      },
    }))
    persistZones(get)
  },

  removeZoneRegion: (id) => {
    set((state) => ({
      industryZones: {
        ...state.industryZones,
        regions: state.industryZones.regions.filter((r) => r.id !== id),
      },
      selectedZoneId: state.selectedZoneId === id ? null : state.selectedZoneId,
    }))
    persistZones(get)
  },

  clearZoneRegions: () => {
    set((state) => ({
      industryZones: { ...state.industryZones, regions: [] },
      selectedZoneId: null,
    }))
    persistZones(get)
  },

  setZoneTool: (tool) =>
    set((state) => ({
      zoneTool: tool,
      selectedZoneId: null,
      blockMode: tool ? false : state.blockMode,
    })),

  setSelectedZoneId: (id) => set({ selectedZoneId: id }),

  // Assignment actions
  assignCompany: async (companyId, boothIds, day) => {
    const { draftId } = get()
    if (!draftId) return

    const tempId = `temp-${Date.now()}`
    const tempAssignment: BoothAssignment = {
      id: tempId,
      companyId,
      draftId,
      boothIds,
      day,
    }
    // Optimistic update
    set((state) => ({
      assignments: [...state.assignments, tempAssignment],
      selectedCompany: null,
    }))
    try {
      const res = await authFetch("/api/assignments", {
        method: "POST",
        body: JSON.stringify({ companyId, draftId, boothIds, day }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to assign company")
      }
      const assignment: BoothAssignment = await res.json()
      // Replace temp with real assignment
      set((state) => ({
        assignments: state.assignments.map((a) =>
          a.id === tempId ? assignment : a
        ),
      }))
    } catch (e) {
      // Rollback: remove the temp assignment
      set((state) => ({
        assignments: state.assignments.filter((a) => a.id !== tempId),
      }))
      toast.error(e instanceof Error ? e.message : "Failed to assign company")
      throw e
    }
  },

  unassignCompany: async (companyId) => {
    const { assignments } = get()
    const assignment = assignments.find((a) => a.companyId === companyId)
    if (!assignment) return

    // Optimistic update
    set((state) => ({
      assignments: state.assignments.filter((a) => a.id !== assignment.id),
      selectedCompany: null,
    }))
    try {
      const res = await authFetch(`/api/assignments/${assignment.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to unassign company")
      }
    } catch (e) {
      // Rollback: re-add the assignment
      set((state) => ({
        assignments: [...state.assignments, assignment],
      }))
      toast.error(e instanceof Error ? e.message : "Failed to unassign company")
      throw e
    }
  },

  unassignAll: async () => {
    const { draftId, assignments, companies } = get()
    if (!draftId || assignments.length === 0) return

    const snapshotAssignments = assignments
    const snapshotCompanies = companies
    // Optimistic update
    set({
      assignments: [],
      companies: companies.filter((c) => !c.isPlaceholder),
      selectedCompany: null,
    })
    try {
      const res = await authFetch("/api/assignments", {
        method: "DELETE",
        body: JSON.stringify({ draftId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to unassign all")
      }
    } catch (e) {
      set({ assignments: snapshotAssignments, companies: snapshotCompanies })
      toast.error(e instanceof Error ? e.message : "Failed to unassign all")
      throw e
    }
  },

  moveCompany: async (assignmentId, newBoothIds, newDay) => {
    const snapshot = get().assignments
    const original = snapshot.find((a) => a.id === assignmentId)
    if (!original) return

    // Optimistic update
    set((state) => ({
      assignments: state.assignments.map((a) => {
        if (a.id !== assignmentId) return a
        return {
          ...a,
          ...(newBoothIds && { boothIds: newBoothIds }),
          ...(newDay !== undefined && { day: newDay }),
        }
      }),
    }))
    try {
      const body: Record<string, unknown> = {}
      if (newBoothIds) body.boothIds = newBoothIds
      if (newDay !== undefined) body.day = newDay
      const res = await authFetch(`/api/assignments/${assignmentId}/move`, {
        method: "PUT",
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to move company")
      }
      const updated: BoothAssignment = await res.json()
      set((state) => ({
        assignments: state.assignments.map((a) =>
          a.id === assignmentId ? updated : a
        ),
      }))
    } catch (e) {
      set({ assignments: snapshot })
      toast.error(e instanceof Error ? e.message : "Failed to move company")
      throw e
    }
  },

  autoPlaceCompanies: async (day) => {
    const { draftId } = get()
    if (!draftId) {
      return { created: [], placedCount: 0, unassignedCount: 0, skippedCount: 0 }
    }

    try {
      const res = await authFetch("/api/assignments/auto-place", {
        method: "POST",
        body: JSON.stringify({ draftId, day }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to auto-place companies")
      }

      const data = await res.json()
      set((state) => {
        const existingIds = new Set(state.assignments.map((a) => a.id))
        const created = (data.created || []).filter(
          (a: BoothAssignment) => !existingIds.has(a.id)
        )
        return {
          assignments: [...state.assignments, ...created],
          selectedCompany: null,
        }
      })

      return data
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to auto-place companies")
      throw e
    }
  },

  blockBooth: async (boothId, day) => {
    const { draftId } = get()
    if (!draftId) return

    try {
      const res = await authFetch("/api/assignments/block", {
        method: "POST",
        body: JSON.stringify({ draftId, boothId, day }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to block booth")
      }

      const data = await res.json()
      set((state) => ({
        companies: [...state.companies, data.company],
        assignments: [...state.assignments, data.assignment],
      }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to block booth")
      throw e
    }
  },

  unblockBooth: async (assignmentId) => {
    const { assignments, companies } = get()
    const assignment = assignments.find((a) => a.id === assignmentId)
    if (!assignment) return

    try {
      const res = await authFetch("/api/assignments/block", {
        method: "DELETE",
        body: JSON.stringify({ assignmentId }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to unblock booth")
      }

      const company = companies.find((c) => c.id === assignment.companyId)

      set((state) => ({
        assignments: state.assignments.filter((a) => a.id !== assignmentId),
        companies: company?.isPlaceholder
          ? state.companies.filter((c) => c.id !== assignment.companyId)
          : state.companies,
      }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unblock booth")
      throw e
    }
  },

  blockBooths: async (boothIds, day) => {
    const { draftId } = get()
    if (!draftId || boothIds.length === 0) return

    try {
      const res = await authFetch("/api/assignments/block", {
        method: "POST",
        body: JSON.stringify({ draftId, boothIds, day }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to block booths")
      }

      const data = await res.json()
      set((state) => ({
        companies: [...state.companies, ...(data.companies || [])],
        assignments: [...state.assignments, ...(data.assignments || [])],
      }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to block booths")
      throw e
    }
  },

  unblockBooths: async (boothIds, day) => {
    const { draftId } = get()
    if (!draftId || boothIds.length === 0) return

    try {
      const res = await authFetch("/api/assignments/block", {
        method: "DELETE",
        body: JSON.stringify({ draftId, day, boothIds }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to unblock booths")
      }

      const { removedCompanyIds = [] } = await res.json()
      const removed = new Set<string>(removedCompanyIds)
      set((state) => ({
        companies: state.companies.filter((c) => !removed.has(c.id)),
        assignments: state.assignments.filter((a) => !removed.has(a.companyId)),
      }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to unblock booths")
      throw e
    }
  },

  clearBlockedForDay: async (day) => {
    const { draftId } = get()
    if (!draftId) return 0

    try {
      const res = await authFetch("/api/assignments/block", {
        method: "DELETE",
        body: JSON.stringify({ draftId, day, all: true }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to clear blocked booths")
      }

      const { removedCompanyIds = [] } = await res.json()
      const removed = new Set<string>(removedCompanyIds)
      set((state) => ({
        companies: state.companies.filter((c) => !removed.has(c.id)),
        assignments: state.assignments.filter((a) => !removed.has(a.companyId)),
      }))
      return removedCompanyIds.length
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear blocked booths")
      throw e
    }
  },

  // UI actions
  setBlockMode: (on) =>
    set({
      blockMode: on,
      // Blocking and zone drawing both own the pointer, so only one is armed.
      zoneTool: on ? null : get().zoneTool,
      selectedZoneId: null,
      selectedCompany: null,
      repositioning: false,
    }),
  setActiveDay: (day) => set({ activeDay: day, selectedCompany: null }),
  setDraggedCompany: (company) => set({ draggedCompany: company }),
  setHoveredBooths: (boothIds, valid) =>
    set({ hoveredBooths: boothIds, hoveredValid: valid }),
  setSelectedCompany: (companyId) => set({ selectedCompany: companyId, repositioning: false }),
  startRepositioning: (companyId) => set({ selectedCompany: companyId, repositioning: true, hoveredBooths: [], hoveredValid: true }),
  cancelRepositioning: () => set({ selectedCompany: null, repositioning: false, hoveredBooths: [], hoveredValid: true }),
  setTooltip: (tooltip) => set({ tooltip }),
  setContextMenu: (menu) => set({ contextMenu: menu }),
  setExportMapFn: (fn) => set({ exportMapFn: fn }),
  setSidebarFilter: (filter) =>
    set((state) => ({
      sidebarFilter: { ...state.sidebarFilter, ...filter },
    })),

  // Derived helpers
  getAssignmentsForDay: (day) => {
    const { assignments } = get()
    return assignments.filter((a) => a.day === null || a.day === day)
  },

  getUnassignedCompanies: (day) => {
    const { companies, assignments } = get()
    const assignedCompanyIds = new Set(assignments.map((a) => a.companyId))
    return companies.filter(
      (c) =>
        !c.isPlaceholder &&
        c.status === "CONFIRMED" &&
        !assignedCompanyIds.has(c.id) &&
        c.days.includes(day)
    )
  },

  getBoothOccupant: (boothId, day) => {
    const { assignments, companies } = get()
    for (const a of assignments) {
      if (
        a.boothIds.includes(boothId) &&
        (a.day === null || a.day === day)
      ) {
        const company = companies.find((c) => c.id === a.companyId)
        if (company) return { company, assignment: a }
      }
    }
    return null
  },

  isBoothAvailable: (boothId, day) => {
    return get().getBoothOccupant(boothId, day) === null
  },

  getOccupiedBoothIds: (day) => {
    const { assignments } = get()
    const occupied = new Set<string>()
    for (const a of assignments) {
      if (a.day === null || a.day === day) {
        for (const bid of a.boothIds) {
          occupied.add(bid)
        }
      }
    }
    return occupied
  },

  getAssignmentForCompany: (companyId) => {
    return get().assignments.find((a) => a.companyId === companyId)
  },

  getBlockedBoothIds: (day) => {
    const { assignments, companies } = get()
    const placeholderIds = new Set(
      companies.filter((c) => c.isPlaceholder).map((c) => c.id)
    )
    const blocked = new Set<string>()
    for (const a of assignments) {
      if (!placeholderIds.has(a.companyId)) continue
      if (a.day === null || a.day === day) {
        for (const bid of a.boothIds) blocked.add(bid)
      }
    }
    return blocked
  },

  /**
   * Booths spoken for on a given day. Confirmed and pending are counted
   * separately so the dashboard can show what the floor looks like today
   * against what it looks like if every pending registration confirms.
   */
  getDayCapacity: (day) => {
    const { companies } = get()
    const result: DayCapacity = { confirmed: 0, pending: 0, blocked: 0 }
    for (const c of companies) {
      if (c.isPlaceholder) continue
      if (c.status === "CANCELED") continue
      if (!c.days.includes(day)) continue
      if (c.status === "CONFIRMED") result.confirmed += c.boothCount
      else result.pending += c.boothCount
    }
    result.blocked = get().getBlockedBoothIds(day).size
    return result
  },
}))
