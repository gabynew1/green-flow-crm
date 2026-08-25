import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2 } from "lucide-react";
import { HoneypotField, useFormGuard } from "@/components/auth/HoneypotField";

interface AuthForgotStepProps {
  initialEmail: string;
  onBack: () => void;
  onMessage: (msg: { type: "info" | "error" | "success"; text: string }) => void;
}

/**
 * Forgot password step with enumeration-safe messaging.
 * Always shows the same success message regardless of email existence.
 */
export default function AuthForgotStep({ initialEmail, onBack, onMessage }: AuthForgotStepProps) {
  const [email, setEmail] = useState(initialEmail);
  const [isLoading, setIsLoading] = useState(false);
  // Reset form has one (usually prefilled) field — 1s matches the server guard.
  const formGuard = useFormGuard(1000);

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      onMessage({ type: "error", text: "Enter your email address to receive a reset link." });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('request-password-reset', {
        body: { email: trimmed, ...formGuard.payload() },
      });
      if (error) {
        onMessage({ type: "error", text: "Please wait a moment and try again." });
        return;
      }
      // SECURITY: Always show the same success message — never reveal
      // whether the email exists in the system.
      onMessage({
        type: "success",
        text: "If an account exists for this email, you'll receive a password reset link shortly.",
      });
    } catch {
      // Generic error — don't leak details
      onMessage({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Reset Password</h3>
      <p className="text-sm text-muted-foreground">
        We'll send a reset link if your email is registered.
      </p>
      <div className="space-y-2">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          aria-label="Email for password reset"
        />
      </div>
      {/* Phase 1 bot friction: honeypot + minimum fill time.
          Phase 2 replaces this with a Cloudflare Turnstile widget. */}
      <HoneypotField guard={formGuard} />
      <Button
        onClick={handleSubmit}
        className="w-full h-11"
        disabled={isLoading || !formGuard.ready}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
          </>
        ) : !formGuard.ready ? (
          "One moment…"
        ) : (
          "Send Reset Link"
        )}
      </Button>

      <button
        type="button"
        onClick={onBack}
        className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
      </button>
    </div>
  );
}
