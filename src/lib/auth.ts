import { createClient } from "@supabase/supabase-js"
import { NextRequest } from "next/server"
import { prisma } from "./prisma"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function getAuthUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!authHeader) return null

  const token = authHeader.replace("Bearer ", "")
  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) return null

  // Ensure user exists in our database
  let dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (!dbUser) {
    dbUser = await prisma.user.create({
      data: { id: user.id, email: user.email! },
    })
  }

  return dbUser
}
