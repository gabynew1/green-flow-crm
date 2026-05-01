import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";

type Message = { role: "user" | "assistant"; content: string };

function extractContext(pathname: string) {
  const ctx: Record<string, string | undefined> = {};
  const propertyMatch = pathname.match(/properties\/([a-f0-9-]+)/);
  const visitMatch = pathname.match(/visits\/([a-f0-9-]+)/);
  if (propertyMatch) ctx.propertyId = propertyMatch[1];
  if (visitMatch) ctx.visitId = visitMatch[1];
  return ctx;
}

interface AIChatBoxProps {
  mobileTriggerOnly?: boolean;
  inline?: boolean;
}

export function AIChatBox({ mobileTriggerOnly, inline }: AIChatBoxProps) {
  const [open, setOpen] = useState(!!inline);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { isProvider, profile } = useAuth();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [userProperties, setUserProperties] = useState<{ id: string; name: string; address: string | null; city: string | null }[]>([]);
  const { data: tenant } = useTenantSubscription();
  const aiLocked = isProvider && tenant && tenant.ai_tier === "none";

  // Fetch user properties for context
  useEffect(() => {
    if (!profile?.customer_id) return;
    supabase
      .from("properties")
      .select("id, name, address, city")
      .eq("customer_id", profile.customer_id)
      .then(({ data }) => {
        if (data) setUserProperties(data);
      });
  }, [profile?.customer_id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const context = {
        role: isProvider ? "provider" : "client",
        ...extractContext(location.pathname),
      };

      const user = profile ? {
        full_name: profile.full_name,
        email: profile.email,
        unique_client_id: profile.unique_client_id,
      } : undefined;

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
          context,
          user,
          properties: userProperties,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data?.message || "Done!" },
      ]);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Something went wrong";
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (inline) {
    if (aiLocked) {
      return <AILockedCard />;
    }
    return (
      <div className="flex flex-col rounded-2xl border bg-card shadow-sm" style={{ height: "calc(100vh - 12rem)" }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">AI Assistant</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {isProvider ? "Provider" : "Client"}
            </span>
          </div>
        </div>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
              <Sparkles className="h-8 w-8 mx-auto text-primary/40" />
              <p className="font-medium">How can I help?</p>
              {isProvider ? (
                <div className="space-y-1 text-xs">
                  <p>🌿 Describe greenery to populate inventory</p>
                  <p>✅ Tell me tasks are done to mark them complete</p>
                  <p>📝 Ask me to summarize a visit for the client</p>
                </div>
              ) : (
                <div className="space-y-1 text-xs">
                  <p>🏡 Describe what you need for your property</p>
                  <p>📋 I'll create a service request for you</p>
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                {m.role === "assistant" ? <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>ul]:mb-1"><ReactMarkdown>{m.content}</ReactMarkdown></div> : m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-xl px-3 py-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
            </div>
          )}
        </div>
        {/* Input */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask anything…" rows={1} className="min-h-[38px] max-h-24 resize-none text-sm" />
            <Button size="icon" className="shrink-0 h-[38px] w-[38px]" onClick={send} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Floating button */}
      {!open && !mobileTriggerOnly && !aiLocked && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity"
          aria-label="Open AI Assistant"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex w-[380px] max-w-[calc(100vw-2.5rem)] flex-col rounded-2xl border bg-card shadow-2xl"
          style={{ height: "min(520px, calc(100vh - 5rem))" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                AI Assistant
              </span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                {isProvider ? "Provider" : "Client"}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
                <Sparkles className="h-8 w-8 mx-auto text-primary/40" />
                <p className="font-medium">How can I help?</p>
                {isProvider ? (
                  <div className="space-y-1 text-xs">
                    <p>🌿 Describe greenery to populate inventory</p>
                    <p>✅ Tell me tasks are done to mark them complete</p>
                    <p>📝 Ask me to summarize a visit for the client</p>
                  </div>
                ) : (
                  <div className="space-y-1 text-xs">
                    <p>🏡 Describe what you need for your property</p>
                    <p>📋 I'll create a service request for you</p>
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm prose-green max-w-none [&>p]:m-0">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-muted px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                className="min-h-[40px] max-h-[100px] resize-none text-sm"
                rows={1}
              />
              <Button
                size="icon"
                onClick={send}
                disabled={!input.trim() || loading}
                className="h-10 w-10 shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
              AI suggestion — please review before saving
            </p>
          </div>
        </div>
      )}

      {/* Small touch target for mobile bottom nav if mobileTriggerOnly is true */}
      {mobileTriggerOnly && !open && (
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary"
        >
          <Sparkles className="h-5 w-5" />
          <span className="text-[10px]">AI Chat</span>
        </button>
      )}
    </>
  );
}
