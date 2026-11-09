import { ResetPasswordForm } from "@/components/reset-password-form"

// Signed-out visitors are sent to /login by the proxy, so this page always has
// a session: usually one just created by a reset link via /api/auth/confirm.
export default function Page() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ResetPasswordForm />
      </div>
    </div>
  )
}
