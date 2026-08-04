import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, X, Home } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDebouncedValue } from "./useDebouncedValue";

interface PropertyRow {
  id: string;
  name: string;
  customer_id: string;
  is_general?: boolean | null;
  customers?: { name: string | null } | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  customerId?: string;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
  /** Offer a "General / no specific location" option (customer-scoped only). */
  allowGeneral?: boolean;
}

export function PropertyCombobox({
  value,
  onChange,
  customerId,
  placeholder = "Select property",
  allowClear = true,
  disabled,
  className,
  allowGeneral = false,
}: Props) {
  const { tenantId } = useAuth();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 250);
  const [creatingGeneral, setCreatingGeneral] = useState(false);
  const scoped = !!customerId;

  const { data: hydrated } = useQuery({
    queryKey: ["picker-properties-hydrate", tenantId, value],
    enabled: !!value && !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, customer_id, is_general, customers ( name )")
        .eq("id", value!)
        .maybeSingle();
      return data as PropertyRow | null;
    },
  });

  // Defense-in-depth: if selected property doesn't belong to current customerId, clear it.
  useEffect(() => {
    if (!customerId || !hydrated || !value) return;
    if (hydrated.customer_id !== customerId) onChange(null);
  }, [customerId, hydrated, value, onChange]);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["picker-properties", tenantId, customerId ?? "all", debounced],
    enabled: open && !!tenantId && (scoped || debounced.trim().length >= 2),
    queryFn: async () => {
      let q = supabase
        .from("properties")
        .select("id, name, customer_id, is_general, customers ( name )")
        .eq("tenant_id", tenantId!)
        .order("name")
        .limit(scoped ? 100 : 20);
      if (debounced.trim().length >= 2) q = q.ilike("name", `%${debounced.trim()}%`);
      if (customerId) q = q.eq("customer_id", customerId).eq("status", "active");
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as PropertyRow[]).filter((p) => !p.is_general);
    },
  });

  const label = hydrated
    ? hydrated.is_general
      ? "No specific location"
      : hydrated.name
    : value
      ? "…"
      : null;

  const showGeneral = allowGeneral && scoped && !disabled;

  const selectGeneral = async () => {
    if (!customerId) return;
    setCreatingGeneral(true);
    try {
      const { data, error } = await supabase.rpc("fn_get_or_create_general_property", {
        _customer_id: customerId,
      });
      if (error) throw error;
      onChange(data as unknown as string);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not select the general location");
    } finally {
      setCreatingGeneral(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select property"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Home className="h-4 w-4 opacity-60" />
            <span className="truncate">{label ?? placeholder}</span>
          </span>
          <span className="flex items-center gap-1 ml-2">
            {value && allowClear && !disabled && (
              <X
                className="h-3.5 w-3.5 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          {(!scoped || results.length > 8 || term.length > 0) && (
            <CommandInput
              placeholder="Search properties…"
              value={term}
              onValueChange={setTerm}
            />
          )}
          <CommandList>
            {showGeneral && (
              <CommandGroup>
                <CommandItem
                  value="__general__"
                  disabled={creatingGeneral}
                  onSelect={selectGeneral}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      hydrated?.is_general ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {creatingGeneral ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  ) : null}
                  <span className="truncate">
                    No specific location
                    <span className="text-muted-foreground"> — general / ad-hoc work</span>
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {!scoped && debounced.trim().length < 2 ? (
              <div className="px-3 py-6 text-xs text-center text-muted-foreground">
                Type to search…
              </div>
            ) : isFetching ? (
              <div className="px-3 py-6 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading…
              </div>
            ) : results.length === 0 ? (
              <div className="px-3 py-6 text-xs text-center text-muted-foreground">
                {scoped ? "No active properties for this customer" : "No matches"}
              </div>
            ) : (
              <>
                <CommandGroup>
                  {results.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onChange(p.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === p.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">
                        {p.name}
                        {!customerId && p.customers?.name && (
                          <span className="text-muted-foreground"> — {p.customers.name}</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {!scoped && results.length === 20 && (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                    Showing first 20 — refine your search
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}