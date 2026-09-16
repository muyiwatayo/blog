import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, supabaseConfigured } from './lib/supabase'
import './styles.css'

const seedPosts = [
  { id: 'attention', category: 'Essays', title: 'The quiet architecture of attention', excerpt: 'A field guide to making room for the thoughts that do not arrive with a notification sound.', body: 'Attention is not a personality trait. It is a place we make. It lives in the spaces between the alert and the answer, in the walk without a podcast, in the notebook left open on the table.\n\nThe work is not to become unreachable. It is to decide what deserves to reach us. A quiet life is not an empty one; it is a life with enough negative space for a thought to finish forming.', author: 'Mina Kwon', date: 'Sep 12, 2026', read: '8 min read', color: 'rust', image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=85' },
  { id: 'small-internet', category: 'Culture', title: 'Notes from the small internet', excerpt: 'What gets better when the audience gets smaller, the edges get softer, and nobody is optimizing for reach.', body: 'The best rooms on the internet still feel like rooms. They have a scale you can hold in your head, a few familiar names, and enough context to make a strange idea feel welcome.\n\nSmall does not mean closed. It means the edges are visible, and that makes care possible.', author: 'Theo Hart', date: 'Sep 08, 2026', read: '6 min read', color: 'blue', image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=85' },
  { id: 'useful-things', category: 'Making', title: 'Make useful things slowly', excerpt: 'A reminder that craft is not a speed bump on the way to scale. Sometimes it is the whole road.', body: 'There is a particular satisfaction in making something that does one job well. It asks you to stay close to the material, notice the awkward edge, and let the work teach you what it needs.\n\nSpeed is useful when the destination is clear. Craft is what helps us choose the destination in the first place.', author: 'Mina Kwon', date: 'Aug 29, 2026', read: '5 min read', color: 'green', image: 'https://images.unsplash.com/photo-1456324504439-367cee3b3c32?auto=format&fit=crop&w=900&q=85' },
]

const postTypes = ['Essay', 'Poem', 'Novel', 'Letter', 'Birthday special']
const suggestions = ['What is Fieldnotes?', 'Recommend a poem', 'How do I publish?', 'How do I share a note?', 'What can I submit?']

function getStoredPosts() {
  try { return JSON.parse(localStorage.getItem('fieldnotes-posts')) || seedPosts } catch { return seedPosts }
}

function mapPost(post) {
  return {
    ...post,
    type: post.type || post.post_type || 'Essay',
    read: `${post.read_time || 1} min read`,
    date: new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
    color: post.color || ['rust', 'blue', 'green'][String(post.id).charCodeAt(0) % 3],
    image: post.image || 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=85',
  }
}

function App() {
  const [posts, setPosts] = useState(getStoredPosts)
  const [user, setUser] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '', phone: '' })
  const [authMessage, setAuthMessage] = useState('')
  const [dataMessage, setDataMessage] = useState('')
  const [activeCategory, setActiveCategory] = useState('All notes')
  const [saved, setSaved] = useState(() => JSON.parse(localStorage.getItem('fieldnotes-saved') || '[]'))
  const [query, setQuery] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [newPost, setNewPost] = useState({ title: '', author: '', type: 'Essay', category: 'Essays', body: '' })
  const [messages, setMessages] = useState([{ from: 'bot', text: 'Hello. I’m the Fieldnotes guide. Ask me about an essay, a theme, or how this little place works.' }])
  const [draft, setDraft] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  useEffect(() => {
    const handleInstall = (event) => { event.preventDefault(); setInstallPrompt(event) }
    window.addEventListener('beforeinstallprompt', handleInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleInstall)
  }, [])
  useEffect(() => {
    if (!supabaseConfigured) return undefined
    const handleShortcut = (event) => { if (event.key === 'Escape') { setComposerOpen(false); setAuthOpen(false); setSelectedPost(null) } }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])
  useEffect(() => {
    if (!supabaseConfigured) localStorage.setItem('fieldnotes-posts', JSON.stringify(posts))
  }, [posts])
  useEffect(() => localStorage.setItem('fieldnotes-saved', JSON.stringify(saved)), [saved])
  useEffect(() => {
    if (!supabaseConfigured) return undefined
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null))
    return () => listener.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!supabaseConfigured) return
    supabase.from('posts').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) setDataMessage(error.message)
      else if (data?.length) setPosts(data.map(mapPost))
    })
  }, [])

  const categories = ['All notes', ...new Set(posts.map((post) => post.category))]
  const filteredPosts = posts.filter((post) => {
    const matchesCategory = activeCategory === 'All notes' || post.category === activeCategory || post.type === activeCategory
    const matchesQuery = `${post.title} ${post.excerpt} ${post.category}`.toLowerCase().includes(query.toLowerCase())
    return matchesCategory && matchesQuery
  })
  const featured = posts[0]
  const libraryPosts = (activeCategory === 'All notes' && !query) ? filteredPosts.slice(1) : filteredPosts

  function toggleSaved(id) { setSaved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) }
  async function installApp() {
    if (!installPrompt) { setDataMessage('Use your browser menu and choose “Install Fieldnotes” or “Add to Home Screen.”'); return }
    installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }
  function openComposer() {
    if (!supabaseConfigured) { setDataMessage('Add your Supabase keys to enable accounts and publishing.'); return }
    if (!user) { setAuthMode('signin'); setAuthOpen(true); return }
    setComposerOpen(true)
  }
  async function submitAuth(event) {
    event.preventDefault()
    setAuthMessage('')
    const result = authMode === 'signup'
      ? await supabase.auth.signUp({ email: authForm.email, password: authForm.password, options: { data: { display_name: authForm.name } } })
      : await supabase.auth.signInWithPassword({ email: authForm.email, password: authForm.password })
    if (result.error) setAuthMessage(result.error.message)
    else if (authMode === 'signup') setAuthMessage('Check your email to confirm your account, then sign in.')
    else { setAuthOpen(false); setAuthForm({ email: '', password: '', name: '', phone: '' }) }
  }
  async function signOut() { await supabase.auth.signOut(); setUser(null) }
  function publishPost(event) {
    event.preventDefault()
    const excerpt = newPost.body.trim().replace(/\s+/g, ' ')
    const post = {
      id: `post-${Date.now()}`,
      category: newPost.category,
      type: newPost.type,
      title: newPost.title.trim(),
      excerpt: excerpt.length > 145 ? `${excerpt.slice(0, 142)}...` : excerpt,
      body: excerpt,
      author: newPost.author.trim(),
      date: 'Just now',
      read: `${Math.max(1, Math.ceil(excerpt.split(' ').length / 180))} min read`,
      color: ['rust', 'blue', 'green'][posts.length % 3],
      image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=900&q=85',
    }
    if (supabaseConfigured && user) {
      supabase.from('posts').insert({ title: post.title, excerpt: post.excerpt, body: post.body, post_type: post.type, category: post.category, author: post.author, author_id: user.id, read_time: Number.parseInt(post.read, 10), image: post.image }).select().single().then(({ data, error }) => {
        if (error) setDataMessage(error.message)
        else {
          setPosts((current) => [mapPost(data), ...current])
          setNewPost({ title: '', author: '', type: 'Essay', category: 'Essays', body: '' })
          setComposerOpen(false)
          setActiveCategory('All notes')
          setQuery('')
          supabase.functions.invoke('notify-new-post', { body: { post: data, siteUrl: window.location.origin } }).then(({ error: notifyError }) => {
            if (notifyError) setDataMessage(`Published, but email notification failed: ${notifyError.message}`)
          })
        }
      })
    } else {
      setPosts((current) => [...current, post]); setNewPost({ title: '', author: '', type: 'Essay', category: 'Essays', body: '' }); setComposerOpen(false); setActiveCategory('All notes'); setQuery('')
    }
  }
  async function subscribe(event) {
    event.preventDefault()
    const email = new FormData(event.currentTarget).get('email')
    if (supabaseConfigured) {
      const { error } = await supabase.from('subscribers').insert({ email })
      if (error && error.code !== '23505') { setDataMessage(error.message); return }
    }
    setSubscribed(true)
  }
  async function sharePost(post) {
    const shareUrl = `${window.location.origin}${window.location.pathname}#note-${post.id}`
    const shareData = { title: post.title, text: `${post.title} by ${post.author} on Fieldnotes`, url: shareUrl }
    try {
      const image = await createShareImage(post)
      if (navigator.share && image && navigator.canShare?.({ files: [image] })) await navigator.share({ ...shareData, files: [image] })
      else if (navigator.share) await navigator.share(shareData)
      else { await navigator.clipboard.writeText(shareUrl); setDataMessage('Link copied. The share card is ready in the note view for Instagram, WhatsApp, Facebook, or your story.') }
    } catch (error) { if (error.name !== 'AbortError') setDataMessage('Copy this link from your browser and share it anywhere.') }
  }
  async function createShareImage(post) {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 630
    const context = canvas.getContext('2d')
    context.fillStyle = '#f5f3ed'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#1f2925'
    context.fillRect(760, 0, 440, 630)
    context.fillStyle = '#e8b360'
    context.beginPath()
    context.arc(1060, 110, 180, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#6e756f'
    context.font = '22px monospace'
    context.fillText(`FIELDNOTES / ${post.type.toUpperCase()}`, 70, 85)
    context.fillStyle = '#1f2925'
    context.font = '58px Georgia'
    const words = post.title.split(' ')
    let line = ''
    let y = 245
    words.forEach((word) => {
      if (context.measureText(`${line} ${word}`).width > 610) { context.fillText(line, 70, y); line = word; y += 70 } else line += `${line ? ' ' : ''}${word}`
    })
    context.fillText(line, 70, y)
    context.fillStyle = '#c65d43'
    context.font = '24px monospace'
    context.fillText(`BY ${post.author.toUpperCase()}`, 70, 520)
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? new File([blob], 'fieldnotes-share.png', { type: 'image/png' }) : null), 'image/png'))
  }
  function answerFor(question) {
    const lower = question.toLowerCase()
    if (lower.includes('recommend') || lower.includes('essay')) return 'Start with “The quiet architecture of attention.” It is a calm, practical essay about protecting your thinking time.'
    if (lower.includes('poem')) return 'Try the library filter for Poem. You can publish poems, short fragments, and spoken-word drafts from the Write a note editor.'
    if (lower.includes('novel')) return 'Novels work well as serialized chapters. Choose Novel, add a chapter title, and publish each installment as its own note.'
    if (lower.includes('letter')) return 'Letters are welcome: personal, open, historical, or addressed to a future self.'
    if (lower.includes('birthday')) return 'Birthday specials are made for dedications, memories, tributes, and celebratory notes.'
    if (lower.includes('publish') || lower.includes('submit')) return 'Create a free account, tap Write a note, choose a format, write your piece, and publish it to the library.'
    if (lower.includes('share') || lower.includes('whatsapp') || lower.includes('instagram') || lower.includes('facebook')) return 'Open any note and tap Share. On mobile, your share sheet can send it to WhatsApp, Instagram, Facebook, or your story. On desktop, the link is copied.'
    if (lower.includes('save')) return 'Tap the bookmark on any note. Saved pieces stay in this browser, so your reading list is yours to keep.'
    if (lower.includes('what is') || lower.includes('fieldnotes')) return 'Fieldnotes is an independent corner for essays on attention, digital culture, and making things with care.'
    return 'That is a good question to sit with. Try asking me about the essays, saving notes, or finding a place to start.'
  }
  function sendMessage(text = draft) {
    const question = text.trim()
    if (!question) return
    setMessages((current) => [...current, { from: 'user', text: question }, { from: 'bot', text: answerFor(question) }])
    setDraft('')
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="Fieldnotes home"><span>Field</span>notes<span className="wordmark-dot">.</span></a>
        <nav className="main-nav" aria-label="Main navigation"><a href="#notes">Read</a><a href="#about">About</a><a href="#newsletter">Letters</a></nav>
        <div className="header-actions">{installPrompt && <button className="account-trigger install-trigger" onClick={installApp}>Install app</button>}{user ? <button className="account-trigger" onClick={signOut}>Sign out</button> : <button className="account-trigger" onClick={() => { if (!supabaseConfigured) setDataMessage('Add your Supabase keys to enable accounts and publishing.'); else setAuthOpen(true) }}>Sign in</button>}<button className="write-trigger" onClick={openComposer}>Write a note <span>+</span></button><button className="chat-trigger" onClick={() => setChatOpen(true)}><span className="status-dot" />Ask the guide</button></div>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy"><p className="eyebrow">Independent notes for a noisy world</p><h1>Keep a little<br /><em>room</em> for wonder.</h1><p className="hero-intro">Fieldnotes is a slow publication about attention, making, and the small ideas that change how we move through a day.</p><div className="hero-actions"><a className="text-link" href="#notes">Explore the notes <span>↘</span></a><button className="text-link write-link" onClick={openComposer}>Share yours <span>+</span></button></div></div>
          <div className="hero-art" aria-label="A still life of a notebook, a cup of tea and a pencil"><div className="sun-disc" /><div className="paper-sheet"><span>FIELD<br />NOTES</span><small>VOL. 04<br />2026</small></div><div className="pencil" /><div className="tea-cup"><div className="tea" /></div><span className="art-caption">The practice of noticing<br />is still a practice.</span></div>
        </section>

        <section className="featured-section" id="notes"><div className="section-heading"><p className="eyebrow">Start here</p><span>01 / Featured note</span></div><article className="featured-card" onClick={() => setSelectedPost(featured)}><div className={`featured-image ${featured.color}`} style={{ backgroundImage: `url(${featured.image})` }}><span className="image-label">{featured.type} / Fieldnotes</span></div><div className="featured-content"><p className="post-meta">{featured.type} <span /> {featured.category} <span /> {featured.read}</p><h2>{featured.title}</h2><p>{featured.excerpt}</p><div className="post-footer"><span>By {featured.author} · {featured.date}</span><button className={saved.includes(featured.id) ? 'save-button saved' : 'save-button'} onClick={(event) => { event.stopPropagation(); toggleSaved(featured.id) }} aria-label="Save featured note">{saved.includes(featured.id) ? 'Saved' : 'Save note'} <span>↗</span></button></div></div></article></section>

        <section className="library-section"><div className="library-top"><div><p className="eyebrow">The library</p><h2>Notes to return to.</h2></div><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes" /></label></div><div className="category-row">{categories.map((category) => <button key={category} className={activeCategory === category ? 'category active' : 'category'} onClick={() => setActiveCategory(category)}>{category}</button>)}{postTypes.map((type) => <button key={type} className={activeCategory === type ? 'category active' : 'category'} onClick={() => setActiveCategory(type)}>{type}</button>)}</div><div className="post-grid">{libraryPosts.filter((post) => post.type === activeCategory || activeCategory === 'All notes' || post.category === activeCategory).map((post) => <article className="post-card" key={post.id} onClick={() => setSelectedPost(post)}><div className={`post-image ${post.color}`} style={{ backgroundImage: `url(${post.image})` }}><span className="post-category">{post.type}</span></div><div className="post-card-content"><div className="post-card-top"><span>{post.read}</span><button className={saved.includes(post.id) ? 'bookmark saved' : 'bookmark'} onClick={(event) => { event.stopPropagation(); toggleSaved(post.id) }} aria-label={`Save ${post.title}`}>{saved.includes(post.id) ? '●' : '○'}</button></div><h3>{post.title}</h3><p>{post.excerpt}</p><span className="card-byline">{post.author} · {post.date}</span></div></article>)}</div>{!libraryPosts.filter((post) => post.type === activeCategory || activeCategory === 'All notes' || post.category === activeCategory).length && <p className="empty-state">No notes match that search yet. Try another phrase.</p>}</section>

        <section className="about-section" id="about"><div className="about-mark">✳</div><div><p className="eyebrow">A note from the editor</p><h2>There is still time<br />to pay attention.</h2></div><p>Fieldnotes is a reader-supported publication for considered thoughts and useful questions. No hot takes. No growth hacks. Just a place to think in public, together.</p></section>
        <section className="newsletter-section" id="newsletter"><div><p className="eyebrow">The Sunday letter</p><h2>A thoughtful note,<br /><em>once a week.</em></h2></div><form onSubmit={subscribe}><label htmlFor="email">Your email address</label><div className="email-row"><input id="email" name="email" type="email" placeholder="you@example.com" required /><button type="submit">{subscribed ? 'You’re in' : 'Subscribe'} <span>→</span></button></div><small>{subscribed ? 'Welcome to the quiet corner of your inbox.' : 'No noise. Unsubscribe whenever you like.'}</small></form></section>
      </main>

      <footer className="site-footer"><a className="wordmark" href="#top"><span>Field</span>notes<span className="wordmark-dot">.</span></a><span>Made for curious minds, 2026</span><div><a href="#notes">Archive</a><a href="#newsletter">Contact</a></div></footer>
      {dataMessage && <div className="data-notice" role="status">{dataMessage}<button onClick={() => setDataMessage('')} aria-label="Dismiss message">×</button></div>}
      {authOpen && <div className="auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false) }}><form className="auth-panel" onSubmit={submitAuth}><div className="composer-heading"><div><p className="eyebrow">{authMode === 'signup' ? 'Join Fieldnotes' : 'Welcome back'}</p><h2>{authMode === 'signup' ? <>Make room<br /><em>for your voice.</em></> : <>Continue<br /><em>reading.</em></>}</h2></div><button type="button" className="close-button" onClick={() => setAuthOpen(false)} aria-label="Close account form">×</button></div>{authMode === 'signup' && <label>Name<input required value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Your name" /></label>}{authMode === 'phone' ? <label>Phone number<input required type="tel" value={authForm.phone} onChange={(event) => setAuthForm({ ...authForm, phone: event.target.value })} placeholder="+1 555 123 4567" /></label> : <><label>Email<input required type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="you@example.com" /></label><label>Password<input required minLength="6" type="password" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder="At least 6 characters" /></label></>}{authMessage && <p className="form-message">{authMessage}</p>}<button className="publish-button auth-submit" type="submit">{authMode === 'phone' ? 'Send code' : authMode === 'signup' ? 'Create account' : 'Sign in'} <span>↗</span></button><div className="provider-row"><button type="button" onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })}>Continue with Google</button></div><button type="button" className="switch-auth" onClick={() => { setAuthMode(authMode === 'signup' ? 'signin' : 'signup'); setAuthMessage('') }}>{authMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><button type="button" className="switch-auth" onClick={() => { setAuthMode(authMode === 'phone' ? 'signin' : 'phone'); setAuthMessage('') }}>{authMode === 'phone' ? 'Use email instead' : 'Use phone number instead'}</button></form></div>}
      {selectedPost && <div className="reader-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPost(null) }}><article className="reader-panel" id={`note-${selectedPost.id}`}><div className="reader-top"><span className="post-meta">{selectedPost.type} <span /> {selectedPost.category} <span /> {selectedPost.read}</span><button className="close-button" onClick={() => setSelectedPost(null)} aria-label="Close note">×</button></div><div className="reader-share-card" style={{ backgroundImage: `url(${selectedPost.image})` }}><div><span>{selectedPost.type} / Fieldnotes</span><strong>{selectedPost.title}</strong><small>By {selectedPost.author}</small></div></div><h2>{selectedPost.title}</h2><p className="reader-byline">By {selectedPost.author} · {selectedPost.date}</p><div className="reader-body">{(selectedPost.body || selectedPost.excerpt).split('\n\n').map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div><div className="reader-actions"><button className="share-button" onClick={() => sharePost(selectedPost)}>Share image + link <span>↗</span></button><button className={saved.includes(selectedPost.id) ? 'save-button saved reader-save' : 'save-button reader-save'} onClick={() => toggleSaved(selectedPost.id)}>{saved.includes(selectedPost.id) ? 'Saved to your reading list' : 'Save to your reading list'} <span>↗</span></button></div></article></div>}
      {composerOpen && <div className="composer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposerOpen(false) }}><form className="composer-panel" onSubmit={publishPost}><div className="composer-heading"><div><p className="eyebrow">New contribution</p><h2>Put something<br /><em>into the world.</em></h2></div><button type="button" className="close-button" onClick={() => setComposerOpen(false)} aria-label="Close editor">×</button></div><label>Title<input required value={newPost.title} onChange={(event) => setNewPost({ ...newPost, title: event.target.value })} placeholder="Give your note a name" /></label><div className="composer-row"><label>By<input required value={newPost.author} onChange={(event) => setNewPost({ ...newPost, author: event.target.value })} placeholder="Your name" /></label><label>Format<select value={newPost.type} onChange={(event) => setNewPost({ ...newPost, type: event.target.value })}>{postTypes.map((type) => <option key={type}>{type}</option>)}</select></label></div><label>Section<select value={newPost.category} onChange={(event) => setNewPost({ ...newPost, category: event.target.value })}><option>Essays</option><option>Culture</option><option>Making</option><option>Community</option></select></label><label>Your piece<textarea required minLength="40" value={newPost.body} onChange={(event) => setNewPost({ ...newPost, body: event.target.value })} placeholder="What have you been thinking about?" /></label><div className="composer-footer"><span>Your {newPost.type.toLowerCase()} will appear in the public library.</span><button className="publish-button" type="submit">Publish {newPost.type.toLowerCase()} <span>↗</span></button></div></form></div>}
      {chatOpen && <div className="chat-panel" role="dialog" aria-label="Fieldnotes guide"><div className="chat-header"><div><span className="status-dot" />Fieldnotes guide</div><button onClick={() => setChatOpen(false)} aria-label="Close chat">×</button></div><div className="chat-messages">{messages.map((message, index) => <div className={`message ${message.from}`} key={`${message.text}-${index}`}>{message.text}</div>)}</div><div className="suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => sendMessage(suggestion)}>{suggestion}</button>)}</div><form className="chat-form" onSubmit={(event) => { event.preventDefault(); sendMessage() }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question..." aria-label="Chat message" /><button aria-label="Send message">↑</button></form></div>}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)