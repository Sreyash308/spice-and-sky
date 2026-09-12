/**
 * Spice & Sky Rooftop Cafe - Splash Screen Controller
 * Features:
 * - Floating rooftop embers & celestial stars canvas
 * - Lottie-web vector animation with SVG fallback
 * - Ambient sound/visual feedback & Animate.css transitions
 * - Dynamic progress & status updates
 * - Confetti celebration burst upon entering the menu
 * - Instant tap-to-skip & replay capabilities
 */

(function () {
  let splashElement = null;
  let canvas = null;
  let ctx = null;
  let animationFrameId = null;
  let particles = [];
  let isDismissed = false;
  let lottieInstance = null;

  // Configuration
  const MIN_DISPLAY_TIME_MS = 1400; // Minimum time for smooth aesthetic experience
  const startTime = Date.now();

  function initSplash() {
    splashElement = document.getElementById('menuSplashScreen');
    if (!splashElement) return;

    // 1. Setup Canvas Particle Background
    setupParticlesCanvas();

    // 2. Initialize Lottie Animation
    setupLottieAnimation();

    // 3. Setup Interactive Click to Skip
    splashElement.addEventListener('click', () => {
      dismissSplash(true);
    });

    // 4. Progress Emulation that syncs with real menu loading
    startProgressSimulation();

    // 5. Expose global replay function
    window.replaySplashScreen = replaySplash;
  }

  /* -------------------------------------------------------------
     1. ROOFTOP CELESTIAL & EMBER PARTICLES CANVAS
     ------------------------------------------------------------- */
  function setupParticlesCanvas() {
    canvas = document.getElementById('splashParticlesCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    function resizeCanvas() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      createParticles();
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    renderParticles();
  }

  function createParticles() {
    particles = [];
    const count = Math.min(48, Math.floor(window.innerWidth / 20));
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2.2 + 0.8,
        speedY: Math.random() * 0.55 + 0.25,
        speedX: (Math.random() - 0.5) * 0.35,
        opacity: Math.random() * 0.6 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.01,
        twinklePhase: Math.random() * Math.PI * 2,
        isStar: Math.random() > 0.65,
        color: Math.random() > 0.4 ? '#d97706' : '#c25e1a'
      });
    }
  }

  function renderParticles() {
    if (!ctx || !canvas || isDismissed) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let p of particles) {
      p.y -= p.speedY;
      p.x += p.speedX;
      p.twinklePhase += p.twinkleSpeed;

      // Wrap around screen boundaries
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;

      const currentOpacity = Math.max(0.1, p.opacity + Math.sin(p.twinklePhase) * 0.25);

      ctx.save();
      ctx.globalAlpha = currentOpacity;

      if (p.isStar) {
        // Draw 4-point glittering star
        ctx.fillStyle = '#fef3c7';
        ctx.shadowColor = '#d97706';
        ctx.shadowBlur = 6;
        drawStar(ctx, p.x, p.y, 4, p.radius * 2.2, p.radius * 0.9);
        ctx.fill();
      } else {
        // Draw soft amber ember
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    animationFrameId = requestAnimationFrame(renderParticles);
  }

  function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }

  /* -------------------------------------------------------------
     2. LOTTIE ANIMATION
     ------------------------------------------------------------- */
  function setupLottieAnimation() {
    const container = document.getElementById('splashLottieContainer');
    const fallbackSvg = document.getElementById('splashSvgFallback');
    if (!container) return;

    if (window.lottie) {
      try {
        lottieInstance = window.lottie.loadAnimation({
          container: container,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '/assets/animations/splash-lottie.json'
        });

        lottieInstance.addEventListener('DOMLoaded', () => {
          if (fallbackSvg) fallbackSvg.style.display = 'none';
        });

        lottieInstance.addEventListener('data_failed', () => {
          console.log('Lottie load failed, keeping fallback SVG');
          if (fallbackSvg) fallbackSvg.style.display = 'block';
        });
      } catch (err) {
        console.warn('Lottie initialization warning:', err);
        if (fallbackSvg) fallbackSvg.style.display = 'block';
      }
    } else {
      if (fallbackSvg) fallbackSvg.style.display = 'block';
    }
  }

  /* -------------------------------------------------------------
     3. PROGRESS SIMULATION & MENU SYNC
     ------------------------------------------------------------- */
  let currentProgress = 0;
  let targetProgress = 100;
  let progressInterval = null;

  function startProgressSimulation() {
    const fill = document.getElementById('splashProgressFill');
    const status = document.getElementById('splashStatusText');

    const messages = [
      { at: 15, text: 'Brewing handcrafted coffees & teas...' },
      { at: 45, text: 'Firing up woodfired pizzas & fresh bowls...' },
      { at: 75, text: 'Setting your rooftop table under the open sky...' },
      { at: 95, text: 'Welcome to Spice & Sky ✨' }
    ];

    let step = 0;
    progressInterval = setInterval(() => {
      if (isDismissed) {
        clearInterval(progressInterval);
        return;
      }

      step += 1;
      if (currentProgress < 90) {
        currentProgress += Math.random() * 12 + 6;
      } else if (window.__spiceMenuReady) {
        currentProgress = 100;
      } else {
        currentProgress = Math.min(94, currentProgress + 1);
      }

      currentProgress = Math.min(100, Math.round(currentProgress));

      if (fill) fill.style.width = `${currentProgress}%`;

      if (status) {
        for (let m of messages) {
          if (currentProgress >= m.at) {
            status.textContent = m.text;
          }
        }
      }

      if (currentProgress >= 100) {
        clearInterval(progressInterval);
        setTimeout(() => {
          dismissSplash();
        }, 350);
      }
    }, 120);

    // Listen for custom menu ready event
    window.addEventListener('spice_menu_loaded', () => {
      window.__spiceMenuReady = true;
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_DISPLAY_TIME_MS - elapsed);
      setTimeout(() => {
        currentProgress = 100;
      }, remaining);
    });
  }

  /* -------------------------------------------------------------
     4. DISMISSAL & CELEBRATION
     ------------------------------------------------------------- */
  function dismissSplash(fast = false) {
    if (isDismissed || !splashElement) return;
    isDismissed = true;

    if (progressInterval) clearInterval(progressInterval);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);

    // Trigger subtle golden celebration confetti if library is available
    if (window.confetti && !fast) {
      try {
        window.confetti({
          particleCount: 38,
          spread: 55,
          origin: { y: 0.6 },
          colors: ['#c25e1a', '#d97706', '#fef3c7', '#9a3412', '#b45309'],
          disableForReducedMotion: true
        });
      } catch (e) {}
    }

    splashElement.classList.add('splash-hidden');

    setTimeout(() => {
      splashElement.style.display = 'none';
      document.body.classList.remove('splash-active');
      window.dispatchEvent(new CustomEvent('splash_completed'));
    }, fast ? 250 : 750);
  }

  /* -------------------------------------------------------------
     5. REPLAY INTRO
     ------------------------------------------------------------- */
  function replaySplash() {
    if (!splashElement) return;
    isDismissed = false;
    currentProgress = 0;
    splashElement.style.display = 'flex';
    splashElement.classList.remove('splash-hidden');

    const fill = document.getElementById('splashProgressFill');
    if (fill) fill.style.width = '0%';

    setupParticlesCanvas();
    startProgressSimulation();
    window.__spiceMenuReady = true;
  }

  // Self-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSplash);
  } else {
    initSplash();
  }
})();
