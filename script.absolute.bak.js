// Масштабирование холста 1920×7150 под ширину окна с сохранением пропорций.
(function () {
  var FRAME_W = 1920;
  var FRAME_H = 7069;
  var frame = document.getElementById('frame');
  var stage = document.getElementById('stage');

  function fit() {
    var scale = stage.clientWidth / FRAME_W;
    frame.style.transform = 'scale(' + scale + ')';
    stage.style.height = FRAME_H * scale + 'px';
  }

  fit();
  window.addEventListener('resize', fit);
})();
