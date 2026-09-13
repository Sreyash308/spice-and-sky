document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  // If already logged in as ADMIN, redirect to /admin
  const user = SpiceClient.getStoredUser();
  if (user && user.role === 'ADMIN') {
    if (window.location.pathname !== '/admin') {
      window.location.href = '/admin';
    }
    return;
  }

  const fillBtn = document.getElementById('fillAdminBtn');
  if (fillBtn) {
    fillBtn.addEventListener('click', () => {
      document.getElementById('adminEmail').value = 'admin@spiceandsky.com';
      document.getElementById('adminPassword').value = 'SpiceSkyAdmin2026!';
    });
  }

  const quickBtn = document.getElementById('quickAdminLoginBtn');
  if (quickBtn) {
    quickBtn.addEventListener('click', async () => {
      quickBtn.disabled = true;
      quickBtn.textContent = '⚡ Signing in as Owner...';
      try {
        const res = await SpiceClient.signIn('admin@spiceandsky.com', 'SpiceSkyAdmin2026!');
        if (res.success && res.user.role === 'ADMIN') {
          window.location.href = '/admin';
        }
      } catch (err) {
        alert('Quick login error: ' + err.message);
        quickBtn.disabled = false;
        quickBtn.textContent = '⚡ 1-Click Quick Login as Owner';
      }
    });
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
      const res = await SpiceClient.signIn(email, password);
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
