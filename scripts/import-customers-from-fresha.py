#!/usr/bin/env python3
"""Import clients from a Fresha .xlsx export into the `customers` table.

One-off loader. Reads the export, normalizes phone/email to the same form the
app stores, dedups, and upserts via the Supabase service-role REST API.

Decisions baked in (see plan):
  - Only `first_name`, `last_name`, `phone`, `email`, `date_of_birth` are
    imported. All other Fresha columns (gender, address, marketing consent,
    referral source, tags, "Bloque") are discarded.
  - Rows with NEITHER phone NOR email are skipped.
  - `language` defaults to 'fr'.

Phone normalization MUST match the client flow + find_or_create_customer, which
store national digits only (no '+', no '33' country code, no leading 0, no
spaces) — e.g. "33 6 13 56 85 94" -> "613568594". Otherwise dedup against
existing rows fails and duplicates are created.

Usage:
  python scripts/import-customers-from-fresha.py <export.xlsx>            # dry-run (default)
  python scripts/import-customers-from-fresha.py <export.xlsx> --apply    # write to DB

Requires (env, same contract as scripts/seed-billing-plans.ts):
  SUPABASE_URL  (or VITE_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY   (service_role key — needed to bypass RLS)

Dependencies: openpyxl, requests  (pip install openpyxl requests)
"""

import os
import re
import sys
from datetime import date, datetime

import openpyxl
import requests

# --- column headers in the Fresha export (French) ---
COL_FIRST = "Prénom"
COL_LAST = "Nom de famille"
COL_MOBILE = "Numéro de portable"
COL_EMAIL = "E-mail"
COL_DOB = "Date de naissance"

FULL_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_phone(raw):
    """Return national-digit phone (matching customers.phone) or None.

    Steps: strip whitespace -> strip a leading '33' country code -> strip a
    single leading '0'. Numbers not starting with '33' are returned normalized
    but flagged for review by the caller.
    """
    if not raw:
        return None, False
    digits = re.sub(r"\s", "", str(raw))
    starts_with_33 = digits.startswith("33")
    if starts_with_33:
        digits = digits[2:]
    digits = re.sub(r"^0", "", digits)
    digits = re.sub(r"\D", "", digits)  # drop any stray non-digits
    if not digits:
        return None, False
    return digits, not starts_with_33


def normalize_email(raw):
    if not raw:
        return None
    e = str(raw).strip().lower()
    return e if EMAIL_RE.match(e) else None


def parse_dob(raw):
    """Only accept a full YYYY-MM-DD (string or datetime). Partial values
    like '03-01' are dropped."""
    if not raw:
        return None
    if isinstance(raw, (datetime, date)):
        return raw.strftime("%Y-%m-%d")
    s = str(raw).strip()
    return s if FULL_DATE_RE.match(s) else None


