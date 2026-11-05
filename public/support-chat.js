(function () {
  if (document.querySelector('script[data-venue-support]')) return;
  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_API.customStyle = {
    zIndex: 40,
    visibility: {
      desktop: { position: 'br', xOffset: 20, yOffset: 20 },
      mobile: { position: 'br', xOffset: 16, yOffset: 84 },
    },
  };
  window.Tawk_LoadStart = new Date();
  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://embed.tawk.to/6ae8777f3b03bc3c31e84590/1k6e15is8';
  script.charset = 'UTF-8';
  script.setAttribute('crossorigin', '*');
  script.setAttribute('data-venue-support', 'essential');
  document.head.append(script);
})();
