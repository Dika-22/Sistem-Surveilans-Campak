/**
 * DATA-LOADER.JS – Pintu Gerbang Tunggal Pemuatan & Pembersihan Data
 * =================================================================
 * Digunakan oleh index.html dan kecamatan.html.
 *
 * FITUR:
 * 1. Mendukung pengambilan live dari Google Sheets CSV via PapaParse
 * 2. Fallback otomatis ke data contoh (js/data.js) jika URL kosong atau jaringan gagal
 * 3. Pembersihan data:
 *    - Penegakan WHITELIST: Kolom sensitif (nama, NIK, alamat lengkap) langsung DIBUANG
 *    - Pemetaan header fleksibel sesuai CONFIG.KOLOM_MAP
 *    - Normalisasi nama kecamatan & nilai kategori
 *    - Abaikan baris kosong dan baris dengan tanggal tidak valid
 * 4. Pembaruan OTOMATIS tanpa menekan tombol / reload halaman:
 *    - cek berkala tiap CONFIG.REFRESH_DETIK detik (default 60)
 *    - ditunda saat tab tidak aktif, langsung cek saat tab dibuka lagi / internet pulih
 *    - layar hanya digambar ulang bila isi data benar-benar berubah
 *    (Catatan: Google Sheets Publish to Web memiliki latensi cache 2-5 menit)
 * 5. Event listener untuk pembaruan komponen reaktif tanpa reload halaman
 */

