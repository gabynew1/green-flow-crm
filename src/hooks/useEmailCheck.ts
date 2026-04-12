import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Centralized email existence check hook.
 * Prevents duplicate requests and race conditions.
 */
export function useEmailCheck() {
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastChecked = useRef<string>("");
  const lastResult = useRef<boolean | null>(null);
  const abortRef = useRef(false);

  const checkEmail = useCallback(async (email: string): Promise<boolean | null> => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address");
      return null;
    }

    // Cache hit — skip network call
    if (trimmed === lastChecked.current && lastResult.current !== null) {
      return lastResult.current;
    }

    setError(null);
    setIsChecking(true);
    abortRef.current = false;

    try {
      const { data, error: rpcError } = await supabase.rpc("email_exists", { _email: trimmed });
      if (abortRef.current) return null;
      if (rpcError) throw rpcError;

      lastChecked.current = trimmed;
      lastResult.current = !!data;
      return !!data;
    } catch (err: any) {
      if (!abortRef.current) {
        setError("Unable to check email. Please try again.");
      }
      return null;
    } finally {
      if (!abortRef.current) setIsChecking(false);
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current = true;
    setIsChecking(false);
    setError(null);
    lastChecked.current = "";
    lastResult.current = null;
  }, []);

  return { checkEmail, isChecking, error, reset };
}
