"use client"

import { useMapStore } from "@/store/map-store"
import { Badge } from "@/components/ui/badge"
import { SPONSORSHIP_CONFIG, SPONSORSHIP_TEXT_COLOR } from "@/lib/constants"
import type { Company } from "@/types"
import { GripVertical } from "lucide-react"

interface CompanyCardProps {
  company: Company
  isAssigned: boolean
}

export function CompanyCard({ company, isAssigned }: CompanyCardProps) {
  const { setDraggedCompany, selectedCompany, setSelectedCompany } =
    useMapStore()
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

  return (
    <div
      draggable={!isAssigned}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() =>
        setSelectedCompany(isSelected ? null : company.id)
      }
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm transition-colors ${
        isAssigned
          ? "border-transparent bg-muted/50 text-muted-foreground"
          : "cursor-grab border-border bg-white hover:bg-gray-50 active:cursor-grabbing"
      } ${isSelected ? "ring-2 ring-primary" : ""}`}
    >
      {!isAssigned && (
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="flex-1 truncate text-xs font-medium">
        {company.name}
      </span>
      <div className="flex items-center gap-1">
        {isBothDays && (
          <Badge variant="outline" className="h-4 px-1 text-[10px]">
            W+T
          </Badge>
        )}
        <Badge
          className="h-4 px-1.5 text-[10px]"
          style={{
            backgroundColor: config.color,
            color: SPONSORSHIP_TEXT_COLOR[company.sponsorship],
          }}
        >
          {config.booths}
        </Badge>
      </div>
    </div>
  )
}
