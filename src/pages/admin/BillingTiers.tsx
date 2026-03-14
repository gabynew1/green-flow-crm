import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Building2,
    CreditCard,
    Users,
    Settings,
    Check,
    Loader2,
    AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface SubscriptionPlan {
    tier: string;
    name: string;
    description: string;
    monthly_price: number;
    max_provider_seats: number;
    max_client_seats: number;
    feature_flags: Record<string, boolean>;
    is_active: boolean;
}

export default function BillingTiers() {
    const plans: SubscriptionPlan[] = [
        { tier: "free", name: "Free", description: "Basic access for small teams", monthly_price: 0, max_provider_seats: 2, max_client_seats: 50, feature_flags: {}, is_active: true },
        { tier: "starter", name: "Starter", description: "For growing businesses", monthly_price: 29, max_provider_seats: 5, max_client_seats: 100, feature_flags: { ai_assistant: true }, is_active: true },
        { tier: "professional", name: "Professional", description: "Full-featured plan", monthly_price: 79, max_provider_seats: 15, max_client_seats: 500, feature_flags: { ai_assistant: true, advanced_reports: true }, is_active: true },
        { tier: "enterprise", name: "Enterprise", description: "Unlimited everything", monthly_price: 199, max_provider_seats: 999, max_client_seats: 9999, feature_flags: { ai_assistant: true, advanced_reports: true, white_label: true }, is_active: true },
    ];
    const isLoading = false;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Billing & Subscriptions</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Manage pricing tiers and limits.</p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-[400px] rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (!plans || plans.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-muted/30 rounded-3xl border-2 border-dashed border-muted-foreground/20">
                <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                <h3 className="text-xl font-bold">No Billing Plans Found</h3>
                <p className="text-muted-foreground max-w-sm mt-2">
                    The `subscription_plans` table is either empty or hasn't been created yet.
                    Please ensure you have applied the `admin_schema_v3_billing.sql` migration in your Supabase dashboard.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Billing & Subscriptions</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Configure global pricing, seating limits, and feature access per tier.</p>
                </div>
                <Button className="shadow-lg shadow-primary/20">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Create Custom Tier
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {plans?.map((plan) => (
                    <Card key={plan.tier} className={`relative overflow-hidden border-2 transition-all hover:border-primary/50 flex flex-col ${plan.tier === 'TRIAL' ? 'bg-amber-50/50 border-amber-200' : ''}`}>
                        {plan.tier === 'PLATINUM' && (
                            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                                Most Popular
                            </div>
                        )}

                        <CardHeader>
                            <div className="flex justify-between items-start mb-2">
                                <Badge variant={plan.tier === 'TRIAL' ? 'outline' : 'default'} className={
                                    plan.tier === 'PLATINUM' ? 'bg-purple-600' :
                                        plan.tier === 'PREMIUM' ? 'bg-blue-600' :
                                            plan.tier === 'TRIAL' ? 'text-amber-600 border-amber-300' :
                                                ''
                                }>
                                    {plan.tier}
                                </Badge>
                            </div>
                            <CardTitle className="text-2xl">{plan.name}</CardTitle>
                            <CardDescription className="h-10">{plan.description}</CardDescription>
                        </CardHeader>

                        <CardContent className="flex-1 space-y-6">
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-extrabold tracking-tight">${plan.monthly_price}</span>
                                <span className="text-muted-foreground text-sm font-medium">/mo</span>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-border/50">
                                <div className="flex items-center justify-between group">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                                        <Users className="h-4 w-4" />
                                        Provider Seats
                                    </div>
                                    <span className="font-semibold">{plan.max_provider_seats}</span>
                                </div>

                                <div className="flex items-center justify-between group">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                                        <Building2 className="h-4 w-4" />
                                        Client Users
                                    </div>
                                    <span className="font-semibold">{plan.max_client_seats > 9999 ? 'Unlimited' : plan.max_client_seats}</span>
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-border/50">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Features included</p>
                                {Object.entries(plan.feature_flags || {}).filter(([k, v]) => v === true).map(([key]) => (
                                    <div key={key} className="flex items-start gap-2">
                                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                        <span className="text-sm capitalize text-muted-foreground tracking-tight">
                                            {key.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>

                        <CardFooter className="pt-6 border-t bg-muted/20">
                            <Button variant="outline" className="w-full">
                                <Settings className="h-4 w-4 mr-2" />
                                Edit Plan Settings
                            </Button>
                        </CardFooter>
                    </Card>
                ))}

                {/* Trial Explainer Card */}
                <Card className="border-dashed bg-transparent border-primary/20 flex flex-col items-center justify-center text-center p-6 opacity-70 hover:opacity-100 transition-opacity">
                    <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-4">
                        <AlertTriangle className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">How 60-Day Trials Work</h3>
                    <p className="text-sm text-muted-foreground max-w-[200px]">
                        New organizations do not get a "Trial" tier. They are granted <strong>PLATINUM</strong> access for 60 days, and automatically fallback to <strong>BASIC</strong> if not upgraded.
                    </p>
                </Card>
            </div>
        </div>
    );
}
