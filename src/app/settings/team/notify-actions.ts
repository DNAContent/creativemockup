"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const PATH = "/settings/team";

type ActionResult = { error?: string };

export type SlackSettings = {
  slack_webhook_url: string | null;
  slack_enabled: boolean;
  slack_on_comment: boolean;
  slack_on_access_request: boolean;
  slack_on_approval: boolean;
};

// Save the agency's Slack notification config (RLS allows any agency member).
export async function saveSlackSettings(
  agencyId: string,
  settings: SlackSettings,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_settings")
    .upsert(
      {
        agency_id: agencyId,
        ...settings,
        slack_webhook_url: settings.slack_webhook_url?.trim() || null,
      },
      { onConflict: "agency_id" },
    );
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}

export type EmailPrefField =
  | "email_on_comment"
  | "email_on_access_request"
  | "email_on_approval";

// Toggle one email opt-in for one staff member. The prefs row is guaranteed to
// exist (ensure_notification_prefs runs when the page loads).
export async function setEmailPref(
  agencyId: string,
  userId: string,
  field: EmailPrefField,
  value: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_prefs")
    .update({ [field]: value })
    .eq("agency_id", agencyId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return {};
}
