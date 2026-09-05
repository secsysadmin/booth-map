"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface GoogleSyncStatus {
  syncedAt: string | null
  error: string | null
}

interface GoogleSheetsExportCardProps {
  googleSheetUrl: string
  googleWorksheetName: string
  googleConnectionEmail: string | null
  googleAutoSync: boolean
  googleSyncStatus: GoogleSyncStatus
  googleBusy: boolean
  onGoogleSheetUrlChange: (value: string) => void
  onGoogleWorksheetNameChange: (value: string) => void
  onGoogleAutoSyncChange: (value: boolean) => void
  onSaveGoogleSettings: () => void
  onConnectGoogle: () => void
  onTestGoogleConnection: () => void
  onUpdateGoogleSheet: () => void
  onDisconnectGoogle: () => void
}

function formatSyncTime(iso: string) {
  const date = new Date(iso)
  const today = new Date().toDateString() === date.toDateString()
  return today
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function GoogleSheetsExportCard({
  googleSheetUrl,
  googleWorksheetName,
  googleConnectionEmail,
  googleAutoSync,
  googleSyncStatus,
  googleBusy,
  onGoogleSheetUrlChange,
  onGoogleWorksheetNameChange,
  onGoogleAutoSyncChange,
  onSaveGoogleSettings,
  onConnectGoogle,
  onTestGoogleConnection,
  onUpdateGoogleSheet,
  onDisconnectGoogle,
}: GoogleSheetsExportCardProps) {
  const sheetLinked = googleSheetUrl.trim().length > 0 && googleConnectionEmail !== null

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Google Sheets Export</CardTitle>
        <CardDescription>Connect a Google account and send the current draft into a spreadsheet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="google-sheet-url">Google Sheet URL</Label>
          <CardDescription>Copy and paste a shareable link</CardDescription>
          <Input
            id="google-sheet-url"
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={googleSheetUrl}
            onChange={(e) => onGoogleSheetUrlChange(e.target.value)}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="google-worksheet-name">Worksheet Name</Label>
          <CardDescription>Enter the name of the specific sheet, not the title of the Google Sheet file</CardDescription>

          <Input
            id="google-worksheet-name"
            value={googleWorksheetName}
            onChange={(e) => onGoogleWorksheetNameChange(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onSaveGoogleSettings}>
            Save Settings
          </Button>
          {googleConnectionEmail ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={onTestGoogleConnection} disabled={googleBusy}>
                Test Connection
              </Button>
              <Button type="button" variant="default" size="sm" onClick={onUpdateGoogleSheet} disabled={googleBusy}>
                Update Google Sheet
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={onDisconnectGoogle} disabled={googleBusy}>
                Disconnect
              </Button>
            </>
          ) : (
            <Button type="button" variant="default" size="sm" onClick={onConnectGoogle} disabled={googleBusy}>
              Connect Google Account
            </Button>
          )}
        </div>

        {googleConnectionEmail ? (
          <p className="text-sm text-muted-foreground">Connected account: {googleConnectionEmail}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No Google account connected yet.</p>
        )}

        <div className="space-y-1 rounded-md border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={googleAutoSync}
              disabled={googleBusy}
              onChange={(e) => onGoogleAutoSyncChange(e.target.checked)}
            />
            Auto-sync booth changes to this sheet
          </label>
          <CardDescription>
            Placing, moving, or removing a company rewrites the worksheet a moment later.
            Anything typed into that tab by hand is replaced on the next change.
          </CardDescription>
          {sheetLinked && googleSyncStatus.error ? (
            <p className="text-sm text-destructive">Last sync failed: {googleSyncStatus.error}</p>
          ) : sheetLinked && googleSyncStatus.syncedAt ? (
            <p className="text-sm text-muted-foreground">Last synced {formatSyncTime(googleSyncStatus.syncedAt)}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