const DataLoader = (function () {
  // State internal
  let currentData = [];
  let isLive = false;
  let hadLiveData = false;
  let lastUpdated = null;
  let lastError = null;
  let sourceLabel = 'contoh';
  let pollTimer = null;
  const updateListeners = [];

  // --- Status pembaruan otomatis ---
  let lastChecked = null;      // kapan terakhir mengecek sumber data (berhasil maupun gagal)
  let lastSignature = '';      // sidik jari data terakhir: layar hanya digambar ulang bila data benar-benar berubah
  let lastStateKey = '';       // live / lokal / contoh
  let inFlight = null;         // cegah dua pengambilan data berjalan bersamaan
  let failCount = 0;           // gagal beruntun -> jeda pengecekan diperlambat (backoff)
  let nextCheckAt = null;      // waktu pengecekan otomatis berikutnya
  let tickTimer = null;        // penghitung mundur di status bar
  let flashUntil = 0;          // tampilkan "Data diperbarui" sebentar saat ada perubahan
  let lifecycleBound = false;

  /**
   * Cari padanan nama kolom internal berdasarkan nama kolom di file CSV/Excel
   */
  function mapHeaderToInternal(headerName) {
    if (!headerName) return null;
    const cleanHeader = String(headerName).trim().toLowerCase().replace(/[\s_-]+/g, '_');

    // Cek di KOLOM_MAP
    if (CONFIG && CONFIG.KOLOM_MAP) {
      for (const [internalKey, aliases] of Object.entries(CONFIG.KOLOM_MAP)) {
        if (internalKey.toLowerCase() === cleanHeader) return internalKey;
        for (const alias of aliases) {
          if (alias.toLowerCase() === cleanHeader) {
            return internalKey;
          }
        }
      }
    }

    // Cek langsung dengan whitelist
    const whitelist = (CONFIG && CONFIG.WHITELIST_KOLOM) || [];
    if (whitelist.includes(cleanHeader)) {
      return cleanHeader;
    }

    return null; // Kolom di luar whitelist (misal: nama_pasien, alamat) -> dibuang
  }

  // ============================================================
  // RESOLUSI NAMA KECAMATAN (mengikuti isi spreadsheet, bukan daftar tetap)
  // ============================================================
  // Urutan: (1) cocok persis dengan 19 kecamatan resmi -> (2) typo ejaan dikoreksi otomatis ->
  //         (3) kolom Kecamatan berisi nama DESA -> dipetakan ke kecamatan induknya ->
  //         (4) wilayah di luar Kab. Pekalongan (mis. "Pekalongan" = Kota) -> dipisah, tidak masuk peta
  const LUAR_KABUPATEN = { 'pekalongan': 'Kota Pekalongan (luar kab.)', 'kotapekalongan': 'Kota Pekalongan (luar kab.)' };
  let audit = { koreksi: {}, luar: {}, tidakDikenal: {} };

  const kunci = t => String(t || '').toLowerCase().replace(/[^a-z]/g, '');

  function jarakEdit(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[m][n];
  }

  // desa -> kecamatan, hanya untuk nama desa yang UNIK (desa kembar antar kecamatan diabaikan)
  let petaDesa = null;
  function getPetaDesa() {
    if (petaDesa) return petaDesa;
    petaDesa = {};
    const dobel = new Set();
    if (typeof DESA_PER_KECAMATAN !== 'undefined') {
      Object.entries(DESA_PER_KECAMATAN).forEach(([kec, list]) => list.forEach(ds => {
        const k = kunci(ds);
        if (petaDesa[k] && petaDesa[k] !== kec) dobel.add(k);
        petaDesa[k] = kec;
      }));
      dobel.forEach(k => delete petaDesa[k]);
    }
    return petaDesa;
  }

  function catat(kelompok, dari, ke) {
    const key = `${dari} → ${ke}`;
    audit[kelompok][key] = (audit[kelompok][key] || 0) + 1;
  }

  function resolveKecamatan(kecRaw) {
    const raw = String(kecRaw || '').trim();
    if (!raw) return 'Tidak Diketahui';
    const k = kunci(raw);
    const resmi = (typeof KECAMATAN_LIST !== 'undefined' && Array.isArray(KECAMATAN_LIST)) ? KECAMATAN_LIST : [];

    const persis = resmi.find(x => kunci(x) === k);
    if (persis) { if (persis !== raw && raw.toLowerCase() !== persis.toLowerCase()) catat('koreksi', raw, persis); return persis; }

    if (LUAR_KABUPATEN[k]) { catat('luar', raw, LUAR_KABUPATEN[k]); return LUAR_KABUPATEN[k]; }

    const induk = getPetaDesa()[k];
    if (induk) { catat('koreksi', `${raw} (nama desa)`, induk); return induk; }

    if (k.length >= 6) {
      const urut = resmi.map(x => ({ x, d: jarakEdit(k, kunci(x)) })).sort((a, b) => a.d - b.d);
      if (urut.length && urut[0].d <= 2 && (urut.length < 2 || urut[1].d > urut[0].d)) {
        catat('koreksi', raw, urut[0].x); return urut[0].x;
      }
    }

    const apaAdanya = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    catat('tidakDikenal', raw, apaAdanya);
    return apaAdanya;
  }

  /**
   * Validasi format tanggal YYYY-MM-DD
   */
  function parseAndValidateDate(val) {
    if (!val) return null;
    const s = String(val).trim();

    // Coba format YYYY-MM-DD
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      const parts = s.split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }

    // Coba format DD/MM/YYYY atau DD-MM-YYYY
    const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const m = parseInt(dmyMatch[2], 10);
      const y = parseInt(dmyMatch[3], 10);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }

    // Coba parse bawaan Date
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = parsed.getMonth() + 1;
      const d = parsed.getDate();
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    return null;
  }


  // ============================================================
  // ADAPTER FORMAT DATA DINKES (kolom asli spreadsheet Dinkes)
  // ============================================================
  // Spreadsheet Dinkes tidak memakai nama kolom internal sistem, sehingga diubah di sini:
  //  - 'Tahun' & 'Bulan'  = UMUR (tahun & bulan), BUKAN tanggal kejadian
  //  - Status imunisasi   = gabungan MCV1 + MCV2
  //  - Status kasus       = dari hasil IgM Campak (Positif = Confirmed, Negatif = Discarded)
  //  - 'Nama Kasus' TIDAK PERNAH disalin (privasi)

  function isDinkesFormat(raw) {
    if (!raw) return false;
    const keys = Object.keys(raw).map(k => k.trim().toLowerCase());
    return keys.includes('hasil igm campak') || keys.includes('mcv1 (9 bln)');
  }

  function ynNorm(v) {
    if (v === undefined || v === null) return '';
    const t = String(v).trim().toLowerCase();
    if (t === 'ya') return 'Ya';
    if (t === 'tidak') return 'Tidak';
    if (t === 'belum') return 'Belum';
    if (t === 'tidak tahu') return 'Tidak Tahu';
    return '';
  }

  // Jenis komplikasi (teks bebas Dinkes) -> daftar istilah baku, dipisah '|'
  function normalisasiKomplikasi(teks) {
    if (!teks) return undefined;
    const hasil = [];
    String(teks).split(/[,;\/]+/).forEach(p => {
      const t = p.trim().toLowerCase();
      if (!t) return;
      let n;
      if (t.includes('pneumonia')) n = 'Bronkopneumonia';
      else if (t.includes('diare')) n = 'Diare';
      else if (t.includes('arthralgia') || t.includes('artralgia')) n = 'Artralgia';
      else if (t.includes('malnutrisi')) n = 'Malnutrisi';
      else if (t.includes('ulkus')) n = 'Ulkus mukosa mulut';
      else n = t.charAt(0).toUpperCase() + t.slice(1);
      if (!hasil.includes(n)) hasil.push(n);
    });
    return hasil.length ? hasil.join('|') : undefined;
  }

  function adaptDinkesRow(raw) {
    const r = {};
    Object.keys(raw).forEach(k => { r[k.trim().toLowerCase()] = raw[k]; });
    const num = v => { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isNaN(n) ? null : n; };

    const th = num(r['tahun']);
    const bl = num(r['bulan']);
    let umur;            // dalam tahun; undefined = tidak diketahui
    if (th !== null) umur = Math.floor(th);
    else if (bl !== null) umur = 0;   // hanya bulan terisi -> bayi < 1 tahun

    const kecRaw = String(r['kecamatan'] || '').trim();
    const kecFix = kecRaw; // dikoreksi di resolveKecamatan()

    const mcv1 = ynNorm(r['mcv1 (9 bln)']);
    const mcv2 = ynNorm(r['mcv2 (18 bln)']);
    const bias = ynNorm(r['campak bias kelas 1 sd']);
    let imun = 'Tidak Diketahui';
    const nYa = [mcv1, mcv2].filter(x => x === 'Ya').length;
    const nTdk = [mcv1, mcv2].filter(x => x === 'Tidak' || x === 'Belum').length;
    if (nYa === 2) imun = 'Lengkap';
    else if (nYa === 1 && nTdk === 1) imun = 'Tidak Lengkap';
    else if (nYa === 0 && nTdk === 2) imun = 'Belum';

    const igm = String(r['hasil igm campak'] || '').trim().toLowerCase();
    const status = igm === 'positif' ? 'Confirmed' : igm === 'negatif' ? 'Discarded' : 'Suspek';

    const kompl = String(r['komplikasi (sebutkan)'] || '').trim();
    const out = {
      umur: umur,
      umur_bulan: bl === null ? undefined : bl,
      jenis_kelamin: r['jenis kelamin'],
      kecamatan: kecFix,
      desa: r['desa'],
      status_imunisasi: imun,
      status_kasus: status,
      mcv1: mcv1 || 'Tidak Tahu',
      mcv2: mcv2 || 'Tidak Tahu',
      bias: bias || 'Tidak Tahu',
      igm_rubella: String(r['hasil igm rubella'] || '').trim() || undefined,
      vit_a: ynNorm(r['vit a']) || undefined,
      gejala_batuk: ynNorm(r['gejala batuk']) || undefined,
      gejala_pilek: ynNorm(r['gejala pilek']) || undefined,
      gejala_mata_merah: ynNorm(r['gejala mata merah']) || undefined,
      komplikasi: kompl ? 'Ya' : 'Tidak',
      komplikasi_jenis: normalisasiKomplikasi(kompl),
      bepergian: ynNorm(r['bepergian dalam 1 bulan terakhir']) || undefined
    };
    // Jika suatu saat Dinkes menambahkan kolom tanggal onset, ikut dibaca
    ['tanggal kasus', 'tanggal_onset', 'tgl_onset', 'tanggal', 'tgl_sakit', 'onset', 'tanggal_gejala'].forEach(k => {
      if (!out.tanggal_onset && r[k]) out.tanggal_onset = r[k];
    });
    return out;
  }

  /**
   * Membersihkan satu baris data sesuai whitelist dan normalisasi
   */
  function cleanRow(rawRow, index) {
    // Baris yang semua selnya kosong (isi dihapus tapi barisnya masih ada di spreadsheet) -> abaikan
    if (rawRow && Object.values(rawRow).every(v => v === undefined || v === null || String(v).trim() === '')) {
      return null;
    }
    if (isDinkesFormat(rawRow)) rawRow = adaptDinkesRow(rawRow);
    const cleaned = {};
    const whitelist = (CONFIG && CONFIG.WHITELIST_KOLOM) || [];

    // Baca setiap properti di rawRow
    for (const [key, val] of Object.entries(rawRow)) {
      const internalKey = mapHeaderToInternal(key);

      // JIKA BUKAN BAGIAN DARI WHITELIST, JANGAN DIMASUKKAN (PRIVASI TERJAMIN)
      if (!internalKey || !whitelist.includes(internalKey)) {
        continue;
      }

      cleaned[internalKey] = typeof val === 'string' ? val.trim() : val;
    }

    // Validasi baris kosong
    const values = Object.values(cleaned);
    if (values.length === 0 || values.every(v => v === '' || v === null || v === undefined)) {
      return null;
    }

    // Normalisasi ID jika belum ada
    if (!cleaned.id) {
      cleaned.id = index + 1;
    }

    // Validasi & normalisasi tanggal onset
    // Tanggal onset bersifat OPSIONAL: data Dinkes saat ini belum memuat tanggal kejadian.
    // Jika ada tetapi formatnya rusak, baris tetap dipakai (tanpa tanggal) agar tidak ada kasus yang hilang.
    const validDate = parseAndValidateDate(cleaned.tanggal_onset);
    if (validDate) cleaned.tanggal_onset = validDate; else delete cleaned.tanggal_onset;

    // Normalisasi umur (angka bulat >= 0)
    // Umur kosong dibiarkan KOSONG (tidak dipaksa 0, agar tidak terhitung sebagai bayi <1 tahun)
    const rawUmur = parseInt(cleaned.umur, 10);
    if (isNaN(rawUmur)) delete cleaned.umur; else cleaned.umur = Math.max(0, rawUmur);

    // Normalisasi nilai Jenis Kelamin
    if (cleaned.jenis_kelamin) {
      const upperJK = String(cleaned.jenis_kelamin).trim().toUpperCase();
      if (CONFIG && CONFIG.normalisasiNilai && CONFIG.normalisasiNilai.jenis_kelamin[upperJK]) {
        cleaned.jenis_kelamin = CONFIG.normalisasiNilai.jenis_kelamin[upperJK];
      } else {
        cleaned.jenis_kelamin = upperJK.startsWith('L') ? 'Laki-laki' : 'Perempuan';
      }
    } else {
      cleaned.jenis_kelamin = 'Tidak Diketahui';
    }

    // Normalisasi Status Imunisasi
    if (cleaned.status_imunisasi) {
      const upperImun = String(cleaned.status_imunisasi).trim().toUpperCase();
      if (CONFIG && CONFIG.normalisasiNilai && CONFIG.normalisasiNilai.status_imunisasi[upperImun]) {
        cleaned.status_imunisasi = CONFIG.normalisasiNilai.status_imunisasi[upperImun];
      }
    } else {
      cleaned.status_imunisasi = 'Tidak Diketahui';
    }

    // Normalisasi Status Kasus
    if (cleaned.status_kasus) {
      const upperKasus = String(cleaned.status_kasus).trim().toUpperCase();
      if (CONFIG && CONFIG.normalisasiNilai && CONFIG.normalisasiNilai.status_kasus[upperKasus]) {
        cleaned.status_kasus = CONFIG.normalisasiNilai.status_kasus[upperKasus];
      }
    } else {
      cleaned.status_kasus = 'Suspek';
    }

    // Normalisasi Kecamatan & Desa
    cleaned.kecamatan = resolveKecamatan(cleaned.kecamatan);
    cleaned.desa = cleaned.desa ? String(cleaned.desa).trim() : 'Tidak Diketahui';

    return cleaned;
  }

  /**
   * Muat data dari Google Sheets (CSV) menggunakan PapaParse
   */
  async function fetchFromGoogleSheets(url) {
    audit = { koreksi: {}, luar: {}, tidakDikenal: {} }; // hitung ulang tiap pemuatan: kecamatan lama tidak tersisa
    // Anti-cache agresif: timestamp + random untuk mencegah data lama muncul
    const cacheBustUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now() + '&_r=' + Math.random().toString(36).slice(2);
    const response = await fetch(cacheBustUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    if (!response.ok) {
      throw new Error(`Gagal mengunduh CSV (${response.status}: ${response.statusText})`);
    }

    const csvText = await response.text();

    return new Promise((resolve, reject) => {
      if (typeof Papa === 'undefined') {
        reject(new Error('Library PapaParse belum dimuat'));
        return;
      }

      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: 'greedy', // baris berisi koma saja (",,,,,") juga dianggap kosong
        dynamicTyping: false,
        complete: function (results) {
          // Spreadsheet yang dikosongkan adalah kondisi SAH (0 kasus), bukan error.
          // Jangan di-reject, supaya web tidak jatuh ke data cadangan lama.
          const cleanedList = [];
          (results.data || []).forEach((row, idx) => {
            const cleaned = cleanRow(row, idx);
            if (cleaned) {
              cleanedList.push(cleaned);
            }
          });

          resolve(cleanedList);
        },
        error: function (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Sidik jari sederhana (djb2) agar perubahan data bisa dikenali tanpa membandingkan baris satu per satu
   */
  function signature(rows) {
    const str = JSON.stringify(rows);
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return rows.length + ':' + h;
  }

  /**
   * Pemuatan data utama (Live atau Fallback Contoh).
   * Aman dipanggil berulang: bila pengambilan sebelumnya masih berjalan, dipakai hasil yang sama.
   */
  function load() {
    if (inFlight) return inFlight;
    inFlight = doLoad().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function doLoad() {
    const sheetUrl = (CONFIG && CONFIG.SHEET_CSV_URL && CONFIG.SHEET_CSV_URL.trim()) || '';

    if (sheetUrl) {
      try {
        const liveRows = await fetchFromGoogleSheets(sheetUrl);
        currentData = liveRows;
        isLive = true;
        hadLiveData = true;
        lastUpdated = new Date();
        lastError = null;
      } catch (err) {
        lastError = err.message || 'Gagal terhubung ke Google Sheets';
        if (hadLiveData) {
          // Pernah berhasil mengambil data dari spreadsheet: pertahankan data live terakhir,
          // jangan diganti salinan lokal yang sudah usang.
          console.warn('Gagal menyegarkan Google Sheets, data live terakhir dipertahankan:', err);
        } else {
          console.warn('Gagal memuat Google Sheets CSV, beralih ke data cadangan:', err);
          currentData = await loadLocalOrSample();
          isLive = false;
          lastUpdated = new Date();
        }
      }
    } else {
      currentData = await loadLocalOrSample();
      lastUpdated = new Date();
      lastError = null;
    }

    lastChecked = new Date();
    failCount = lastError ? failCount + 1 : 0;

    // Gambar ulang hanya bila isi data / sumbernya berubah (tidak ada kedipan grafik tiap polling)
    const sig = signature(currentData);
    const stateKey = isLive + '|' + sourceLabel;
    const changed = sig !== lastSignature || stateKey !== lastStateKey;
    const firstLoad = lastSignature === '';
    lastSignature = sig;
    lastStateKey = stateKey;

    if (changed) {
      if (!firstLoad) flashUntil = Date.now() + 4000;
      notifyListeners();
    }
    updateStatusBadge();
    return currentData;
  }

  /**
   * Urutan cadangan: CSV lokal Dinkes (data/data_campak.csv) -> data contoh fiktif (js/data.js)
   */
  async function loadLocalOrSample() {
    sourceLabel = 'contoh';
    const path = CONFIG && CONFIG.DATA_CSV_LOKAL;
    if (path) {
      try {
        const rows = await fetchFromGoogleSheets(path);
        sourceLabel = 'lokal';
        return rows;
      } catch (e) {
        console.warn('CSV lokal tidak terbaca (buka lewat http://, bukan file:///). Memakai data contoh.', e);
      }
    }
    return loadSampleFallback();
  }

  /**
   * Fallback membaca data contoh lokal dari js/data.js
   * dengan tetap menerapkan pembersihan whitelist dan normalisasi
   */
  function loadSampleFallback() {
    let rawSample = [];
    if (typeof loadData === 'function') {
      rawSample = loadData();
    } else if (typeof dataCampak !== 'undefined' && Array.isArray(dataCampak)) {
      rawSample = dataCampak;
    } else if (typeof generateSampleData === 'function') {
      rawSample = generateSampleData();
    }

    const cleaned = [];
    rawSample.forEach((row, idx) => {
      const c = cleanRow(row, idx);
      if (c) cleaned.push(c);
    });
    return cleaned;
  }

  /**
   * Beri tahu semua komponen yang berlangganan
   */
  function notifyListeners() {
    updateListeners.forEach(fn => {
      try {
        fn(currentData, { isLive, lastUpdated, lastError });
      } catch (e) {
        console.error('Error saat memperbarui listener data:', e);
      }
    });
  }

  const pad2 = n => String(n).padStart(2, '0');
  const fmtJam = d => d ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';

  function intervalMs() {
    // REFRESH_DETIK (baru) diutamakan; REFRESH_MENIT (lama) tetap didukung
    const detik = Number(CONFIG && CONFIG.REFRESH_DETIK) || (Number(CONFIG && CONFIG.REFRESH_MENIT) || 1) * 60;
    return Math.max(15, detik) * 1000;
  }

  function intervalLabel() {
    const d = Math.round(intervalMs() / 1000);
    return d % 60 === 0 ? `${d / 60} menit` : `${d} detik`;
  }

  /**
   * Teks penghitung mundur di status bar (hanya mengubah satu elemen, tidak membangun ulang bar)
   */
  function renderCountdown() {
    const el = document.getElementById('status-next');
    const flash = document.getElementById('status-flash');
    if (flash) {
      const show = Date.now() < flashUntil;
      if (flash.hidden === show) flash.hidden = !show;
    }
    if (!el) return;
    let txt;
    if (document.hidden) txt = 'dijeda saat tab tidak aktif';
    else if (inFlight) txt = 'memeriksa data…';
    else if (nextCheckAt) {
      const sisa = Math.max(0, Math.round((nextCheckAt - Date.now()) / 1000));
      txt = `cek lagi ${Math.floor(sisa / 60)}:${pad2(sisa % 60)}`;
    } else txt = 'menunggu';
    if (failCount > 0) txt = 'koneksi bermasalah, mencoba lagi · ' + txt;
    if (el.textContent !== txt) el.textContent = txt;
  }

  /**
   * Update elemen status badge live / contoh di antarmuka
   */
  function updateStatusBadge() {
    const badgeContainer = document.getElementById('data-status-bar');
    if (!badgeContainer) return;

    const timeStr = fmtJam(lastUpdated);
    const isLiveClass = isLive ? 'status-live' : 'status-sample';
    const statusText = isLive ? '🟢 Data Live (Google Sheets)'
      : (sourceLabel === 'lokal' ? '🟡 Data Dinkes (salinan lokal)' : '⚠️ Data Contoh (Fiktif)');

    let warningHtml = '';
    if (isLive && currentData.length === 0) {
      warningHtml = `<span class="status-note">Spreadsheet saat ini tidak berisi data kasus (0 kasus)</span>`;
    } else if (lastError && hadLiveData) {
      warningHtml = `<span class="status-warning" title="${lastError}">Gagal menyegarkan, menampilkan data live terakhir</span>`;
    } else if (!isLive && CONFIG && CONFIG.SHEET_CSV_URL) {
      warningHtml = `<span class="status-warning" title="${lastError || ''}">Gagal terhubung ke Sheets, memakai data lokal</span>`;
    } else if (!isLive && sourceLabel === 'lokal') {
      warningHtml = `<span class="status-note">Belum terhubung ke Google Sheets (isi SHEET_CSV_URL di js/config.js)</span>`;
    } else if (!isLive) {
      warningHtml = `<span class="status-note">SHEET_CSV_URL belum diisi di js/config.js</span>`;
    }

    badgeContainer.innerHTML = `
      <div class="status-inner ${isLiveClass}">
        <span class="status-pill">${statusText}</span>
        <span class="status-time">Diperbarui <strong>${timeStr}</strong></span>
        <span class="status-auto" title="Data diperiksa otomatis tiap ${intervalLabel()}. Tidak perlu memuat ulang halaman.">🔄 Otomatis tiap ${intervalLabel()} · <span id="status-next"></span></span>
        <span class="status-flash" id="status-flash" role="status" aria-live="polite" hidden>✔ Data diperbarui</span>
        ${warningHtml}
        <button id="btn-reload-data" class="btn-reload btn-reload-icon" title="Periksa data sekarang" aria-label="Periksa data sekarang">⟳</button>
      </div>
    `;

    const reloadBtn = document.getElementById('btn-reload-data');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        reloadBtn.classList.add('spinning');
        load().finally(() => {
          scheduleNext();
          setTimeout(() => reloadBtn.classList.remove('spinning'), 500);
        });
      });
    }
    renderCountdown();
  }

  /**
   * Jadwal pengecekan otomatis berikutnya.
   * - setTimeout berantai (bukan setInterval) supaya tidak pernah tumpang tindih
   * - ditunda saat tab tersembunyi (hemat baterai & kuota HP), lanjut seketika saat tab dibuka lagi
   * - bila gagal berulang, jeda diperpanjang bertahap (maks. 5 menit) lalu kembali normal saat berhasil
   */
  function scheduleNext() {
    clearTimeout(pollTimer);
    if (document.hidden) { nextCheckAt = null; renderCountdown(); return; }
    const base = intervalMs();
    const wait = failCount > 0 ? Math.min(base * Math.pow(2, failCount), 5 * 60 * 1000) : base;
    nextCheckAt = Date.now() + wait;
    pollTimer = setTimeout(() => { load().finally(scheduleNext); }, wait);
    renderCountdown();
  }

  function bindLifecycle() {
    if (lifecycleBound || typeof document === 'undefined') return;
    lifecycleBound = true;

    // Tab dibuka kembali / aplikasi kembali dari background -> segarkan segera bila data sudah agak lama
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(pollTimer);
        nextCheckAt = null;
        renderCountdown();
        return;
      }
      const basi = !lastChecked || (Date.now() - lastChecked.getTime()) > 10000;
      (basi ? load() : Promise.resolve()).finally(scheduleNext);
    });
    // Koneksi internet pulih
    window.addEventListener('online', () => { failCount = 0; load().finally(scheduleNext); });
    // Halaman dipulihkan dari cache tombol "kembali" (terutama Safari/iOS)
    window.addEventListener('pageshow', (e) => { if (e.persisted) load().finally(scheduleNext); });

    tickTimer = setInterval(renderCountdown, 1000);
  }

  // Public API
  return {
    async init() {
      const data = await load();
      scheduleNext();
      bindLifecycle();
      return data;
    },
    getData() {
      return currentData;
    },
    getAudit() {
      return audit;
    },
    getStatus() {
      return { isLive, lastUpdated, lastChecked, nextCheckAt, lastError, source: sourceLabel };
    },
    onUpdate(callback) {
      if (typeof callback === 'function') {
        updateListeners.push(callback);
      }
    },
    reload() {
      return load().finally(scheduleNext);
    }
  };
})();

// Ekspor ke window global
if (typeof window !== 'undefined') {
  window.DataLoader = DataLoader;
}
