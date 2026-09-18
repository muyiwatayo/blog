const dashboardConfig = window.FIELDNOTES_CONFIG || {}
const dashboardClient = window.supabase.createClient(dashboardConfig.supabaseUrl, dashboardConfig.supabaseAnonKey)

const safe = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

function notice(text) {
  const root = document.getElementById('noticeRoot')
  if (!root) return
  root.innerHTML = `<div class="data-notice">${safe(text)}<button onclick="document.getElementById('noticeRoot').innerHTML=''">×</button></div>`
}

async function loadDashboard() {
  const { data: { user }, error: userError } = await dashboardClient.auth.getUser()
  if (userError || !user) {
    window.location.href = 'signin.html'
    return
  }

  // Fetch author posts
  const { data: posts } = await dashboardClient
    .from('posts')
    .select('*')
    .eq('author_id', user.id)
    .order('created_at', { ascending: false })

  // Read saved notes from browser local storage
  const savedIds = JSON.parse(localStorage.getItem('fieldnotes-saved') || '[]')
  
  const name = user.user_metadata?.display_name || user.email.split('@')[0]
  const bio = user.user_metadata?.bio || 'Writer, reader, and thinker on Fieldnotes.'
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()

  document.getElementById('dashboardLoading').hidden = true
  const content = document.getElementById('dashboardContent')
  content.hidden = false

  content.innerHTML = `
    <div class="dashboard-shell">
      <div class="dashboard-identity">
        <div class="initials-badge">${safe(initials)}</div>
        <div>
          <p class="eyebrow">Writer Studio</p>
          <h1>Good to see you, ${safe(name)}.</h1>
          <p class="dashboard-muted">${safe(bio)}</p>
        </div>
      </div>

      <div class="dashboard-actions">
        <a class="dashboard-home" href="index.html">Home</a>
        <button class="publish-button" id="openComposerBtn">Write a note <span>+</span></button>
        <button class="text-link" id="openProfileBtn">Edit Profile Card</button>
      </div>

      <div class="dashboard-stats">
        <div><strong>${posts?.length || 0}</strong><span>Published notes</span></div>
        <div><strong>${savedIds.length}</strong><span>Saved for later</span></div>
        <div><strong>${safe(user.email)}</strong><span>Verified Account</span></div>
      </div>

      <div class="dashboard-heading">
        <p class="eyebrow">Your Library & Profile</p>
        <h2>Manage your writing.</h2>
      </div>

      <div class="dashboard-grid">
        <div class="profile-card-preview" style="border: 1px solid rgba(0,0,0,0.08); padding: 24px; border-radius: 8px; margin-bottom: 24px;">
          <p class="eyebrow">Public Writer Card</p>
          <h3 style="margin-top: 8px;">${safe(name)}</h3>
          <p style="margin-top: 4px; color: #6e756f;">${safe(bio)}</p>
          <small style="display: block; margin-top: 12px; color: #6e756f;">${safe(user.email)}</small>
        </div>

        <h3>Published Notes (${posts?.length || 0})</h3>
        ${posts?.length ? posts.map((post) => `
          <article class="dashboard-note">
            <span>${safe(post.post_type || 'Essay')}</span>
            <h3>${safe(post.title)}</h3>
            <p>${safe(post.excerpt)}</p>
            <small>${new Date(post.created_at).toLocaleDateString()} ·${post.read_time || 1} min read</small>
          </article>
        `).join('') : '<p class="empty-state">You have not published anything yet. Click "Write a note" to start.</p>'}
      </div>
    </div>
  `

  document.getElementById('openComposerBtn').onclick = () => openDashboardComposer(user)
  document.getElementById('openProfileBtn').onclick = () => openProfileEditor(user)
}

