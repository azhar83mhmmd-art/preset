# PresetFlow: "Aktivitas Terbaru" menampilkan preset (maks 10, untuk semua pengunjung)

Kartu **Aktivitas Terbaru** sekarang berisi preset yang ditemukan user: thumbnail, judul, waktu, tombol **Import**
(buka tautan preset) dan **Salin tautan**. Kartu lain (7 Hari Terakhir, Recent searches, dll) tidak disentuh.
Baris lama ("Preset ditemukan · 1 link") hanya disembunyikan, tidak dihapus. Untuk menampilkannya lagi: `window.PF_FEED = { keepOld: true }`.

## 1. Database (Supabase > SQL Editor)
Jalankan `supabase.sql` (aman dijalankan ulang). Maks 10 dijaga trigger: preset terlama otomatis terhapus.

## 2. API
`api/recent.js` (GET = 10 terbaru, POST = simpan). Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- Vercel: taruh di folder `/api`.
- Express/Node: `app.use(express.json()); app.all('/api/recent', require('./api/recent'));`

## 3. Pasang di `index.html`
```html
<head>
  <script src="/perf-boost.js"></script>          <!-- paling atas, tanpa defer -->
  ...CSS utama kamu...
  <link rel="stylesheet" href="/perf-boost.css">
  <link rel="stylesheet" href="/activity-presets.css">
</head>
<body>
  ...
  <script src="/activity-presets.js"></script>     <!-- paling bawah -->
</body>
```
Kartu dicari otomatis dari judul "Aktivitas Terbaru". Kalau tidak ketemu, beri id pada daftar aktivitasmu dan set
`window.PF_FEED = { target: '#idDaftar' }` sebelum script ini.

## 4. Satu baris penting: laporkan preset yang berhasil ditemukan
Cari di `script.js` tempat kode mencatat aktivitas **"Preset ditemukan"**, lalu tambahkan di titik yang sama:
```js
PresetFeed.report(hasil, linkTikTok);
```
`hasil` boleh objek hasil pencarian, string link, atau array. Field dikenali otomatis (link/url/preset_link, title/name,
thumbnail/thumb/cover/image). Hanya panggil saat pencarian sukses.

## Catatan
- Kalau API belum aktif, kartu tetap jalan dalam mode lokal (hanya terlihat di perangkat itu).
- Feed publik menerima data dari klien, jadi bisa dipalsukan. Untuk lebih aman, panggil POST dari server setelah server sendiri memverifikasi hasilnya.
- Thumbnail CDN TikTok bisa kedaluwarsa; kalau gambar lama kosong, simpan ke Supabase Storage.
- `perf-boost.*` mengurangi lag scroll (blur kaca dimatikan, canvas latar 30fps, animasi dijeda saat scroll). Bandingkan dengan `?perf=off`.
