"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm({
  linkExpired = false,
  className,
  ...props
}: React.ComponentProps<"div"> & { linkExpired?: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(
    linkExpired
      ? "That reset link has expired or was already used. Enter your email to get a new one."
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Shown whether or not the address has an account, so this page can't be
    // used to find out who has signed up.
    setSent(true);
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>{sent ? "Check your email" : "Reset your password"}</CardTitle>
          <CardDescription>
            {sent
              ? `If an account exists for ${email}, we've sent a link to reset your password.`
              : "Enter your email and we'll send you a link to reset your password"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <FieldDescription className="text-center">
              <Link href="/login" className="underline underline-offset-4">
                Back to login
              </Link>
            </FieldDescription>
          ) : (
            <form onSubmit={handleSubmit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Field>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Sending..." : "Send reset link"}
                  </Button>
                  <FieldDescription className="text-center">
                    Remembered it?{" "}
                    <Link href="/login" className="underline underline-offset-4">
                      Back to login
                    </Link>
                  </FieldDescription>
                </Field>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
