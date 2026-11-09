import { ForgotPasswordForm } from "@/components/forgot-password-form"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <ForgotPasswordForm linkExpired={error === "link_expired"} />
      </div>
    </div>
  )
}
