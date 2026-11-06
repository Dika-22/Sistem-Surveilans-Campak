/**
 * CONFIG.JS – Konfigurasi Terpusat Sistem Surveilans Campak
 * ===========================================================
 * File ini berisi:
 * 1. Data Identitas Akademik & Instansi
 * 2. Konfigurasi Sumber Data Live (Google Sheets CSV)
 * 3. Whitelist Privasi Data (Mencegah Kebocoran Data Pasien)
 * 4. Pemetaan Kolom Excel ke Kolom Internal
 * 5. Kategori dan Kelompok Umur Analisis
 */

const CONFIG = {
  // ============================================================
  // 1. IDENTITAS MAHASISWA & AKADEMIK
  // ============================================================
  identitas: {
    namaMahasiswa: "Eva Risqiyanti",
    nim: "0623015731",
    prodi: "Kesehatan Masyarakat",
    fakultas: "Fakultas Ilmu Kesehatan",
    universitas: "Universitas Pekalongan",
    dosenPembimbing: "Jaya Maulana, S.KM.,M.Kes",
    dinas: "Dinas Kesehatan Kabupaten Pekalongan"
  },

  // ============================================================
  // 2. SUMBER DATA LIVE & POLLING
  // ============================================================
  // URL CSV Google Sheets dari menu File -> Share -> Publish to Web -> CSV
  // Contoh: 'https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pub?output=csv'
  // Kosongkan ('') jika ingin menggunakan data contoh lokal dari js/data.js
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT6N3JNCRmqeRy2XNk3jhwz6MwN65NxvoOVoyCHRPKZ6hF0-n4qWfnEH7MCkAAbkYvVEZ9kkFRs8TY2/pub?gid=1165050433&single=true&output=csv',

  // Cadangan lokal: data Dinkes (tanpa nama pasien) yang ikut dalam paket proyek.
  // Dipakai jika SHEET_CSV_URL kosong / gagal. Perlu dibuka lewat http:// (bukan file:///).
  DATA_CSV_LOKAL: 'data/data_campak.csv',

  // Pembaruan OTOMATIS: halaman memeriksa spreadsheet sendiri tiap beberapa detik,
  // pengunjung tidak perlu menekan tombol atau memuat ulang halaman.
  // Catatan: Google Sheets menahan (cache) hasil publikasi ~2-5 menit, jadi perubahan di
  // spreadsheet baru tampil setelah jeda itu, berapa pun interval di bawah ini.
  // Minimum 15 detik. Isi REFRESH_DETIK; REFRESH_MENIT hanya dipakai jika REFRESH_DETIK dikosongkan.
  REFRESH_DETIK: 60,
  REFRESH_MENIT: 1,

  // ============================================================
  // 3. PRIVASI & WHITELIST KOLOM (WAJIB)
  // ============================================================
  // Seluruh website dan ekspor HANYA memuat kolom yang ada di daftar ini.
  // Kolom identitas personal (seperti Nama Pasien, NIK, No. HP, Alamat Rumah/RT/RW)
  // TIDAK ADA di whitelist dan OTOMATIS DIBUANG saat data dibaca.
  WHITELIST_KOLOM: [
    'id',
    'tanggal_onset',
    'umur',
    'jenis_kelamin',
    'status_imunisasi',
    'status_kasus',
    'kecamatan',
    'desa',
    // Kolom tambahan dari format data Dinkes (semua bukan identitas pribadi)
    'umur_bulan', 'mcv1', 'mcv2', 'bias', 'igm_rubella', 'vit_a',
    'gejala_batuk', 'gejala_pilek', 'gejala_mata_merah', 'komplikasi', 'komplikasi_jenis', 'bepergian'
  ],

  // ============================================================
  // 4. PEMETAAN KOLOM EXCEL KE INTERNAL (KOLOM_MAP)
  // ============================================================
  // Menghubungkan berbagai kemungkinan penulisan header kolom di file Excel/Google Sheets
  // ke nama kolom standar sistem. Huruf besar/kecil diabaikan otomatis saat pencocokan.
  KOLOM_MAP: {
    'id': ['id', 'no', 'nomor', 'no_kasus', 'kode_kasus'],
    'tanggal_onset': [
      'tanggal_onset', 'tanggal_kasus', 'tgl_onset', 'tanggal', 'tgl_sakit', 
      'onset', 'date_of_onset', 'tanggal_gejala'
    ],
    'umur': ['umur', 'usia', 'age', 'umur_tahun', 'usia_tahun'],
    'jenis_kelamin': [
      'jenis_kelamin', 'jk', 'gender', 'sex', 'kelamin'
    ],
    'status_imunisasi': [
      'status_imunisasi', 'imunisasi', 'status_vaksin', 'vaksinasi',
      'riwayat_imunisasi', 'campak_mr'
    ],
    'status_kasus': [
      'status_kasus', 'status', 'klasifikasi', 'diagnosis', 'hasil_lab'
    ],
    'kecamatan': ['kecamatan', 'wilayah', 'distrik', 'subdistrict'],
    'desa': ['desa', 'kelurahan', 'desa_kelurahan', 'village']
  },

  // ============================================================
  // 5. KELOMPOK UMUR & KATEGORI FLEKSIBEL
  // ============================================================
  // Konfigurasi kelompok umur epidemiologi campak (revisi dosen pembimbing)
  // Batas awal: <1, 1–4, 5–9, 10–14, 15–19, 20+ tahun
  kelompokUmur: [
    { label: '<1 tahun', min: 0, max: 0 },
    { label: '1–4 tahun', min: 1, max: 4 },
    { label: '5–9 tahun', min: 5, max: 9 },
    { label: '10–14 tahun', min: 10, max: 14 },
    { label: '15–19 tahun', min: 15, max: 19 },
    { label: '20+ tahun', min: 20, max: 150 }
  ],

  // Nilai standar yang diakui untuk kategorisasi
  kategori: {
    jenis_kelamin: ['Laki-laki', 'Perempuan'],
    status_imunisasi: ['Lengkap', 'Tidak Lengkap', 'Belum', 'Tidak Diketahui'],
    status_kasus: ['Confirmed', 'Suspek', 'Discarded']
  },

  // Normalisasi singkatan atau ragam penulisan nilai data
  normalisasiNilai: {
    jenis_kelamin: {
      'L': 'Laki-laki',
      'LAKI-LAKI': 'Laki-laki',
      'LAKI': 'Laki-laki',
      'PRIA': 'Laki-laki',
      'M': 'Laki-laki',
      'P': 'Perempuan',
      'PEREMPUAN': 'Perempuan',
      'WANITA': 'Perempuan',
      'F': 'Perempuan'
    },
    status_imunisasi: {
      'LENGKAP': 'Lengkap',
      'TIDAK LENGKAP': 'Tidak Lengkap',
      'BELUM': 'Belum',
      'TIDAK': 'Belum',
      'BELUM IMUNISASI': 'Belum',
      'TIDAK DIKETAHUI': 'Tidak Diketahui',
      'UNKNOWN': 'Tidak Diketahui'
    },
    status_kasus: {
      'CONFIRMED': 'Confirmed',
      'KONFIRMASI': 'Confirmed',
      'POSITIF': 'Confirmed',
      'LAB': 'Confirmed',
      'SUSPEK': 'Suspek',
      'SUSPECT': 'Suspek',
      'KLINIS': 'Suspek',
      'DISCARDED': 'Discarded',
      'BUKAN': 'Discarded',
      'NEGATIF': 'Discarded'
    }
  }
};

// Ekspor ke window global untuk akses instan di script browser
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}
