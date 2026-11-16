/* Hiệu ứng hoa đào rơi — chỉ để trang trí, không ảnh hưởng logic game */
(function () {
  'use strict';

  var layer = document.getElementById('petals');
  if (!layer) return;

  // Tôn trọng cài đặt "giảm chuyển động" của hệ thống
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce && reduce.matches) return;

  var COUNT = window.innerWidth < 600 ? 14 : 22;

  function rand(min, max) { return min + Math.random() * (max - min); }

  for (var i = 0; i < COUNT; i++) {
    var fall = document.createElement('span');
    fall.className = 'petal-fall';
    var duration = rand(9, 17);
    fall.style.left = rand(0, 100).toFixed(1) + '%';
    fall.style.animationDuration = duration.toFixed(1) + 's';
    fall.style.animationDelay = (-rand(0, duration)).toFixed(1) + 's'; // rải đều ngay từ đầu

    var petal = document.createElement('span');
    petal.className = 'petal' + (Math.random() < 0.35 ? ' petal-light' : '');
    var size = rand(9, 17);
    petal.style.width = size.toFixed(1) + 'px';
    petal.style.height = (size * 0.8).toFixed(1) + 'px';
    petal.style.setProperty('--sway', rand(25, 70).toFixed(0) + 'px');
    petal.style.animationDuration = rand(2.8, 5).toFixed(1) + 's';
    petal.style.animationDelay = (-rand(0, 5)).toFixed(1) + 's';
    petal.style.opacity = rand(0.6, 0.95).toFixed(2);

    fall.appendChild(petal);
    layer.appendChild(fall);
  }
})();
