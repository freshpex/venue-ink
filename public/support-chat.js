(function () {
  var loaded = false;
  function start(choice) {
    if (
      loaded ||
      !choice ||
      choice.version !== 1 ||
      choice.chat !== true ||
      typeof choice.savedAt !== 'number' ||
      choice.savedAt > Date.now() ||
      choice.savedAt <= Date.now() - 180 * 86400000
    )
      return;
    loaded = true;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_API.customStyle = {
      zIndex: 40,
      visibility: {
        desktop: { position: 'br', xOffset: 20, yOffset: 20 },
        mobile: { position: 'br', xOffset: 16, yOffset: 84 },
      },
    };
    window.Tawk_LoadStart = new Date();
    var s1 = document.createElement('script'),
      s0 = document.getElementsByTagName('script')[0];
    s1.async = true;
    s1.src = 'https://embed.tawk.to/6ae8777f3b03bc3c31e84590/1k6e15is8';
    s1.charset = 'UTF-8';
    s1.setAttribute('crossorigin', '*');
    s0.parentNode.insertBefore(s1, s0);
  }
  try {
    start(JSON.parse(localStorage.getItem('venue-cookie-consent') || 'null'));
  } catch {
    /* Optional chat stays disabled. */
  }
  window.addEventListener('venue:cookie-consent', function (event) {
    start(event.detail);
  });
})();
