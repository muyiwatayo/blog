const authConfig = window.FIELDNOTES_CONFIG || {}
const authClient = window.supabase.createClient(authConfig.supabaseUrl, authConfig.supabaseAnonKey)

function setMessage(text, error = false) {
  const element = document.getElementById('authMessage')
  if (element) { element.textContent = text; element.className = error ? 'form-message error' : 'form-message' }
}

function togglePassword() {
  const input = document.getElementById('password')
  const button = document.getElementById('passwordToggle')
  input.type = input.type === 'password' ? 'text' : 'password'
  button.textContent = input.type === 'password' ? 'Show' : 'Hide'
}

async function signInWithGoogle() {
  const { error } = await authClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/dashboard.html` } })
  if (error) setMessage(error.message, true)
}

async function submitAuth(event) {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const mode = document.body.dataset.mode
  const result = mode === 'signup'
    ? await authClient.auth.signUp({ email: form.get('email'), password: form.get('password'), options: { data: { display_name: form.get('name') } } })
    : await authClient.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') })
  if (result.error) setMessage(result.error.message, true)
  else if (mode === 'signup') setMessage('Account created. Check your email, then sign in.')
  else window.location.href = 'dashboard.html'
}

document.getElementById('authForm')?.addEventListener('submit', submitAuth)
document.getElementById('passwordToggle')?.addEventListener('click', togglePassword)
document.getElementById('googleButton')?.addEventListener('click', signInWithGoogle)