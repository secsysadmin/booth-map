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
import { Upload } from "lucide-react"

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
          <p className="text-sm text-muted-foreground">
            Upload an .xlsx or .csv file with columns: Name, Sponsorship, Day(s)
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          <Button
            className="w-full"
            variant="outline"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : "Select File"}
          </Button>

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
