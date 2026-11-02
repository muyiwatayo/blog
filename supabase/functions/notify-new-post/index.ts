import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

type PublishedPost = {
  id: string
  title: string
  excerpt: string
  post_type: string
  author: string
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
    const configuredSiteUrl = Deno.env.get('SITE_URL')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase is not configured for notifications.' }, 500)
    }
    if (!resendApiKey || !fromEmail) {
      return jsonResponse({ error: 'Email service is not configured.' }, 503)
    }
    if (!configuredSiteUrl) {
      return jsonResponse({ error: 'The site URL is not configured.' }, 500)
    }

    let siteUrl: URL
    try {
      siteUrl = new URL(configuredSiteUrl)
    } catch {
      return jsonResponse({ error: 'The configured site URL is invalid.' }, 500)
    }
    if (siteUrl.protocol !== 'https:' && siteUrl.protocol !== 'http:') {
      return jsonResponse({ error: 'The configured site URL must use HTTP or HTTPS.' }, 500)
    }

    let payload: { post?: { id?: unknown } }
    try {
      payload = await request.json()
    } catch {
      return jsonResponse({ error: 'A valid post is required.' }, 400)
    }
    const postId = payload.post?.id
    if (
      typeof postId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postId)
    ) {
      return jsonResponse({ error: 'A valid post is required.' }, 400)
    }

    const authHeader = request.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Authentication required.' }, 401)

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Authentication required.' }, 401)
    }

    const { data: post, error: postError } = await userClient
      .from('posts')
      .select('id, title, excerpt, post_type, author')
      .eq('id', postId)
      .eq('author_id', user.id)
      .maybeSingle()
    if (postError) throw postError
    if (!post) {
      return jsonResponse({ error: 'Only the writer of a published note can notify readers.' }, 403)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: subscribers, error: subscriberError } = await admin
      .from('subscribers')
      .select('email')
    if (subscriberError) throw subscriberError
    if (!subscribers?.length) return jsonResponse({ sent: 0, failed: 0 })

    const postUrl = new URL(`/notes/${post.id}`, siteUrl).toString()
    const emailHtml = `
      <div style="font-family: Georgia, serif; color: #273a34; max-width: 560px; margin: 0 auto; padding: 20px;">
        <p style="font-family: monospace; text-transform: uppercase; letter-spacing: 2px; color: #687a72; font-size: 11px">Fieldnotes / ${escapeHtml(post.post_type || 'Note')}</p>
        <h1 style="font-weight: 500; font-size: 32px; line-height: 1.1; margin: 16px 0;">${escapeHtml(post.title)}</h1>
        <p style="font-size: 16px; line-height: 1.6; color: #333;">${escapeHtml(post.excerpt)}</p>
        <p style="font-family: monospace; font-size: 12px; color: #687a72; margin-bottom: 24px;">By ${escapeHtml(post.author)}</p>
        <a href="${escapeHtml(postUrl)}" style="display: inline-block; background: #273a34; color: #f3f5ef; padding: 12px 20px; text-decoration: none; font-family: monospace; font-size: 12px;">Read the new note ↗</a>
      </div>
    `

    let sent = 0
    let failed = 0
    for (const { email } of subscribers) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: `New ${post.post_type || 'note'} on Fieldnotes: ${post.title}`,
            html: emailHtml,
          }),
        })
        if (response.ok) sent++
        else failed++
      } catch (error) {
        console.error('Could not deliver a subscriber notification.', error)
        failed++
      }
    }

    return jsonResponse(
      { sent, failed, ...(failed ? { error: 'Some subscriber emails could not be delivered.' } : {}) },
      failed ? 502 : 200,
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notification failed.'
    return jsonResponse({ error: message }, 500)
  }
})

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char,
  )
}
