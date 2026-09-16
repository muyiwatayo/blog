import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Post = {
  id: string
  title: string
  excerpt: string
  body: string
  post_type: string
  author: string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL')
    const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173'

    if (!resendApiKey || !fromEmail) throw new Error('Email service is not configured.')

    const authHeader = request.headers.get('Authorization') || ''
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { post, siteUrl: requestSiteUrl } = await request.json() as { post: Post, siteUrl?: string }
    if (!post?.id || !post.title) return new Response(JSON.stringify({ error: 'A post is required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: subscribers, error: subscriberError } = await admin.from('subscribers').select('email')
    if (subscriberError) throw subscriberError
    if (!subscribers?.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const postUrl = `${requestSiteUrl || siteUrl}/#note-${post.id}`
    const recipients = subscribers.map(({ email }) => email)
      const emailHtml = `<div style="font-family: Georgia, serif; color: #1f2925; max-width: 560px; margin: 0 auto"><p style="font-family: monospace; text-transform: uppercase; letter-spacing: 2px; color: #6e756f; font-size: 11px">Fieldnotes / ${post.post_type || 'Note'}</p><h1 style="font-weight: 500; font-size: 38px; line-height: 1.05">${escapeHtml(post.title)}</h1><p style="font-size: 16px; line-height: 1.6">${escapeHtml(post.excerpt)}</p><p style="font-family: monospace; font-size: 12px; color: #6e756f">By ${escapeHtml(post.author)}</p><a href="${postUrl}" style="display: inline-block; background: #1f2925; color: #f5f3ed; padding: 13px 17px; text-decoration: none; font-family: monospace; font-size: 12px">Read the new note</a></div>`
      for (const batch of chunk(recipients, 50)) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: fromEmail, to: batch, subject: `New ${post.post_type || 'note'} on Fieldnotes: ${post.title}`, html: emailHtml }),
        })
        if (!response.ok) throw new Error(await response.text())
      }
      return new Response(JSON.stringify({ sent: recipients.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Notification failed.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] || character)
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size))
}