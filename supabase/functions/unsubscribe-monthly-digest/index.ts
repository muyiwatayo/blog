import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function page(message: string, status: number) {
  let siteUrl = "https://fieldnotes-blog.vercel.app";
  try {
    const configuredUrl = Deno.env.get("SITE_URL");
    if (configuredUrl) {
      const parsedUrl = new URL(configuredUrl);
      if (parsedUrl.protocol === "https:" || parsedUrl.hostname === "localhost") {
        siteUrl = parsedUrl.origin;
      }
    }
  } catch (error) {
    console.error("The configured site address is invalid for the unsubscribe page.", error);
  }

  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fieldnotes email preferences</title><body style="margin:0;background:#f7f5f3;color:#1b191a;font:16px/1.6 Arial,sans-serif"><main style="max-width:560px;margin:12vh auto;padding:32px"><p style="color:#a83245;font-size:12px;letter-spacing:2px;text-transform:uppercase">Fieldnotes</p><h1 style="font:500 36px/1.1 Georgia,serif">Email preferences</h1><p>${message}</p><a style="color:#a83245" href="${siteUrl}">Return to Fieldnotes</a></main></body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

Deno.serve(async (request) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  }

  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");
  if (
    !token ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
  ) {
    return page("This unsubscribe link is invalid or has expired.", 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("The unsubscribe function is missing Supabase configuration.");
    return page("Your email preference could not be updated. Please try again later.", 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token)
    .is("unsubscribed_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("Could not update a subscriber's email preference.", error);
    return page("Your email preference could not be updated. Please try again later.", 500);
  }
  if (!data) {
    const { data: subscriber, error: lookupError } = await supabase
      .from("subscribers")
      .select("id")
      .eq("unsubscribe_token", token)
      .maybeSingle();
    if (lookupError) {
      console.error("Could not verify an unsubscribe request.", lookupError);
      return page("Your email preference could not be updated. Please try again later.", 500);
    }
    if (!subscriber) return page("This unsubscribe link is invalid or has expired.", 404);
  }

  return page("You’re unsubscribed from the Fieldnotes monthly digest.", 200);
});
