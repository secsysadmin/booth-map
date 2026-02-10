# Career Fair Booth Assignment Tool — Product Spec

## Overview

A web application for managing career fair booth assignments. Users import a spreadsheet of companies, drag them onto interactive floor maps (one per day), and export finalized assignments as spreadsheets. Supports multiple drafts per account, multi-day events, and sponsorship-based booth sizing.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router, TypeScript) |
| UI | shadcn/ui + Tailwind CSS |
| Canvas/Map | React Konva (interactive booth map) |
| Drag & Drop | Native HTML5 drag (sidebar → canvas) + Konva drag (on-canvas repositioning) |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | Supabase Auth |
| Spreadsheet I/O | SheetJS (xlsx) for import/export |
| State Management | Zustand |

---

## Data Model

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  drafts    Draft[]
  createdAt DateTime @default(now())
}

model Draft {
  id          String            @id @default(uuid())
  name        String
  userId      String
  user        User              @relation(fields: [userId], references: [id])
  companies   Company[]
  assignments BoothAssignment[]
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
}

model Company {
  id            String            @id @default(uuid())
  name          String
  days          Day[]             // ["wednesday", "thursday", or both]
  sponsorship   Sponsorship       @default(BASIC)
  draftId       String
  draft         Draft             @relation(fields: [draftId], references: [id], onDelete: Cascade)
  assignments   BoothAssignment[]
}

