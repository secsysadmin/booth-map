# Booth Map

Career fair booth assignment tool. Import companies from a spreadsheet, drag them onto an interactive floor map, and export finalized assignments.

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your Supabase credentials (see `.env.example`).

3. Run the Prisma migration:
   ```bash
   npx prisma db push
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

## Tech Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- react-konva for the interactive map canvas
- Zustand for state management
- Prisma + Supabase (PostgreSQL + Auth)
- shadcn/ui components
