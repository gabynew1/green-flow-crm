import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { format } from "date-fns";

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("feedback")
      .select("*, service_orders(id, period_label, properties(name, customers(name)))")
      .order("created_at", { ascending: false })
      .then(({ data }) => setFeedback(data ?? []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Feedback</h1>
      <div className="space-y-3">
        {feedback.map(f => (
          <Card key={f.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < f.rating_stars ? "fill-accent text-accent" : "text-muted"}`} />
                    ))}
                  </div>
                  <p className="text-sm font-medium">
                    {(f.service_orders as any)?.properties?.name} · {(f.service_orders as any)?.properties?.customers?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{(f.service_orders as any)?.period_label}</p>
                  {f.comment && <p className="text-sm mt-2">{f.comment}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(f.created_at), "MMM d, yyyy")}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {feedback.length === 0 && <p className="text-muted-foreground text-center py-8">No feedback yet</p>}
      </div>
    </div>
  );
}
