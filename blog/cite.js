document.addEventListener('click', function (e) {
  var btn = e.target.closest('.cite-copy');
  if (!btn) return;
  var src = document.getElementById(btn.getAttribute('data-target'));
  if (!src) return;
  var text = src.getAttribute('data-raw') || src.textContent;
  navigator.clipboard.writeText(text).then(function () {
    var old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(function () { btn.textContent = old; }, 1500);
  });
});
