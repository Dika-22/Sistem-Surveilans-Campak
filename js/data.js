/**
 * DATA CONTOH – Sistem Surveilans Kasus Campak Kabupaten Pekalongan
 * ================================================================
 * File ini adalah SATU-SATUNYA tempat data disimpan.
 * Semua angka, grafik, dan peta dihitung dari array `dataCampak` di bawah.
 *
 * CARA MENGGANTI DENGAN DATA ASLI:
 * --------------------------------
 * Opsi 1: Ganti langsung isi array `dataCampak` dengan data asli.
 *
 * Opsi 2: Ambil dari Google Sheets (CSV):
 *   1. Publikasikan Google Sheet sebagai CSV.
 *   2. Di js/app.js, ubah fungsi loadData() menjadi:
 *      async function loadData() {
 *        const url = 'https://docs.google.com/spreadsheets/d/ID_SHEET/export?format=csv';
 *        const resp = await fetch(url);
 *        const csv  = await resp.text();
 *        return parseCSV(csv); // fungsi parsing CSV → array objek
 *      }
 *   3. Pastikan kolom CSV sama: id, tanggal_onset, umur, jenis_kelamin,
 *      status_imunisasi, status_kasus, kecamatan, desa.
 *
 * PERHATIAN: Data di bawah adalah DATA CONTOH / FIKTIF.
 *            Jangan digunakan untuk pengambilan keputusan.
 */

// Daftar kecamatan di Kabupaten Pekalongan
const KECAMATAN_LIST = [
  'Kandangserang', 'Paninggaran', 'Lebakbarang', 'Petungkriyono',
  'Talun', 'Doro', 'Karanganyar', 'Kajen', 'Kesesi', 'Sragi',
  'Bojong', 'Wonopringgo', 'Kedungwuni', 'Karangdadap', 'Buaran',
  'Tirto', 'Wiradesa', 'Siwalan', 'Wonokerto'
];

// Desa/kelurahan tiap kecamatan (nama wilayah asli; kasus yang memakainya tetap DATA CONTOH)
const DESA_PER_KECAMATAN = {
  "Kandangserang": ["Bodas", "Bojongkoneng", "Bubak", "Garungwiyoro", "Gembong", "Kandangserang", "Karanggondang", "Klesem", "Lambur", "Luragung", "Sukoharjo", "Tajur", "Trajumas", "Wangkelang"],
  "Paninggaran": ["Bedagung", "Botosari", "Domiyang", "Kaliboja", "Kaliombo", "Krandegan", "Lambanggelun", "Lumeneng", "Notogiwang", "Paninggaran", "Sawangan", "Tangeran", "Tenogo", "Werdi", "Winduaji"],
  "Lebakbarang": ["Bantarkulon", "Depok", "Kapundutan", "Kutorembet", "Lebakbarang", "Mendolo", "Pamutuh", "Sidomulyo", "Tembelangunung", "Timbangsari", "Wonosido"],
  "Petungkriyono": ["Curugmuncar", "Gumelem", "Kasimpar", "Kayupuring", "Simego", "Songgodadi", "Tlogohendro", "Tlogopakis", "Yosorejo"],
  "Talun": ["Banjarsari", "Batursari", "Donowangun", "Jolotigo", "Kalirejo", "Karangasem", "Krompeng", "Mesoyi", "Sengare", "Talun"],
  "Doro": ["Bligorejo", "Doro", "Dororejo", "Harjosari", "Kalimojosari", "Kutosari", "Larikan", "Lemahabang", "Pungangan", "Randusari", "Rogoselo", "Sawangan", "Sidoharjo", "Wringinagung"],
  "Karanganyar": ["Banjarejo", "Gutomo", "Karanggondang", "Karangsari", "Kayugeritan", "Kulu", "Kutosari", "Legokalong", "Limbangan", "Lolong", "Pedawang", "Pododadi", "Sidomukti", "Sokosari", "Wonosari"],
  "Kajen": ["Brengkolang", "Gandarum", "Gejlig", "Kajen", "Kajongan", "Kalijoyo", "Kebonagung", "Kutorejo", "Kutorojo", "Linggoasri", "Nyamok", "Pekiringanageng", "Pekiringanalit", "Pringsurat", "Rowolaku", "Sabarwangi", "Salit", "Sambiroto", "Sangkanjoyo", "Sinangohprendeng", "Sukoyoso", "Tambakroto", "Tanjungkulon", "Tanjungsari", "Wonorejo"],
  "Kesesi": ["Brondong", "Jagung", "Kaibahan", "Kalimade", "Karangrejo", "Karyomukti", "Kesesi", "Krandon", "Kwasen", "Kwigaran", "Langensari", "Mulyorejo", "Pantirejo", "Podosari", "Ponolawen", "Sidomulyo", "Sidosari", "Srinahan", "Sukorejo", "Ujungnegoro", "Watugajah", "Watupayung", "Windurojo"],
  "Sragi": ["Bulakpelem", "Bulaksari", "Gebangkerep", "Kalijambe", "Kedungjaran", "Ketanonageng", "Klunjukan", "Krsakageng", "Mrican", "Purwodadi", "Purworejo", "Sijeruk", "Sragi", "Sumubkidul", "Sumublor", "Tegalontar", "Tegalsuruh"],
  "Bojong": ["Babalankidul", "Babalanlor", "Bojonglor", "Bojongminggir", "Bojongwetan", "Bukur", "Duwet", "Jajarwayang", "Kalipancur", "Karagsari", "Kemasan", "Ketitangkidul", "Ketitanglor", "Legokclile", "Menjangan", "Pantianom", "Randumuktiwaren", "Rejosari", "Sembungjambu", "Sumurjomblangbogo", "Wangandowo", "Wiroditan"],
  "Wonopringgo": ["Galangpengampon", "Getas", "Gondang", "Jetakkidul", "Jetaklengkong", "Kwagean", "Legokgunung", "Pengadentengah", "Rowokembu", "Sampih", "Sastrodirjan", "Surobayan", "Wonopringgo", "Wonorejo"],
  "Kedungwuni": ["Ambokembang", "Bugangan", "Karangdowo", "Kedungpatangewu", "Kedungwuni Barat", "Kedungwuni Timur", "Kwayangan", "Langkap", "Pajomblangan", "Pakisputih", "Pekajangan", "Podo", "Proto", "Rengas", "Rowocacing", "Salakbrojo", "Tangkilkulon", "Tangkiltengah", "Tosaran"],
  "Karangdadap": ["Jrebengkembang", "Kaligawe", "Kalilembu", "Karangdadap", "Kebonrowopucang", "Kebonsari", "Kedungkebo", "Logandeng", "Pagumenganmas", "Pangkah", "Pegandon"],
  "Buaran": ["Bligo", "Coprayan", "Kertijayan", "Pakumbulan", "Paweden", "Sapugarut", "Simbangkulon", "Simbangwetan", "Watusalam", "Wonoyoso"],
  "Tirto": ["Curug", "Dadirejo", "Jeruksari", "Karanganyar", "Karangjompo", "Mulyorejo", "Ngalian", "Pacar", "Pandanarum", "Pucung", "Samborejo", "Sidorejo", "Silirejo", "Tanjung", "Tegaldowo", "Wuled"],
  "Wiradesa": ["Bener", "Bondansari", "Delegtukang", "Gumawang", "Kadipaten", "Kampil", "Karangjati", "Kauman", "Kemplong", "Kepatihan", "Mayangan", "Pekuncen", "Petukangan", "Warukidul", "Warulor", "Wiradesa"],
  "Siwalan": ["Blacanan", "Blimbingwuluh", "Boyoteluk", "Depok", "Mejasem", "Pait", "Rembun", "Siwalan", "Tengengkulon", "Tengengwetan", "Tunjungsari", "Wonosari", "Yosorejo"],
  "Wonokerto": ["Api-api", "Bebel", "Pecakaran", "Pesanggrahan", "Rowoyoso", "Semut", "Sijambe", "Tratebang", "Werdi", "Wonokertokulon", "Wonokertowetan"]
};

