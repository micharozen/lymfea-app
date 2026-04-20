import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;
const GENDER_VALUES = new Set(['female', 'male']);

function parseSlugList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => SLUG_RE.test(s));
}

export type UrlGender = 'female' | 'male' | null;

export interface UrlBookingState {
  treatmentSlugs: string[];
  date: string | null;
  time: string | null;
  gender: UrlGender;
  setTreatmentSlugs: (slugs: string[]) => void;
  setDateTime: (date: string, time: string) => void;
  setGender: (gender: UrlGender) => void;
  clearDateTime: () => void;
}

/**
 * Synchronises booking selection (treatments, date, time) with URL query params
 * so that refresh + share produce the same state.
 *
 * Params used:
 *  - ?t=slug1,slug2  — selected treatment slugs (comma-separated)
 *  - ?date=YYYY-MM-DD
 *  - ?time=HH:mm
 *
 * Values that fail validation are dropped silently.
 */
export function useUrlBookingState(): UrlBookingState {
  const [searchParams, setSearchParams] = useSearchParams();

  const treatmentSlugs = useMemo(
    () => parseSlugList(searchParams.get('t')),
    [searchParams]
  );

  const date = useMemo(() => {
    const raw = searchParams.get('date');
    return raw && DATE_RE.test(raw) ? raw : null;
  }, [searchParams]);

  const time = useMemo(() => {
    const raw = searchParams.get('time');
    return raw && TIME_RE.test(raw) ? raw : null;
  }, [searchParams]);

  const gender = useMemo((): UrlGender => {
    const raw = searchParams.get('gender');
    return raw && GENDER_VALUES.has(raw) ? (raw as 'female' | 'male') : null;
  }, [searchParams]);

  const setTreatmentSlugs = useCallback(
    (slugs: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const clean = slugs.filter((s) => SLUG_RE.test(s));
          if (clean.length > 0) {
            next.set('t', clean.join(','));
          } else {
            next.delete('t');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setDateTime = useCallback(
    (nextDate: string, nextTime: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (DATE_RE.test(nextDate)) {
            next.set('date', nextDate);
          } else {
            next.delete('date');
          }
          if (TIME_RE.test(nextTime)) {
            next.set('time', nextTime);
          } else {
            next.delete('time');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setGender = useCallback(
    (g: UrlGender) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (g && GENDER_VALUES.has(g)) {
            next.set('gender', g);
          } else {
            next.delete('gender');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearDateTime = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('date');
        next.delete('time');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  return {
    treatmentSlugs,
    date,
    time,
    gender,
    setTreatmentSlugs,
    setDateTime,
    setGender,
    clearDateTime,
  };
}
