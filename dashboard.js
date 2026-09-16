const dashboardConfig = window.FIELDNOTES_CONFIG || {}
const dashboardClient = window.supabase.createClient(dashboardConfig.supabaseUrl, dashboardConfig.supabaseAnonKey)
const safe = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

async function loadDashboard() {
  const { data: { user } } = await dashboardClient.auth.getUser()
  if (!user) { window.location.href = 'signin.html'; return }
  const { data: posts } = await dashboardClient.from('posts').select('*').eq('author_id', user.id).order('created_at', { ascending: false })
  const name = user.user_metadata?.display_name || user.email.split('@')[0]
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  document.getElementById('dashboardLoading').hidden = true
  const content = document.getElementById('dashboardContent')
  content.hidden = false
  content.innerHTML = `<div class="dashboard-shell"><div class="dashboard-identity"><div class="initials-badge">${safe(initials)}</div><div><p class="eyebrow">Writer studio</p><h1>Good to see you, ${safe(name)}.</h1><p class="dashboard-muted">Your private home for making and keeping notes.</p></div></div><div class="dashboard-actions"><a class="dashboard-home" href="index.html">Home</a><a class="publish-button" href="index.html#write">Write a note <span>+</span></a><span class="dashboard-email">${safe(user.email)}</span></div><div class="dashboard-stats"><div><strong>${posts?.length || 0}</strong><span>Published notes</span></div><div><strong>Fieldnotes</strong><span>Writer account</span></div><div><strong>Active</strong><span>Session</span></div></div><div class="dashboard-heading"><p class="eyebrow">Your library</p><h2>Notes you have made.</h2></div><div class="dashboard-grid">${posts?.length ? posts.map((post) => `<article class="dashboard-note"><span>${safe(post.post_type || 'Essay')}</span><h3>${safe(post.title)}</h3><p>${safe(post.excerpt)}</p><small>${new Date(post.created_at).toLocaleDateString()}</small></article>`).join('') : '<p class="empty-state">You have not published anything yet. Return home and choose Write a note.</p>'}</div></div>`
}

document.getElementById('logoutButton').onclick = async () => { await dashboardClient.auth.signOut(); window.location.href = 'index.html' }
loadDashboard()