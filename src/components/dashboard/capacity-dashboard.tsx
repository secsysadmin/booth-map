"use client"

import { useMemo, useState } from "react"
import { useMapStore } from "@/store/map-store"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  REGISTRATION_STATUS_CONFIG,
  REGISTRATION_STATUS_ORDER,
  SPONSORSHIP_CONFIG,
} from "@/lib/constants"
import type { Company, Day, DayCapacity, RegistrationStatus } from "@/types"
import { AlertTriangle, Search, Trash2 } from "lucide-react"
import { toast } from "sonner"

const DAYS: { day: Day; title: string; subtitle: string }[] = [
  { day: "WEDNESDAY", title: "Day 1", subtitle: "Wednesday" },
  { day: "THURSDAY", title: "Day 2", subtitle: "Thursday" },
]

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

function dayChips(days: Day[]) {
  return days.map((d) => (
    <Badge key={d} variant="outline" className="h-4 px-1.5 text-[10px] font-medium">
      {d === "WEDNESDAY" ? "Wed" : "Thu"}
    </Badge>
  ))
}

/** One day's booth demand against the capacity target. */
function DayCard({
  title,
  subtitle,
  capacity,
  stats,
}: {
  title: string
  subtitle: string
  capacity: number
  stats: DayCapacity
}) {
  const total = stats.confirmed + stats.pending + stats.blocked
  const remaining = capacity - total
  const over = total > capacity

  const confirmedPct = Math.min(100, (stats.confirmed / capacity) * 100)
  const pendingPct = Math.min(100 - confirmedPct, (stats.pending / capacity) * 100)
  const blockedPct = Math.min(
    100 - confirmedPct - pendingPct,
    (stats.blocked / capacity) * 100
  )

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{subtitle}</p>

      <p className="mt-3 text-3xl font-bold leading-none tracking-tight">
        {stats.confirmed}
        <span className="ml-2 text-sm font-medium text-muted-foreground">
          / {capacity} booths confirmed
        </span>
      </p>

      <div className="mt-4 flex h-5 overflow-hidden rounded-md bg-slate-100">
        <div style={{ width: `${confirmedPct}%`, backgroundColor: "#500000" }} />
        <div style={{ width: `${pendingPct}%`, backgroundColor: "#e8a020" }} />
        <div style={{ width: `${blockedPct}%`, backgroundColor: "#a1a1aa" }} />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {[
          ["#500000", "Confirmed"],
          ["#e8a020", "Pending"],
          ["#a1a1aa", "Blocked"],
          ["#f1f5f9", "Available"],
        ].map(([color, label]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10"
              style={{ backgroundColor: color }}
            />
            {label}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
        <span>
          <b className="block text-lg font-semibold" style={{ color: "#500000" }}>
            {stats.confirmed}
          </b>
          confirmed
        </span>
        <span>
          <b className="block text-lg font-semibold" style={{ color: "#a16207" }}>
            {stats.pending}
          </b>
          pending
        </span>
        <span>
          <b className="block text-lg font-semibold text-foreground">
            {stats.blocked}
          </b>
          blocked
        </span>
        <span>
          <b
            className={`block text-lg font-semibold ${
              remaining < 0 ? "text-destructive" : "text-green-700"
            }`}
          >
            {remaining}
          </b>
          left if all pending confirm
        </span>
        <span>
          <b className="block text-lg font-semibold text-foreground">
            {capacity - stats.confirmed - stats.blocked}
          </b>
          left counting confirmed only
        </span>
      </div>

      {over && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          Over capacity by {total - capacity} booths if all pending confirm
        </p>
      )}
    </div>
  )
}

export function CapacityDashboard() {
  const {
    companies,
    capacityPerDay,
    saveCapacityPerDay,
    getDayCapacity,
    updateCompany,
    deleteCompany,
  } = useMapStore()

  const [capacityInput, setCapacityInput] = useState(String(capacityPerDay))
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | "all">("all")
  const [dayFilter, setDayFilter] = useState<Day | "all">("all")
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  // Blocked booths live as placeholder companies; they aren't registrations.
  const registrations = useMemo(
    () => companies.filter((c) => !c.isPlaceholder),
    [companies]
  )

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of registrations) {
      const key = normalizeName(c.name)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [registrations])

  const statusCounts = useMemo(() => {
    const counts: Record<RegistrationStatus, number> = {
      CONFIRMED: 0,
      PENDING: 0,
      CANCELED: 0,
    }
    for (const c of registrations) counts[c.status]++
    return counts
  }, [registrations])

  const wed = getDayCapacity("WEDNESDAY")
  const thu = getDayCapacity("THURSDAY")

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return registrations
      .filter((c) => {
        if (
          q &&
          !`${c.name} ${c.contactName ?? ""} ${c.contactEmail ?? ""}`
            .toLowerCase()
            .includes(q)
        )
          return false
        if (statusFilter !== "all" && c.status !== statusFilter) return false
        if (dayFilter !== "all" && !c.days.includes(dayFilter)) return false
        return true
      })
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          (a.registeredOn ?? "").localeCompare(b.registeredOn ?? "")
      )
  }, [registrations, search, statusFilter, dayFilter])

  function commitCapacity() {
    const value = Number(capacityInput)
    if (!Number.isInteger(value) || value < 1) {
      setCapacityInput(String(capacityPerDay))
      toast.error("Capacity must be a whole number greater than 0")
      return
    }
    saveCapacityPerDay(value)
  }

  async function changeStatus(company: Company, status: RegistrationStatus) {
    if (status === company.status) return
    try {
      await updateCompany(company.id, { status })
      toast.success(
        `${company.name} marked ${REGISTRATION_STATUS_CONFIG[status].label.toLowerCase()}`
      )
    } catch {
      // Store already showed the error
    }
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Registrations</h1>
          <p className="text-xs text-muted-foreground">
            {registrations.length} registrations &middot; {statusCounts.CONFIRMED}{" "}
            confirmed, {statusCounts.PENDING} pending, {statusCounts.CANCELED}{" "}
            canceled
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          Capacity per day
          <Input
            type="number"
            min={1}
            value={capacityInput}
            onChange={(e) => setCapacityInput(e.target.value)}
            onBlur={commitCapacity}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
            className="h-8 w-24 text-center text-sm font-semibold"
          />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {DAYS.map(({ day, title, subtitle }) => (
          <DayCard
            key={day}
            title={title}
            subtitle={subtitle}
            capacity={capacityPerDay}
            stats={day === "WEDNESDAY" ? wed : thu}
          />
        ))}
      </div>

      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">Overall</h2>
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Registrations", registrations.length],
            ["Confirmed", statusCounts.CONFIRMED],
            ["Pending", statusCounts.PENDING],
            ["Canceled", statusCounts.CANCELED],
            ["Wed booths (conf + pend)", `${wed.confirmed} + ${wed.pending}`],
            ["Thu booths (conf + pend)", `${thu.confirmed} + ${thu.pending}`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-xl font-semibold tracking-tight">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">Companies</h2>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search company or contact..."
                className="h-9 w-56 pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as RegistrationStatus | "all")}
            >
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {REGISTRATION_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {REGISTRATION_STATUS_CONFIG[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={dayFilter}
              onValueChange={(v) => setDayFilter(v as Day | "all")}
            >
              <SelectTrigger className="h-9 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both days</SelectItem>
                <SelectItem value="WEDNESDAY">Day 1 (Wed)</SelectItem>
                <SelectItem value="THURSDAY">Day 2 (Thu)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Package</TableHead>
                <TableHead>Booths</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                    {registrations.length === 0 ? (
                      <>
                        <b className="text-foreground">No companies yet.</b>
                        <br />
                        Use Import to bring in your registration report.
                      </>
                    ) : (
                      "No companies match your filters."
                    )}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((c, i) => {
                const config = SPONSORSHIP_CONFIG[c.sponsorship]
                const statusConfig = REGISTRATION_STATUS_CONFIG[c.status]
                const duplicates = nameCounts.get(normalizeName(c.name)) ?? 1
                const isCustomCount = c.boothCount !== config.booths
                return (
                  <TableRow
                    key={c.id}
                    className={c.status === "CANCELED" ? "opacity-50" : undefined}
                  >
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium">{c.name}</span>
                        {duplicates > 1 && (
                          <Badge
                            variant="outline"
                            className="h-4 border-blue-200 bg-blue-50 px-1.5 text-[10px] text-blue-700"
                            title="This company has multiple registrations"
                          >
                            &times;{duplicates}
                          </Badge>
                        )}
                      </div>
                      {(c.contactName || c.contactEmail) && (
                        <p className="text-[11px] text-muted-foreground">
                          {[c.contactName, c.contactEmail].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className="h-5 px-2 text-[10px]"
                        style={{ backgroundColor: config.color, color: "#fff" }}
                      >
                        {config.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold">{c.boothCount}</span>
                      {isCustomCount ? (
                        <Badge
                          variant="outline"
                          className="ml-1.5 h-4 border-amber-200 bg-amber-50 px-1.5 text-[10px] text-amber-700"
                          title={`Custom booth count (${config.label} default is ${config.booths})`}
                        >
                          custom
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground"> / day</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">{dayChips(c.days)}</div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusConfig.badgeClass}`}
                          >
                            {statusConfig.label}
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuLabel className="text-xs">
                            Set status
                          </DropdownMenuLabel>
                          {REGISTRATION_STATUS_ORDER.map((s) => (
                            <DropdownMenuItem
                              key={s}
                              className="text-xs"
                              onClick={() => changeStatus(c, s)}
                            >
                              {REGISTRATION_STATUS_CONFIG[s].label}
                              {s === c.status && " ✓"}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {c.status !== "CONFIRMED" && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          not placeable
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {c.registeredOn || "—"}
                    </TableCell>
                    <TableCell>
                      {confirmingDelete === c.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2 text-[10px]"
                            onClick={async () => {
                              try {
                                await deleteCompany(c.id)
                                toast.success(`Removed ${c.name}`)
                              } catch {
                                // Store already showed the error
                              }
                              setConfirmingDelete(null)
                            }}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => setConfirmingDelete(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Remove this registration"
                          onClick={() => setConfirmingDelete(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {rows.length} of {registrations.length} registrations
        </p>
      </div>
    </div>
  )
}
