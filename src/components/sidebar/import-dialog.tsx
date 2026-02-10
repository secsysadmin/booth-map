"use client"

import { useState, useRef } from "react"
import { useApi } from "@/hooks/use-api"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Upload, ChevronDown, ChevronUp, Loader2 } from "lucide-react"

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftId: string
  onImportComplete: () => void
}

export function ImportDialog({
  open,
  onOpenChange,
  draftId,
  onImportComplete,
}: ImportDialogProps) {
  const { apiFetch } = useApi()
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{
    created: number
    updated: number
    errors: string[]
    total: number
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showExample, setShowExample] = useState(false)

  async function handleUpload(file: File) {
    setUploading(true)
    setResult(null)

    const formData = new FormData()
    formData.append("file", file)

    const res = await apiFetch(`/api/drafts/${draftId}/import`, {
      method: "POST",
      body: formData,
    })

    setUploading(false)

    if (res.ok) {
      const data = await res.json()
      setResult(data)
      toast.success(`Imported ${data.total} companies`)
      onImportComplete()
    } else {
      const err = await res.json()
      toast.error(err.error || "Import failed")
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Companies</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="text-sm text-muted-foreground">
            <p>Upload a .xlsx or .csv file with columns:</p>
            <p className="mt-1 font-medium text-foreground">Name, Sponsorship, Days</p>
            <button
              type="button"
              onClick={() => setShowExample(!showExample)}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {showExample ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showExample ? "Hide example" : "Show example"}
            </button>
            {showExample && (
              <div className="mt-2 overflow-x-auto rounded-md border bg-muted/50">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b text-left font-semibold text-foreground">
                      <th className="px-2 py-1">Name</th>
                      <th className="px-2 py-1">Sponsorship</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b"><td className="px-2 py-1">Acme Corp</td><td className="px-2 py-1 whitespace-nowrap">Gold Two-Day [$5500.00]</td></tr>
                    <tr className="border-b"><td className="px-2 py-1">Beta Inc</td><td className="px-2 py-1 whitespace-nowrap">Basic One-Day: Wednesday, Jan 28th [$1000.00]</td></tr>
                    <tr className="border-b"><td className="px-2 py-1">Gamma Labs</td><td className="px-2 py-1 whitespace-nowrap">Silver One-Day: Thursday, Jan 29th [$1800.00]</td></tr>
                    <tr><td className="px-2 py-1">Delta Eng</td><td className="px-2 py-1 whitespace-nowrap">Maroon Two-Day [$12500.00]</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed py-6">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Uploading and parsing...</p>
            </div>
          ) : (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Select File
            </Button>
          )}

          {result && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                Created: {result.created} &middot; Updated: {result.updated}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-destructive">
                    Errors ({result.errors.length}):
                  </p>
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
