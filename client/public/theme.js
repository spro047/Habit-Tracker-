(function () {
  var t = localStorage.getItem('ht_theme');
  if (t && t !== 'classic' && t !== 'light') document.documentElement.classList.add('theme-' + t);
})();