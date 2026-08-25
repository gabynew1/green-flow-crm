import { useEffect, useRef, useState } from "react";

/**
 * Invisible bot trap for public forms.
 *
 * Renders a hidden text input that real users never see or fill, and records
 * when the form mounted. Both values are sent to the edge function, which
 * rejects filled traps and submissions faster than ~2s.
 *
 * Usage:
 *   const guard = useFormGuard();
 *   <HoneypotField guard={guard} />
 *   ...invoke(fn, { body: { ...payload, ...guard.payload() } })
 */
export function useFormGuard(minFillMs = 2000) {
  const mountedAt = useRef<number>(Date.now());
  const [trap, setTrap] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    mountedAt.current = Date.now();
    setReady(false);
    const t = setTimeout(() => setReady(true), minFillMs);
    return () => clearTimeout(t);
  }, [minFillMs]);

  return {
    trap,
    setTrap,
    ready,
    payload: () => ({ hp_field: trap, form_started_at: mountedAt.current }),
  };
}

export type FormGuard = ReturnType<typeof useFormGuard>;


export function HoneypotField({ guard }: { guard: FormGuard }) {
  return (
    <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
      <label htmlFor="hp_field">Leave this field empty</label>
      <input
        id="hp_field"
        name="hp_field"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={guard.trap}
        onChange={(e) => guard.setTrap(e.target.value)}
      />
    </div>
  );
}
