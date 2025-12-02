(function() {
  'use strict';

  function trackEvent(eventName, eventData) {
    console.debug('[rp1-analytics]', eventName, eventData);
  }

  document.addEventListener('click', function(e) {
    var copyBtn = e.target.closest('.md-clipboard');
    if (copyBtn) {
      var codeBlock = copyBtn.closest('.highlight');
      var isInstallCmd = codeBlock && codeBlock.textContent && codeBlock.textContent.includes('/plugin install');
      if (isInstallCmd) {
        trackEvent('copy_install_command', { page: location.pathname });
      }
    }
  });

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.md-button--primary');
    if (btn) {
      trackEvent('cta_click', { page: location.pathname, text: btn.textContent.trim() });
    }
  });

  document.addEventListener('click', function(e) {
    var link = e.target.closest('a[href^="https://github.com"]');
    if (link) {
      trackEvent('github_click', { page: location.pathname, href: link.href });
    }
  });
})();
