import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { getGoogleSheetsClientForUser } from "@/lib/google-auth"
import { getDraftExportRows } from "@/lib/export"

// A burst of drags becomes one rewrite shortly after the last one lands.
const SYNC_DELAY_MS = 1500

function quoteSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`
}

/**
 * Rewrites the draft's connected worksheet with the current assignments. The
 * whole tab is replaced rather than patched, so the sheet always mirrors the
 * map exactly. Throws when nothing is connected or Google rejects the write.
 */
export async function writeDraftToGoogleSheet(draftId: string): Promise<void> {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { googleConnection: { select: { userId: true } } },
  })
  if (!draft) throw new Error("Draft not found")
  if (!draft.googleSpreadsheetId) {
    throw new Error("No Google Sheet is connected to this draft")
  }

  // The connection pinned to the draft is preferred; a draft configured before
  // connections were pinned falls back to its owner's account.
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
  // The sheet is read by people looking up a company, so it's A to Z by name
  // (the CSV export keeps booth order for walking the floor).
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

/**
 * Writes the sheet and records how it went on the draft, so the export card can
 * show when the sheet was last brought up to date or why it wasn't.
 */
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

/**
 * Runs one sync for the draft and settles when the draft is idle again.
 * Changes that arrive while waiting are covered by the upcoming read; changes
 * that arrive mid-write mark the entry dirty so exactly one follow-up runs.
 */
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

/**
 * Call after any change that alters the export (placing, moving, unassigning,
 * importing, editing or deleting a company). Returns immediately; the sheet is
 * rewritten after the response is sent, and only if the draft has a connected
 * sheet with auto-sync on.
 *
 * Coalescing is per process. Two server instances handling a burst may each
 * write once, which is harmless since every write reproduces the full state.
 */
export function scheduleGoogleSheetSync(draftId: string): void {
  after(() => syncSoon(draftId))
}
