// ===== PWA Install Handler =====

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ SW registered:', reg.scope))
      .catch(err => console.log('❌ SW failed:', err));
  });
}

let deferredPrompt = null;
const popup   = document.getElementById('pwaPopup');
const btnInstall = document.getElementById('pwaInstall');
const btnClose   = document.getElementById('pwaClose');

// Capture install prompt
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;

  // Show popup after 2 seconds if not dismissed before
  const dismissed = localStorage.getItem('pwaPopupDismissed');
  const installed  = localStorage.getItem('pwaInstalled');

  if (!dismissed && !installed) {
    setTimeout(() => {
      popup.classList.add('show');
    }, 2000);
  }
});

// Install button clicked
btnInstall?.addEventListener('click', async () => {
  if (!deferredPrompt) {
    // Fallback for browsers that don't support prompt
    alert('To install:\n1. Tap the menu (⋮) in your browser\n2. Select "Add to Home Screen"');
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    localStorage.setItem('pwaInstalled', 'true');
    console.log('✅ PWA installed');
  }
  deferredPrompt = null;
  popup.classList.remove('show');
});

// Close button
btnClose?.addEventListener('click', () => {
  popup.classList.remove('show');
  localStorage.setItem('pwaPopupDismissed', 'true');
});

// Mark as installed if launched from home screen
if (window.matchMedia('(display-mode: standalone)').matches) {
  localStorage.setItem('pwaInstalled', 'true');
  popup.classList.remove('show');
}
