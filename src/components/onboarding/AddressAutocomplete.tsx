import { useEffect, useRef } from "react";
import { useGoogleMapsLoader } from "@/hooks/useGoogleMapsLoader";
import { cn } from "@/lib/utils";

export interface ParsedAddress {
  formatted: string;
  name: string;
  streetLine: string;
  postalCode: string;
  city: string;
  country: string;
  countryCode: string;
}

interface NewAddressComponent {
  longText: string | null;
  shortText: string | null;
  types: string[];
}

function pickComponent(
  components: NewAddressComponent[] | undefined | null,
  type: string,
  short = false,
): string {
  if (!components) return "";
  const found = components.find((c) => c.types.includes(type));
  if (!found) return "";
  return (short ? found.shortText : found.longText) ?? "";
}

interface NewPlace {
  addressComponents?: NewAddressComponent[] | null;
  formattedAddress?: string | null;
  displayName?: string | null;
}

export function parseNewPlace(place: NewPlace): ParsedAddress {
  const components = place.addressComponents ?? undefined;
  const streetNumber = pickComponent(components, "street_number");
  const route = pickComponent(components, "route");
  const streetLine = [streetNumber, route].filter(Boolean).join(" ");
  return {
    formatted: place.formattedAddress ?? "",
    name: place.displayName ?? "",
    streetLine,
    postalCode: pickComponent(components, "postal_code"),
    city:
      pickComponent(components, "locality") ||
      pickComponent(components, "postal_town") ||
      pickComponent(components, "administrative_area_level_2"),
    country: pickComponent(components, "country"),
    countryCode: pickComponent(components, "country", true),
  };
}

interface AddressAutocompleteProps {
  id?: string;
  value?: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onPlaceSelected?: (parsed: ParsedAddress) => void;
  includedPrimaryTypes?: string[];
  includedRegionCodes?: string[];
  className?: string;
}

export function AddressAutocomplete({
  id,
  value,
  placeholder,
  onChange,
  onPlaceSelected,
  includedPrimaryTypes,
  includedRegionCodes,
  className,
}: AddressAutocompleteProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectedRef = useRef(onPlaceSelected);
  const { ready } = useGoogleMapsLoader();

  useEffect(() => {
    onChangeRef.current = onChange;
    onPlaceSelectedRef.current = onPlaceSelected;
  }, [onChange, onPlaceSelected]);

  useEffect(() => {
    if (!ready || !hostRef.current || elementRef.current) return;
    const places = (google.maps.places as unknown) as {
      PlaceAutocompleteElement: new (options?: {
        includedPrimaryTypes?: string[];
        includedRegionCodes?: string[];
      }) => HTMLElement;
    };
    const el = new places.PlaceAutocompleteElement({
      includedPrimaryTypes,
      includedRegionCodes,
    });
    el.id = id ?? "";
    if (placeholder) {
      (el as unknown as { placeholder?: string }).placeholder = placeholder;
    }
    el.style.width = "100%";
    hostRef.current.appendChild(el);
    elementRef.current = el;

    const handler = async (event: Event) => {
      const detail = (event as unknown as {
        placePrediction?: { toPlace: () => NewPlace & { fetchFields: (opts: { fields: string[] }) => Promise<unknown> } };
      }).placePrediction;
      if (!detail) return;
      try {
        const place = detail.toPlace();
        await place.fetchFields({
          fields: ["addressComponents", "formattedAddress", "displayName"],
        });
        const parsed = parseNewPlace(place);
        const next = parsed.name || parsed.formatted;
        if (next) onChangeRef.current(next);
        onPlaceSelectedRef.current?.(parsed);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[Places] fetchFields failed", err);
      }
    };
    el.addEventListener("gmp-select", handler);

    return () => {
      el.removeEventListener("gmp-select", handler);
      el.remove();
      elementRef.current = null;
    };
  }, [ready, id, placeholder, includedPrimaryTypes, includedRegionCodes]);

  useEffect(() => {
    const el = elementRef.current as unknown as { value?: string } | null;
    if (!el) return;
    if (typeof value === "string" && el.value !== value) {
      el.value = value;
    }
  }, [value]);

  return (
    <div
      ref={hostRef}
      className={cn(
        "[&_gmp-place-autocomplete]:block [&_gmp-place-autocomplete]:w-full",
        className,
      )}
    />
  );
}
