

# AI Chat Assistant — Implementation Plan

## Overview
A floating chatbox component accessible from both Provider and Client views. The AI understands the user's role and current context (property, visit) and can perform three key actions via tool-calling:

1. **Populate property inventory** — Provider describes greenery in natural language, AI parses into structured inventory items and saves them
2. **Confirm tasks / summarize visits** — Provider asks AI to mark items complete or generate a client-friendly visit summary
3. **Create service requests** — Client describes what they need, AI parses it into a structured service request

## Architecture

### Edge Function: `ai-assistant`
- Single edge function at `supabase/functions/ai-assistant/index.ts`
- Receives: `{ messages, context: { role, propertyId?, visitId?, customerId? } }`
- Uses Lovable AI Gateway (`google/gemini-3-flash-preview`) with tool-calling
- Three tools defined for the AI to call:
  - `populate_inventory` — params: `{ propertyId, items: [{category, name, quantity, unit, notes}] }` — inserts inventory_items with source=AI_ASSISTED
  - `summarize_visit` — params: `{ visitId }` — reads visit notes/items, generates client summary, saves to `service_orders.client_summary`
  - `create_service_request` — params: `{ propertyId, description, preferredDate?, items: [{name, quantity, unit}] }` — creates a DRAFT service_order with items
- The edge function executes tool calls server-side using Supabase service role client, then returns the AI's final response
- Handles 429/402 errors from gateway

### Frontend: `AIChatBox` Component
- Floating button (bottom-right) with a slide-up chat panel
- Message list with markdown rendering (`react-markdown`)
- Streaming SSE responses for real-time token display
- Context-aware: detects current route to auto-set `propertyId` or `visitId`
- Role-aware: provider gets inventory + summarize tools; client gets request tool
- AI suggestions labeled: "AI suggestion — please review before saving"
- After tool execution, shows a confirmation card (e.g., "Added 5 inventory items to Oak Street property")

### Integration Points
- Add `<AIChatBox />` to both `ProviderLayout` and `ClientLayout`
- Pass current user role and route params as context
- Update `supabase/config.toml` with `[functions.ai-assistant]` and `verify_jwt = false`

## Files to Create/Edit

| File | Action |
|------|--------|
| `supabase/functions/ai-assistant/index.ts` | Create — edge function with tool-calling |
| `supabase/config.toml` | Edit — add function config |
| `src/components/AIChatBox.tsx` | Create — floating chat UI with streaming |
| `src/components/provider/ProviderLayout.tsx` | Edit — add `<AIChatBox />` |
| `src/components/client/ClientLayout.tsx` | Edit — add `<AIChatBox />` |

## AI System Prompt (in edge function)
Tailored per role:
- **Provider**: "You help landscapers manage properties. You can populate inventory from descriptions, summarize visit notes for clients, and mark tasks complete."
- **Client**: "You help property owners request landscaping services. Describe what you need and I'll create a structured request for your landscaper."

