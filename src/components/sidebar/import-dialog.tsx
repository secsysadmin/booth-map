"use client"

import { useRef, useState } from "react"
import { useApi } from "@/hooks/use-api"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { ImportPreview } from "@/types"
import {
  ChevronDown,
  ChevronUp,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react"

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftId: string
  onImportComplete: () => void
}

type ImportMode = "merge" | "replace"

interface ApplyResult {
  created: number
  updated: number
  unchanged: number
  removed: number
  placed: number
  droppedAssignments: number
  errors: string[]
  total: number
}

const PLACEHOLDER = `Helmerich & Payne
Mara Zannotti
mara.zannotti@hpinc.com
Basic Two-Day [$2000.00]
Day 1 (Wednesday, September 9th)
Day 2 (Thursday, September 10th)
Pending
Aug 10, 2026, 10:52 AM`

/**
 * Two-step import: preview the diff, then apply it. Accepts a pasted report
 * (block format, or rows copied out of Sheets) or an uploaded spreadsheet.
 */
export function ImportDialog({
  open,
  onOpenChange,
  draftId,
  onImportComplete,
}: ImportDialogProps) {
  const { apiFetch } = useApi()
  const [text, setText] = useState("")
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [mode, setMode] = useState<ImportMode>("merge")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [showExample, setShowExample] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function resetAll() {
    setText("")
    setPendingFile(null)
    setPreview(null)
    setResult(null)
    setBusy(false)
  }

  async function post(isPreview: boolean) {
    if (pendingFile) {
      const formData = new FormData()
      formData.append("file", pendingFile)
      formData.append("mode", mode)
      formData.append("preview", String(isPreview))
      return apiFetch(`/api/drafts/${draftId}/import`, {
        method: "POST",
        body: formData,
      })
    }
    return apiFetch(`/api/drafts/${draftId}/import`, {
      method: "POST",
      body: JSON.stringify({ text, mode, preview: isPreview }),
    })
  }

  async function runPreview() {
    if (!pendingFile && !text.trim()) {
      toast.error("Paste a report or choose a file first")
      return
    }
    setBusy(true)
    setResult(null)
    const res = await post(true)
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || "Could not read that report")
      return
    }
    setPreview(await res.json())
  }

  async function runApply() {
    setBusy(true)
    const res = await post(false)
    setBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error || "Import failed")
      return
    }
    const data: ApplyResult = await res.json()
    setResult(data)
    setPreview(null)
    setText("")
    setPendingFile(null)
    toast.success(
      `Imported ${data.total} registrations (${data.created} new, ${data.updated} updated)` +
        (data.placed > 0 ? `, ${data.placed} placed on the map` : "")
    )
    onImportComplete()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setText("")
    setPreview(null)
    setResult(null)
    e.target.value = ""
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) resetAll()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import registration report</DialogTitle>
          <DialogDescription>
            Upload a spreadsheet, paste rows copied out of Google Sheets, or paste the
            block-style report — the format is detected automatically. Registrations are
            matched on company name plus the &ldquo;Registered On&rdquo; date, so a company
            that cancels and re-registers stays two rows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Choose file
            </Button>
            <span className="text-xs text-muted-foreground">or paste below</span>
            <button
              type="button"
              onClick={() => setShowExample(!showExample)}
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {showExample ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              {showExample ? "Hide" : "Show"} accepted formats
            </button>
          </div>

          {showExample && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-[11px] text-muted-foreground">
              <p>
                <b className="text-foreground">Block format</b> — one field per line, a
                blank line between companies. Fields are matched by shape, so extra
                columns are ignored.
              </p>
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono">{PLACEHOLDER}</pre>
              <p>
                <b className="text-foreground">Spreadsheet / CSV / TSV</b> — one company
                per row. A header row is skipped automatically. The package cell carries
                the tier and days, e.g. <code>Gold Two-Day [$5500.00]</code> or{" "}
                <code>Basic One-Day: Wednesday, Jan 28th [$1000.00]</code>.
              </p>
              <p>
                A status cell reading Confirmed, Pending or Canceled sets the
                registration status; without one, companies come in as confirmed.
              </p>
              <p>
                A <code>Number of booths</code> column overrides the tier&rsquo;s default
                count — that is how a Diamond sponsor with a single booth comes through
                correctly. A <code>Booth assigned</code> column like <code>P-28</code> or{" "}
                <code>A-13, A-14, A-15</code> places the company on the map, as long as it
                is confirmed, the booths are free, and there are as many of them as the
                company booked. Anything that doesn&rsquo;t fit is listed as a warning
                instead of being forced onto the floor.
              </p>
            </div>
          )}

          {pendingFile ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <FileUp className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{pendingFile.name}</span>
              <button
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setPendingFile(null)
                  setPreview(null)
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setPreview(null)
              }}
              placeholder={PLACEHOLDER}
              className="min-h-[180px] w-full resize-y rounded-md border p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}

          <div className="flex flex-wrap gap-4 text-sm">
            {(
              [
                ["merge", "Update & add", "Keeps companies not in this import"],
                ["replace", "Replace all", "Removes registrations missing from this import"],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="importMode"
                  checked={mode === value}
                  onChange={() => {
                    setMode(value)
                    setPreview(null)
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="text-sm">{label}</span>
                  <span className="block text-[11px] text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>

          {preview && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
              <p className="text-sm">
                <b>{preview.parsed} registrations parsed:</b>{" "}
                <span className="font-semibold text-green-700">{preview.created} new</span>,{" "}
                <span className="font-semibold text-amber-700">{preview.updated} updated</span>,{" "}
                <span className="text-muted-foreground">{preview.unchanged} unchanged</span>
                {preview.removed.length > 0 && (
                  <>
                    ,{" "}
                    <span className="font-semibold text-destructive">
                      {preview.removed.length} will be removed
                    </span>
                  </>
                )}
                {preview.placed > 0 && (
                  <>
                    ,{" "}
                    <span className="font-semibold text-blue-700">
                      {preview.placed} placed on the map
                    </span>
                  </>
                )}
              </p>

              {preview.items.length > 0 && (
                <ul className="max-h-44 space-y-1 overflow-y-auto">
                  {preview.items.map((item, i) => (
                    <li key={i}>
                      <span
                        className={`mr-1.5 font-semibold ${
                          item.kind === "new" ? "text-green-700" : "text-amber-700"
                        }`}
                      >
                        {item.kind === "new" ? "NEW" : "UPDATED"}
                      </span>
                      {item.name}
                      {item.changes.length > 0 && ` — ${item.changes.join("; ")}`}
                      {item.booths && item.booths.length > 0 && (
                        <span className="text-blue-700">
                          {" "}
                          → {item.booths.join(", ")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {preview.removed.length > 0 && (
                <p>
                  <span className="font-semibold text-destructive">Removed:</span>{" "}
                  {preview.removed.join(", ")}
                </p>
              )}

              {preview.warnings.length > 0 && (
                <div>
                  <p className="font-semibold text-destructive">
                    Warnings ({preview.warnings.length})
                  </p>
                  <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-muted-foreground">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                Created: {result.created} &middot; Updated: {result.updated} &middot;
                Unchanged: {result.unchanged}
                {result.removed > 0 && ` · Removed: ${result.removed}`}
              </p>
              {result.droppedAssignments > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  {result.droppedAssignments} booth placement
                  {result.droppedAssignments === 1 ? " was" : "s were"} cleared because the
                  company is no longer confirmed or its booth count changed.
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-destructive">
                    Skipped rows ({result.errors.length})
                  </p>
                  <ul className="mt-1 max-h-32 list-inside list-disc overflow-y-auto text-xs text-muted-foreground">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {busy && <Loader2 className="mr-auto h-4 w-4 animate-spin text-primary" />}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Close
            </Button>
            {preview ? (
              <Button onClick={runApply} disabled={busy || preview.parsed === 0}>
                Apply import
              </Button>
            ) : (
              <Button onClick={runPreview} disabled={busy}>
                Preview changes
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
