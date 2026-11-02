// Fix: use window.ENV (exported by config.js)
const supabaseUrl    = window.ENV?.SUPABASE_URL    || 'https://tyicduuijghugeztrmmj.supabase.co';
const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY || 'sb_publishable_xYH_3Mnn4rcfnKym7RVyMw_X2FASqON';
const dashboardClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

const safe = (v = '') => String(v).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function notice(text) {
  const root = document.getElementById('noticeRoot');
  if (!root) return;
  root.innerHTML = `<div class="data-notice">${safe(text)}<button onclick="document.getElementById('noticeRoot').innerHTML=''">×</button></div>`;
}

function badgeColor(id = '') {
  const palette = ['#c65d43','#4a7c6f','#7b6fa0','#c4883a','#3a6ea5','#7a9e3a'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = id.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

async function loadDashboard() {
  // 1. Verify session
  const { data: { session } } = await dashboardClient.auth.getSession();
  if (!session) { window.location.href = 'signin.html'; return; }

  const { data: { user }, error: userError } = await dashboardClient.auth.getUser();
  if (userError || !user) { window.location.href = 'signin.html'; return; }

  // 2. Upsert profile row (creates it on first sign-in)
  const displayName = user.user_metadata?.display_name
    || user.user_metadata?.full_name
    || user.email.split('@')[0];
  const bio = user.user_metadata?.bio || '';

  await dashboardClient.from('profiles').upsert(
    { id: user.id, display_name: displayName, bio, updated_at: new Date().toISOString() },
    { onConflict: 'id', ignoreDuplicates: false }
  );

  // 3. Fetch posts, follower count, following count in parallel
  const [postsRes, followersRes, followingRes] = await Promise.all([
    dashboardClient.from('posts').select('*').eq('author_id', user.id).order('created_at', { ascending: false }),
    dashboardClient.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', user.id),
    dashboardClient.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', user.id)
  ]);

  const posts          = postsRes.data || [];
  const followersCount = followersRes.count || 0;
  const followingCount = followingRes.count || 0;
  const savedIds       = JSON.parse(localStorage.getItem('fieldnotes-saved') || '[]');

  const name     = displayName;
  const initials = name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
  const color    = badgeColor(user.id);

  // 4. Reveal content
  document.getElementById('dashboardLoading').hidden = true;
  const content = document.getElementById('dashboardContent');
  content.hidden = false;

  // 5. Render
  const inner = document.getElementById('dashboardInner');
  inner.innerHTML = `
    <div class="dashboard-shell" style="max-width:1180px;margin:auto;padding:75px 0 100px;">

      <!-- Identity row -->
      <div class="dashboard-identity" style="margin-bottom:35px;">
        <div class="initials-badge" style="background:${color};box-shadow:0 0 0 7px ${color}22;">${safe(initials)}</div>
        <div>
          <p class="eyebrow">Writer Studio</p>
          <h1 style="font:500 clamp(42px,5vw,70px)/.92 Fraunces,serif;letter-spacing:-3px;margin:10px 0 8px;">${safe(name)}</h1>
          <p class="dashboard-muted">${safe(bio || 'Add a bio to introduce yourself to readers.')}</p>
          <a class="dashboard-profile-link" href="profile.html?id=${user.id}">View public profile →</a>
        </div>
      </div>

      <!-- Action bar -->
      <div class="dashboard-actions" style="margin-bottom:42px;padding-bottom:28px;border-bottom:1px solid var(--line);">
        <button class="publish-button" id="openComposerBtn">Write a note <span>+</span></button>
        <button class="text-link" id="openProfileBtn">Edit Profile</button>
      </div>

      <!-- Stats (5 cols) -->
      <div class="dashboard-stats dashboard-stats-5" style="margin-bottom:70px;">
        <div><strong>${posts.length}</strong><span>Notes published</span></div>
        <div><strong>${followersCount}</strong><span>Followers</span></div>
        <div><strong>${followingCount}</strong><span>Following</span></div>
        <div><strong>${savedIds.length}</strong><span>Saved</span></div>
        <div><strong style="font-size:14px;letter-spacing:0;">${safe(user.email)}</strong><span>Account</span></div>
      </div>

      <!-- Posts heading -->
      <div class="dashboard-heading" style="margin-bottom:30px;">
        <p class="eyebrow">Your library</p>
        <h2 style="font:500 45px/1 Fraunces,serif;letter-spacing:-2px;margin:0;">Manage your writing.</h2>
      </div>

      <!-- Posts grid -->
      <div class="dashboard-grid">
        ${posts.length
          ? posts.map(post => `
              <article class="dashboard-note">
                <span>${safe(post.post_type || 'Essay')}</span>
                <h3>${safe(post.title)}</h3>
                <p>${safe(post.excerpt)}</p>
                <small>${new Date(post.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} · ${post.read_time || 1} min read</small>
              </article>`).join('')
          : `<p class="empty-state" style="grid-column:1/-1;">
               You haven't published anything yet. Click <strong>Write a note</strong> to start.
             </p>`
        }
      </div>
    </div>
  `;

  document.getElementById('openComposerBtn').onclick = () => openDashboardComposer(user);
  document.getElementById('openProfileBtn').onclick  = () => openProfileEditor(user, bio);
}

/* ── Profile editor modal ──────────────────────────────── */
function openProfileEditor(user, currentBio) {
  const currentName    = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email.split('@')[0];
  const currentWebsite = user.user_metadata?.website || '';
  const root = document.getElementById('dashboardModalRoot');

  root.innerHTML = `
    <div class="composer-backdrop">
      <form class="composer-panel" id="profileForm">
        <div class="composer-heading">
          <div>
            <p class="eyebrow">Writer Identity</p>
            <h2>Edit<br><em>profile.</em></h2>
          </div>
          <button type="button" class="close-button" id="closeProfileModal">×</button>
        </div>
        <label>Display Name
          <input required name="name" value="${safe(currentName)}" placeholder="Your display name">
        </label>
        <label>Short Bio
          <textarea name="bio" rows="3" placeholder="Tell readers a little about yourself…">${safe(currentBio || '')}</textarea>
        </label>
        <label>Website
          <input name="website" type="url" value="${safe(currentWebsite)}" placeholder="https://yoursite.com">
        </label>
        <p id="profileMsg" class="form-message"></p>
        <div class="composer-footer">
          <span>Visible on your public profile page.</span>
          <button class="publish-button" type="submit">Save profile <span>↗</span></button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('closeProfileModal').onclick = () => { root.innerHTML = ''; };
  document.getElementById('profileForm').onsubmit = async e => {
    e.preventDefault();
    const fd      = new FormData(e.currentTarget);
    const newName = fd.get('name').trim();
    const newBio  = fd.get('bio').trim();
    const newSite = fd.get('website').trim();
    const msg     = document.getElementById('profileMsg');
    msg.textContent = 'Saving…';

    const [profRes, authRes] = await Promise.all([
      dashboardClient.from('profiles').upsert({
        id: user.id,
        display_name: newName,
        bio: newBio,
        website: newSite,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' }),
      dashboardClient.auth.updateUser({
        data: { display_name: newName, full_name: newName, bio: newBio, website: newSite }
      })
    ]);

    if (profRes.error || authRes.error) {
      msg.textContent = (profRes.error || authRes.error).message;
    } else {
      root.innerHTML = '';
      notice('Profile saved!');
      loadDashboard();
    }
  };
}

/* ── Composer modal ─────────────────────────────────────── */
function openDashboardComposer(user) {
  const postTypes = ['Essay', 'Poem', 'Novel', 'Letter', 'Birthday special'];
  const root = document.getElementById('dashboardModalRoot');
  const authorName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.email.split('@')[0];

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
            <input required name="author" value="${safe(authorName)}">
          </label>
          <label>Format
            <select name="type">${postTypes.map(t => `<option>${t}</option>`).join('')}</select>
          </label>
        </div>
        <label>Section
          <select name="category">
            <option>Essays</option><option>Culture</option>
            <option>Making</option><option>Community</option>
          </select>
        </label>
        <label>Your piece
          <textarea required minlength="40" name="body" placeholder="Write your thought, essay, poem, or story…"></textarea>
        </label>
        <p id="composeMsg" class="form-message"></p>
        <div class="composer-footer">
          <span>Published live to Fieldnotes.</span>
          <button class="publish-button" type="submit">Publish <span>↗</span></button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('closeComposerModal').onclick = () => { root.innerHTML = ''; };
  document.getElementById('dashboardPublishForm').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('composeMsg');
    msg.textContent = 'Publishing…';
    const form = new FormData(e.currentTarget);
    const body = form.get('body').toString().trim();

    const { data, error } = await dashboardClient.from('posts').insert({
      title:     form.get('title').toString().trim(),
      excerpt:   body.slice(0, 142) + '…',
      body,
      post_type: form.get('type'),
      category:  form.get('category'),
      author:    form.get('author').toString().trim(),
      author_id: user.id,
      read_time: Math.max(1, Math.ceil(body.split(/\s+/).length / 180))
    }).select().single();

    if (error) { msg.textContent = error.message; return; }

    root.innerHTML = '';
    notice('Published successfully!');
    await dashboardClient.functions.invoke('notify-new-post', {
      body: { post: data, siteUrl: window.location.origin }
    });
    loadDashboard();
  };
}

/* ── Sign-out ───────────────────────────────────────────── */
document.getElementById('logoutButton').onclick = async () => {
  await dashboardClient.auth.signOut();
  window.location.href = 'index.html';
};

/* ── Auth state watcher ─────────────────────────────────── */
dashboardClient.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') window.location.href = 'signin.html';
});

/* ── Boot ───────────────────────────────────────────────── */
loadDashboard();