"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { useApi } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"
import { Plus, MoreVertical, Copy, Trash2, Pencil, KeyRound } from "lucide-react"

interface DraftSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  _count: { companies: number; assignments: number }
}

export default function DashboardPage() {
  const { user, loading, signOut, updatePassword } = useAuth()
  const { apiFetch } = useApi()
  const router = useRouter()
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [newDraftName, setNewDraftName] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState("")
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/")
    }
  }, [user, loading, router])

  async function loadDrafts() {
    const res = await apiFetch("/api/drafts")
    if (res.ok) {
      setDrafts(await res.json())
    }
  }

  useEffect(() => {
    if (user) loadDrafts() // eslint-disable-line react-hooks/set-state-in-effect
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createDraft() {
    const res = await apiFetch("/api/drafts", {
      method: "POST",
      body: JSON.stringify({ name: newDraftName || "Untitled Draft" }),
    })
    if (res.ok) {
      setNewDraftName("")
      setDialogOpen(false)
      toast.success("Draft created")
      loadDrafts()
    }
  }

  async function duplicateDraft(id: string) {
    const res = await apiFetch(`/api/drafts/${id}/duplicate`, {
      method: "POST",
    })
    if (res.ok) {
      toast.success("Draft duplicated")
      loadDrafts()
    }
  }

  async function deleteDraft(id: string) {
    const res = await apiFetch(`/api/drafts/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Draft deleted")
      loadDrafts()
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    setChangingPassword(true)
    const { error } = await updatePassword(newPassword)
    setChangingPassword(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success("Password updated")
      setPasswordOpen(false)
      setNewPassword("")
      setConfirmPassword("")
    }
  }

  async function renameDraft() {
    if (!renameId) return
    const res = await apiFetch(`/api/drafts/${renameId}`, {
      method: "PUT",
      body: JSON.stringify({ name: renameName }),
    })
    if (res.ok) {
      toast.success("Draft renamed")
      setRenameId(null)
      loadDrafts()
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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-xl font-semibold">Career Fair Booth Map</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Dialog open={passwordOpen} onOpenChange={(open) => {
              setPasswordOpen(open)
              if (!open) { setNewPassword(""); setConfirmPassword("") }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Password</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && changePassword()}
                      minLength={6}
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={changePassword}
                    disabled={changingPassword || !newPassword || !confirmPassword}
                  >
                    {changingPassword ? "Updating..." : "Update Password"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium">Your Drafts</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Draft
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Draft</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="Draft name"
                  value={newDraftName}
                  onChange={(e) => setNewDraftName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createDraft()}
                />
                <Button className="w-full" onClick={createDraft}>
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Rename dialog */}
        <Dialog
          open={renameId !== null}
          onOpenChange={(open) => !open && setRenameId(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Draft</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Input
                placeholder="New name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && renameDraft()}
              />
              <Button className="w-full" onClick={renameDraft}>
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {drafts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No drafts yet. Create one to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {drafts.map((draft) => (
              <Card
                key={draft.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => router.push(`/dashboard/${draft.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{draft.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            setRenameName(draft.name)
                            setRenameId(draft.id)
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            duplicateDraft(draft.id)
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteDraft(draft.id)
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription>
                    {draft._count.companies} companies &middot;{" "}
                    {draft._count.assignments} assigned
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Updated{" "}
                    {new Date(draft.updatedAt).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
