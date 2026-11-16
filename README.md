# Toko Buah Segar Blitar

Website toko buah (tugas akhir Workshop Desain Web, Politeknik Elektronika Negeri Surabaya).
Dibuat dengan HTML, CSS (Flexbox + Grid), JavaScript, dan jQuery 3.7.1.

## Fitur
- Katalog produk dimuat dari `data/products.json` dengan `$.getJSON`
- Cari, filter kategori, dan urutkan produk
- Keranjang belanja (event delegation, batas stok, tersimpan di `localStorage`)
- Slider hero dengan animasi fade jQuery
- Login memakai `data/users.json` (akun demo: `pembeli` / `buah123`)
- Form pemesanan dengan validasi (nama, nomor HP, alamat)
- Responsif untuk desktop, tablet, dan mobile

## Menjalankan di komputer
`$.getJSON` tidak bisa membaca file lewat `file://`, jadi jalankan lewat server lokal:

```
python -m http.server 8000
```

lalu buka http://localhost:8000. Atau pakai ekstensi Live Server di VS Code.

## Catatan
Ini proyek demo: pesanan tidak dikirim ke server, dan data login ada di file JSON publik.
Nama toko, alamat, nomor WhatsApp, dan harga hanyalah contoh.
