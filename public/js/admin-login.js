document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  // If already logged in as ADMIN, redirect to /admin
  const user = SpiceClient.getStoredUser('ADMIN');
  if (user && user.role === 'ADMIN') {
    if (window.location.pathname !== '/admin') {
      window.location.href = '/admin';
    }
    return;
  }
  const form = document.getElementById('adminLoginForm');
  const errBanner = document.getElementById('adminErrorBanner');
  const loginBtn = document.getElementById('adminLoginBtn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBanner.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Verifying authorization...';

    const email = document.getElementById('adminEmail').value;
    const password = document.getElementById('adminPassword').value;

    try {
      const res = await SpiceClient.signIn(email, password, { portal: 'admin' });
      if (res.success && res.user.role === 'ADMIN') {
        window.location.href = '/admin';
      } else {
        throw new Error('Access denied. This account does not have Owner/Admin privileges.');
      }
    } catch (err) {
      errBanner.textContent = err.message || 'Invalid administrator credentials.';
      errBanner.style.display = 'block';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Open Admin Dashboard →';
    }
  });
});
