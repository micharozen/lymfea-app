import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TimePickerWheelProps {
  value: string;
  onChange: (value: string) => void;
  minHour?: number;
  maxHour?: number;
  minuteStep?: number;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;

export function TimePickerWheel({
  value,
  onChange,
  minHour = 7,
  maxHour = 23,
  minuteStep = 10,
}: TimePickerWheelProps) {
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
  const minutes = Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep);

  const [selectedHour, setSelectedHour] = useState(() => {
    if (value) {
      const h = parseInt(value.split(":")[0]);
      return hours.includes(h) ? h : hours[0];
    }
    return hours[0];
  });

  const [selectedMinute, setSelectedMinute] = useState(() => {
    if (value) {
      const m = parseInt(value.split(":")[1]);
      return minutes.includes(m) ? m : minutes[0];
    }
    return minutes[0];
  });

  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeValue = `${selectedHour.toString().padStart(2, "0")}:${selectedMinute.toString().padStart(2, "0")}`;
    if (timeValue !== value) {
      onChange(timeValue);
    }
  }, [selectedHour, selectedMinute, onChange, value]);

  // Scroll to selected value on mount
  useEffect(() => {
    if (hourRef.current) {
      const index = hours.indexOf(selectedHour);
      hourRef.current.scrollTop = index * ITEM_HEIGHT;
    }
    if (minuteRef.current) {
      const index = minutes.indexOf(selectedMinute);
      minuteRef.current.scrollTop = index * ITEM_HEIGHT;
    }
  }, []);

  const handleScroll = (
    ref: React.RefObject<HTMLDivElement>,
    items: number[],
    setSelected: (val: number) => void
  ) => {
    if (!ref.current) return;
    const scrollTop = ref.current.scrollTop;
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, items.length - 1));
    setSelected(items[clampedIndex]);
  };

  const scrollToItem = (
    ref: React.RefObject<HTMLDivElement>,
    items: number[],
    item: number
  ) => {
    if (!ref.current) return;
    const index = items.indexOf(item);
    ref.current.scrollTo({
      top: index * ITEM_HEIGHT,
      behavior: "smooth",
    });
  };

  return (
    <div className="flex items-center gap-2 p-4">
      {/* Hours */}
      <div className="relative">
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 bg-muted rounded-md pointer-events-none z-0"
          style={{ height: ITEM_HEIGHT }}
        />
        <div
          ref={hourRef}
          className="relative z-10 overflow-y-auto scrollbar-hide"
          style={{
            height: ITEM_HEIGHT * VISIBLE_ITEMS,
            scrollSnapType: "y mandatory",
          }}
          onScroll={() => handleScroll(hourRef, hours, setSelectedHour)}
        >
          <div style={{ height: ITEM_HEIGHT * 2 }} />
          {hours.map((h) => (
            <div
              key={h}
              className={cn(
                "flex items-center justify-center cursor-pointer transition-all",
                selectedHour === h
                  ? "text-foreground font-semibold text-lg"
                  : "text-muted-foreground text-base"
              )}
              style={{
                height: ITEM_HEIGHT,
                scrollSnapAlign: "center",
              }}
              onClick={() => {
                setSelectedHour(h);
                scrollToItem(hourRef, hours, h);
              }}
            >
              {h.toString().padStart(2, "0")}
            </div>
          ))}
          <div style={{ height: ITEM_HEIGHT * 2 }} />
        </div>
      </div>

      <span className="text-xl font-semibold">:</span>

      {/* Minutes */}
      <div className="relative">
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-10 bg-muted rounded-md pointer-events-none z-0"
          style={{ height: ITEM_HEIGHT }}
        />
        <div
          ref={minuteRef}
          className="relative z-10 overflow-y-auto scrollbar-hide"
          style={{
            height: ITEM_HEIGHT * VISIBLE_ITEMS,
            scrollSnapType: "y mandatory",
          }}
          onScroll={() => handleScroll(minuteRef, minutes, setSelectedMinute)}
        >
          <div style={{ height: ITEM_HEIGHT * 2 }} />
          {minutes.map((m) => (
            <div
              key={m}
              className={cn(
                "flex items-center justify-center cursor-pointer transition-all",
                selectedMinute === m
                  ? "text-foreground font-semibold text-lg"
                  : "text-muted-foreground text-base"
              )}
              style={{
                height: ITEM_HEIGHT,
                scrollSnapAlign: "center",
              }}
              onClick={() => {
                setSelectedMinute(m);
                scrollToItem(minuteRef, minutes, m);
              }}
            >
              {m.toString().padStart(2, "0")}
            </div>
          ))}
          <div style={{ height: ITEM_HEIGHT * 2 }} />
        </div>
      </div>
    </div>
  );
}
