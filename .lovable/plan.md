

# Make AI Assistant Context-Aware (User + Properties)

## Problem
The AI assistant currently only knows the user's role and the current page URL. It doesn't know the user's name, ID, or their properties — so it can't reference them in conversation.

## Solution
Pass the logged-in user's profile and all their properties as context to the edge function, and inject that into the system prompt.

### 1. `src/components/AIChatBox.tsx`
- On component mount (or when chat opens), fetch the user's properties from `properties` table (joined via `customer_id` from profile)
- Send `user` (name, unique_client_id, email) and `properties` (id, name, address, city) alongside existing context to the edge function

### 2. `supabase/functions/ai-assistant/index.ts`
- Accept `user` and `properties` in the request body
- Inject into the system prompt: "You are helping {user.full_name} (ID: {unique_client_id}). Their properties: {list with names/addresses/IDs}"
- For client role: the AI can now reference properties by name when the user asks questions without specifying which property
- For provider role: include tenant info if available

This is a lightweight change — two files, no DB changes.

