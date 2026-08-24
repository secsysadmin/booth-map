# Tetris

Career fair booth assignment tool. Import companies from a spreadsheet, drag them onto an interactive floor map, and export finalized assignments.

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your Supabase credentials (see `.env.example`).

3. Apply the database migrations:
   ```bash
   npx prisma migrate deploy
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

## Database migrations

Schema changes live in `prisma/migrations` and are applied by `prisma migrate deploy`,
which runs automatically as part of `npm run build`.

**Adding a change:** edit `prisma/schema.prisma`, then add a numbered folder under
`prisma/migrations` with a `migration.sql` holding the SQL. Keep the numbering
sequential — if someone else lands a migration with your number first, renumber yours.

**Pointing at a database that predates migrations:** a database built with `db push`
has no record of what it already ran, so `migrate deploy` will try to replay
migrations against tables that already exist and fail. Mark the ones already
reflected in that database as applied first:

```bash
npx prisma migrate status                        # see what it thinks is pending
npx prisma migrate resolve --applied <folder>    # once per already-applied migration
```

Then `migrate status` should report "Database schema is up to date!".

## Useful Prisma Commands

- Opens a browser tab where you can see all your tables, add/delete rows, and filter data without writing any SQL.
   ```bash
   npx prisma studio
   ```

- When you run this, Prisma compares your schema to the database and generates a .sql file in a timestamped folder inside the prisma/migrations folder. This folder then holds SQL files that show exactly how the database changed over time, that way a teammate can pull your code and run npx prisma migrate dev to get their local database updated with the exact same SQL steps you took. 
- **Note: This may fail because it tries to create a shadow database using the SQL scripts in migrations folders to compare to actual database.**
   ```bash
   npx prisma migrate dev --name {change name}
   ```

- Applies any migration files the database hasn't run yet. This is what deploys use, and it only ever runs the SQL in `prisma/migrations` — it never drops anything it didn't create.
   ```bash
   npx prisma migrate deploy
   ```

- Syncs the schema straight to the database without recording history. **Avoid this on any shared database.** It rewrites the database to match your `schema.prisma` exactly, which means it silently drops any table or column your branch doesn't declare — including a teammate's work-in-progress schema.
   ```bash
   npx prisma db push
   ```

- Syncs your schema.prisma to match the actual database.
   ```bash
   npx prisma db pull
   ```

## Tech Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- react-konva for the interactive map canvas
- Zustand for state management
- Prisma + Supabase (PostgreSQL + Auth)
- shadcn/ui components
