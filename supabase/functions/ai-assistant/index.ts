import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const tools = [
  {
    type: "function",
    function: {
      name: "populate_inventory",
      description:
        "Parse a natural-language description of greenery/landscaping elements and save structured inventory items for a property. Use when the user describes trees, lawns, shrubs, flower beds, or other landscape elements.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "string", description: "UUID of the property" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: {
                  type: "string",
                  enum: ["TREE", "LAWN", "SHRUB", "FLOWER_BED", "OTHER"],
                },
                name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
                notes: { type: "string" },
              },
              required: ["category", "name", "quantity", "unit"],
            },
          },
        },
        required: ["propertyId", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_visit",
      description:
        "Generate a client-friendly summary of a service visit based on its notes and completed items. Use when provider asks to summarize or prepare notes for the client.",
      parameters: {
        type: "object",
        properties: {
          visitId: { type: "string", description: "UUID of the service order" },
        },
        required: ["visitId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_service_request",
      description:
        "Create a draft service request (service order) for a property based on a client's description. Parse free text into structured service items.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "string", description: "UUID of the property" },
          description: { type: "string", description: "What the client needs" },
          preferredDate: { type: "string", description: "Preferred date (YYYY-MM-DD), optional" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string" },
              },
              required: ["name", "quantity", "unit"],
            },
          },
        },
        required: ["propertyId", "description", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_tasks_done",
      description:
        "Mark service order items as completed. Use when provider says tasks are done.",
      parameters: {
        type: "object",
        properties: {
          visitId: { type: "string", description: "UUID of the service order" },
          itemIds: {
            type: "array",
            items: { type: "string" },
            description: "UUIDs of service_order_items to mark completed. If empty, mark all.",
          },
        },
        required: ["visitId"],
      },
    },
  },
];

interface UserInfo {
  full_name?: string;
  email?: string;
  unique_client_id?: string;
}

interface PropertyInfo {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
}

function getSystemPrompt(
  role: string,
  context: Record<string, string | undefined>,
  user?: UserInfo,
  properties?: PropertyInfo[]
) {
  const base =
    "You are GreenCRM Assistant, a helpful AI for a landscaping and gardening CRM. Be concise, friendly, and action-oriented. When you perform an action, confirm what you did clearly.";

  let userCtx = "";
  if (user?.full_name) {
    userCtx += `\n\nYou are helping ${user.full_name}`;
    if (user.unique_client_id) userCtx += ` (Client ID: ${user.unique_client_id})`;
    if (user.email) userCtx += `, email: ${user.email}`;
    userCtx += ".";
  }

  let propsCtx = "";
  if (properties && properties.length > 0) {
    propsCtx = "\n\nTheir properties:\n" + properties.map((p, i) =>
      `${i + 1}. "${p.name}" (ID: ${p.id})${p.address ? `, ${p.address}` : ""}${p.city ? `, ${p.city}` : ""}`
    ).join("\n");
    propsCtx += "\n\nWhen the user refers to a property by name, use the matching property ID for tool calls.";
  }

  if (role === "provider") {
    let ctx = "";
    if (context.propertyId) ctx += ` The user is viewing property ${context.propertyId}.`;
    if (context.visitId) ctx += ` The user is viewing service visit ${context.visitId}.`;
    return `${base}${userCtx}${propsCtx}\n\nYou are helping a landscaping SERVICE PROVIDER. You can:\n1. Populate property inventory from natural-language descriptions (trees, lawns, shrubs, etc.)\n2. Summarize visit notes into client-friendly summaries\n3. Mark service visit tasks as completed\n\nAlways confirm actions before executing when the request is ambiguous. Label AI suggestions clearly.${ctx}`;
  }

  return `${base}${userCtx}${propsCtx}\n\nYou are helping a PROPERTY OWNER (client). You can:\n1. Create service requests by describing what you need in plain language\n\nAlways confirm the parsed request before saving. Property: ${context.propertyId || "not specified"}.`;
}

