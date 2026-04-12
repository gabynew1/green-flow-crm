import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/* ---------- Brand Icons ---------- */
function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.81 12.23c0-.72-.06-1.25-.19-1.8H12.2v3.56h5.53c-.11.88-.71 2.2-2.04 3.09l-.02.12 2.85 2.21.2.02c1.84-1.7 2.89-4.2 2.89-7.2Z" />
      <path fill="#34A853" d="M12.2 22c2.71 0 4.98-.89 6.64-2.41l-3.17-2.46c-.85.59-1.99 1-3.47 1-2.65 0-4.89-1.74-5.69-4.15l-.11.01-2.96 2.3-.04.11A10.03 10.03 0 0 0 12.2 22Z" />
      <path fill="#FBBC05" d="M6.51 13.98A6.03 6.03 0 0 1 6.17 12c0-.69.12-1.36.32-1.98l-.01-.13-3-2.34-.1.05A10 10 0 0 0 2.2 12c0 1.6.38 3.11 1.06 4.4l3.25-2.42Z" />
      <path fill="#EA4335" d="M12.2 5.87c1.87 0 3.13.81 3.84 1.48l2.8-2.73C17.16 3.07 14.9 2 12.2 2a10.03 10.03 0 0 0-8.82 5.6l3.11 2.42c.81-2.41 3.04-4.15 5.7-4.15Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.65-2.2.46-3.06-.4C3.79 16.17 4.36 9.53 8.7 9.28c1.23.06 2.08.72 2.8.75.99-.2 1.94-.77 3-.65 1.28.15 2.24.72 2.86 1.65-2.63 1.57-2.01 5.03.83 6l-.01.01c-.57 1.5-1.32 2.98-2.13 4.24ZM12.03 9.2C11.88 7.12 13.54 5.4 15.5 5.25c.3 2.36-2.15 4.14-3.47 3.95Z" />
    </svg>
  );
}

interface OAuthButtonsProps {
  emailHint?: string;
  disabled?: boolean;
  hideForInvite?: boolean;
}

/**
 * Reusable Google + Apple OAuth buttons.
 * Used on both the email step and login step of /auth.
 */
export default function OAuthButtons({ emailHint, disabled, hideForInvite }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);

  if (hideForInvite) return null;

  const handleOAuth = async (provider: "google" | "apple") => {
    setLoadingProvider(provider);
    try {
      const extraParams: Record<string, string> = {};
      if (emailHint && provider === "google") {
        extraParams.login_hint = emailHint;
      }

      const { error } = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
        extraParams: Object.keys(extraParams).length > 0 ? extraParams : undefined,
      });

      if (error) {
        toast.error(error.message || `${provider === "google" ? "Google" : "Apple"} sign-in failed`);
        setLoadingProvider(null);
      }
      // If no error, the browser will redirect — don't reset loading
    } catch {
      toast.error("Something went wrong. Please try again.");
      setLoadingProvider(null);
    }
  };

  const isLoading = !!loadingProvider || disabled;

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-center gap-3 border-border bg-background font-medium text-foreground shadow-sm hover:bg-muted"
        onClick={() => handleOAuth("google")}
        disabled={isLoading}
        aria-label="Continue with Google"
      >
        {loadingProvider === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continue with Google
      </Button>

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-center gap-3 border-border bg-background font-medium text-foreground shadow-sm hover:bg-muted"
        onClick={() => handleOAuth("apple")}
        disabled={isLoading}
        aria-label="Continue with Apple"
      >
        {loadingProvider === "apple" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <AppleIcon />
        )}
        Continue with Apple
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase tracking-[0.2em]">
          <span className="bg-background px-3 text-muted-foreground">Or use email</span>
        </div>
      </div>
    </div>
  );
}
