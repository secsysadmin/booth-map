import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthUser } from "@/lib/auth"
import * as XLSX from "xlsx"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  // Format booth IDs: "G-14" → "G14", sorted by row then number
  function formatBoothIds(boothIds: string[]) {
    return [...boothIds]
      .sort((a, b) => {
        const [rowA, numA] = a.split("-")
        const [rowB, numB] = b.split("-")
        if (rowA !== rowB) return rowA.localeCompare(rowB)
        return parseInt(numA) - parseInt(numB)
      })
      .map((id) => id.replace("-", ""))
      .join(", ")
  }

  // Format days for display
  function formatDays(day: string | null, companyDays: string[]) {
    if (day === null) return "Wednesday Thursday"
    if (day === "WEDNESDAY") return "Wednesday"
    if (day === "THURSDAY") return "Thursday"
    return companyDays.map((d) => d === "WEDNESDAY" ? "Wednesday" : "Thursday").join(" ")
  }

  const rows = draft.assignments
    .map((a) => ({
      "Name": a.company.name,
      "DAYS REGISTERED": formatDays(a.day, a.company.days),
      "ASSIGNMENT": formatBoothIds(a.boothIds),
    }))
    .sort((a, b) => {
      // Sort by assignment (row letter first, then number)
      const aFirst = a["ASSIGNMENT"].split(",")[0].trim()
      const bFirst = b["ASSIGNMENT"].split(",")[0].trim()
      const aRow = aFirst.match(/^([A-Q])/)?.[1] || ""
      const bRow = bFirst.match(/^([A-Q])/)?.[1] || ""
      if (aRow !== bRow) return aRow.localeCompare(bRow)
      const aNum = parseInt(aFirst.slice(1)) || 0
      const bNum = parseInt(bFirst.slice(1)) || 0
      return aNum - bNum
    })

  const sheet = XLSX.utils.json_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(sheet)

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${draft.name}-Assignments.csv"`,
    },
  })
}