async function executeToolCall(
  fnName: string,
  args: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>
): Promise<string> {
  try {
    switch (fnName) {
      case "populate_inventory": {
        const { propertyId, items } = args as {
          propertyId: string;
          items: { category: string; name: string; quantity: number; unit: string; notes?: string }[];
        };

        // Get inventory id for property
        const { data: inv, error: invErr } = await supabaseAdmin
          .from("inventory")
          .select("id")
          .eq("property_id", propertyId)
          .single();

        if (invErr || !inv) return `Error: Could not find inventory for property ${propertyId}`;

        const rows = items.map((i) => ({
          inventory_id: inv.id,
          category: i.category,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          notes: i.notes || null,
          source: "AI_ASSISTED",
        }));

        const { error } = await supabaseAdmin.from("inventory_items").insert(rows);
        if (error) return `Error saving inventory items: ${error.message}`;

        // Update summary
        const summary = items.map((i) => `${i.quantity} ${i.unit} ${i.name} (${i.category})`).join(", ");
        await supabaseAdmin
          .from("inventory")
          .update({ last_ai_update_summary: `AI added: ${summary}` })
          .eq("id", inv.id);

        return `Successfully added ${items.length} inventory items: ${summary}`;
      }

      case "summarize_visit": {
        const { visitId } = args as { visitId: string };

        const { data: visit } = await supabaseAdmin
          .from("service_orders")
          .select("notes, property_id")
          .eq("id", visitId)
          .single();

        const { data: items } = await supabaseAdmin
          .from("service_order_items")
          .select("name, quantity, unit, is_completed, notes")
          .eq("service_order_id", visitId);

        if (!visit || !items) return "Error: Visit not found";

        const completedItems = items.filter((i) => i.is_completed);
        const pendingItems = items.filter((i) => !i.is_completed);

        // Generate summary using AI
        const summaryPrompt = `Summarize this landscaping visit for the property owner in 2-3 friendly sentences:\n\nProvider notes: ${visit.notes || "No notes"}\n\nCompleted services: ${completedItems.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(", ") || "None"}\n\nPending services: ${pendingItems.map((i) => i.name).join(", ") || "None"}`;

        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        const summaryRes = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You write short, friendly summaries of landscaping visits for property owners. Be specific about what was done. 2-3 sentences max." },
              { role: "user", content: summaryPrompt },
            ],
          }),
        });

        const summaryData = await summaryRes.json();
        const clientSummary = summaryData.choices?.[0]?.message?.content || "Visit summary generated.";

        await supabaseAdmin
          .from("service_orders")
          .update({ client_summary: clientSummary })
          .eq("id", visitId);

        return `Summary saved: "${clientSummary}"`;
      }

      case "create_service_request": {
        const { propertyId, description, preferredDate, items } = args as {
          propertyId: string;
          description: string;
          preferredDate?: string;
          items: { name: string; quantity: number; unit: string }[];
        };

        const { data: order, error: orderErr } = await supabaseAdmin
          .from("service_orders")
          .insert([{
            property_id: propertyId,
            status: "DRAFT",
            period_type: "ONE_TIME",
            scheduled_date: preferredDate || null,
            notes: description,
            client_summary: description,
          }])
          .select("id")
          .single();

        if (orderErr || !order) return `Error creating request: ${orderErr?.message}`;

        if (items.length > 0) {
          const orderItems = items.map((i) => ({
            service_order_id: order.id,
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            source: "AD_HOC",
          }));
          await supabaseAdmin.from("service_order_items").insert(orderItems);
        }

        return `Service request created with ${items.length} items. Your landscaper will review it shortly.`;
      }

      case "confirm_tasks_done": {
        const { visitId, itemIds } = args as { visitId: string; itemIds?: string[] };

        if (itemIds && itemIds.length > 0) {
          const { error } = await supabaseAdmin
            .from("service_order_items")
            .update({ is_completed: true })
            .eq("service_order_id", visitId)
            .in("id", itemIds);
          if (error) return `Error: ${error.message}`;
          return `Marked ${itemIds.length} items as completed.`;
        } else {
          const { error, count } = await supabaseAdmin
            .from("service_order_items")
            .update({ is_completed: true })
            .eq("service_order_id", visitId)
            .eq("is_completed", false);
          if (error) return `Error: ${error.message}`;
          return `Marked all pending items as completed for this visit.`;
        }
      }

      default:
        return `Unknown tool: ${fnName}`;
    }
  } catch (e) {
    return `Tool execution error: ${e instanceof Error ? e.message : "Unknown"}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const role = context?.role || "provider";
    const systemPrompt = getSystemPrompt(role, context || {});

    // Filter tools based on role
    const availableTools =
      role === "provider"
        ? tools
        : tools.filter((t) => t.function.name === "create_service_request");

    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    // First AI call
    let response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        tools: availableTools,
        stream: false,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Gateway error:", status, text);
      throw new Error(`Gateway error: ${status}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices?.[0]?.message;

    // Handle tool calls in a loop (max 5 iterations)
    let iterations = 0;
    while (assistantMessage?.tool_calls && iterations < 5) {
      iterations++;
      const toolResults = [];

      for (const tc of assistantMessage.tool_calls) {
        const fnName = tc.function.name;
        const fnArgs = JSON.parse(tc.function.arguments);
        const result = await executeToolCall(fnName, fnArgs, supabaseAdmin);
        toolResults.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Follow-up call with tool results
      aiMessages.push(assistantMessage);
      aiMessages.push(...toolResults);

      response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          tools: availableTools,
          stream: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("Follow-up gateway error:", response.status, text);
        break;
      }

      data = await response.json();
      assistantMessage = data.choices?.[0]?.message;
    }

    const content = assistantMessage?.content || "I've completed the requested action.";

    return new Response(JSON.stringify({ message: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
