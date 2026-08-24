"use client"

import { useMapStore } from "@/store/map-store"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  REGISTRATION_STATUS_CONFIG,
  REGISTRATION_STATUS_ORDER,
  SPONSORSHIP_CONFIG,
  SPONSORSHIP_TEXT_COLOR,
} from "@/lib/constants"
import type { Company, Sponsorship, Day, RegistrationStatus } from "@/types"
import { GripVertical, MoreVertical } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

interface CompanyCardProps {
  company: Company
  isAssigned: boolean
}

const SPONSORSHIP_OPTIONS: Sponsorship[] = ["MAROON", "DIAMOND", "GOLD", "SILVER", "BASIC"]

export function CompanyCard({ company, isAssigned }: CompanyCardProps) {
  const { setDraggedCompany, selectedCompany, setSelectedCompany, updateCompany, unassignCompany, getAssignmentForCompany, moveCompany, repositioning, startRepositioning, cancelRepositioning } =
    useMapStore()
  const [boothCountInput, setBoothCountInput] = useState(
    company.boothCount.toString()
  )
  const config = SPONSORSHIP_CONFIG[company.sponsorship]
  const isSelected = selectedCompany === company.id
  const isBothDays =
    company.days.includes("WEDNESDAY") && company.days.includes("THURSDAY")

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("application/company-id", company.id)
    e.dataTransfer.effectAllowed = "move"
    setDraggedCompany(company)
  }

  function handleDragEnd() {
    setDraggedCompany(null)
  }

  async function handleSponsorshipChange(sponsorship: Sponsorship) {
    if (sponsorship === company.sponsorship) return
    try {
      if (isAssigned) {
        await unassignCompany(company.id)
      }

      const defaultBoothCount = SPONSORSHIP_CONFIG[sponsorship].booths

      await updateCompany(company.id, {
        sponsorship,
        boothCount: defaultBoothCount,
      })

      setBoothCountInput(defaultBoothCount.toString())

      toast.success(`Updated to ${SPONSORSHIP_CONFIG[sponsorship].label}`)
    } catch {
      // Store already showed error toast
    }
  }

  async function handleBoothCountChange() {
    const boothCount = Number(boothCountInput)

    if (!Number.isInteger(boothCount) || boothCount < 1) {
      setBoothCountInput(company.boothCount.toString())
      toast.error("Booth count must be a whole number greater than 0")
      return
    }

    if (boothCount === company.boothCount) return

    try {
      if (isAssigned) {
        await unassignCompany(company.id)
      }

      await updateCompany(company.id, { boothCount })
      toast.success(`Booth count updated to ${boothCount}`)
    } catch {
      setBoothCountInput(company.boothCount.toString())
    }
  }

  async function handleStatusChange(status: RegistrationStatus) {
    if (status === company.status) return
    try {
      // Losing confirmed status gives up the booth, so warn before it happens.
      if (status !== "CONFIRMED" && isAssigned) {
        await unassignCompany(company.id)
      }
      await updateCompany(company.id, { status })
      toast.success(
        `${company.name} marked ${REGISTRATION_STATUS_CONFIG[status].label.toLowerCase()}`
      )
    } catch {
      // Store already showed error toast
    }
  }

  async function handleQueueToggle(checked: boolean) {
    try {
      await updateCompany(company.id, { hasQueue: checked })
      toast.success(checked ? "Queue added" : "Queue removed")
    } catch {
      // Store already showed error toast
    }
  }

  async function handleDaysChange(days: Day[]) {
    if (JSON.stringify(days) === JSON.stringify(company.days)) return

    const assignment = getAssignmentForCompany(company.id)

    if (assignment) {
      // Determine new assignment day value
      const newAssignmentDay = days.length === 2 ? null : days[0]

      try {
        // Update the assignment day (keeps same booths)
        await moveCompany(assignment.id, undefined, newAssignmentDay)
      } catch {
        return // moveCompany already showed a toast
      }
    }

    try {
      await updateCompany(company.id, { days })
      toast.success("Days updated")
    } catch {
      // Store already showed error toast
    }
  }

  return (
    <div
      draggable={!isAssigned}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => {
        if (isSelected && repositioning) {
          cancelRepositioning()
        } else {
          startRepositioning(company.id)
        }
      }}
      className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
        isAssigned
          ? "cursor-pointer border-transparent bg-muted/50 text-muted-foreground hover:bg-muted"
          : "cursor-pointer border-border bg-white hover:bg-gray-50"
      } ${isSelected ? "ring-2 ring-primary" : ""}`}
    >
      {!isAssigned && (
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="flex-1 truncate text-xs font-medium">
        {company.name}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {company.hasQueue && (
          <Badge variant="outline" className="h-4 px-1 text-[10px] border-blue-400 text-blue-600">
            Q
          </Badge>
        )}
        {isBothDays && (
          <Badge variant="outline" className="h-4 px-1 text-[10px]">
            W/TH
          </Badge>
        )}
        <Badge
          className="h-4 px-1.5 text-[10px]"
          style={{
            backgroundColor: config.color,
            color: SPONSORSHIP_TEXT_COLOR[company.sponsorship],
          }}
        >
          {company.boothCount}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger
            asChild
            onClick={(e) => e.stopPropagation()}
          >
            <button className="ml-0.5 rounded p-0.5 hover:bg-gray-200">
              <MoreVertical className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>


            <DropdownMenuLabel className="text-xs">Booth Count</DropdownMenuLabel>
            <div
              className="flex items-center gap-2 px-2 pb-2"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="number"
                min={1}
                step={1}
                value={boothCountInput}
                onChange={(e) => setBoothCountInput(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === "Enter") {
                    void handleBoothCountChange()
                  }
                }}
                className="h-7 w-16 rounded-md border px-2 text-xs"
              />
              <button
                type="button"
                onClick={() => void handleBoothCountChange()}
                className="h-7 rounded-md border px-2 text-xs hover:bg-accent"
              >
                Save
              </button>
            </div>
            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs">Sponsorship</DropdownMenuLabel>
            {SPONSORSHIP_OPTIONS.map((s) => (
              <DropdownMenuItem
                key={s}
                onClick={() => handleSponsorshipChange(s)}
                className="text-xs"
              >
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: SPONSORSHIP_CONFIG[s].color }}
                />
                {SPONSORSHIP_CONFIG[s].label}
                {s === company.sponsorship && " ✓"}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />


            <DropdownMenuLabel className="text-xs">Days</DropdownMenuLabel>
            <DropdownMenuItem
              className="text-xs"
              onClick={() => handleDaysChange(["WEDNESDAY"])}
            >
              Wednesday{company.days.length === 1 && company.days[0] === "WEDNESDAY" && " ✓"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs"
              onClick={() => handleDaysChange(["THURSDAY"])}
            >
              Thursday{company.days.length === 1 && company.days[0] === "THURSDAY" && " ✓"}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs"
              onClick={() => handleDaysChange(["WEDNESDAY", "THURSDAY"])}
            >
              Both{isBothDays && " ✓"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuCheckboxItem
              className="text-xs"
              checked={company.hasQueue}
              onCheckedChange={handleQueueToggle}
            >
              Company Queue
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs">Industry</DropdownMenuLabel>
            <DropdownMenuItem
              className="text-xs"
              onClick={() => toast.error("Not implemented yet")}
            >
              {company.industry}
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs">Status</DropdownMenuLabel>
            {REGISTRATION_STATUS_ORDER.map((s) => (
              <DropdownMenuItem
                key={s}
                className="text-xs"
                onClick={() => handleStatusChange(s)}
              >
                <span
                  className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: REGISTRATION_STATUS_CONFIG[s].color }}
                />
                {REGISTRATION_STATUS_CONFIG[s].label}
                {s === company.status && " ✓"}
              </DropdownMenuItem>
            ))}

          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
