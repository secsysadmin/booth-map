"use client"

import { useMemo, useState } from "react"
import { useMapStore } from "@/store/map-store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { CompanyCard } from "./company-card"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"
import type { Company, Sponsorship } from "@/types"
import { Search, XCircle } from "lucide-react"
import { toast } from "sonner"

const TIER_ORDER: Sponsorship[] = ["MAROON", "DIAMOND", "GOLD", "SILVER", "BASIC"]

export function CompanySidebar() {
  const {
    companies,
    assignments,
    activeDay,
    sidebarFilter,
    setSidebarFilter,
    unassignAll,
  } = useMapStore()
  const [confirmingUnassignAll, setConfirmingUnassignAll] = useState(false)

  const assignedCompanyIds = useMemo(
    () => new Set(assignments.map((a) => a.companyId)),
    [assignments]
  )

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      // Day filter: show companies relevant to active day
      if (!c.days.includes(activeDay)) return false

      // Search filter
      if (
        sidebarFilter.search &&
        !c.name.toLowerCase().includes(sidebarFilter.search.toLowerCase())
      )
        return false

      // Sponsorship filter
      if (
        sidebarFilter.sponsorship !== "all" &&
        c.sponsorship !== sidebarFilter.sponsorship
      )
        return false

      // Assignment status filter
      const isAssigned = assignedCompanyIds.has(c.id)
      if (sidebarFilter.assignmentStatus === "assigned" && !isAssigned)
        return false
      if (sidebarFilter.assignmentStatus === "unassigned" && isAssigned)
        return false

      return true
    })
  }, [companies, activeDay, sidebarFilter, assignedCompanyIds])

  // Group by sponsorship tier
  const grouped = useMemo(() => {
    const groups = new Map<Sponsorship, Company[]>()
    for (const tier of TIER_ORDER) {
      const tierCompanies = filteredCompanies.filter(
        (c) => c.sponsorship === tier
      )
      if (tierCompanies.length > 0) {
        groups.set(tier, tierCompanies.sort((a, b) => a.name.localeCompare(b.name)))
      }
    }
    return groups
  }, [filteredCompanies])

  const totalFiltered = filteredCompanies.length
  const totalAssigned = filteredCompanies.filter(
    (c) => assignedCompanyIds.has(c.id)
  ).length
  const totalUnassigned = totalFiltered - totalAssigned
  const pct = totalFiltered > 0 ? Math.round((totalAssigned / totalFiltered) * 100) : 0

  return (
    <div className="flex w-72 flex-col overflow-hidden border-r bg-white">
      <div className="space-y-3 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            className="pl-9"
            value={sidebarFilter.search}
            onChange={(e) => setSidebarFilter({ search: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={sidebarFilter.sponsorship}
            onValueChange={(v) =>
              setSidebarFilter({ sponsorship: v as Sponsorship | "all" })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {TIER_ORDER.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {SPONSORSHIP_CONFIG[tier].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sidebarFilter.assignmentStatus}
            onValueChange={(v) =>
              setSidebarFilter({
                assignmentStatus: v as "assigned" | "unassigned" | "all",
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {totalAssigned}/{totalFiltered} assigned ({pct}%) &middot; {totalUnassigned} remaining
          </p>
          {assignments.length > 0 && (
            confirmingUnassignAll ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={async () => {
                    try {
                      await unassignAll()
                      toast.success("All assignments cleared")
                    } catch {
                      // Store already showed error toast
                    }
                    setConfirmingUnassignAll(false)
                  }}
                >
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setConfirmingUnassignAll(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmingUnassignAll(true)}
              >
                <XCircle className="h-3 w-3" />
                Unassign All
              </Button>
            )
          )}
        </div>
      </div>

      <Separator />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3 space-y-4">
          {Array.from(grouped.entries()).map(([tier, tierCompanies]) => (
            <div key={tier}>
              <h3
                className="mb-2 text-xs font-semibold uppercase tracking-wider"
                style={{ color: SPONSORSHIP_CONFIG[tier].color }}
              >
                {SPONSORSHIP_CONFIG[tier].label} ({tierCompanies.length})
              </h3>
              <div className="space-y-1">
                {tierCompanies.map((company) => (
                  <CompanyCard
                    key={company.id}
                    company={company}
                    isAssigned={assignedCompanyIds.has(company.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {grouped.size === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No companies match filters
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
