// Карусель фактов: стрелки, точки и синхронизация с ручным скроллом.
(function () {
  var track = document.getElementById('facts-track');
  var dotsBox = document.getElementById('facts-dots');
  if (!track || !dotsBox) return;

  var cards = Array.prototype.slice.call(track.children);
  var dots = Array.prototype.slice.call(dotsBox.querySelectorAll('button'));
  var prev = document.querySelector('.nav-btn--prev');
  var next = document.querySelector('.nav-btn--next');
  var current = 0;

  function step() {
    if (cards.length < 2) return track.clientWidth;
    return cards[1].offsetLeft - cards[0].offsetLeft;
  }

  function goTo(index) {
    index = Math.max(0, Math.min(cards.length - 1, index));
    track.scrollTo({ left: index * step(), behavior: 'smooth' });
  }

  function sync() {
    var index = Math.round(track.scrollLeft / step());
    index = Math.max(0, Math.min(cards.length - 1, index));
    if (index === current) return;
    current = index;
    dots.forEach(function (dot, i) {
      dot.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  }

  [prev, next].forEach(function (btn) {
    if (!btn) return;
    btn.addEventListener('click', function () {
      goTo(current + Number(btn.dataset.dir));
    });
  });

  dots.forEach(function (dot, i) {
    dot.addEventListener('click', function () { goTo(i); });
  });

  var raf;
  track.addEventListener('scroll', function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(sync);
  }, { passive: true });
})();
