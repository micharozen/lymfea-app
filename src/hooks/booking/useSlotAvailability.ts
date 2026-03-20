import { useCallback, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

interface UseSlotAvailabilityParams {
  hotelId: string;
  dates: (Date | undefined)[];
  slotInterval?: number;
}

export function useSlotAvailability({
  hotelId,
  dates,
  slotInterval = 30,
}: UseSlotAvailabilityParams) {
  // Deduplicate dates into unique date strings
  const uniqueDateStrings = useMemo(() => {
    const set = new Set<string>();
    for (const d of dates) {
      if (d) set.add(format(d, "yyyy-MM-dd"));
    }
    return [...set];
  }, [dates]);

  const queries = useQueries({
    queries: uniqueDateStrings.map((dateStr) => ({
      queryKey: ["admin-slot-availability", hotelId, dateStr],
      queryFn: async () => {
        const { data, error } = await supabase.functions.invoke(
          "check-availability",
          { body: { hotelId, date: dateStr } }
        );
        if (error) throw error;
        return (data?.availableSlots || []) as string[];
      },
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      enabled: !!hotelId,
    })),
  });

  // Build a map: dateStr -> { slots, isLoading }
  const slotMap = useMemo(() => {
    const map = new Map<string, { slots: string[]; isLoading: boolean }>();
    uniqueDateStrings.forEach((dateStr, i) => {
      map.set(dateStr, {
        slots: queries[i]?.data || [],
        isLoading: queries[i]?.isLoading ?? false,
      });
    });
    return map;
  }, [uniqueDateStrings, queries]);

  const isLoading = useCallback(
    (date: Date | undefined): boolean => {
      if (!date) return false;
      return slotMap.get(format(date, "yyyy-MM-dd"))?.isLoading ?? false;
    },
    [slotMap]
  );

  const isSlotAvailable = useCallback(
    (date: Date | undefined, time: string, interval: number = slotInterval): boolean => {
      if (!date || !hotelId) return true;

      const dateStr = format(date, "yyyy-MM-dd");
      const entry = slotMap.get(dateStr);
      if (!entry) return true; // not yet fetched
      if (entry.isLoading) return true; // still loading, assume available

      const [h, m] = time.split(":").map(Number);
      const totalMinutes = h * 60 + m;
      const alignedMinutes = Math.floor(totalMinutes / interval) * interval;
      const alignedH = Math.floor(alignedMinutes / 60);
      const alignedM = alignedMinutes % 60;
      const alignedSlot = `${String(alignedH).padStart(2, "0")}:${String(alignedM).padStart(2, "0")}:00`;

      return entry.slots.includes(alignedSlot);
    },
    [slotMap, hotelId, slotInterval]
  );

  return { isSlotAvailable, isLoading };
}
