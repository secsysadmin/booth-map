"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { toast } from "sonner"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { user, loading, signIn, signUp } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (user) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password)

    setSubmitting(false)

    if (error) {
      toast.error(error.message)
    } else if (isSignUp) {
      toast.success("Account created! Check your email to confirm.")
    } else {
      router.push("/dashboard")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Career Fair Booth Planner</CardTitle>
          <CardDescription>
            {isSignUp ? "Create an account" : "Sign in to manage your booth assignments"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting
                ? "Loading..."
                : isSignUp
                  ? "Sign Up"
                  : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button
                  className="underline hover:text-foreground"
                  onClick={() => setIsSignUp(false)}
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  className="underline hover:text-foreground"
                  onClick={() => setIsSignUp(true)}
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