model BoothAssignment {
  id          String   @id @default(uuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  draftId     String
  draft       Draft    @relation(fields: [draftId], references: [id], onDelete: Cascade)
  boothIds    String[] // e.g. ["G-14", "G-15", "G-16", "G-17"] for a maroon sponsor
  day         Day?     // null = "both" (shared placement), or specific day override

  @@unique([companyId, draftId])
}

enum Sponsorship {
  MAROON    // 4 booths
  DIAMOND   // 3 booths
  GOLD      // 2 booths
  SILVER    // 1 booth
  BASIC     // 1 booth
}

enum Day {
  WEDNESDAY
  THURSDAY
}
```

---

## Booth / Map Structure

### Venue Layout

The venue is a rectangular hall with lettered rows A through Q. Rows run vertically (top-to-bottom), and are arranged horizontally across the hall from right (A) to left (Q). Each middle row is a double-sided aisle with booths on both sides. Edge rows (A on the right wall, Q on the left wall) are single-sided.

### Numbering Pattern: U-Shape (Snake)

Booth numbers follow a **U-shaped snake pattern** within each row:

1. Start at **bottom-right** (booth 1), count **UP** to 7
2. Cross the aisle, continue **UP** on top-right from 8 to 15
3. Cross over to **top-left**, count **DOWN** from 16 to 23
4. Cross the aisle, continue **DOWN** on bottom-left from 24 to 30

This creates a U-shape: up the right side (1→15), then down the left side (16→30).

### Middle Rows (B through P) — 4 segments, 30 booths each

```
┌──────────────── Row G (example middle row) ────────────────┐
│                                                             │
│   Seg 3 (Top-Left)              Seg 2 (Top-Right)          │
│                                                             │
│   ┌──┐                          ┌──┐                       │
│   │16│  (top)                   │15│  (top)                 │
│   │17│                          │14│                        │
│   │18│                          │13│                        │
│   │19│                          │12│                        │
│   │20│                          │11│                        │
│   │21│                          │10│                        │
│   │22│                          │ 9│                        │
│   │23│  (bottom)                │ 8│  (bottom)              │
│   └──┘                          └──┘                       │
│                                                             │
│   ═══════════════════ AISLE ════════════════════            │
│                                                             │
│   ┌──┐                          ┌──┐                       │
│   │24│  (top)                   │ 7│  (top)                 │
│   │25│                          │ 6│                        │
│   │26│                          │ 5│                        │
│   │27│                          │ 4│                        │
│   │28│                          │ 3│                        │
│   │29│                          │ 2│                        │
│   │30│  (bottom)                │ 1│  (bottom)              │
│   └──┘                          └──┘                       │
│                                                             │
│   Seg 4 (Bottom-Left)           Seg 1 (Bottom-Right)       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

U-shape path:  1→7 (up right) → 8→15 (up right) → 16→23 (down left) → 24→30 (down left)
```

**Segment numbering directions:**

```
Seg 3 (Top-Left)      Seg 2 (Top-Right)
  ↓ 16 → 23            ↑ 8 → 15
  (top to bottom)       (bottom to top)

═══════ AISLE ═══════

Seg 4 (Bottom-Left)   Seg 1 (Bottom-Right)
  ↓ 24 → 30            ↑ 1 → 7
  (top to bottom)       (bottom to top)
```

### Edge Rows (A and Q) — 2 segments, 15 booths each

Edge rows are against the wall and only have the right-side half of the U (segments 1 and 2). Both segments count upward from bottom to top.

```
┌──────── Row A (right edge) ────────┐
│                                     │
│   Seg 2 (Top)                       │
│                                     │  ←── WALL
│   ┌──┐                             │
│   │15│  (top)                       │
│   │14│                              │
│   │13│                              │
│   │12│                              │
│   │11│                              │
│   │10│                              │
│   │ 9│                              │
│   │ 8│  (bottom)                    │
│   └──┘                             │
│                                     │
│   ═══════ AISLE ═══════            │
│                                     │
│   ┌──┐                             │
│   │ 7│  (top)                       │
│   │ 6│                              │
│   │ 5│                              │
│   │ 4│                              │
│   │ 3│                              │
│   │ 2│                              │
│   │ 1│  (bottom)                    │
│   └──┘                             │
│                                     │
│   Seg 1 (Bottom)                    │
│                                     │
└─────────────────────────────────────┘

Path: 1→7 (up bottom) → 8→15 (up top)
```

Row Q is identical but the wall is on the left side.

### Full Hall Bird's-Eye View

```
    LEFT WALL                                                      RIGHT WALL
    ┌──────────────────────────────────────────────────────────────────────┐
    │                                                                      │
    │  Q       P       O       N    ...    D       C       B        A      │
    │  EDGE    ├─MID───┤                                   ├─MID──┤  EDGE  │
    │ [1-7]   [1-7 ]  [1-7 ]  [1-7 ]    [1-7 ]  [1-7 ]  [1-7 ]  [1-7]  │
    │ [8-15]  [8-15]  [8-15]  [8-15]    [8-15]  [8-15]  [8-15]  [8-15] │
    │         [16-23] [16-23] [16-23]   [16-23] [16-23] [16-23]         │
    │         [24-30] [24-30] [24-30]   [24-30] [24-30] [24-30]         │
    │                                                                      │
    │                       ┌─── ENTRANCE ───┐                             │
    └──────────────────────────────────────────────────────────────────────┘
```

### Contiguous Placement Rule

Multi-booth sponsors are placed **vertically within a single segment**. Booths are stacked along the column.

Example: Maroon sponsor (4 booths) placed in Row G, Segment 1 (Bottom-Right):
→ Occupies `G-2, G-3, G-4, G-5` (a vertical stack of 4)

Placements **cannot** span across segments or across the aisle.

### Booth Identifiers

Format: `{Row Letter}-{Booth Number}`  
Examples: `A-1`, `G-14`, `P-30`, `Q-8`

### Total Booth Count

- Edge rows: 2 rows × 15 booths = 30
- Middle rows: 15 rows × 30 booths = 450
- **Total: 480 booths**

---

## Sponsorship Tiers & Booth Sizing

| Tier | Booths | Color (suggestion) |
|------|--------|--------------------|
| Maroon | 4 | `#500000` (TAMU Maroon) |
| Diamond | 3 | `#B9D9EB` |
| Gold | 2 | `#CFB53B` |
| Silver | 1 | `#C0C0C0` |
| Basic | 1 | `#E8E8E8` |

Multi-booth sponsors **must be contiguous** within the same row segment. A maroon sponsor claiming 4 booths in row G, segment 1, would occupy `G-1, G-2, G-3, G-4`.

---

## Core Features

### 1. Spreadsheet Import

**Input:** `.xlsx` or `.csv` file with columns:
- `Name` — company name
- `Day(s)` — "Wednesday", "Thursday", or "Both" (or similar variants)
- `Sponsorship` — tier name (maroon/diamond/gold/silver/basic)

**Behavior:**
- Parse and validate on upload
- Create `Company` records linked to the active draft
- Show validation errors (missing names, unknown tiers, etc.)
- Support re-import (upsert by company name)

### 2. Interactive Map (×2: Wednesday & Thursday)

**Layout:**
- Left sidebar: list of unassigned companies, grouped/filterable by sponsorship tier and day
- Main area: Konva canvas rendering the booth grid
- Two tabs or side-by-side views: Wednesday map and Thursday map

**Drag-and-Drop UX:**
1. User drags a company name from the sidebar onto the map
2. As the user hovers over a row, the system highlights N contiguous booths based on sponsorship tier (N = 4 for maroon, 3 for diamond, etc.)
3. The highlight "slides" along the row as the user moves their mouse, always snapping to valid contiguous groups
4. If the user hovers near occupied booths, the highlight skips/adjusts to only show valid placements
5. On drop, the booths are assigned and the company label appears on the map
6. Companies tagged "Both" days: placing on one map automatically mirrors the placement on the other map (shared state, single source of truth)

**On-Map Interactions:**
- Click an assigned company to see details / unassign
- Drag an already-placed company to reposition within the map
- Visual distinction per sponsorship tier (color-coded booth fills)
- Tooltip on hover showing company name, tier, booth IDs

### 3. "Both Days" Sync Logic

Companies with `days = [WEDNESDAY, THURSDAY]`:
- Store ONE canonical `BoothAssignment` with `day = null` (meaning both)
- Both map views read from this same assignment
- Moving on either map updates the shared record
- Visual indicator (e.g., pin icon or badge) showing it's a "both days" company

Companies with a single day:
- Only appear on their respective map
- Cannot be dragged onto the wrong day's map

### 4. Drafts & Persistence

- Each user can have multiple drafts (e.g., "Draft 1", "Final Layout", "Backup")
- Auto-save on every placement/move action
- Draft selector in the header
- Duplicate draft functionality
- Delete draft with confirmation

### 5. Spreadsheet Export

**Output per map (Wednesday / Thursday):**

| Company Name | Booth Number(s) |
|-------------|----------------|
| Acme Corp   | G-14, G-15     |

**Export options:**
- Export Wednesday sheet
- Export Thursday sheet
- Export merged workbook (both sheets in one `.xlsx` file)
- Sorted alphabetically by company name or by booth number

---

## Page Structure

```
/                     → Landing / login
/dashboard            → Draft list, create new draft, import spreadsheet
/dashboard/[draftId]  → Main editor view (map + sidebar + tabs)
```

---

## API Routes (Next.js App Router)

```
POST   /api/drafts                    → Create draft
GET    /api/drafts                    → List user's drafts
GET    /api/drafts/[id]               → Get draft with companies & assignments
PUT    /api/drafts/[id]               → Update draft name
DELETE /api/drafts/[id]               → Delete draft
POST   /api/drafts/[id]/duplicate     → Duplicate draft

POST   /api/drafts/[id]/import        → Upload & parse spreadsheet
GET    /api/drafts/[id]/export        → Export assignments as .xlsx
GET    /api/drafts/[id]/export?day=wed → Export single day

GET    /api/drafts/[id]/companies     → List companies in draft
PUT    /api/companies/[id]            → Update company details

POST   /api/assignments               → Create/update booth assignment
DELETE /api/assignments/[id]           → Remove assignment
PUT    /api/assignments/[id]/move      → Reposition (new booth IDs)
```

---

## State Management (Zustand Store)

```typescript
interface MapStore {
  // Data
  companies: Company[]
  assignments: Map<string, BoothAssignment> // keyed by companyId
  booths: BoothDefinition[] // static booth layout
  
  // UI State
  activeDay: "wednesday" | "thursday"
  draggedCompany: Company | null
  hoveredBooths: string[] // booth IDs currently highlighted during drag
  selectedCompany: string | null // companyId of selected on-map company
  
  // Filters
  sidebarFilter: {
    search: string
    sponsorship: Sponsorship | "all"
    assignmentStatus: "assigned" | "unassigned" | "all"
  }
  
  // Actions
  assignCompany: (companyId: string, boothIds: string[]) => void
  unassignCompany: (companyId: string) => void
  moveCompany: (companyId: string, newBoothIds: string[]) => void
  setHoveredBooths: (boothIds: string[]) => void
  
  // Derived
  getUnassignedCompanies: (day: Day) => Company[]
  getBoothOccupant: (boothId: string) => Company | null
  isBoothAvailable: (boothId: string) => boolean
}
```

---

## Hover/Placement Algorithm

```
ON DRAG HOVER (mouseX, mouseY):
  1. Determine which row (A-Q) the cursor is over
  2. Determine which segment of that row (1-7, 8-15, 16-23, 24-30)
  3. Determine the closest booth number within that segment
  4. Based on sponsorship tier, calculate N (number of booths needed)
  5. Generate candidate contiguous groups of N booths centered on cursor position
  6. Filter out groups that overlap with already-assigned booths
  7. Filter out groups that span segment boundaries
  8. Highlight the best valid group (closest to cursor)
  9. If no valid placement exists in this segment, show red/invalid indicator

ON DROP:
  1. If hoveredBooths is a valid group → create BoothAssignment
  2. If company.days includes both → assignment.day = null (syncs to both maps)
  3. Persist to DB via API
  4. Update Zustand store
  5. Remove company from sidebar unassigned list
```

---

## UI Components (shadcn)

- `Button`, `Input`, `Select` — standard controls
- `Dialog` — draft creation, company details, confirmations
- `Tabs` — Wednesday / Thursday map switching
- `Card` — company cards in sidebar
- `Badge` — sponsorship tier labels
- `DropdownMenu` — draft actions (rename, duplicate, delete)
- `Sheet` — mobile sidebar
- `Tooltip` — booth hover info
- `Toast` / `Sonner` — save confirmations, error notifications
- `DataTable` — company list view, export preview

---

## Nice-to-Have / Future

- Real-time collaboration (Supabase Realtime)
- Undo/redo stack
- Print-friendly map view
- Conflict detection (two users editing same draft)
- Booth preference system (companies request specific rows)
- Analytics dashboard (booth utilization, tier distribution)
- Map zoom/pan controls
- Mobile-responsive map (pinch to zoom)
