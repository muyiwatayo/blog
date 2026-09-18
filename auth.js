const authConfig = window.FIELDNOTES_CONFIG || {}
const authClient = window.supabase.createClient(authConfig.supabaseUrl, authConfig.supabaseAnonKey)

function setMessage(text, error = false) {
  const element = document.getElementById('authMessage')
  if (element) {
    element.textContent = text
    element.className = error ? 'form-message error' : 'form-message'
  }
}

function togglePassword() {
  const input = document.getElementById('password')
  const button = document.getElementById('passwordToggle')
  if (input && button) {
    input.type = input.type === 'password' ? 'text' : 'password'
    button.textContent = input.type === 'password' ? 'Show' : 'Hide'
  }
}

async function signInWithGoogle() {
  const redirectTo = `${window.location.origin}/dashboard.html`
  const { error } = await authClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo }
  })
  if (error) setMessage(error.message, true)
}

async function submitAuth(event) {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const mode = document.body.dataset.mode
  const email = form.get('email')?.toString().trim()
  const password = form.get('password')?.toString().trim()
  const name = form.get('name')?.toString().trim()

  if (mode === 'signup') {
    const { data, error } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: `${window.location.origin}/dashboard.html`
      }
    })
    if (error) {
      setMessage(error.message, true)
    } else if (data.session) {
      window.location.href = 'dashboard.html'
    } else {
      setMessage('Account created! Please check your email to confirm your account before signing in.')
    }
  } else {
    const { error } = await authClient.auth.signInWithPassword({ email, password })
    if (error) {
      setMessage(error.message, true)
    } else {
      window.location.href = 'dashboard.html'
    }
  }
}

document.getElementById('authForm')?.addEventListener('submit', submitAuth)
document.getElementById('passwordToggle')?.addEventListener('click', togglePassword)
document.getElementById('googleButton')?.addEventListener('click', signInWithGoogle)