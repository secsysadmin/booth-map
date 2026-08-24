import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import * as XLSX from "xlsx"
import { getDraftExportRows, getPlacementReportRows } from "@/lib/export"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const format = searchParams.get("format")

  const draft = await prisma.draft.findFirst({
    where: { id, userId: user.id },
  })

  if (!draft)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  // "report" lists every confirmed company per day, placed or not, so the gaps
  // are as visible as the placements. Default stays the assignments-only CSV.
  const isReport = format === "report"
  const rows = isReport
    ? await getPlacementReportRows(id)
    : await getDraftExportRows(id)

  const sheet = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(sheet)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${draft.name}-${
        isReport ? "Placement-Report" : "Assignments"
      }.csv"`,
    },
  })
}
