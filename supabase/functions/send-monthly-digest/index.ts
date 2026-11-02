import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type DigestPost = {
  id: string;
  title: string;
  excerpt: string;
  author: string;
};

type Subscriber = {
  id: string;
  email: string;
  unsubscribe_token: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function buildEmail(
  posts: DigestPost[],
  siteUrl: string,
  monthLabel: string,
  unsubscribeUrl: string,
) {
  const postList = posts
    .map(
      (post) =>
        `<li style="margin:0 0 24px"><a href="${siteUrl}/notes/${encodeURIComponent(post.id)}" style="color:#a83245;font-size:20px">${escapeHtml(post.title)}</a><p style="margin:6px 0;color:#666">${escapeHtml(post.excerpt)}</p><small>By ${escapeHtml(post.author)}</small></li>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><body style="margin:0;background:#f7f5f3;color:#1b191a;font:16px/1.6 Arial,sans-serif"><main style="max-width:620px;margin:0 auto;padding:36px 24px"><p style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#71696a">Fieldnotes · Monthly digest</p><h1 style="font:500 36px/1.1 Georgia,serif">A month in Fieldnotes</h1><p style="color:#71696a">${escapeHtml(monthLabel)} — a few new notes worth keeping.</p><ul style="padding:0;list-style:none">${postList}</ul><p style="border-top:1px solid #ded9d8;padding-top:20px;color:#71696a">Read the library at <a href="${siteUrl}" style="color:#a83245">Fieldnotes</a>.</p><p style="font-size:12px;color:#71696a">You’re receiving this because you subscribed to Fieldnotes. <a href="${unsubscribeUrl}" style="color:#a83245">Unsubscribe</a>.</p></main></body></html>`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", { status: 405, headers: { Allow: "POST" } });
  }

  const cronSecret = Deno.env.get("MONTHLY_DIGEST_CRON_SECRET");
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const siteUrlValue = Deno.env.get("SITE_URL");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail || !siteUrlValue) {
    console.error("Monthly digest configuration is incomplete.");
    return new Response("Monthly digest configuration is incomplete.", { status: 500 });
  }

  let siteUrl: string;
  try {
    const parsedUrl = new URL(siteUrlValue);
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
      throw new Error("SITE_URL must use HTTPS.");
    }
    siteUrl = parsedUrl.origin;
  } catch (error) {
    console.error("SITE_URL is invalid.", error);
    return new Response("SITE_URL is invalid.", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const digestMonth = monthStart.toISOString().slice(0, 10);
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthStart);
  let claimedMonth = false;

  try {
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("id, title, excerpt, author")
      .eq("status", "published")
      .gte("published_at", monthStart.toISOString())
      .lt("published_at", nextMonthStart.toISOString())
      .order("published_at", { ascending: false });
    if (postsError) throw postsError;
    if (!posts?.length) {
      return Response.json({ sent: 0, skipped: "no published notes", digestMonth });
    }

    const { data: subscribers, error: subscribersError } = await supabase
      .from("subscribers")
      .select("id, email, unsubscribe_token")
      .is("unsubscribed_at", null);
    if (subscribersError) throw subscribersError;

    const { error: claimError } = await supabase
      .from("newsletter_digests")
      .insert({ digest_month: digestMonth, status: "sending" });
    if (claimError?.code === "23505") {
      const { data: existingDigest, error: digestError } = await supabase
        .from("newsletter_digests")
        .select("status, started_at")
        .eq("digest_month", digestMonth)
        .single();
      if (digestError) throw digestError;
      if (existingDigest.status === "sent") {
        return Response.json({ sent: 0, skipped: "digest already sent", digestMonth });
      }

      const startedAt = new Date(existingDigest.started_at).getTime();
      if (existingDigest.status === "sending" && Date.now() - startedAt < 30 * 60 * 1000) {
        return new Response("This monthly digest is already running.", { status: 409 });
      }

      const { data: claim, error: retryError } = await supabase
        .from("newsletter_digests")
        .update({ status: "sending", started_at: new Date().toISOString(), last_error: null })
        .eq("digest_month", digestMonth)
        .eq("status", existingDigest.status)
        .eq("started_at", existingDigest.started_at)
        .select("digest_month")
        .maybeSingle();
      if (retryError) throw retryError;
      if (!claim) return new Response("This monthly digest is already running.", { status: 409 });
    } else if (claimError) {
      throw claimError;
    }
    claimedMonth = true;

    const { data: previousDeliveries, error: deliveriesError } = await supabase
      .from("newsletter_deliveries")
      .select("subscriber_id")
      .eq("digest_month", digestMonth)
      .eq("status", "sent");
    if (deliveriesError) throw deliveriesError;
    const alreadySent = new Set((previousDeliveries || []).map((delivery) => delivery.subscriber_id));
    const pending = ((subscribers || []) as Subscriber[]).filter(
      (subscriber) => !alreadySent.has(subscriber.id),
    );
    const postList = (posts || []) as DigestPost[];
    let sentCount = alreadySent.size;
    let failedCount = 0;
    const notes = postList.map((post) => ({
      id: post.id,
      title: post.title,
      excerpt: post.excerpt,
      author: post.author,
    }));

    for (let index = 0; index < pending.length; index += 5) {
      const batch = pending.slice(index, index + 5);
      const results = await Promise.all(
        batch.map(async (subscriber) => {
          const unsubscribeUrl = `${supabaseUrl}/functions/v1/unsubscribe-monthly-digest?token=${encodeURIComponent(subscriber.unsubscribe_token)}`;
          try {
            const response = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": `fieldnotes-${digestMonth}-${subscriber.id}`,
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [subscriber.email],
                subject: `A month in Fieldnotes — ${monthLabel}`,
                html: buildEmail(notes, siteUrl, monthLabel, unsubscribeUrl),
                headers: {
                  "List-Unsubscribe": `<${unsubscribeUrl}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
              }),
            });
            if (!response.ok) {
              const details = (await response.text()).slice(0, 300);
              throw new Error(`Resend returned ${response.status}: ${details}`);
            }

            const { error: saveError } = await supabase
              .from("newsletter_deliveries")
              .upsert(
                {
                  digest_month: digestMonth,
                  subscriber_id: subscriber.id,
                  status: "sent",
                  sent_at: new Date().toISOString(),
                  last_error: null,
                },
                { onConflict: "digest_month,subscriber_id" },
              );
            if (saveError) throw saveError;
            return { sent: true, error: null };
          } catch (error) {
            const message = error instanceof Error ? error.message : "Email delivery failed.";
            const { error: saveError } = await supabase
              .from("newsletter_deliveries")
              .upsert(
                {
                  digest_month: digestMonth,
                  subscriber_id: subscriber.id,
                  status: "failed",
                  last_error: message.slice(0, 500),
                },
                { onConflict: "digest_month,subscriber_id" },
              );
            if (saveError) console.error("Could not record a failed newsletter delivery.", saveError);
            console.error(`Monthly digest delivery failed for ${subscriber.id}.`, message);
            return { sent: false, error: message };
          }
        }),
      );
      sentCount += results.filter((result) => result.sent).length;
      failedCount += results.filter((result) => !result.sent).length;
    }

    const status = failedCount ? "failed" : "sent";
    const { error: finishError } = await supabase
      .from("newsletter_digests")
      .update({
        status,
        subscriber_count: (subscribers || []).length,
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: failedCount ? null : new Date().toISOString(),
        last_error: failedCount ? `${failedCount} delivery or tracking error(s).` : null,
      })
      .eq("digest_month", digestMonth);
    if (finishError) throw finishError;

    return Response.json({ sent: sentCount, failed: failedCount, digestMonth });
  } catch (error) {
    console.error("The monthly digest could not be completed.", error);
    if (claimedMonth) {
      const { error: updateError } = await supabase
        .from("newsletter_digests")
        .update({
          status: "failed",
          last_error: error instanceof Error ? error.message.slice(0, 500) : "Digest failed.",
        })
        .eq("digest_month", digestMonth);
      if (updateError) console.error("Could not record the failed monthly digest.", updateError);
    }
    return new Response("The monthly digest could not be completed.", { status: 500 });
  }
});
