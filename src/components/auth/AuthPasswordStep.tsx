import { forwardRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";

interface AuthPasswordStepProps {
  email: string;
  password: string;
  onPasswordChange: (password: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  onForgot: () => void;
  onCreateAccount: () => void;
  isLoading: boolean;
  inviteToken: string | null;
  /** Whether email_exists returned true — used only to adjust copy, not to block access */
  emailKnown: boolean;
}

/**
 * Password login step. Always shows a "Create account" escape hatch
 * so we don't leak whether the email exists.
 */
const AuthPasswordStep = forwardRef<HTMLInputElement, AuthPasswordStepProps>(
  (
    {
      email,
      password,
      onPasswordChange,
      onSubmit,
      onBack,
      onForgot,
      onCreateAccount,
      isLoading,
      inviteToken,
      emailKnown,
    },
    ref
  ) => {
    const [showPw, setShowPw] = useState(false);

    return (
      <div className="space-y-4">
        {/* Email display with edit button */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5">
          <span className="flex-1 text-sm font-medium text-foreground truncate">{email}</span>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-primary hover:underline whitespace-nowrap"
          >
            Change
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                ref={ref}
                id="login-password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                required
                className="pr-10"
                autoComplete="current-password"
                aria-label="Password"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id="remember" name="remember" />
              <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                Remember me
              </Label>
            </div>
            <button
              type="button"
              onClick={onForgot}
              className="text-sm text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>

          <Button type="submit" className="w-full h-11" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…
              </>
            ) : inviteToken ? (
              "Sign In & Accept Invite"
            ) : (
              "Sign In"
            )}
          </Button>

          {/* Neutral escape hatch — doesn't confirm whether email exists */}
          <div className="text-center space-y-1">
            <button
              type="button"
              onClick={onCreateAccount}
              className="text-sm text-primary hover:underline"
            >
              Don't have an account? Create one
            </button>
            <span className="block text-xs text-muted-foreground">or</span>
            <button
              type="button"
              onClick={onBack}
              className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
            </button>
          </div>
        </form>
      </div>
    );
  }
);

AuthPasswordStep.displayName = "AuthPasswordStep";
export default AuthPasswordStep;
