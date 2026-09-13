document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  const form = document.getElementById('waiterLoginForm');
  const errBanner = document.getElementById('errorBanner');
  const loginBtn = document.getElementById('loginBtn');
  const adminSessionBox = document.getElementById('adminSessionBox');
  const switchAsWaiterBtn = document.getElementById('switchAsWaiterBtn');

  // If already logged in as WAITER, redirect directly to /waiter
  const existingUser = SpiceClient.getStoredUser();
  if (existingUser && existingUser.role === 'WAITER') {
    if (window.location.pathname !== '/waiter') {
      window.location.href = '/waiter';
    }
    return;
  }

  // If logged in as ADMIN, show choice card rather than trapping
  if (existingUser && existingUser.role === 'ADMIN') {
    if (adminSessionBox) adminSessionBox.style.display = 'block';
  }

  if (switchAsWaiterBtn) {
    switchAsWaiterBtn.addEventListener('click', async () => {
      await SpiceClient.signOut();
      if (adminSessionBox) adminSessionBox.style.display = 'none';
      document.getElementById('staffEmail').value = '';
      document.getElementById('staffPassword').value = '';
      document.getElementById('staffEmail').focus();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBanner.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Authenticating...';

    const email = document.getElementById('staffEmail').value;
    const password = document.getElementById('staffPassword').value;

    try {
      const res = await SpiceClient.signIn(email, password);
      if (res.success) {
        window.location.href = '/waiter';
      } else {
        throw new Error(res.error || 'Authentication failed.');
      }
    } catch (err) {
      errBanner.textContent = err.message || 'Invalid staff credentials.';
      errBanner.style.display = 'block';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Open Waiter Terminal →';
    }
  });
});
