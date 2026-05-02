// ===== PWA Install Handler =====

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('✅ SW registered'))
      .catch(err => console.log('❌ SW:', err));
  });
}

let deferredPrompt = null;
const popup      = document.getElementById('pwaPopup');
const btnInstall = document.getElementById('pwaInstall');
const btnClose   = document.getElementById('pwaClose');

const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS        = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid    = /android/i.test(navigator.userAgent);

// Reset dismissed on every visit so popup always shows
// (remove this line if you want to remember dismissal)
localStorage.removeItem('pwaPopupDismissed');

if (isStandalone) {
  localStorage.setItem('pwaInstalled', 'true');
}

function showPopup() {
  if (localStorage.getItem('pwaInstalled')) return;
  if (isStandalone) return;
  setTimeout(() => popup?.classList.add('show'), 1500);
}

// Chrome/Edge/Android Chrome
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  showPopup();
});

// iOS Safari
if (isIOS && !isStandalone) showPopup();

// Samsung/other Android without beforeinstallprompt
if (isAndroid && !isStandalone) showPopup();

btnInstall?.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') localStorage.setItem('pwaInstalled', 'true');
    deferredPrompt = null;
    popup?.classList.remove('show');
  } else if (isIOS) {
    alert('iOS install karo:\n1. Share ⬆️ button dabao\n2. "Add to Home Screen" select karo\n3. Add dabao ✅');
  } else {
    alert('Install karo:\n1. Browser menu ⋮ kholo\n2. "Add to Home Screen" select karo\n3. Install dabao ✅');
  }
});

btnClose?.addEventListener('click', () => {
  popup?.classList.remove('show');
  localStorage.setItem('pwaPopupDismissed', 'true');
});

window.addEventListener('appinstalled', () => {
  localStorage.setItem('pwaInstalled', 'true');
  popup?.classList.remove('show');
});