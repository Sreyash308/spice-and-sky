document.addEventListener('DOMContentLoaded', async () => {
  await SpiceClient.init();

  const form = document.getElementById('waiterLoginForm');
  const errBanner = document.getElementById('errorBanner');
  const loginBtn = document.getElementById('loginBtn');

  const ALLOWED_WAITERS = ['shan', 'yawar', 'nawaz'];


  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBanner.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Authenticating...';

    const rawInput = (document.getElementById('staffEmail').value || '').trim();
    const password = document.getElementById('staffPassword').value;
    const normalized = rawInput.toLowerCase();

    // Client-side whitelist check: ONLY Shan, Yawar, and Nawaz
    const isAllowed = ALLOWED_WAITERS.includes(normalized) ||
                      ALLOWED_WAITERS.some(w => normalized === `${w}@spiceandsky.com`);

    if (!isAllowed) {
      errBanner.textContent = 'Access denied. Only Shan, Yawar, and Nawaz are authorized to log into the Waiter Terminal.';
      errBanner.style.display = 'block';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Open Waiter Terminal →';
      return;
    }

    try {
      const res = await SpiceClient.signIn(rawInput, password, { portal: 'waiter' });
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
