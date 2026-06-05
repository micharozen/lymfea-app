import { useEffect, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let loaderPromise: Promise<google.maps.PlacesLibrary> | null = null;

function loadPlaces(): Promise<google.maps.PlacesLibrary> {
  if (loaderPromise) return loaderPromise;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) {
    loaderPromise = Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
    return loaderPromise;
  }
  setOptions({ key: apiKey, v: "weekly" });
  loaderPromise = importLibrary("places") as Promise<google.maps.PlacesLibrary>;
  return loaderPromise;
}

interface State {
  ready: boolean;
  error: Error | null;
}

export function useGoogleMapsLoader(): State {
  const [state, setState] = useState<State>({ ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    loadPlaces()
      .then(() => {
        if (!cancelled) setState({ ready: true, error: null });
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error("Google Maps load failed");
        if (!cancelled) setState({ ready: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