def read_rows(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header = list(rows[0])
    idx = {name: header.index(name) for name in
           (COL_FIRST, COL_LAST, COL_MOBILE, COL_EMAIL, COL_DOB)}
    out = []
    for r in rows[1:]:
        out.append({
            "first": (r[idx[COL_FIRST]] or "").strip() or None,
            "last": (str(r[idx[COL_LAST]]).strip() or None) if r[idx[COL_LAST]] else None,
            "mobile_raw": r[idx[COL_MOBILE]],
            "email_raw": r[idx[COL_EMAIL]],
            "dob_raw": r[idx[COL_DOB]],
        })
    return out


def build_records(raw_rows, stats):
    """Normalize, skip no-contact rows, and dedup (by phone then email)."""
    by_phone = {}
    by_email = {}
    records = []

    def merge(existing, new):
        for k in ("first_name", "last_name", "email", "phone", "date_of_birth"):
            if not existing.get(k) and new.get(k):
                existing[k] = new[k]

    for row in raw_rows:
        stats["read"] += 1
        phone, foreign = normalize_phone(row["mobile_raw"])
        email = normalize_email(row["email_raw"])
        if foreign:
            stats["foreign_phone"] += 1
        if not phone and not email:
            stats["skipped_no_contact"] += 1
            continue
        dob = parse_dob(row["dob_raw"])
        if dob:
            stats["dob_parsed"] += 1
        rec = {
            "first_name": row["first"],
            "last_name": row["last"],
            "phone": phone,
            "email": email,
            "date_of_birth": dob,
            "language": "fr",
        }
        # in-file dedup: phone is the strongest key, then email
        if phone and phone in by_phone:
            merge(by_phone[phone], rec)
            stats["deduped"] += 1
            continue
        if not phone and email and email in by_email:
            merge(by_email[email], rec)
            stats["deduped"] += 1
            continue
        records.append(rec)
        if phone:
            by_phone[phone] = rec
        if email:
            by_email.setdefault(email, rec)
    return records


def supabase_env():
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url:
        sys.exit("SUPABASE_URL (or VITE_SUPABASE_URL) missing")
    if not key:
        sys.exit("SUPABASE_SERVICE_ROLE_KEY missing (service_role key required)")
    return url.rstrip("/"), key


def apply_records(records, stats):
    url, key = supabase_env()
    base = f"{url}/rest/v1/customers"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    with_phone = [r for r in records if r["phone"]]
    no_phone = [r for r in records if not r["phone"]]

    # Phone rows: rely on the customers_phone_key unique constraint for idempotency.
    for i in range(0, len(with_phone), 500):
        batch = with_phone[i:i + 500]
        resp = requests.post(
            base,
            headers={**headers, "Prefer": "resolution=ignore-duplicates,return=representation"},
            json=batch,
            timeout=60,
        )
        resp.raise_for_status()
        stats["inserted"] += len(resp.json())

    # Email-only rows: no unique index on email, so pre-check existence per row.
    for rec in no_phone:
        check = requests.get(
            base,
            headers=headers,
            params={"select": "id", "email": f"eq.{rec['email']}", "limit": 1},
            timeout=60,
        )
        check.raise_for_status()
        if check.json():
            stats["skipped_existing_email"] += 1
            continue
        resp = requests.post(base, headers={**headers, "Prefer": "return=representation"},
                             json=rec, timeout=60)
        resp.raise_for_status()
        stats["inserted"] += len(resp.json())


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    if not args:
        sys.exit("usage: import-customers-from-fresha.py <export.xlsx> [--apply]")
    path = args[0]

    stats = {
        "read": 0, "skipped_no_contact": 0, "deduped": 0, "dob_parsed": 0,
        "foreign_phone": 0, "inserted": 0, "skipped_existing_email": 0,
    }

    records = build_records(read_rows(path), stats)

    if apply:
        apply_records(records, stats)
    else:
        # estimate idempotent inserts without touching the DB
        stats["inserted"] = len(records)

    mode = "APPLY" if apply else "DRY-RUN (no writes; pass --apply to load)"
    print(f"\n=== Fresha customer import — {mode} ===")
    print(f"  rows read in file        : {stats['read']}")
    print(f"  skipped (no contact)     : {stats['skipped_no_contact']}")
    print(f"  deduped within file      : {stats['deduped']}")
    print(f"  records to import        : {len(records)}")
    print(f"    - with phone           : {sum(1 for r in records if r['phone'])}")
    print(f"    - email-only           : {sum(1 for r in records if not r['phone'])}")
    print(f"  date_of_birth parsed     : {stats['dob_parsed']}")
    print(f"  phones not starting '33' : {stats['foreign_phone']} (review)")
    if apply:
        print(f"  inserted into DB         : {stats['inserted']}")
        print(f"  skipped (existing email) : {stats['skipped_existing_email']}")
    print(f"  check: read == skipped_no_contact + deduped + records  -> "
          f"{stats['read']} == {stats['skipped_no_contact']} + {stats['deduped']} + {len(records)}")


if __name__ == "__main__":
    main()
