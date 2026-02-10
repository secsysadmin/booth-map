"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSignUp, setIsSignUp] = useState(false)
  const [isForgot, setIsForgot] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { user, loading, signIn, signUp, resetPassword } = useAuth()
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

    if (isForgot) {
      const { error } = await resetPassword(email)
      setSubmitting(false)
      if (error) {
        toast.error(error.message)
      } else {
        toast.success("Check your email for a password reset link")
        setIsForgot(false)
      }
      return
    }

    const { error } = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password)

    setSubmitting(false)

    if (error) {
      toast.error(error.message)
    } else {
      if (isSignUp) toast.success("Account created!")
      router.push("/dashboard")
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-[360px]">
        {/* Icon + Title */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 grid h-10 w-10 grid-cols-2 grid-rows-2 gap-[3px]">
            <div className="rounded-[4px] bg-neutral-900" />
            <div className="rounded-[4px] bg-neutral-300" />
            <div className="rounded-[4px] bg-neutral-300" />
            <div className="rounded-[4px] bg-neutral-900" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-neutral-900">
            {isForgot
              ? "Reset your password"
              : isSignUp
                ? "Create your account"
                : "Sign in to Booth Map"}
          </h1>
          <p className="mt-1 text-[13px] text-neutral-400">
            {isForgot
              ? "We\u2019ll email you a reset link"
              : isSignUp
                ? "Student Engineers\u2019 Council"
                : "Student Engineers\u2019 Council"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] text-neutral-600">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
              />
            </div>

            {!isForgot && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-[13px] text-neutral-600">
                    Password
                  </Label>
                  {!isSignUp && (
                    <button
                      type="button"
                      className="text-[12px] text-neutral-400 hover:text-neutral-600 transition-colors"
                      onClick={() => { setIsForgot(true); setPassword("") }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="h-10"
                />
              </div>
            )}

            <Button type="submit" className="h-10 w-full text-[13px]" disabled={submitting}>
              {submitting
                ? "Loading..."
                : isForgot
                  ? "Send Reset Link"
                  : isSignUp
                    ? "Create Account"
                    : "Continue"}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-[13px] text-neutral-400">
          {isForgot ? (
            <>
              Back to{" "}
              <button
                className="text-neutral-600 hover:text-neutral-900 transition-colors"
                onClick={() => { setIsForgot(false); setEmail(""); setPassword("") }}
              >
                Sign In
              </button>
            </>
          ) : isSignUp ? (
            <>
              Have an account?{" "}
              <button
                className="text-neutral-600 hover:text-neutral-900 transition-colors"
                onClick={() => { setIsSignUp(false); setEmail(""); setPassword("") }}
              >
                Sign In
              </button>
            </>
          ) : (
            <>
              No account?{" "}
              <button
                className="text-neutral-600 hover:text-neutral-900 transition-colors"
                onClick={() => { setIsSignUp(true); setEmail(""); setPassword("") }}
              >
                Sign Up
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
