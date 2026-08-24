import { prisma } from "@/lib/prisma"

// Helper functions for formatting booth IDs and days
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

function formatDays(day: string | null, companyDays: string[]) {
    if (day === null) return "Wednesday Thursday"
    if (day === "WEDNESDAY") return "Wednesday"
    if (day === "THURSDAY") return "Thursday"
    return companyDays.map((d) => d === "WEDNESDAY" ? "Wednesday" : "Thursday").join(" ")
}

export async function getDraftExportRows(draftId: string) {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId },
    include: {
      assignments: { include: { company: true } },
    },
  })

  if (!draft) {
    throw new Error("Draft not found")
  }

  return draft.assignments
    .map((a) => ({
      Name: a.company.name,
      "DAYS REGISTERED": formatDays(a.day, a.company.days),
      ASSIGNMENT: formatBoothIds(a.boothIds),
    }))
    .sort((a, b) => {
      const aFirst = a.ASSIGNMENT.split(",")[0].trim()
      const bFirst = b.ASSIGNMENT.split(",")[0].trim()
      const aRow = aFirst.match(/^([A-Q])/)?.[1] || ""
      const bRow = bFirst.match(/^([A-Q])/)?.[1] || ""
      if (aRow !== bRow) return aRow.localeCompare(bRow)
      const aNum = parseInt(aFirst.slice(1)) || 0
      const bNum = parseInt(bFirst.slice(1)) || 0
      return aNum - bNum
    })
}

/**
 * Every confirmed company for each day, whether or not it has booths yet, so
 * the unplaced ones are as visible as the placed ones.
 */
export async function getPlacementReportRows(draftId: string) {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId },
    include: {
      assignments: true,
      companies: true,
    },
  })

  if (!draft) {
    throw new Error("Draft not found")
  }

  const assignmentByCompany = new Map(
    draft.assignments.map((a) => [a.companyId, a])
  )
  const rows: Record<string, string | number>[] = []

  for (const day of ["WEDNESDAY", "THURSDAY"] as const) {
    const dayName =
      day === "WEDNESDAY" ? "Wednesday (Day 1)" : "Thursday (Day 2)"

    const forDay = draft.companies
      .filter(
        (c) =>
          !c.isPlaceholder && c.status === "CONFIRMED" && c.days.includes(day)
      )
      .map((c) => {
        const a = assignmentByCompany.get(c.id)
        const placed = a && (a.day === null || a.day === day)
        return {
          name: c.name,
          sponsorship: c.sponsorship,
          boothCount: c.boothCount,
          booths: placed ? formatBoothIds(a.boothIds) : "",
        }
      })
      .sort((x, y) => {
        // Placed companies first in floor order; unplaced trail alphabetically.
        if (!!x.booths !== !!y.booths) return x.booths ? -1 : 1
        if (x.booths && y.booths) return x.booths.localeCompare(y.booths)
        return x.name.localeCompare(y.name)
      })

    for (const r of forDay) {
      rows.push({
        Day: dayName,
        Company: r.name,
        Package: r.sponsorship,
        Booths: r.boothCount,
        "Booth IDs": r.booths || "NOT PLACED",
      })
    }
  }

  return rows
}
