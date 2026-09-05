import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { getGoogleSheetsClientForUser } from "@/lib/google-auth"
import { getDraftExportRows } from "@/lib/export"

const SYNC_DELAY_MS = 1500

function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`
}

export async function writeDraftToGoogleSheet(draftId: string): Promise<void> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { googleConnection: { select: { userId: true } } },
  })
  if (!draft) throw new Error("Draft not found")
  if (!draft.googleSpreadsheetId) {
    throw new Error("No Google Sheet is connected to this draft")
  }

  const sheets = await getGoogleSheetsClientForUser(
    draft.googleConnection?.userId ?? draft.userId
  )
  if (!sheets) {
    throw new Error(
      "Google authorization is not available. Please reconnect your Google account."
    )
  }

  const spreadsheetId = draft.googleSpreadsheetId
  const worksheetName = draft.googleWorksheetName || "Assignments"
  const rows = (await getDraftExportRows(draftId)).sort((a, b) =>
    a.Name.localeCompare(b.Name, undefined, { sensitivity: "base" })
  )
  const values = [
    ["Name", "DAYS REGISTERED", "ASSIGNMENT"],
    ...rows.map((row) => [row.Name, row["DAYS REGISTERED"], row.ASSIGNMENT]),
  ]

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  })
  const exists = meta.data.sheets?.some(
    (sheet) => sheet.properties?.title === worksheetName
  )
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: worksheetName } } }],
      },
    })
  }

  const tab = quoteSheetName(worksheetName)
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tab}!A:Z` })
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A1`,
    valueInputOption: "RAW",
    requestBody: { values },
  })
}

export async function syncDraftToGoogleSheet(
  draftId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await writeDraftToGoogleSheet(draftId)
    await prisma.draft.update({
      where: { id: draftId },
      data: { googleSyncedAt: new Date(), googleSyncError: null },
    })
    return { ok: true }
  } catch (err) {
    const error =
      err instanceof Error && err.message ? err.message : "Google Sheets update failed"
    await prisma.draft
      .update({ where: { id: draftId }, data: { googleSyncError: error } })
      .catch(() => {})
    return { ok: false, error }
  }
}

async function isAutoSyncOn(draftId: string): Promise<boolean> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    select: { googleAutoSync: true, googleSpreadsheetId: true },
  })
  return !!draft?.googleAutoSync && !!draft.googleSpreadsheetId
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type Pending = { phase: "waiting" | "writing"; dirty: boolean; done: Promise<void> }
const pending = new Map<string, Pending>()

function syncSoon(draftId: string): Promise<void> {
  const current = pending.get(draftId)
  if (current) {
    if (current.phase === "writing") current.dirty = true
    return current.done
  }

  const entry: Pending = { phase: "waiting", dirty: false, done: Promise.resolve() }
  entry.done = (async () => {
    try {
      do {
        entry.dirty = false
        entry.phase = "waiting"
        if (!(await isAutoSyncOn(draftId))) return
        await sleep(SYNC_DELAY_MS)
        entry.phase = "writing"
        await syncDraftToGoogleSheet(draftId)
      } while (entry.dirty)
    } finally {
      pending.delete(draftId)
    }
  })()
  pending.set(draftId, entry)
  return entry.done
}

export function scheduleGoogleSheetSync(draftId: string): void {
  after(() => syncSoon(draftId))
}
