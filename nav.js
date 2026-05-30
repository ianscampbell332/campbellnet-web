(function () {
  const hamburger = document.getElementById('nav-hamburger');
  const menu      = document.getElementById('mobile-menu');
  if (!hamburger || !menu) return;

  hamburger.addEventListener('click', function () {
    const open = hamburger.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
  });

  // Close menu when any link inside it is clicked
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      menu.classList.remove('open');
    });
  });
})();
