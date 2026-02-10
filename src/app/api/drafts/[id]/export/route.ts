import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"
import * as XLSX from "xlsx"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(req)
  if (limited) return limited
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const dayFilter = searchParams.get("day")?.toUpperCase()

  const draft = await prisma.draft.findFirst({
    where: { id, userId: user.id },
    include: {
      assignments: { include: { company: true } },
    },
  })

  if (!draft)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  const day = dayFilter || "WEDNESDAY"

  const dayAssignments = draft.assignments.filter(
    (a) => a.day === null || a.day === day
  )

  const rows = dayAssignments
    .map((a) => ({
      "Company Name": a.company.name,
      "Sponsorship": a.company.sponsorship,
      "Booth Number(s)": [...a.boothIds]
        .sort((x, y) => parseInt(x.split("-")[1]) - parseInt(y.split("-")[1]))
        .join(", "),
    }))
    .sort((a, b) => a["Company Name"].localeCompare(b["Company Name"]))

  const sheet = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(sheet)

  const dayLabel = day === "WEDNESDAY" ? "Wednesday" : "Thursday"

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${draft.name}-${dayLabel}.csv"`,
    },
  })
}