// Titik tengah tiap kecamatan [lintang, bujur], dihitung dari koordinat desa/kelurahan di tiap kecamatan
// (nilai tengah dari data wilayah administrasi, bukan titik pusat pemerintahan).
// Jika ingin titik tepat di kantor kecamatan, ganti angkanya dengan koordinat dari Google Maps
// (klik kanan pada lokasi, lalu salin koordinatnya).
const KOORDINAT_KECAMATAN = {
  "Kandangserang": [-7.16281, 109.5261],
  "Paninggaran": [-7.16793, 109.58817],
  "Lebakbarang": [-7.14169, 109.66428],
  "Petungkriyono": [-7.15757, 109.74038],
  "Talun": [-7.02468, 109.73024],
  "Doro": [-7.03135, 109.68264],
  "Karanganyar": [-7.03012, 109.62033],
  "Kajen": [-7.04137, 109.57511],
  "Kesesi": [-7.00996, 109.51956],
  "Sragi": [-6.9488, 109.55147],
  "Bojong": [-6.96372, 109.60398],
  "Wonopringgo": [-6.98954, 109.63376],
  "Kedungwuni": [-6.9633, 109.65194],
  "Karangdadap": [-6.97617, 109.68834],
  "Buaran": [-6.93394, 109.65786],
  "Tirto": [-6.9093, 109.63847],
  "Wiradesa": [-6.89801, 109.61266],
  "Siwalan": [-6.89544, 109.58675],
  "Wonokerto": [-6.87365, 109.62631]
};

/**
 * Fungsi pembangkit angka acak sederhana dengan seed
 * agar data konsisten setiap kali halaman dibuka.
 */
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Membangkitkan data contoh campak.
 * Jumlah kasus: ~220, disebar 2024–2026 dengan puncak di bulan tertentu.
 */
