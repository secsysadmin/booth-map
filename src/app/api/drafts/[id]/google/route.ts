import { NextRequest, NextResponse } from "next/server"
import { getAuthUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseGoogleSpreadsheetId, verifyGoogleSheetAccess, createGoogleErrorResponse } from "@/lib/google-auth"
import { syncDraftToGoogleSheet } from "@/lib/google-sync"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : "update"
  const draft = await prisma.draft.findFirst({
    where: { id, userId: user.id },
    include: { googleConnection: true },
  })

  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 })

  const userGoogleConnection = await prisma.googleConnection.findUnique({
    where: { userId: user.id },
  })
  const activeGoogleConnection = draft.googleConnection ?? userGoogleConnection

  const spreadsheetUrl = typeof body.spreadsheetUrl === "string" ? body.spreadsheetUrl.trim() : draft.googleSheetUrl ?? ""
  const spreadsheetId = parseGoogleSpreadsheetId(spreadsheetUrl) ?? draft.googleSpreadsheetId
  const worksheetName = typeof body.worksheetName === "string" ? body.worksheetName.trim() : draft.googleWorksheetName ?? "Assignments"

  if (!spreadsheetId) {
    return NextResponse.json({ error: "Please provide a valid Google Sheets URL" }, { status: 400 })
  }

  if (!activeGoogleConnection) {
    return NextResponse.json({ error: "Please connect your Google account first" }, { status: 400 })
  }

  try {
    await verifyGoogleSheetAccess(user.id, spreadsheetId)

    await prisma.draft.update({
      where: { id },
      data: {
        googleSheetUrl: spreadsheetUrl,
        googleSpreadsheetId: spreadsheetId,
        googleWorksheetName: worksheetName || "Assignments",
        googleConnectionId: activeGoogleConnection.id,
      },
    })

    if (action === "test") {
      return NextResponse.json({ success: true, message: "Google Sheets connection verified" })
    }
  } catch (error) {
    return createGoogleErrorResponse(error, "Unable to update Google Sheet")
  }

  // Same writer the background auto-sync uses, so the two can't drift apart.
  const result = await syncDraftToGoogleSheet(id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ success: true, message: "Google Sheet updated" })
}
