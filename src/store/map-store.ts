import { create } from "zustand"
import type {
  Company,
  BoothAssignment,
  BoothDefinition,
  Day,
  Sponsorship,
  SidebarFilter,
} from "@/types"
import { getBoothLayout } from "@/lib/booth-geometry"
import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

async function authFetch(url: string, options: RequestInit = {}) {
  const supabase = getSupabaseBrowserClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    "Content-Type": "application/json",
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  return fetch(url, { ...options, headers })
}

interface MapStore {
  // Data
  draftId: string | null
  companies: Company[]
  assignments: BoothAssignment[]
  booths: BoothDefinition[]

  // UI State
  activeDay: Day
  draggedCompany: Company | null
  hoveredBooths: string[]
  hoveredValid: boolean
  selectedCompany: string | null
  repositioning: boolean  // true when a selected company is being moved
  tooltip: { x: number; y: number; boothId: string; companyName: string; sponsorship: string; boothIds: string[] } | null

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
  updateCompany: (id: string, updates: Partial<Company>) => void

  // Assignment actions
  assignCompany: (companyId: string, boothIds: string[], day: Day | null) => Promise<void>
  unassignCompany: (companyId: string) => Promise<void>
  moveCompany: (assignmentId: string, newBoothIds: string[]) => Promise<void>

  // UI actions
  setActiveDay: (day: Day) => void
  setDraggedCompany: (company: Company | null) => void
  setHoveredBooths: (boothIds: string[], valid: boolean) => void
  setSelectedCompany: (companyId: string | null) => void
  startRepositioning: (companyId: string) => void
  cancelRepositioning: () => void
  setTooltip: (tooltip: MapStore["tooltip"]) => void
  setSidebarFilter: (filter: Partial<SidebarFilter>) => void

  // Derived helpers
  getAssignmentsForDay: (day: Day) => BoothAssignment[]
  getUnassignedCompanies: (day: Day) => Company[]
  getBoothOccupant: (boothId: string, day: Day) => { company: Company; assignment: BoothAssignment } | null
  isBoothAvailable: (boothId: string, day: Day) => boolean
  getOccupiedBoothIds: (day: Day) => Set<string>
  getAssignmentForCompany: (companyId: string) => BoothAssignment | undefined
}

export const useMapStore = create<MapStore>((set, get) => ({
  // Initial state
  draftId: null,
  companies: [],
  assignments: [],
  booths: getBoothLayout(),

  activeDay: "WEDNESDAY",
  draggedCompany: null,
  hoveredBooths: [],
  hoveredValid: true,
  selectedCompany: null,
  repositioning: false,
  tooltip: null,
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

  updateCompany: (id, updates) =>
    set((state) => ({
      companies: state.companies.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  // Assignment actions
  assignCompany: async (companyId, boothIds, day) => {
    const { draftId } = get()
    if (!draftId) return

    const res = await authFetch("/api/assignments", {
      method: "POST",
      body: JSON.stringify({ companyId, draftId, boothIds, day }),
    })

    if (res.ok) {
      const assignment: BoothAssignment = await res.json()
      set((state) => ({
        assignments: [...state.assignments, assignment],
        selectedCompany: null,
      }))
    }
  },

  unassignCompany: async (companyId) => {
    const { assignments } = get()
    const assignment = assignments.find((a) => a.companyId === companyId)
    if (!assignment) return

    const res = await authFetch(`/api/assignments/${assignment.id}`, {
      method: "DELETE",
    })

    if (res.ok) {
      set((state) => ({
        assignments: state.assignments.filter((a) => a.id !== assignment.id),
        selectedCompany: null,
      }))
    }
  },

  moveCompany: async (assignmentId, newBoothIds) => {
    const res = await authFetch(`/api/assignments/${assignmentId}/move`, {
      method: "PUT",
      body: JSON.stringify({ boothIds: newBoothIds }),
    })

    if (res.ok) {
      const updated: BoothAssignment = await res.json()
      set((state) => ({
        assignments: state.assignments.map((a) =>
          a.id === assignmentId ? updated : a
        ),
      }))
    }
  },

  // UI actions
  setActiveDay: (day) => set({ activeDay: day, selectedCompany: null }),
  setDraggedCompany: (company) => set({ draggedCompany: company }),
  setHoveredBooths: (boothIds, valid) =>
    set({ hoveredBooths: boothIds, hoveredValid: valid }),
  setSelectedCompany: (companyId) => set({ selectedCompany: companyId, repositioning: false }),
  startRepositioning: (companyId) => set({ selectedCompany: companyId, repositioning: true, hoveredBooths: [], hoveredValid: true }),
  cancelRepositioning: () => set({ selectedCompany: null, repositioning: false, hoveredBooths: [], hoveredValid: true }),
  setTooltip: (tooltip) => set({ tooltip }),
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
}))
