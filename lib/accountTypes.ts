export type AccountPlan = "trial" | "pro" | "lifetime" | "expired";

export interface AccountState {
  uid: string;
  email: string | null;
  plan: AccountPlan;
  planLabel: string;
  trialEndsAt: string | null;
  licenseExpiresAt: string | null;
  dailyUsed: number;
  dailyLimit: number;
  remaining: number;
  emailVerified?: boolean;
  isAdmin?: boolean;
}
