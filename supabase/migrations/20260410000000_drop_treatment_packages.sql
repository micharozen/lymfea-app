-- Drop treatment_packages and package_treatments (unused, superseded by treatment_bundles)
-- package_treatments has FK to treatment_packages, so drop it first
DROP TABLE IF EXISTS package_treatments;
DROP TABLE IF EXISTS treatment_packages;
