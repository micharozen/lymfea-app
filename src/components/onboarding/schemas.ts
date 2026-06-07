import { z } from "zod";

export const accountSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().optional().default(""),
    countryCode: z.string().optional().default("+33"),
    termsAccepted: z.literal(true, {
      errorMap: () => ({ message: "termsRequired" }),
    }),
    privacyAccepted: z.literal(true, {
      errorMap: () => ({ message: "privacyRequired" }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwordMismatch",
  });

export const organizationSchema = z.object({
  organizationName: z.string().min(2).max(80),
});

export const venueSchema = z.object({
  venueType: z.enum(["hotel", "spa"]),
  venueName: z.string().min(2).max(120),
  venueAddress: z.string().min(5).max(200),
  venuePostalCode: z.string().max(20).optional().default(""),
  venueCity: z.string().max(120).optional().default(""),
  venueCountry: z.string().max(120).optional().default(""),
});

export const planSchema = z.object({
  planCode: z.enum(["starter", "pro"]),
  billingCycle: z.enum(["monthly", "yearly"]),
});

export type AccountValues = z.infer<typeof accountSchema>;
export type OrganizationValues = z.infer<typeof organizationSchema>;
export type VenueValues = z.infer<typeof venueSchema>;
export type PlanValues = z.infer<typeof planSchema>;

export type OnboardingValues = AccountValues &
  OrganizationValues &
  VenueValues &
  PlanValues;

export type StepKey = "account" | "organization" | "venue" | "plan" | "summary";
