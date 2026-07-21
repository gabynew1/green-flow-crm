import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, X, Building2 } from "lucide-react";
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

export function TenantCombobox({
  value,
  onChange,
  placeholder = "Tenant: Any",
  allowClear = true,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term, 250);

  // Hydrate label for a preset value.
  const { data: hydrated } = useQuery({
    queryKey: ["picker-tenants-hydrate", value],
    enabled: !!value,
    queryFn: async () => {
      const { data } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("id", value!)
        .maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["picker-tenants", debounced],
    enabled: open && debounced.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name")
        .ilike("name", `%${debounced.trim()}%`)
        .order("name")
        .limit(20);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const label = hydrated?.name ?? (value ? "…" : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Filter by tenant"
          disabled={disabled}
          className={cn("h-11 justify-between min-w-[200px]", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 opacity-60" />
            <span className="truncate">{label ?? placeholder}</span>
          </span>
          <span className="flex items-center gap-1 ml-2">
            {value && allowClear && (
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
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search tenants…"
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
                  {results.map((t) => (
                    <CommandItem
                      key={t.id}
                      value={t.id}
                      onSelect={() => {
                        onChange(t.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === t.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {t.name}
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