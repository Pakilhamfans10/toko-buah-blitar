/* =========================================================
   Toko Buah Segar Blitar - app.js (jQuery 3.7.1)
   Fitur: render produk dari JSON, cari/filter/urut, keranjang
   (event delegation), slider animasi, login dari users.json,
   validasi form pemesanan.

   Catatan optimasi:
   - Kartu produk & item keranjang dibuat sebagai string HTML lalu
     ditulis ke DOM sekali (bukan puluhan elemen jQuery satu per satu).
   - Selector jQuery di-cache; produk dicari lewat peta id (O(1)).
   - users.json hanya diunduh saat dibutuhkan (login), bukan saat awal.
   - Slider berhenti saat tab disembunyikan / hero keluar layar.
   ========================================================= */
(function ($) {
  'use strict';

  var KEY_CART = 'tbb_cart';
  var KEY_USER = 'tbb_user';
  var HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var DOM_IDS = [
    'product-grid', 'empty-msg', 'error-msg', 'result-info', 'search', 'sort', 'filter-kategori',
    'cart-items', 'cart-empty', 'cart-total-row', 'order-form', 'cart-total', 'cart-badge',
    'btn-cart', 'cart-close', 'cart-drawer', 'cart-view', 'overlay', 'order-success',
    'login-modal', 'login-form', 'login-user', 'login-pass', 'login-err', 'login-note',
    'btn-login', 'user-box', 'user-name', 'alamat-group', 'toast-wrap', 'site-header', 'nav-toggle',
    'success-items', 'success-detail', 'success-code', 'success-total', 'order-catatan'
  ];

  var products = [];
  var byId = {};            // { idProduk: produk } supaya pencarian cepat
  var usersReq = null;      // promise users.json (dimuat saat dibutuhkan)
  var cart = {};            // { idProduk: jumlah }
  var currentUser = null;   // { username, nama }
  var view = { q: '', kategori: 'semua', sort: 'default' };
  var lastFocus = null;
  var firstRender = true;   // animasi muncul hanya pada render pertama
  var $ui = {};             // cache objek jQuery (diisi saat DOM siap)
  var $fields = {};         // { nama|hp|alamat: { $in, $err } }

  /* ---------- Utilitas ---------- */

  function trim(s) {
    return String(s == null ? '' : s).trim();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return HTML_ESC[c]; });
  }

  function rupiah(n) {
    return 'Rp ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Storage bisa melempar error (mode privat / diblokir), jadi selalu dibungkus try/catch.
  function readStore(kind, key) {
    try { return JSON.parse(window[kind].getItem(key)); } catch (e) { return null; }
  }
  function writeStore(kind, key, value) {
    try {
      if (value === null) { window[kind].removeItem(key); }
      else { window[kind].setItem(key, JSON.stringify(value)); }
    } catch (e) { /* abaikan */ }
  }

  function findProduct(id) {
    return byId[id] || null;
  }

  // Memutar ulang animasi CSS pada elemen yang sama.
  function replayAnimation($el, cls) {
    $el.removeClass(cls);
    void $el[0].offsetWidth;
    $el.addClass(cls);
  }

  function toast(message, isError) {
    var $t = $('<div class="toast" role="status">').text(message).toggleClass('error', !!isError);
    $ui.toastWrap.children().slice(0, -2).remove();   // paling banyak 3 toast sekaligus
    $ui.toastWrap.append($t);
    $t.fadeIn(200).delay(2200).fadeOut(300, function () { $t.remove(); });
  }

  /* ---------- Memuat data (AJAX / $.getJSON) ---------- */

  function loadProducts() {
    $.getJSON('data/products.json')
      .done(function (data) {
        if (!Array.isArray(data) || !data.length) { return showLoadError(); }
        products = data;
        byId = {};
        $.each(products, function (_, p) {
          byId[p.id] = p;
          p.cari = (p.nama + ' ' + p.deskripsi).toLowerCase();   // dihitung sekali, dipakai tiap pencarian
        });
        restoreCart();
        buildCategoryChips();
        renderProducts();
        renderCart();
      })
      .fail(showLoadError);
  }

  function showLoadError() {
    $ui.productGrid.empty();
    $ui.resultInfo.text('');
    $ui.errorMsg
      .text('Gagal memuat data produk. Jika Anda membuka file langsung, jalankan lewat Live Server atau GitHub Pages.')
      .removeClass('hidden');
  }

  // users.json hanya diunduh saat pertama kali dibutuhkan; kalau gagal boleh dicoba lagi.
  function getUsers() {
    if (!usersReq) {
      usersReq = $.getJSON('data/users.json').then(
        function (data) { return Array.isArray(data) ? data : []; },
        function () { usersReq = null; return []; }
      );
    }
    return usersReq;
  }

  /* ---------- Produk: filter, urut, render ---------- */

  function buildCategoryChips() {
    var cats = ['semua'];
    $.each(products, function (_, p) {
      if ($.inArray(p.kategori, cats) === -1) { cats.push(p.kategori); }
    });
    var html = '';
    $.each(cats, function (_, c) {
      var on = c === view.kategori;
      html += '<button type="button" class="chip' + (on ? ' active' : '') + '" data-kategori="' + esc(c) +
        '" aria-pressed="' + on + '">' + (c === 'semua' ? 'Semua' : esc(c)) + '</button>';
    });
    $ui.filterKategori.html(html);
  }

  function visibleProducts() {
    var q = trim(view.q).toLowerCase();
    var list = $.grep(products, function (p) {
      var okKategori = view.kategori === 'semua' || p.kategori === view.kategori;
      return okKategori && (!q || p.cari.indexOf(q) !== -1);
    });
    if (view.sort === 'harga-asc') { list.sort(function (a, b) { return a.harga - b.harga; }); }
    else if (view.sort === 'harga-desc') { list.sort(function (a, b) { return b.harga - a.harga; }); }
    else if (view.sort === 'nama') { list.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); }); }
    return list;
  }

  function buildCard(p, index) {
    var habis = p.stok <= 0;
    var enter = firstRender ? ' enter" style="animation-delay:' + Math.min(index, 8) * 40 + 'ms' : '';
    return '<article class="card' + enter + '">' +
      '<div class="card-img" aria-hidden="true" style="background-color:' + esc(p.warna) + '">' + esc(p.emoji) + '</div>' +
      '<div class="card-body">' +
        '<span class="tag">' + esc(p.kategori) + '</span>' +
        '<h3>' + esc(p.nama) + '</h3>' +
        '<p class="card-desc">' + esc(p.deskripsi) + '</p>' +
        '<p class="price">' + rupiah(p.harga) + ' <small>/ ' + esc(p.satuan) + '</small></p>' +
        '<p class="stock' + (habis ? ' out' : '') + '">' +
          (habis ? 'Stok habis' : 'Stok: ' + p.stok + ' ' + esc(p.satuan)) + '</p>' +
        '<button type="button" class="btn btn-accent btn-add" data-id="' + p.id + '"' + (habis ? ' disabled' : '') + '>' +
          (habis ? 'Stok Habis' : 'Tambah ke Keranjang') + '</button>' +
      '</div></article>';
  }

  function renderProducts() {
    var list = visibleProducts();
    var html = '';
    for (var i = 0; i < list.length; i++) { html += buildCard(list[i], i); }
    $ui.productGrid.html(html);             // satu kali tulis ke DOM (sekaligus menghapus pesan "Memuat…")
    firstRender = false;
    $ui.emptyMsg.toggleClass('hidden', list.length > 0);
    $ui.resultInfo.text('Menampilkan ' + list.length + ' dari ' + products.length + ' produk');
  }

  /* ---------- Keranjang ---------- */

  function restoreCart() {
    var saved = readStore('localStorage', KEY_CART);
    cart = {};
    if (!saved || typeof saved !== 'object') { return; }
    $.each(saved, function (key, qty) {
      var id = Number(key);
      var p = findProduct(id);
      qty = Math.floor(Number(qty));
      if (p && p.stok > 0 && qty > 0) { cart[id] = Math.min(qty, p.stok); }
    });
  }

  function saveCart() { writeStore('localStorage', KEY_CART, cart); }

  // Jumlah barang dan total harga dihitung dalam satu putaran.
  function cartStats() {
    var count = 0, total = 0;
    $.each(cart, function (id, qty) {
      var p = findProduct(id);
      if (p) { count += qty; total += p.harga * qty; }
    });
    return { count: count, total: total };
  }

  function addToCart(id) {
    var p = findProduct(id);
    if (!p || p.stok <= 0) { return; }
    var now = cart[id] || 0;
    if (now + 1 > p.stok) {
      toast('Stok ' + p.nama + ' hanya ' + p.stok + ' ' + p.satuan + '.', true);
      return;
    }
    cart[id] = now + 1;
    saveCart();
    renderCart();
    replayAnimation($ui.btnCart, 'bump');
    toast(p.nama + ' ditambahkan ke keranjang');
  }

  function changeQty(id, delta) {
    var p = findProduct(id);
    if (!p || !cart[id]) { return; }
    var next = cart[id] + delta;
    if (next > p.stok) { toast('Stok ' + p.nama + ' hanya ' + p.stok + ' ' + p.satuan + '.', true); return; }
    if (next <= 0) { delete cart[id]; } else { cart[id] = next; }
    saveCart();
    renderCart();
  }

  function removeItem(id) {
    delete cart[id];
    saveCart();
    renderCart();
  }

  // Daftar keranjang digambar ulang seluruhnya, jadi fokus keyboard dikembalikan ke tombol yang sama.
  function refocusCart(id, selector) {
    var $btn = selector ? $ui.cartItems.children('[data-id="' + id + '"]').find(selector + ':enabled') : $();
    if (!$btn.length) { $btn = $ui.cartItems.find('button:enabled').first(); }
    if (!$btn.length) { $btn = $ui.cartClose; }
    $btn.trigger('focus');
  }

  function renderCart() {
    var html = '', count = 0, total = 0;

    $.each(cart, function (id, qty) {
      var p = findProduct(id);
      if (!p) { return; }
      count += qty;
      total += p.harga * qty;
      html += '<li class="cart-item" data-id="' + p.id + '">' +
        '<div class="cart-thumb" aria-hidden="true" style="background-color:' + esc(p.warna) + '">' + esc(p.emoji) + '</div>' +
        '<div class="cart-info">' +
          '<strong>' + esc(p.nama) + '</strong>' +
          '<small>' + rupiah(p.harga) + ' / ' + esc(p.satuan) + '</small>' +
          '<div class="qty">' +
            '<button type="button" class="qty-minus" aria-label="Kurangi ' + esc(p.nama) + '">−</button>' +
            '<span aria-live="polite">' + qty + '</span>' +
            '<button type="button" class="qty-plus" aria-label="Tambah ' + esc(p.nama) + '"' + (qty >= p.stok ? ' disabled' : '') + '>+</button>' +
          '</div>' +
        '</div>' +
        '<div><div class="cart-sub">' + rupiah(p.harga * qty) + '</div>' +
          '<button type="button" class="cart-remove" aria-label="Hapus ' + esc(p.nama) + '">Hapus</button></div>' +
      '</li>';
    });

    var empty = count === 0;
    $ui.cartItems.html(html);
    $ui.cartEmpty.toggleClass('hidden', !empty);
    $ui.cartTotalRow.add($ui.orderForm).toggleClass('hidden', empty);
    $ui.cartTotal.text(rupiah(total));
    $ui.cartBadge.text(count);
    updateLoginNote();
  }

  /* ---------- Drawer & modal ---------- */

  function openDrawer() {
    lastFocus = document.activeElement;
    resetSuccessView();
    $ui.overlay.addClass('open');
    $ui.cartDrawer.addClass('open').attr('aria-hidden', 'false');
    $('body').addClass('no-scroll');
    $ui.cartClose.trigger('focus');
  }

  function closeDrawer() {
    $ui.overlay.removeClass('open');
    $ui.cartDrawer.removeClass('open').attr('aria-hidden', 'true');
    $('body').removeClass('no-scroll');
    resetSuccessView();
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  }

  function isDrawerOpen() { return $ui.cartDrawer.hasClass('open'); }
  function isModalOpen() { return $ui.loginModal.hasClass('open'); }

  function openLogin() {
    getUsers();                              // mulai mengunduh users.json selagi pengguna mengetik
    $ui.loginErr.hide().text('');
    $ui.loginForm[0].reset();
    $ui.loginModal.addClass('open').attr('aria-hidden', 'false');
    $('body').addClass('no-scroll');
    window.setTimeout(function () { $ui.loginUser.trigger('focus'); }, 50);
  }

  function closeLogin() {
    $ui.loginModal.removeClass('open').attr('aria-hidden', 'true');
    if (!isDrawerOpen()) { $('body').removeClass('no-scroll'); }
  }

  /* ---------- Login (users.json) ---------- */

  function setUser(user) {
    currentUser = user;
    writeStore('sessionStorage', KEY_USER, user ? { username: user.username, nama: user.nama } : null);
    $ui.btnLogin.toggleClass('hidden', !!user);
    $ui.userBox.toggleClass('hidden', !user);
    $ui.userName.text(user ? 'Halo, ' + user.nama : '');
    if (user && !trim($fields.nama.$in.val())) { $fields.nama.$in.val(user.nama); }
    updateLoginNote();
  }

  function restoreUser() {
    var saved = readStore('sessionStorage', KEY_USER);
    if (saved && typeof saved.username === 'string' && typeof saved.nama === 'string') { setUser(saved); }
  }

  function updateLoginNote() {
    $ui.loginNote.toggleClass('hidden', !!currentUser);
  }

  function showLoginError(msg) {
    $ui.loginErr.text(msg).stop(true, true).slideDown(150);
    replayAnimation($ui.loginModal.find('.modal-box'), 'shake');
  }

  function onLoginSubmit(e) {
    e.preventDefault();
    var u = trim($ui.loginUser.val()).toLowerCase();
    var pw = $ui.loginPass.val();
    if (!u || !pw) { return showLoginError('Username dan password wajib diisi.'); }
    getUsers().then(function (users) {
      if (!users.length) { return showLoginError('Data pengguna belum termuat. Coba muat ulang halaman.'); }
      var match = $.grep(users, function (x) {
        return String(x.username).toLowerCase() === u && x.password === pw;
      })[0];
      if (!match) { return showLoginError('Username atau password salah.'); }
      setUser({ username: match.username, nama: match.nama });
      closeLogin();
      toast('Selamat datang, ' + match.nama + '!');
    });
  }

  /* ---------- Form pemesanan: validasi ---------- */

  function setFieldError(field, msg) {
    var f = $fields[field];
    if (msg) {
      f.$in.addClass('invalid').attr('aria-invalid', 'true');
      f.$err.text(msg).stop(true, true).slideDown(150);
    } else {
      f.$in.removeClass('invalid').removeAttr('aria-invalid');
      f.$err.stop(true, true).hide().text('');
    }
  }

  function validateOrder() {
    var nama = trim($fields.nama.$in.val());
    var hp = $fields.hp.$in.val().replace(/[\s-]/g, '');
    var metode = $('input[name="metode"]:checked').val();
    var alamat = trim($fields.alamat.$in.val());
    var errors = {};

    if (nama.length < 3) { errors.nama = 'Nama minimal 3 karakter.'; }
    else if (!/^[A-Za-zÀ-ɏ .'\-]+$/.test(nama)) { errors.nama = 'Nama hanya boleh berisi huruf dan spasi.'; }

    if (!hp) { errors.hp = 'Nomor HP wajib diisi.'; }
    else if (!/^(\+62|62|0)8\d{8,11}$/.test(hp)) { errors.hp = 'Nomor HP tidak valid. Contoh: 081234567890.'; }

    if (metode === 'antar') {
      if (!alamat) { errors.alamat = 'Alamat pengantaran wajib diisi.'; }
      else if (alamat.length < 10) { errors.alamat = 'Alamat terlalu singkat, tulis minimal 10 karakter.'; }
    }

    var first = null;
    $.each(['nama', 'hp', 'alamat'], function (_, f) {
      setFieldError(f, errors[f] || '');
      if (errors[f] && !first) { first = f; }
    });
    if (first) { $fields[first].$in.trigger('focus'); }

    return {
      ok: !first,
      data: { nama: nama, hp: hp, metode: metode, alamat: alamat, catatan: trim($ui.orderCatatan.val()) }
    };
  }

  function onOrderSubmit(e) {
    e.preventDefault();
    if (!cartStats().count) { return toast('Keranjang masih kosong.', true); }
    if (!currentUser) {
      toast('Silakan masuk terlebih dahulu.', true);
      return openLogin();
    }
    var result = validateOrder();
    if (!result.ok) { return; }
    showSuccess(result.data);
  }

  function showSuccess(d) {
    var total = cartStats().total;
    var items = '';
    $.each(cart, function (id, qty) {
      var p = findProduct(id);
      if (!p) { return; }
      items += '<li><span>' + esc(p.nama) + ' × ' + qty + ' ' + esc(p.satuan) + '</span><span>' + rupiah(p.harga * qty) + '</span></li>';
    });
    $ui.successItems.html(items);

    var detail = '';
    function row(label, value) { detail += '<dt>' + label + '</dt><dd>' + esc(value) + '</dd>'; }
    row('Nama', d.nama);
    row('No. HP', d.hp);
    row('Penerimaan', d.metode === 'antar' ? 'Diantar' : 'Ambil di toko');
    if (d.metode === 'antar') { row('Alamat', d.alamat); }
    if (d.catatan) { row('Catatan', d.catatan); }
    $ui.successDetail.html(detail);

    $ui.successCode.text('TBB-' + Date.now().toString(36).toUpperCase());
    $ui.successTotal.text(rupiah(total));

    cart = {};
    saveCart();
    renderCart();
    $ui.orderForm[0].reset();
    $ui.alamatGroup.hide();
    $.each(['nama', 'hp', 'alamat'], function (_, f) { setFieldError(f, ''); });
    if (currentUser) { $fields.nama.$in.val(currentUser.nama); }

    $ui.cartView.hide();
    $ui.orderSuccess.fadeIn(250).trigger('focus');
    $('.drawer-body').scrollTop(0);
  }

  function resetSuccessView() {
    $ui.orderSuccess.hide();
    $ui.cartView.show();
  }

  /* ---------- Slider hero (animasi fade jQuery) ---------- */

  function initSlider() {
    var $hero = $('.hero');
    var $slides = $hero.find('.slide');
    var total = $slides.length;
    var current = 0;
    var busy = false;
    var timer = null;
    var onScreen = true;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var $dots = $('#slider-dots');
    var dotsHtml = '';

    if (reduce) { $.fx.off = true; }

    for (var i = 0; i < total; i++) {
      dotsHtml += '<button type="button" aria-label="Ke slide ' + (i + 1) + '"' + (i === 0 ? ' class="active"' : '') + '></button>';
    }
    $dots.html(dotsHtml).on('click', 'button', function () { go($(this).index()); restart(); });

    function go(index) {
      index = (index + total) % total;
      if (busy || index === current) { return; }
      busy = true;
      var $from = $slides.eq(current);
      var $to = $slides.eq(index);
      current = index;
      $dots.children().removeClass('active').eq(index).addClass('active');
      $from.fadeOut(300, function () {
        $to.fadeIn(300, function () { busy = false; });
      });
    }

    // Jangan memutar slide kalau tab disembunyikan atau hero sudah keluar layar (hemat CPU & baterai).
    function start() {
      if (reduce || timer || document.hidden || !onScreen) { return; }
      timer = window.setInterval(function () { go(current + 1); }, 5500);
    }
    function stop() { window.clearInterval(timer); timer = null; }
    function restart() { stop(); start(); }

    $('#slider-prev').on('click', function () { go(current - 1); restart(); });
    $('#slider-next').on('click', function () { go(current + 1); restart(); });
    $hero.on('mouseenter focusin', stop).on('mouseleave focusout', start);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { stop(); } else { start(); } });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        if (onScreen) { start(); } else { stop(); }
      }).observe($hero[0]);
    }
    start();
  }

  /* ---------- Menu mobile ---------- */

  function setNav(open) {
    $ui.siteHeader.toggleClass('nav-open', open);
    $ui.navToggle.attr('aria-expanded', open ? 'true' : 'false')
      .attr('aria-label', open ? 'Tutup menu' : 'Buka menu');
  }

  /* ---------- Pasang event ---------- */

  $(function () {
    // Cache semua elemen yang dipakai berulang (#product-grid -> $ui.productGrid)
    $.each(DOM_IDS, function (_, id) {
      $ui[id.replace(/-(\w)/g, function (_m, c) { return c.toUpperCase(); })] = $('#' + id);
    });
    $.each(['nama', 'hp', 'alamat'], function (_, f) {
      $fields[f] = { $in: $('#order-' + f), $err: $('#err-' + f) };
    });

    var $metode = $('input[name="metode"]');
    var searchTimer = null;
    var cartId = function (el) { return Number($(el).closest('.cart-item').attr('data-id')); };

    $('#year').text(new Date().getFullYear());

    initSlider();
    restoreUser();
    loadProducts();

    // Cari (ditunda 60 ms saat mengetik), urut
    $ui.search.on('input', function () {
      view.q = this.value;
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderProducts, 60);
    });
    $ui.sort.on('change', function () { view.sort = this.value; renderProducts(); });

    // Event delegation: elemen ini dibuat dinamis setelah JSON dimuat
    $ui.filterKategori.on('click', '.chip', function () {
      view.kategori = $(this).attr('data-kategori');
      $ui.filterKategori.children().removeClass('active').attr('aria-pressed', 'false');
      $(this).addClass('active').attr('aria-pressed', 'true');
      renderProducts();
    });
    $ui.productGrid.on('click', '.btn-add', function () {
      addToCart(Number($(this).attr('data-id')));
    });
    $ui.cartItems
      .on('click', '.qty-plus', function () { var id = cartId(this); changeQty(id, 1); refocusCart(id, '.qty-plus'); })
      .on('click', '.qty-minus', function () { var id = cartId(this); changeQty(id, -1); refocusCart(id, '.qty-minus'); })
      .on('click', '.cart-remove', function () { removeItem(cartId(this)); refocusCart(); });

    // Drawer & modal
    $ui.btnCart.on('click', openDrawer);
    $('#cart-close, #overlay, #success-close').on('click', closeDrawer);
    $('#btn-login, #note-login').on('click', openLogin)
      .one('mouseenter focus touchstart', getUsers);   // unduh users.json lebih awal begitu pengguna mendekati tombol
    $('#login-close').on('click', closeLogin);
    $ui.loginModal.on('click', function (e) { if (e.target === this) { closeLogin(); } });
    $ui.loginForm.on('submit', onLoginSubmit);
    $('#btn-logout').on('click', function () { setUser(null); toast('Anda sudah keluar.'); });
    $(document).on('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      if (isModalOpen()) { closeLogin(); }
      else if (isDrawerOpen()) { closeDrawer(); }
      else { setNav(false); }
    });

    // Form pemesanan
    $ui.orderForm.on('submit', onOrderSubmit);
    $metode.on('change', function () {
      if ($metode.filter(':checked').val() === 'antar') { $ui.alamatGroup.slideDown(200); }
      else { $ui.alamatGroup.slideUp(200); setFieldError('alamat', ''); }
    });
    $ui.orderForm.on('input', 'input, textarea', function () {
      var f = this.id.replace('order-', '');
      if ($fields[f] && $(this).hasClass('invalid')) { setFieldError(f, ''); }
    });

    // Menu mobile (matchMedia menggantikan listener resize yang terpanggil terus-menerus)
    $ui.navToggle.on('click', function () { setNav(!$ui.siteHeader.hasClass('nav-open')); });
    $('#main-nav').on('click', 'a', function () { setNav(false); });
    window.matchMedia('(min-width: 769px)').addEventListener('change', function (e) { if (e.matches) { setNav(false); } });
  });

})(jQuery);
