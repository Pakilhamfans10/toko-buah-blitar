/* =========================================================
   Toko Buah Segar Blitar - app.js (jQuery 3.7.1)
   Fitur: render produk dari JSON, cari/filter/urut, keranjang
   (event delegation), slider animasi, login dari users.json,
   validasi form pemesanan.
   ========================================================= */
(function ($) {
  'use strict';

  var KEY_CART = 'tbb_cart';
  var KEY_USER = 'tbb_user';

  var products = [];
  var users = [];
  var cart = {};            // { idProduk: jumlah }
  var currentUser = null;   // { username, nama }
  var view = { q: '', kategori: 'semua', sort: 'default' };
  var lastFocus = null;

  /* ---------- Utilitas ---------- */

  function trim(s) {
    return String(s == null ? '' : s).replace(/^\s+|\s+$/g, '');
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
    for (var i = 0; i < products.length; i++) {
      if (products[i].id === id) { return products[i]; }
    }
    return null;
  }

  function toast(message, isError) {
    var $t = $('<div class="toast" role="status">').text(message).toggleClass('error', !!isError);
    $('#toast-wrap').append($t);
    $t.fadeIn(200).delay(2200).fadeOut(300, function () { $t.remove(); });
  }

  /* ---------- Memuat data (AJAX / $.getJSON) ---------- */

  function loadProducts() {
    $.getJSON('data/products.json')
      .done(function (data) {
        if (!Array.isArray(data) || !data.length) { return showLoadError(); }
        products = data;
        restoreCart();
        buildCategoryChips();
        renderProducts();
        renderCart();
      })
      .fail(showLoadError);
  }

  function showLoadError() {
    $('#loading-msg').remove();
    $('#result-info').text('');
    $('#error-msg')
      .text('Gagal memuat data produk. Jika Anda membuka file langsung, jalankan lewat Live Server atau GitHub Pages.')
      .removeClass('hidden');
  }

  function loadUsers() {
    $.getJSON('data/users.json')
      .done(function (data) { users = Array.isArray(data) ? data : []; })
      .fail(function () { users = []; });
  }

  /* ---------- Produk: filter, urut, render ---------- */

  function buildCategoryChips() {
    var cats = ['semua'];
    $.each(products, function (_, p) {
      if ($.inArray(p.kategori, cats) === -1) { cats.push(p.kategori); }
    });
    var $wrap = $('#filter-kategori').empty();
    $.each(cats, function (_, c) {
      $('<button type="button" class="chip">')
        .attr('data-kategori', c)
        .attr('aria-pressed', c === view.kategori ? 'true' : 'false')
        .toggleClass('active', c === view.kategori)
        .text(c === 'semua' ? 'Semua' : c)
        .appendTo($wrap);
    });
  }

  function visibleProducts() {
    var q = trim(view.q).toLowerCase();
    var list = $.grep(products, function (p) {
      var okKategori = view.kategori === 'semua' || p.kategori === view.kategori;
      var okCari = !q || (p.nama + ' ' + p.deskripsi).toLowerCase().indexOf(q) !== -1;
      return okKategori && okCari;
    });
    if (view.sort === 'harga-asc') { list.sort(function (a, b) { return a.harga - b.harga; }); }
    else if (view.sort === 'harga-desc') { list.sort(function (a, b) { return b.harga - a.harga; }); }
    else if (view.sort === 'nama') { list.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); }); }
    return list;
  }

  function buildCard(p, index) {
    var $card = $('<article class="card">').css('animation-delay', Math.min(index, 8) * 40 + 'ms');
    $('<div class="card-img" aria-hidden="true">').css('background-color', p.warna).text(p.emoji).appendTo($card);

    var $body = $('<div class="card-body">').appendTo($card);
    $('<span class="tag">').text(p.kategori).appendTo($body);
    $('<h3>').text(p.nama).appendTo($body);
    $('<p class="card-desc">').text(p.deskripsi).appendTo($body);

    var $price = $('<p class="price">').text(rupiah(p.harga) + ' ').appendTo($body);
    $('<small>').text('/ ' + p.satuan).appendTo($price);

    var habis = p.stok <= 0;
    $('<p class="stock">').toggleClass('out', habis)
      .text(habis ? 'Stok habis' : 'Stok: ' + p.stok + ' ' + p.satuan).appendTo($body);

    $('<button type="button" class="btn btn-accent btn-add">')
      .attr('data-id', p.id)
      .prop('disabled', habis)
      .text(habis ? 'Stok Habis' : 'Tambah ke Keranjang')
      .appendTo($body);
    return $card;
  }

  function renderProducts() {
    $('#loading-msg').remove();
    var list = visibleProducts();
    var $grid = $('#product-grid').empty();
    $.each(list, function (i, p) { $grid.append(buildCard(p, i)); });
    $('#empty-msg').toggleClass('hidden', list.length > 0);
    $('#result-info').text('Menampilkan ' + list.length + ' dari ' + products.length + ' produk');
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

  function cartCount() {
    var n = 0;
    $.each(cart, function (_, q) { n += q; });
    return n;
  }

  function cartTotal() {
    var t = 0;
    $.each(cart, function (id, q) {
      var p = findProduct(Number(id));
      if (p) { t += p.harga * q; }
    });
    return t;
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
    $('#btn-cart').removeClass('bump');
    void $('#btn-cart')[0].offsetWidth;   // restart animasi
    $('#btn-cart').addClass('bump');
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

  function renderCart() {
    var $list = $('#cart-items').empty();
    var ids = $.map(cart, function (_, id) { return Number(id); });

    $.each(ids, function (_, id) {
      var p = findProduct(id);
      var qty = cart[id];
      if (!p) { return; }
      var $li = $('<li class="cart-item">').attr('data-id', id);
      $('<div class="cart-thumb" aria-hidden="true">').css('background-color', p.warna).text(p.emoji).appendTo($li);

      var $info = $('<div class="cart-info">').appendTo($li);
      $('<strong>').text(p.nama).appendTo($info);
      $('<small>').text(rupiah(p.harga) + ' / ' + p.satuan).appendTo($info);
      var $qty = $('<div class="qty">').appendTo($info);
      $('<button type="button" class="qty-minus">').attr('aria-label', 'Kurangi ' + p.nama).text('−').appendTo($qty);
      $('<span aria-live="polite">').text(qty).appendTo($qty);
      $('<button type="button" class="qty-plus">').attr('aria-label', 'Tambah ' + p.nama).prop('disabled', qty >= p.stok).text('+').appendTo($qty);

      var $sub = $('<div>').appendTo($li);
      $('<div class="cart-sub">').text(rupiah(p.harga * qty)).appendTo($sub);
      $('<button type="button" class="cart-remove">').attr('aria-label', 'Hapus ' + p.nama).text('Hapus').appendTo($sub);

      $list.append($li);
    });

    var empty = ids.length === 0;
    $('#cart-empty').toggleClass('hidden', !empty);
    $('#cart-total-row, #order-form').toggleClass('hidden', empty);
    $('#cart-total').text(rupiah(cartTotal()));
    $('#cart-badge').text(cartCount());
    updateLoginNote();
  }

  /* ---------- Drawer & modal ---------- */

  function openDrawer() {
    lastFocus = document.activeElement;
    resetSuccessView();
    $('#overlay').addClass('open');
    $('#cart-drawer').addClass('open').attr('aria-hidden', 'false');
    $('body').addClass('no-scroll');
    $('#cart-close').trigger('focus');
  }

  function closeDrawer() {
    $('#overlay').removeClass('open');
    $('#cart-drawer').removeClass('open').attr('aria-hidden', 'true');
    $('body').removeClass('no-scroll');
    resetSuccessView();
    if (lastFocus && lastFocus.focus) { lastFocus.focus(); }
  }

  function isDrawerOpen() { return $('#cart-drawer').hasClass('open'); }
  function isModalOpen() { return $('#login-modal').hasClass('open'); }

  function openLogin() {
    $('#login-err').hide().text('');
    $('#login-form')[0].reset();
    $('#login-modal').addClass('open').attr('aria-hidden', 'false');
    $('body').addClass('no-scroll');
    window.setTimeout(function () { $('#login-user').trigger('focus'); }, 50);
  }

  function closeLogin() {
    $('#login-modal').removeClass('open').attr('aria-hidden', 'true');
    if (!isDrawerOpen()) { $('body').removeClass('no-scroll'); }
  }

  /* ---------- Login (users.json) ---------- */

  function setUser(user) {
    currentUser = user;
    writeStore('sessionStorage', KEY_USER, user ? { username: user.username, nama: user.nama } : null);
    $('#btn-login').toggleClass('hidden', !!user);
    $('#user-box').toggleClass('hidden', !user);
    $('#user-name').text(user ? 'Halo, ' + user.nama : '');
    if (user && !trim($('#order-nama').val())) { $('#order-nama').val(user.nama); }
    updateLoginNote();
  }

  function restoreUser() {
    var saved = readStore('sessionStorage', KEY_USER);
    if (saved && typeof saved.username === 'string' && typeof saved.nama === 'string') { setUser(saved); }
  }

  function updateLoginNote() {
    $('#login-note').toggleClass('hidden', !!currentUser);
  }

  function showLoginError(msg) {
    var $box = $('#login-modal .modal-box');
    $('#login-err').text(msg).stop(true, true).slideDown(150);
    $box.removeClass('shake');
    void $box[0].offsetWidth;
    $box.addClass('shake');
  }

  function onLoginSubmit(e) {
    e.preventDefault();
    var u = trim($('#login-user').val()).toLowerCase();
    var pw = $('#login-pass').val();
    if (!u || !pw) { return showLoginError('Username dan password wajib diisi.'); }
    if (!users.length) { return showLoginError('Data pengguna belum termuat. Coba muat ulang halaman.'); }
    var match = $.grep(users, function (x) {
      return String(x.username).toLowerCase() === u && x.password === pw;
    })[0];
    if (!match) { return showLoginError('Username atau password salah.'); }
    setUser({ username: match.username, nama: match.nama });
    closeLogin();
    toast('Selamat datang, ' + match.nama + '!');
  }

  /* ---------- Form pemesanan: validasi ---------- */

  function setFieldError(field, msg) {
    var $input = $('#order-' + field);
    var $err = $('#err-' + field);
    if (msg) {
      $input.addClass('invalid').attr('aria-invalid', 'true');
      $err.text(msg).stop(true, true).slideDown(150);
    } else {
      $input.removeClass('invalid').removeAttr('aria-invalid');
      $err.stop(true, true).hide().text('');
    }
  }

  function validateOrder() {
    var nama = trim($('#order-nama').val());
    var hp = $('#order-hp').val().replace(/[\s-]/g, '');
    var metode = $('input[name="metode"]:checked').val();
    var alamat = trim($('#order-alamat').val());
    var errors = {};

    if (nama.length < 3) { errors.nama = 'Nama minimal 3 karakter.'; }
    else if (!/^[A-Za-zÀ-ɏ .'\-]+$/.test(nama)) { errors.nama = 'Nama hanya boleh berisi huruf dan spasi.'; }

    if (!hp) { errors.hp = 'Nomor HP wajib diisi.'; }
    else if (!/^(\+62|62|0)8\d{8,11}$/.test(hp)) { errors.hp = 'Nomor HP tidak valid. Contoh: 081234567890.'; }

    if (metode === 'antar') {
      if (!alamat) { errors.alamat = 'Alamat pengantaran wajib diisi.'; }
      else if (alamat.length < 10) { errors.alamat = 'Alamat terlalu singkat, tulis minimal 10 karakter.'; }
    }

    $.each(['nama', 'hp', 'alamat'], function (_, f) { setFieldError(f, errors[f] || ''); });

    var order = ['nama', 'hp', 'alamat'];
    for (var i = 0; i < order.length; i++) {
      if (errors[order[i]]) { $('#order-' + order[i]).trigger('focus'); break; }
    }
    return {
      ok: $.isEmptyObject(errors),
      data: { nama: nama, hp: hp, metode: metode, alamat: alamat, catatan: trim($('#order-catatan').val()) }
    };
  }

  function onOrderSubmit(e) {
    e.preventDefault();
    if (!cartCount()) { return toast('Keranjang masih kosong.', true); }
    if (!currentUser) {
      toast('Silakan masuk terlebih dahulu.', true);
      return openLogin();
    }
    var result = validateOrder();
    if (!result.ok) { return; }
    showSuccess(result.data);
  }

  function addDetail($dl, label, value) {
    $('<dt>').text(label).appendTo($dl);
    $('<dd>').text(value).appendTo($dl);
  }

  function showSuccess(d) {
    var total = cartTotal();
    var $items = $('#success-items').empty();
    $.each(cart, function (id, qty) {
      var p = findProduct(Number(id));
      if (!p) { return; }
      var $li = $('<li>').appendTo($items);
      $('<span>').text(p.nama + ' × ' + qty + ' ' + p.satuan).appendTo($li);
      $('<span>').text(rupiah(p.harga * qty)).appendTo($li);
    });

    var $dl = $('#success-detail').empty();
    addDetail($dl, 'Nama', d.nama);
    addDetail($dl, 'No. HP', d.hp);
    addDetail($dl, 'Penerimaan', d.metode === 'antar' ? 'Diantar' : 'Ambil di toko');
    if (d.metode === 'antar') { addDetail($dl, 'Alamat', d.alamat); }
    if (d.catatan) { addDetail($dl, 'Catatan', d.catatan); }

    $('#success-code').text('TBB-' + Date.now().toString(36).toUpperCase());
    $('#success-total').text(rupiah(total));

    cart = {};
    saveCart();
    renderCart();
    $('#order-form')[0].reset();
    $('#alamat-group').hide();
    $.each(['nama', 'hp', 'alamat'], function (_, f) { setFieldError(f, ''); });
    if (currentUser) { $('#order-nama').val(currentUser.nama); }

    $('#cart-view').hide();
    $('#order-success').fadeIn(250).trigger('focus');
    $('.drawer-body').scrollTop(0);
  }

  function resetSuccessView() {
    $('#order-success').hide();
    $('#cart-view').show();
  }

  /* ---------- Slider hero (animasi fade jQuery) ---------- */

  function initSlider() {
    var $slides = $('.hero .slide');
    var total = $slides.length;
    var current = 0;
    var busy = false;
    var timer = null;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var $dots = $('#slider-dots');

    if (reduce) { $.fx.off = true; }

    $slides.each(function (i) {
      $('<button type="button">')
        .attr('aria-label', 'Ke slide ' + (i + 1))
        .toggleClass('active', i === 0)
        .on('click', function () { go(i); restart(); })
        .appendTo($dots);
    });

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

    function start() {
      if (reduce || timer) { return; }
      timer = window.setInterval(function () { go(current + 1); }, 5500);
    }
    function stop() { window.clearInterval(timer); timer = null; }
    function restart() { stop(); start(); }

    $('#slider-prev').on('click', function () { go(current - 1); restart(); });
    $('#slider-next').on('click', function () { go(current + 1); restart(); });
    $('.hero').on('mouseenter focusin', stop).on('mouseleave focusout', start);
    start();
  }

  /* ---------- Menu mobile ---------- */

  function setNav(open) {
    $('#site-header').toggleClass('nav-open', open);
    $('#nav-toggle').attr('aria-expanded', open ? 'true' : 'false')
      .attr('aria-label', open ? 'Tutup menu' : 'Buka menu');
  }

  /* ---------- Pasang event ---------- */

  $(function () {
    $('#year').text(new Date().getFullYear());

    initSlider();
    restoreUser();
    loadProducts();
    loadUsers();
    renderCart();

    // Cari, urut
    $('#search').on('input', function () { view.q = $(this).val(); renderProducts(); });
    $('#sort').on('change', function () { view.sort = $(this).val(); renderProducts(); });

    // Event delegation: elemen ini dibuat dinamis setelah JSON dimuat
    $('#filter-kategori').on('click', '.chip', function () {
      view.kategori = $(this).attr('data-kategori');
      $('#filter-kategori .chip').removeClass('active').attr('aria-pressed', 'false');
      $(this).addClass('active').attr('aria-pressed', 'true');
      renderProducts();
    });
    $('#product-grid').on('click', '.btn-add', function () {
      addToCart(Number($(this).attr('data-id')));
    });
    $('#cart-items')
      .on('click', '.qty-plus', function () { changeQty(Number($(this).closest('.cart-item').attr('data-id')), 1); })
      .on('click', '.qty-minus', function () { changeQty(Number($(this).closest('.cart-item').attr('data-id')), -1); })
      .on('click', '.cart-remove', function () { removeItem(Number($(this).closest('.cart-item').attr('data-id'))); });

    // Drawer & modal
    $('#btn-cart').on('click', openDrawer);
    $('#cart-close, #overlay, #success-close').on('click', closeDrawer);
    $('#btn-login, #note-login').on('click', openLogin);
    $('#login-close').on('click', closeLogin);
    $('#login-modal').on('click', function (e) { if (e.target === this) { closeLogin(); } });
    $('#login-form').on('submit', onLoginSubmit);
    $('#btn-logout').on('click', function () { setUser(null); toast('Anda sudah keluar.'); });
    $(document).on('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      if (isModalOpen()) { closeLogin(); }
      else if (isDrawerOpen()) { closeDrawer(); }
      else { setNav(false); }
    });

    // Form pemesanan
    $('#order-form').on('submit', onOrderSubmit);
    $('input[name="metode"]').on('change', function () {
      var antar = $('input[name="metode"]:checked').val() === 'antar';
      if (antar) { $('#alamat-group').slideDown(200); }
      else { $('#alamat-group').slideUp(200); setFieldError('alamat', ''); }
    });
    $('#order-nama, #order-hp, #order-alamat').on('input', function () {
      var f = this.id.replace('order-', '');
      if ($(this).hasClass('invalid')) { setFieldError(f, ''); }
    });

    // Menu mobile
    $('#nav-toggle').on('click', function () { setNav(!$('#site-header').hasClass('nav-open')); });
    $('#main-nav').on('click', 'a', function () { setNav(false); });
    $(window).on('resize', function () { if (window.innerWidth > 768) { setNav(false); } });
  });

})(jQuery);
