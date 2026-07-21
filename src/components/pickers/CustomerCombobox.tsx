import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, X, User } from "lucide-react";
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
import { useDebouncedValue } from "./useDebouncedValue";

interface Props {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CustomerCombobox({
  value,
  onChange,
  placeholder = "Select customer",
  allowClear = true,
  disabled,
  className,
}: Props) {
  const { tenantId } = useAuth();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 250);

  const { data: hydrated } = useQuery({
    queryKey: ["picker-customers-hydrate", tenantId, value],
    enabled: !!value && !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name, company_name")
        .eq("id", value!)
        .maybeSingle();
      return data as { id: string; name: string; company_name: string | null } | null;
    },
  });

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["picker-customers", tenantId, debounced],
    enabled: open && !!tenantId && debounced.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, company_name")
        .eq("tenant_id", tenantId!)
        .ilike("name", `%${debounced.trim()}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; company_name: string | null }[];
    },
  });

  const label = hydrated
    ? `${hydrated.name}${hydrated.company_name ? ` (${hydrated.company_name})` : ""}`
    : value
      ? "…"
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select customer"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <User className="h-4 w-4 opacity-60" />
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
          <CommandInput
            placeholder="Search customers…"
            value={term}
            onValueChange={setTerm}
          />
          <CommandList>
            {debounced.trim().length < 2 ? (
              <div className="px-3 py-6 text-xs text-center text-muted-foreground">
                Type to search…
              </div>
            ) : isFetching ? (
              <div className="px-3 py-6 flex items-center justify-center text-xs text-muted-foreground gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Searching…
              </div>
            ) : results.length === 0 ? (
              <CommandEmpty>No matches</CommandEmpty>
            ) : (
              <>
                <CommandGroup>
                  {results.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === c.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="truncate">
                        {c.name}
                        {c.company_name && (
                          <span className="text-muted-foreground"> ({c.company_name})</span>
                        )}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {results.length === 20 && (
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