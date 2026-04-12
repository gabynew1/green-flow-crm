import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2 } from "lucide-react";
import OAuthButtons from "./OAuthButtons";

interface AuthEmailStepProps {
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isChecking: boolean;
  isLoading: boolean;
  hideOAuthForInvite?: boolean;
  onClearInlineMsg?: () => void;
}

/**
 * Email-first entry step: OAuth buttons + email input.
 * Does not reveal whether the email exists.
 */
const AuthEmailStep = forwardRef<HTMLInputElement, AuthEmailStepProps>(
  ({ email, onEmailChange, onSubmit, isChecking, isLoading, hideOAuthForInvite, onClearInlineMsg }, ref) => {
    return (
      <div className="space-y-4">
        <OAuthButtons
          emailHint={email.trim() || undefined}
          disabled={isLoading || isChecking}
          hideForInvite={hideOAuthForInvite}
        />

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              ref={ref}
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => {
                onEmailChange(e.target.value);
                onClearInlineMsg?.();
              }}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
              aria-describedby="email-hint"
            />
            <p id="email-hint" className="sr-only">
              Enter your email to sign in or create an account
            </p>
          </div>
          <Button type="submit" className="w-full h-11" disabled={isChecking || isLoading}>
            {isChecking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
              </>
            ) : (
              <>
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    );
  }
);

AuthEmailStep.displayName = "AuthEmailStep";
export default AuthEmailStep;
