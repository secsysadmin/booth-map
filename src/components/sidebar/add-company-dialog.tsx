"use client"

import { useState } from "react"
import { useMapStore } from "@/store/map-store"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SPONSORSHIP_CONFIG } from "@/lib/constants"
import type { Day, Industry, Sponsorship } from "@/types"
import { toast } from "sonner"

const TIERS: Sponsorship[] = ["MAROON", "DIAMOND", "GOLD", "SILVER", "BASIC"]
const INDUSTRIES: Industry[] = [
  "AEROSPACE",
  "MECHANICAL",
  "ENERGY",
  "CHEMICALS",
  "OIL",
  "CIVIL",
  "TECH",
  "SEMICONDUCTORS",
  "OTHER",
]

function industryLabel(industry: Industry) {
  return industry.charAt(0) + industry.slice(1).toLowerCase()
}

interface AddCompanyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddCompanyDialog({ open, onOpenChange }: AddCompanyDialogProps) {
  const { createCompany, activeDay } = useMapStore()
  const [name, setName] = useState("")
  const [sponsorship, setSponsorship] = useState<Sponsorship>("BASIC")
  const [wednesday, setWednesday] = useState(true)
  const [thursday, setThursday] = useState(true)
  const [industry, setIndustry] = useState<Industry>("OTHER")
  const [boothCountInput, setBoothCountInput] = useState("")
  const [saving, setSaving] = useState(false)

  const defaultBooths = SPONSORSHIP_CONFIG[sponsorship].booths
  const boothCount = boothCountInput.trim() === "" ? defaultBooths : Number(boothCountInput)

  function reset() {
    setName("")
    setSponsorship("BASIC")
    setWednesday(true)
    setThursday(true)
    setIndustry("OTHER")
    setBoothCountInput("")
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Enter a company name")
      return
    }
    const days: Day[] = []
    if (wednesday) days.push("WEDNESDAY")
    if (thursday) days.push("THURSDAY")
    if (days.length === 0) {
      toast.error("Pick at least one day")
      return
    }
    if (!Number.isInteger(boothCount) || boothCount < 1) {
      toast.error("Booth count must be a whole number greater than 0")
      return
    }

    setSaving(true)
    try {
      await createCompany({ name: trimmed, sponsorship, days, boothCount, industry })
      const visibleToday = days.includes(activeDay)
      toast.success(
        visibleToday
          ? `Added ${trimmed}`
          : `Added ${trimmed} — switch days to see it in the list`
      )
      handleOpenChange(false)
    } catch {
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add company</DialogTitle>
            <DialogDescription>
              Adds a confirmed company to this draft without importing a report.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label htmlFor="add-company-name">Company name</Label>
            <Input
              id="add-company-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Robotics"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tier</Label>
              <Select value={sponsorship} onValueChange={(v) => setSponsorship(v as Sponsorship)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {SPONSORSHIP_CONFIG[tier].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-company-booths">Booths</Label>
              <Input
                id="add-company-booths"
                type="number"
                min={1}
                inputMode="numeric"
                value={boothCountInput}
                placeholder={String(defaultBooths)}
                onChange={(e) => setBoothCountInput(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Days</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={wednesday}
                  onChange={(e) => setWednesday(e.target.checked)}
                />
                Wednesday
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={thursday}
                  onChange={(e) => setThursday(e.target.checked)}
                />
                Thursday
              </label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Industry</Label>
            <Select value={industry} onValueChange={(v) => setIndustry(v as Industry)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRIES.map((ind) => (
                  <SelectItem key={ind} value={ind}>
                    {industryLabel(ind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
