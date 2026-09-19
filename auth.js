// Hardcoded fallback keys with config.js override
const supabaseUrl = window.ENV?.SUPABASE_URL || 'https://tyicduuijghugeztrmmj.supabase.co';
const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY || 'sb_publishable_xYH_3Mnn4rcfnKym7RVyMw_X2FASqON';

// Initialize Supabase Client
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// Detect current page mode: signin or signup
const pageMode = document.body.dataset.mode || 'signin';

document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('authForm');
  const googleButton = document.getElementById('googleButton');
  const authMessage = document.getElementById('authMessage');
  const passwordInput = document.getElementById('password');
  const passwordToggle = document.getElementById('passwordToggle');

  // If already logged in, skip to dashboard
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      window.location.href = 'dashboard.html';
    }
  });

  // Password Visibility Toggle
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      passwordToggle.textContent = type === 'password' ? 'Show' : 'Hide';
    });
  }

  // Google OAuth Handler — always redirects to dashboard.html
  if (googleButton) {
    googleButton.addEventListener('click', async () => {
      if (authMessage) {
        authMessage.textContent = 'Redirecting to Google...';
        authMessage.className = 'form-message info';
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard.html`
        }
      });

      if (error && authMessage) {
        authMessage.textContent = error.message;
        authMessage.className = 'form-message error';
      }
    });
  }

  // Email / Password Handler
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = authForm.email.value.trim();
      const password = authForm.password.value;

      if (authMessage) {
        authMessage.textContent = pageMode === 'signup' ? 'Creating account...' : 'Signing in...';
        authMessage.className = 'form-message info';
      }

      if (pageMode === 'signup') {
        // Sign-up flow
        const name = authForm.name?.value.trim() || '';
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name, full_name: name }
          }
        });

        if (error) {
          if (authMessage) {
            authMessage.textContent = error.message;
            authMessage.className = 'form-message error';
          }
        } else {
          if (authMessage) {
            authMessage.textContent = 'Account created! Check your email to confirm, then sign in.';
            authMessage.className = 'form-message info';
          }
        }
      } else {
        // Sign-in flow
        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
          if (authMessage) {
            authMessage.textContent = error.message;
            authMessage.className = 'form-message error';
          }
        } else {
          window.location.href = 'dashboard.html';
        }
      }
    });
  }
});