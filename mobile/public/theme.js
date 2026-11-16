// Applies the look chosen in Settings before the app draws, so there is no light or dark flash.
try {
  if (localStorage.getItem('cliper.theme') === 'dark') document.documentElement.className = 'dark';
} catch (e) {
  /* private mode: light */
}