function generateSampleData() {
  const rng = seededRandom(42);
  const kasus = [];
  let id = 1;

  const statusImunisasi = ['Lengkap', 'Tidak Lengkap', 'Belum', 'Tidak Diketahui'];
  const statusKasus     = ['Confirmed', 'Suspek', 'Discarded'];
  const jenisKelamin    = ['L', 'P'];

  // Bobot kecamatan (beberapa kecamatan lebih banyak kasus)
  const bobotKecamatan = {
    'Kedungwuni': 3, 'Kajen': 3, 'Buaran': 2.5, 'Tirto': 2.5,
    'Wonopringgo': 2, 'Sragi': 2, 'Kesesi': 2, 'Wiradesa': 2,
    'Bojong': 1.5, 'Karangdadap': 1.5, 'Siwalan': 1.5,
    'Kandangserang': 1, 'Paninggaran': 1, 'Lebakbarang': 0.8,
    'Petungkriyono': 0.6, 'Talun': 0.8, 'Doro': 1,
    'Karanganyar': 1, 'Wonokerto': 1.5
  };

  // Bobot bulan (puncak di bulan 3–5 dan 9–10)
  const bobotBulan = [0.6, 0.7, 1.5, 1.8, 1.6, 0.9, 0.7, 0.8, 1.4, 1.3, 0.8, 0.6];

  // Target kasus per tahun
  const targetPerTahun = { 2024: 85, 2025: 95, 2026: 45 }; // 2026 baru sampai ~Oktober

  for (const [tahun, target] of Object.entries(targetPerTahun)) {
    const maxBulan = tahun === '2026' ? 9 : 12; // 2026 hanya sampai Sep

    for (let i = 0; i < target; i++) {
      // Pilih bulan berdasarkan bobot
      let bulan = pickWeighted(bobotBulan.slice(0, maxBulan), rng);

      // Pilih kecamatan berdasarkan bobot
      const kecNames = Object.keys(bobotKecamatan);
      const kecWeights = kecNames.map(k => bobotKecamatan[k]);
      const kecIdx = pickWeighted(kecWeights, rng);
      const kecamatan = kecNames[kecIdx];

      // Pilih desa acak di kecamatan
      const desaList = DESA_PER_KECAMATAN[kecamatan];
      const desa = desaList[Math.floor(rng() * desaList.length)];

      // Tanggal acak dalam bulan itu
      const hari = Math.floor(rng() * 28) + 1;
      const tanggal = `${tahun}-${String(bulan + 1).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;

      // Umur: mayoritas anak 0–14, beberapa remaja/dewasa
      let umur;
      const umurRoll = rng();
      if (umurRoll < 0.35) umur = Math.floor(rng() * 5);          // 0–4
      else if (umurRoll < 0.65) umur = 5 + Math.floor(rng() * 5); // 5–9
      else if (umurRoll < 0.82) umur = 10 + Math.floor(rng() * 5);// 10–14
      else if (umurRoll < 0.92) umur = 15 + Math.floor(rng() * 10);// 15–24
      else umur = 25 + Math.floor(rng() * 20);                     // 25–44

      // Jenis kelamin
      const jk = jenisKelamin[rng() < 0.52 ? 0 : 1];

      // Status imunisasi (lebih banyak belum/tidak lengkap)
      let si;
      const siRoll = rng();
      if (siRoll < 0.20) si = 'Lengkap';
      else if (siRoll < 0.45) si = 'Tidak Lengkap';
      else if (siRoll < 0.75) si = 'Belum';
      else si = 'Tidak Diketahui';

      // Status kasus
      let sk;
      const skRoll = rng();
      if (skRoll < 0.45) sk = 'Confirmed';
      else if (skRoll < 0.80) sk = 'Suspek';
      else sk = 'Discarded';

      kasus.push({
        id: id++,
        tanggal_onset: tanggal,
        umur: umur,
        jenis_kelamin: jk,
        status_imunisasi: si,
        status_kasus: sk,
        kecamatan: kecamatan,
        desa: desa
      });
    }
  }

  return kasus;
}

/**
 * Memilih indeks berdasarkan bobot.
 */
function pickWeighted(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ============================================================
// DATA CONTOH – dibangkitkan saat file dimuat
// ============================================================
const dataCampak = generateSampleData();

/**
 * Fungsi loadData() – titik masuk tunggal untuk mengambil data.
 * Saat ini membaca dari variabel `dataCampak` di atas.
 *
 * UNTUK MENGGANTI DENGAN CSV DARI GOOGLE SHEETS:
 * -----------------------------------------------
 * async function loadData() {
 *   const SHEET_URL = 'https://docs.google.com/spreadsheets/d/ID/export?format=csv';
 *   const response = await fetch(SHEET_URL);
 *   const csvText = await response.text();
 *   const rows = csvText.split('\n').slice(1); // buang header
 *   return rows.filter(r => r.trim()).map((row, idx) => {
 *     const cols = row.split(',');
 *     return {
 *       id: idx + 1,
 *       tanggal_onset: cols[0].trim(),
 *       umur: parseInt(cols[1]),
 *       jenis_kelamin: cols[2].trim(),
 *       status_imunisasi: cols[3].trim(),
 *       status_kasus: cols[4].trim(),
 *       kecamatan: cols[5].trim(),
 *       desa: cols[6].trim()
 *     };
 *   });
 * }
 */
function loadData() {
  return dataCampak;
}
