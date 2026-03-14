

## Plan: Fix All Build Errors

There are **5 distinct errors** to fix across 4 files (plus 3 missing module files to create).

### 1. Missing `Inspections`, `Offers`, `Contracts` pages (SalesPipeline.tsx)

`SalesPipeline.tsx` imports from `./Inspections`, `./Offers`, `./Contracts` but these files don't exist in `src/pages/provider/`. Need to create stub/placeholder components for each that accept `embedded?: boolean` and `statusFilter?: string` props. These will be simple list views querying their respective tables (`inspections`, `offers`, `contracts`).

### 2. Missing `Ban` import (GlobalUserManagement.tsx)

Line 260 uses `<Ban />` but it's not in the import list. Add `Ban` to the lucide-react import on line 1-20.

### 3. Missing `cn` import (TenantManagement.tsx)

The file uses `cn()` but doesn't import it. Add `import { cn } from "@/lib/utils"`.

### 4. `supabase-tenant.ts` TypeScript error (line 27)

The `.eq("tenant_id", tenantId)` fails because the generic type system can't verify `tenant_id` exists on all tables. Fix: cast the entire expression with `as any` earlier or use a simpler approach.

Current code already has `as any` at the end but the `.eq()` call itself fails. Fix by casting `query` before calling `.eq()`.

### 5. Edge function `err` is `unknown` (3 files)

- `accept-provider-invite/index.ts` line 81: `err.message` → `(err as Error).message`
- `create-provider-invite/index.ts` line 70: `err.message` → `(err as Error).message`
- `ai-assistant/index.ts` line 162/394: Fix the `executeToolCall` parameter type by changing `ReturnType<typeof createClient>` to `any`, and cast `err` properly.

### Execution Order

1. Create 3 missing page files: `Inspections.tsx`, `Offers.tsx`, `Contracts.tsx`
2. Fix `GlobalUserManagement.tsx` — add `Ban` import
3. Fix `TenantManagement.tsx` — add `cn` import
4. Fix `supabase-tenant.ts` — fix type casting
5. Fix 3 edge functions — cast `err` and fix type param

