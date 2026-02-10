"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useApi } from "@/hooks/use-api"
import { useMapStore } from "@/store/map-store"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import dynamic from "next/dynamic"
import { CompanySidebar } from "@/components/sidebar/company-sidebar"
import { ImportDialog } from "@/components/sidebar/import-dialog"

const BoothMap = dynamic(
  () => import("@/components/map/booth-map").then((mod) => mod.BoothMap),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-muted-foreground">Loading map...</div> }
)
import { ArrowLeft, Download, Upload } from "lucide-react"
import type { Day } from "@/types"
import { toast } from "sonner"

export default function EditorPage() {
  const params = useParams()
  const router = useRouter()
  const draftId = params.draftId as string
  const { user, loading } = useAuth()
  const { apiFetch } = useApi()
  const [draftName, setDraftName] = useState("")
  const [importOpen, setImportOpen] = useState(false)

  const {
    activeDay,
    setActiveDay,
    setDraftId,
    setCompanies,
    setAssignments,
  } = useMapStore()

  const loadDraft = useCallback(async () => {
    const res = await apiFetch(`/api/drafts/${draftId}`)
    if (res.ok) {
      const draft = await res.json()
      setDraftName(draft.name)
      setDraftId(draft.id)
      setCompanies(draft.companies)
      setAssignments(draft.assignments)
    } else {
      router.push("/dashboard")
    }
  }, [apiFetch, draftId, setDraftId, setCompanies, setAssignments, router])

  useEffect(() => {
    if (!loading && !user) {
      router.push("/")
      return
    }
    if (user) loadDraft()
  }, [user, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport(day: Day) {
    const url = `/api/drafts/${draftId}/export?day=${day}`
    const dayLabel = day === "WEDNESDAY" ? "Wednesday" : "Thursday"

    const res = await apiFetch(url)
    if (res.ok) {
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = downloadUrl
      a.download = `${draftName}-${dayLabel}.csv`
      a.click()
      URL.revokeObjectURL(downloadUrl)
      toast.success("Export downloaded")
    } else {
      toast.error("Export failed")
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold">{draftName}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Tabs
            value={activeDay}
            onValueChange={(v) => setActiveDay(v as Day)}
          >
            <TabsList>
              <TabsTrigger value="WEDNESDAY">Wednesday</TabsTrigger>
              <TabsTrigger value="THURSDAY">Thursday</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-1 h-4 w-4" />
            Import
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="mr-1 h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport("WEDNESDAY")}>
                Wednesday
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("THURSDAY")}>
                Thursday
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <CompanySidebar />
        <div className="flex-1 overflow-hidden bg-gray-100">
          <BoothMap />
        </div>
      </div>

      {/* Import dialog */}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        draftId={draftId}
        onImportComplete={loadDraft}
      />
    </div>
  )
}