function openProfileEditor(user) {
  const currentName = user.user_metadata?.display_name || user.email.split('@')[0]
  const currentBio = user.user_metadata?.bio || ''

  const root = document.getElementById('dashboardModalRoot')
  root.innerHTML = `
    <div class="composer-backdrop">
      <form class="composer-panel" id="profileForm">
        <div class="composer-heading">
          <div>
            <p class="eyebrow">Writer Identity</p>
            <h2>Update profile card</h2>
          </div>
          <button type="button" class="close-button" id="closeProfileModal">×</button>
        </div>
        <label>Display Name
          <input required name="name" value="${safe(currentName)}" placeholder="Your display name">
        </label>
        <label>Short Bio / Tagline
          <textarea name="bio" rows="3" placeholder="A short description about your writing focus...">${safe(currentBio)}</textarea>
        </label>
        <div class="composer-footer">
          <span>This metadata appears on your published notes.</span>
          <button class="publish-button" type="submit">Save Profile <span>↗</span></button>
        </div>
      </form>
    </div>
  `

  document.getElementById('closeProfileModal').onclick = () => { root.innerHTML = '' }
  document.getElementById('profileForm').onsubmit = async (e) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const newName = formData.get('name').toString().trim()
    const newBio = formData.get('bio').toString().trim()

    const { error } = await dashboardClient.auth.updateUser({
      data: { display_name: newName, bio: newBio }
    })

    if (error) {
      notice(error.message)
    } else {
      root.innerHTML = ''
      notice('Profile updated successfully.')
      loadDashboard()
    }
  }
}

function openDashboardComposer(user) {
  const postTypes = ['Essay', 'Poem', 'Novel', 'Letter', 'Birthday special']
  const root = document.getElementById('dashboardModalRoot')

  root.innerHTML = `
    <div class="composer-backdrop">
      <form class="composer-panel" id="dashboardPublishForm">
        <div class="composer-heading">
          <div>
            <p class="eyebrow">Writer Studio</p>
            <h2>Publish a note</h2>
          </div>
          <button type="button" class="close-button" id="closeComposerModal">×</button>
        </div>
        <label>Title
          <input required name="title" placeholder="Give your note a title">
        </label>
        <div class="composer-row">
          <label>Author Name
            <input required name="author" value="${safe(user.user_metadata?.display_name || user.email.split('@')[0])}">
          </label>
          <label>Format
            <select name="type">${postTypes.map((t) => `<option>${t}</option>`).join('')}</select>
          </label>
        </div>
        <label>Section
          <select name="category">
            <option>Essays</option>
            <option>Culture</option>
            <option>Making</option>
            <option>Community</option>
          </select>
        </label>
        <label>Your piece
          <textarea required minlength="40" name="body" placeholder="Write your thought, essay, poem, or story..."></textarea>
        </label>
        <div class="composer-footer">
          <span>Your note will be published live to Fieldnotes.</span>
          <button class="publish-button" type="submit">Publish <span>↗</span></button>
        </div>
      </form>
    </div>
  `

  document.getElementById('closeComposerModal').onclick = () => { root.innerHTML = '' }
  document.getElementById('dashboardPublishForm').onsubmit = async (e) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body = form.get('body').toString().trim()
    const title = form.get('title').toString().trim()
    const author = form.get('author').toString().trim()
    const post_type = form.get('type')
    const category = form.get('category')

    const payload = {
      title,
      excerpt: body.slice(0, 142) + '...',
      body,
      post_type,
      category,
      author,
      author_id: user.id,
      read_time: Math.max(1, Math.ceil(body.split(/\s+/).length / 180))
    }

    const { data, error } = await dashboardClient.from('posts').insert(payload).select().single()

    if (error) {
      notice(error.message)
      return
    }

    root.innerHTML = ''
    notice('Published successfully!')
    
    // Trigger subscriber email notification edge function
    await dashboardClient.functions.invoke('notify-new-post', {
      body: { post: data, siteUrl: window.location.origin }
    })

    loadDashboard()
  }
}

document.getElementById('logoutButton').onclick = async () => {
  await dashboardClient.auth.signOut()
  window.location.href = 'index.html'
}

loadDashboard()