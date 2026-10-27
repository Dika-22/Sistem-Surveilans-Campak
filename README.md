# Sistem Surveilans Kasus Campak — Kabupaten Pekalongan

Dashboard surveilans epidemiologi kasus campak berdasarkan karakteristik **orang** (person), **waktu** (time), dan **tempat** (place) periode 2026. Aplikasi ini dilengkapi dengan uji korelasi statistik inferensial, analisis spasial (Choropleth & Global Moran's I), penjaminan privasi medis (whitelist kolom & penyamaran sel kecil), drill-down kecamatan, serta ekspor laporan PDF, Excel (.xlsx), CSV, dan gambar PNG.

> ⚠️ **Catatan Privasi & Etika Data Kesehatan:**
> Sesuai ketentuan kerahasiaan data medis epidemiologi, seluruh website dan hasil ekspor **TIDAK MEMUAT nama pasien maupun alamat lengkap individu**. Hanya data teragregasi dan kolom yang disetujui dalam whitelist yang dimuat dan ditampilkan.

## 📂 Struktur File Proyek

```
├── index.html              # Halaman dashboard utama
├── kecamatan.html          # Halaman detail per kecamatan (drill-down)
├── css/
│   └── style.css           # Styling terpadu (tema biru-putih, mobile-first 360px–desktop)
├── js/
│   ├── config.js           # Konfigurasi terpusat (identitas, URL Sheets, whitelist, mapping kolom)
│   ├── data.js             # Data contoh epidemiologi lokal & daftar kecamatan/desa
│   ├── data-loader.js      # Gerbang data tunggal (live fetch, PapaParse, pembersihan privasi, polling)
│   ├── stats.js            # Engine analisis statistik korelasi (Pearson, Chi-Square, OR, Moran's I)
│   └── app.js              # Controller tampilan dashboard, Chart.js reaktif, Leaflet & ekspor
├── assets/
│   ├── logo/
│   │   ├── unikal.png      # Logo Universitas Pekalongan
│   │   ├── fakultas.png    # Logo Fakultas Ilmu Kesehatan
│   │   └── dinas.png       # Logo Dinas Kesehatan
│   └── img/
│       └── bg.jpg          # Gambar latar belakang hero dengan gradasi biru transparan
├── data/
│   ├── penduduk.csv        # Data jumlah penduduk per kecamatan untuk angka insidensi
│   └── kecamatan.geojson   # Batas poligon wilayah kecamatan Kabupaten Pekalongan
└── README.md               # Dokumentasi panduan teknis dan operasional

## 🚀 Cara Menjalankan Aplikasi

Aplikasi ini dibangun tanpa ketergantungan backend server atau database khusus, sehingga sangat ringan dan portabel.

### 1. Membuka Langsung di Browser
- Cukup klik ganda file `index.html` pada File Explorer untuk membukanya di peramban web modern (Google Chrome, Mozilla Firefox, Microsoft Edge).
- Seluruh grafik, tabel, korelasi, dan data contoh lokal akan langsung berfungsi 100%.

### 2. Menggunakan Web Server Lokal (Direkomendasikan untuk Live Google Sheets & GeoJSON)
Fitur pengambilan data daring (`fetch` Google Sheets CSV, `data/kecamatan.geojson`, dan `data/penduduk.csv`) membutuhkan protokol `http://` atau `https://` agar tidak diblokir oleh kebijakan keamanan CORS browser lokal (`file:///`):
- **Opsi A (VS Code Live Server)**: Klik kanan file `index.html` di VS Code, lalu pilih **"Open with Live Server"**.
- **Opsi B (Node.js)**: Jalankan perintah `npx serve .` di folder proyek.
- **Opsi C (Python)**: Jalankan `python -m http.server 8000` lalu akses `http://localhost:8000`.

## 📄 Lisensi & Hak Penggunaan
Dikembangkan untuk riset tugas akhir / skripsi mahasiswa program studi Kesehatan Masyarakat Universitas Pekalongan bekerja sama dengan instansi surveilans epidemiologi daerah. Bebas dikembangkan untuk pemantauan kesehatan publik.


```
