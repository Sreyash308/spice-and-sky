/**
 * VERCEL WEB ANALYTICS INITIALIZATION
 * Spice & Sky Rooftop Cafe
 * 
 * This script initializes Vercel Web Analytics for tracking page views
 * and user interactions across the application.
 */

(function() {
  'use strict';

  // Check if we're running in a browser environment
  if (typeof window === 'undefined') return;

  // Dynamically import and inject Vercel Analytics
  import('https://cdn.jsdelivr.net/npm/@vercel/analytics@1/dist/index.mjs')
    .then(module => {
      const { inject } = module;
      
      // Inject analytics with appropriate mode based on environment
      const isDevelopment = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1';
      
      inject({
        mode: isDevelopment ? 'development' : 'production',
        debug: isDevelopment
      });

      console.log(`[Vercel Analytics] Initialized in ${isDevelopment ? 'development' : 'production'} mode`);
    })
    .catch(error => {
      console.warn('[Vercel Analytics] Failed to load:', error);
    });
})();
