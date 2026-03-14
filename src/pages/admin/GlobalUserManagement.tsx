import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Users,
    Search,
    Mail,
    ShieldAlert,
    UserCircle2,
    Fingerprint,
    ExternalLink,
    Lock,
    Unlock,
    KeyRound,
    RefreshCcw,
    BadgeCheck,
    Eye,
    ChevronDown,
    Building2,
    Shield,
    Ban
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GlobalUserManagement() {
    const [searchTerm, setSearchTerm] = useState("");

    const { data: users, isLoading, refetch } = useQuery({
        queryKey: ["admin-global-users", searchTerm],
        queryFn: async () => {
            let query = supabase
                .from("profiles")
                .select(`
          id, 
          full_name, 
          email, 
          tenant_id,
          is_locked,
          license_type,
          temporary_password,
          tenants (name, subscription_tier)
        `);

            if (searchTerm) {
                query = query.or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query.limit(50);
            if (error) throw error;
            return data;
        }
    });

    const toggleLock = async (id: string, currentLock: boolean) => {
        const { error } = await supabase
            .from("profiles")
            .update({ is_locked: !currentLock } as any)
            .eq("id", id);

        if (error) toast.error(error.message);
        else {
            toast.success(currentLock ? "User unfrozen" : "User access revoked");
            refetch();
        }
    };

    const assignLicense = async (id: string, newLicense: string) => {
        const { error } = await supabase
            .from("profiles")
            .update({ license_type: newLicense } as any)
            .eq("id", id);

        if (error) toast.error(error.message);
        else {
            toast.success(`License updated to ${newLicense}`);
            refetch();
        }
    };

    const triggerReset = async (id: string) => {
        // In reality, this should call an Edge Function using Supabase Admin API to force auth password
        const tempPassword = Math.random().toString(36).slice(-8) + "A1!";
        const { error } = await supabase
            .from("profiles")
            .update({ temporary_password: tempPassword } as any)
            .eq("id", id);

        if (error) toast.error("Failed to generate password: " + error.message);
        else {
            toast.success(`Temp Password Generated: ${tempPassword}`, { duration: 10000 });
            refetch();
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Global User Support</h2>
                    <p className="text-muted-foreground mt-1 font-medium">Search and assist users across all tenants.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline">
                        <ShieldAlert className="h-4 w-4 mr-2" />
                        Security Audit
                    </Button>
                </div>
            </div>

            <div className="relative group max-w-2xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                    placeholder="Search by full name or email address..."
                    className="pl-10 h-12 text-lg shadow-sm border-primary/20 focus:ring-primary/20"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid gap-6 md:grid-cols-4">
                {[
                    { label: "Active Sessions", value: "1,204", icon: Fingerprint, color: "text-blue-600" },
                    { label: "Locked Accounts", value: "12", icon: Lock, color: "text-destructive" },
                    { label: "MFA Adoption", value: "64%", icon: KeyRound, color: "text-amber-600" },
                    { label: "Role Requests", value: "5", icon: RefreshCcw, color: "text-purple-600" },
                ].map((stat, i) => (
                    <Card key={i} className="border-primary/5 bg-primary/5 backdrop-blur-sm">
                        <CardContent className="pt-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                                <p className={cn("text-2xl font-bold mt-1", stat.color)}>{stat.value}</p>
                            </div>
                            <stat.icon className={cn("h-8 w-8 opacity-20", stat.color)} />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="border-primary/10 overflow-hidden">
                <Table>
                    <TableHeader className="bg-muted/50">
                        <TableRow>
                            <TableHead className="font-bold">User Identity</TableHead>
                            <TableHead className="font-bold">Affiliation</TableHead>
                            <TableHead className="font-bold">License</TableHead>
                            <TableHead className="font-bold">Status</TableHead>
                            <TableHead className="text-right font-bold w-[250px]">Support Toolbox</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-8 animate-pulse">Searching global registry...</TableCell></TableRow>
                        ) : users?.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No users found matching your search.</TableCell></TableRow>
                        ) : users?.map((user: any) => (
                            <TableRow key={user.id} className="group transition-colors hover:bg-primary/5">
                                <TableCell>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border shadow-inner">
                                            <UserCircle2 className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm leading-none">{user.full_name || "Unknown User"}</p>
                                            <p className="text-xs text-muted-foreground font-medium mt-1 flex items-center gap-1">
                                                <Mail className="h-3 w-3" />
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1 items-start">
                                        <Badge variant="outline" className="bg-background/50 font-bold border-primary/20">
                                            {user.tenants?.name || "Independent"}
                                        </Badge>
                                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                                            Tier: {user.tenants?.subscription_tier || "N/A"}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-8 px-2 flex items-center gap-2 hover:bg-primary/10">
                                                {user.license_type === 'FULL' ? (
                                                    <Badge className="bg-blue-600 hover:bg-blue-700">Full Access</Badge>
                                                ) : (
                                                    <Badge variant="secondary">Viewer</Badge>
                                                )}
                                                <ChevronDown className="h-3 w-3 opacity-50" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuLabel>Change License</DropdownMenuLabel>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => assignLicense(user.id, 'FULL')}>
                                                <BadgeCheck className="h-4 w-4 mr-2 text-blue-600" />
                                                Full Access
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => assignLicense(user.id, 'VIEWER')}>
                                                <Eye className="h-4 w-4 mr-2" />
                                                Viewer (Read-only)
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                                <TableCell>
                                    {user.is_locked ? (
                                        <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                                            <Lock className="h-3 w-3" />
                                            Locked
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 flex items-center gap-1 w-fit">
                                            <Unlock className="h-3 w-3" />
                                            Active
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="bg-primary/5 hover:bg-primary/10 border-primary/10"
                                            onClick={() => triggerReset(user.id)}
                                        >
                                            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                                            Reset PW
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => toggleLock(user.id, user.is_locked)}
                                            className={cn(
                                                "border-primary/10",
                                                user.is_locked ? "text-green-600 hover:bg-green-50" : "text-destructive hover:bg-destructive/5"
                                            )}
                                        >
                                            {user.is_locked ? <Unlock className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                                        </Button>
                                        <Button variant="secondary" size="sm" className="font-bold shadow-sm">
                                            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                            Impersonate
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
