/**
 * APP.JS – Logika Utama Dashboard Surveilans Campak Kab. Pekalongan
 * ===============================================================
 * Menangani:
 * - Inisialisasi Identitas dari CONFIG
 * - Manajemen Data Real-Time via DataLoader
 * - Pembaruan Grafik Reaktif (Chart.js tanpa reload kanvas)
 * - Peta Interaktif Leaflet (Titik Kasus, Choropleth Kasus, Choropleth Insidensi)
 * - Drill-down Kecamatan ke kecamatan.html?nama=...
 * - Analisis Korelasi Otomatis (Pearson, Spearman, Chi-Square, Fisher, OR) via Stats.js
 * - Global Moran's I Autokorelasi Spasial
 * - Pencarian, Pengurutan, Pagination, dan Penyamaran (<5) Tabel Laporan
 * - Ekspor Data CSV, Excel (.xlsx via SheetJS), Gambar PNG, dan Laporan PDF (jsPDF + html2canvas)
 */

// ============================================================
// VARIABEL GLOBAL & STATE
// ============================================================
let allData = [];
let filteredDataWaktu = [];
let chartInstances = {}; // Menyimpan chart instance agar bisa di-update tanpa canvas recreate
let mapInstance = null;
let currentMapLayerType = 'titik'; // 'titik' | 'choropleth-kasus' | 'choropleth-insidensi'
let mapLayerGroup = null;
let mapLegendControl = null;
let geojsonData = null;
let pendudukData = {}; // { 'Kecamatan': jumlahPenduduk }

// Palet warna biru konsisten
const CHART_COLORS = [
  '#0A3A66', '#0B6FB8', '#3A9AD9', '#6DB9E8',
  '#9CCBF3', '#C5DFF5', '#0958A0', '#1881CC'
];

const NAMA_BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

const NAMA_BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

// State Tabel Laporan
let reportSearchQuery = '';
let reportSortColumn = 'id';
let reportSortAsc = true;
let reportCurrentPage = 1;
const reportPageSize = 10;
let maskSmallReport = false;
let maskSmallKecamatan = false;

// ============================================================
// INISIALISASI UTAMA
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Tampilkan Identitas dari js/config.js
  renderIdentity();

  // 2. Inisialisasi Pengunduh Gambar Chart
  initChartDownloadListeners();

  // 3. Navigasi & Animasi
  initNavigation();
  initScrollAnimations();
  initScrollToTop();
  initFilterTahun();

  // 4. Inisialisasi Kontrol Laporan & Dokumen
  initReportControls();
  initCorrelationControls();
  initMapToolbar();

  // 5. Muat Data Penduduk & GeoJSON secara paralel
  await loadSpatialResources();

  // 6. Muat Data Utama via DataLoader
  try {
    allData = await DataLoader.init();
    filteredDataWaktu = [...allData];

    // Render semua komponen awal
    renderAllDashboardComponents();
  } catch (err) {
    console.error('Error saat inisialisasi data:', err);
  }

  // 7. Daftarkan Listener Pembaruan Data Real-Time (Live Polling / Manual Reload)
  DataLoader.onUpdate((newData, status) => {
    allData = newData;
    filteredDataWaktu = [...allData];
    updateAllDashboardComponents();
  });
});

// ============================================================
// 1. IDENTITAS MAHASISWA & AKADEMIK
// ============================================================
function renderIdentity() {
  if (!CONFIG || !CONFIG.identitas) return;
  const id = CONFIG.identitas;

  const setEl = (elemId, val) => {
    const el = document.getElementById(elemId);
    if (el) el.textContent = val || '';
  };

  setEl('top-univ', id.universitas || 'Universitas Pekalongan');
  setEl('top-fakultas', id.fakultas || 'Fakultas Ilmu Kesehatan');
  setEl('top-prodi', id.prodi || 'Program Studi Kesehatan Masyarakat');
  setEl('top-mhs', id.namaMahasiswa || '[Isi Nama Mahasiswa]');
  setEl('top-nim', id.nim ? `(NIM: ${id.nim})` : '');
  setEl('top-dosen', id.dosenPembimbing || '[Dosen Pembimbing]');
  setEl('top-dinas', id.dinas || 'Dinas Kesehatan Kab. Pekalongan');

  // Ringkasan di footer
  const foot = document.getElementById('footer-identity-summary');
  if (foot) {
    foot.innerHTML = `
      <span>${id.universitas} &bull; ${id.fakultas} &bull; ${id.prodi}</span><br>
      <span>Peneliti: <strong>${id.namaMahasiswa}</strong> ${id.nim ? `(${id.nim})` : ''} | Dosen Pembimbing: <strong>${id.dosenPembimbing}</strong></span><br>
      <span>Wilayah Mitra: <strong>${id.dinas}</strong></span>
    `;
  }
}

// ============================================================
// 2. RENDER SEMUA KOMPONEN DASHBOARD
// ============================================================
function renderAllDashboardComponents() {
  [
    updateStatusLabels, renderSummaryCards, renderChartOrang, renderChartWaktu,
    renderChartTempat, renderMap, renderAnalysis, renderImunisasi,
    renderInfoCards, renderCorrelation, renderReportTable
  ].forEach(fn => {
    try { fn(); } catch (e) { console.error('Gagal merender komponen ' + fn.name + ':', e); }
  });
}

/**
 * Pembaruan komponen reaktif tanpa membuat ulang kanvas
 */
function updateAllDashboardComponents() {
  // Tiap komponen dijalankan terpisah: jika satu error (mis. saat data 0 kasus),
  // komponen lain tetap diperbarui dan tidak menyisakan angka/grafik lama.
  [
    updateStatusLabels, renderSummaryCards, renderChartOrang, renderChartWaktu,
    renderChartTempat, updateMapLayer, renderAnalysis, renderImunisasi,
    renderInfoCards, renderCorrelation, renderReportTable
  ].forEach(fn => {
    try { fn(); } catch (e) { console.error('Gagal memperbarui komponen ' + fn.name + ':', e); }
  });
}

function updateStatusLabels() {
  const status = DataLoader.getStatus();
  const heroBadge = document.getElementById('hero-badge');
  const sampleBadges = document.querySelectorAll('[id$="-sample"]');

  if (status && status.isLive) {
    if (heroBadge) heroBadge.textContent = '🟢 Data Live (Google Sheets)';
    sampleBadges.forEach(b => {
      b.textContent = 'Data Live';
      b.style.borderColor = '#B7EBCE';
      b.style.color = '#1B873F';
    });
  } else if (status && status.source === 'lokal') {
    if (heroBadge) heroBadge.textContent = '🟡 Data Dinkes Kab. Pekalongan (salinan lokal)';
    sampleBadges.forEach(b => {
      b.textContent = 'Data Dinkes';
      b.style.borderColor = '#FFE7A8';
      b.style.color = '#8a6100';
    });
  } else {
    if (heroBadge) heroBadge.textContent = '⚠️ Data Contoh — Bukan Data Asli';
    sampleBadges.forEach(b => {
      b.textContent = 'Data contoh';
      b.style.borderColor = '';
      b.style.color = '';
    });
  }
}

// ============================================================
// 3. KARTU RINGKASAN (BERANDA)
// ============================================================
function renderSummaryCards() {
  const total = allData.length;
  const confirmed = allData.filter(d => d.status_kasus === 'Confirmed').length;
  const kecamatanSet = new Set(allData.map(d => d.kecamatan).filter(k => k && !/luar kab/i.test(k) && k !== 'Tidak Diketahui'));

  document.getElementById('total-kasus').textContent = total;
  document.getElementById('total-confirmed').textContent = confirmed;
  document.getElementById('total-kecamatan').textContent = kecamatanSet.size;
}

// ============================================================
// 4. DATA ORANG (FLEKSIBEL SESUAI CONFIG)
// ============================================================
function renderChartOrang() {
  // 1. Umur
  const containerUmur = document.getElementById('container-chart-umur');
  const hasUmurCol = allData.some(d => d.umur !== undefined && d.umur !== null);

  if (!hasUmurCol) {
    renderEmptyChartMsg(containerUmur, 'Kolom umur belum tersedia di data');
  } else {
    const kelompokUmurConfig = (CONFIG && CONFIG.kelompokUmur) || [
      { label: '<1 tahun', min: 0, max: 0 },
      { label: '1–4 tahun', min: 1, max: 4 },
      { label: '5–9 tahun', min: 5, max: 9 },
      { label: '10–14 tahun', min: 10, max: 14 },
      { label: '15–19 tahun', min: 15, max: 19 },
      { label: '20+ tahun', min: 20, max: 150 }
    ];

    const countUmur = {};
    kelompokUmurConfig.forEach(g => { countUmur[g.label] = 0; });
    allData.forEach(d => {
      const u = d.umur;
      const g = kelompokUmurConfig.find(item => u >= item.min && u <= item.max);
      if (g) countUmur[g.label]++;
    });

    createOrUpdateChart('chart-umur', 'bar', {
      labels: Object.keys(countUmur),
      datasets: [{
        label: 'Jumlah Kasus',
        data: Object.values(countUmur),
        backgroundColor: CHART_COLORS.slice(0, Object.keys(countUmur).length),
        borderRadius: 6,
        borderSkipped: false
      }]
    }, {
      scales: {
        x: { ticks: { font: { size: 10 } } }
      }
    }, 'Grafik kasus campak per kelompok umur');
  }

  // 2. Jenis Kelamin
  const containerJK = document.getElementById('container-chart-jk');
  const hasJKCol = allData.some(d => d.jenis_kelamin !== undefined && d.jenis_kelamin !== null);

  if (!hasJKCol) {
    renderEmptyChartMsg(containerJK, 'Kolom jenis kelamin belum tersedia di data');
  } else {
    const countJK = { 'Laki-laki': 0, 'Perempuan': 0 };
    allData.forEach(d => {
      if (d.jenis_kelamin === 'Laki-laki' || d.jenis_kelamin === 'L') countJK['Laki-laki']++;
      else countJK['Perempuan']++;
    });

    createOrUpdateChart('chart-jk', 'doughnut', {
      labels: Object.keys(countJK),
      datasets: [{
        data: Object.values(countJK),
        backgroundColor: ['#0B6FB8', '#9CCBF3'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    }, { cutout: '60%' }, 'Grafik kasus campak per jenis kelamin');
  }

  // 3. Status Imunisasi
  const containerImun = document.getElementById('container-chart-imunisasi-orang');
  const hasImunCol = allData.some(d => d.status_imunisasi !== undefined && d.status_imunisasi !== null);

  if (!hasImunCol) {
    renderEmptyChartMsg(containerImun, 'Kolom status imunisasi belum tersedia di data');
  } else {
    const countImun = {};
    allData.forEach(d => {
      const s = d.status_imunisasi || 'Tidak Diketahui';
      countImun[s] = (countImun[s] || 0) + 1;
    });

    createOrUpdateChart('chart-imunisasi-orang', 'bar', {
      labels: Object.keys(countImun),
      datasets: [{
        label: 'Jumlah Kasus',
        data: Object.values(countImun),
        backgroundColor: CHART_COLORS.slice(0, Object.keys(countImun).length),
        borderRadius: 6,
        borderSkipped: false
      }]
    }, {}, 'Grafik kasus campak per status imunisasi');
  }

  // 4. Status Kasus
  const containerStatus = document.getElementById('container-chart-status');
  const hasStatusCol = allData.some(d => d.status_kasus !== undefined && d.status_kasus !== null);

  if (!hasStatusCol) {
    renderEmptyChartMsg(containerStatus, 'Kolom status kasus belum tersedia di data');
  } else {
    const countStatus = {};
    allData.forEach(d => {
      const s = d.status_kasus || 'Suspek';
      countStatus[s] = (countStatus[s] || 0) + 1;
    });

    createOrUpdateChart('chart-status', 'pie', {
      labels: Object.keys(countStatus),
      datasets: [{
        data: Object.values(countStatus),
        backgroundColor: ['#0A3A66', '#0B6FB8', '#9CCBF3', '#C5DFF5'].slice(0, Object.keys(countStatus).length),
        borderWidth: 2,
        borderColor: '#fff'
      }]
    }, {}, 'Grafik kasus campak per status kasus');
  }

  // 5-8. Vitamin A, Bepergian, Komplikasi (kolom tambahan data Dinkes)
  renderChartKategoriSederhana('chart-vita', 'vit_a', ['Ya', 'Tidak', 'Tidak Tahu'], 'Kolom Vitamin A belum tersedia di data', 'Grafik kasus campak menurut pemberian vitamin A');
  renderChartKategoriSederhana('chart-bepergian', 'bepergian', ['Ya', 'Tidak', 'Tidak Tahu'], 'Kolom riwayat bepergian belum tersedia di data', 'Grafik riwayat bepergian satu bulan terakhir');
  renderChartKategoriSederhana('chart-komplikasi', 'komplikasi', ['Ya', 'Tidak'], 'Kolom komplikasi belum tersedia di data', 'Grafik kasus campak dengan dan tanpa komplikasi');

  const adaJenis = allData.some(d => d.komplikasi_jenis);
  const wadahJenis = document.getElementById('container-chart-komplikasi-jenis');
  if (wadahJenis && !wadahJenis.querySelector('canvas')) {
    wadahJenis.innerHTML = '<canvas id="chart-komplikasi-jenis"></canvas>';
  }
  if (!adaJenis) {
    renderEmptyChartMsg(wadahJenis, 'Tidak ada komplikasi yang dilaporkan pada data');
  } else {
    const hitungJenis = {};
    allData.forEach(d => {
      if (!d.komplikasi_jenis) return;
      String(d.komplikasi_jenis).split('|').forEach(j => { hitungJenis[j] = (hitungJenis[j] || 0) + 1; });
    });
    const urut = Object.entries(hitungJenis).sort((a, b) => b[1] - a[1]);
    createOrUpdateChart('chart-komplikasi-jenis', 'bar', {
      labels: urut.map(u => u[0]),
      datasets: [{
        label: 'Jumlah Kasus',
        data: urut.map(u => u[1]),
        backgroundColor: CHART_COLORS.slice(0, urut.length),
        borderRadius: 6,
        borderSkipped: false
      }]
    }, { indexAxis: 'y', plugins: { legend: { display: false } } }, 'Grafik jenis komplikasi pada kasus campak');
  }
}

/**
 * Grafik donat sederhana untuk kolom Ya/Tidak/Tidak Tahu
 */
function renderChartKategoriSederhana(canvasId, kolom, urutan, pesanKosong, ariaLabel) {
  const wadah = document.getElementById('container-' + canvasId);
  if (!wadah) return;
  if (!allData.some(d => d[kolom] !== undefined && d[kolom] !== null && d[kolom] !== '')) {
    renderEmptyChartMsg(wadah, pesanKosong);
    return;
  }
  if (!wadah.querySelector('canvas')) wadah.innerHTML = `<canvas id="${canvasId}"></canvas>`;
  const hitung = {};
  urutan.forEach(k => { hitung[k] = 0; });
  allData.forEach(d => {
    const v = d[kolom];
    if (v === undefined || v === null || v === '') return;
    hitung[v] = (hitung[v] || 0) + 1;
  });
  const label = Object.keys(hitung).filter(k => hitung[k] > 0);
  createOrUpdateChart(canvasId, 'doughnut', {
    labels: label,
    datasets: [{
      data: label.map(k => hitung[k]),
      backgroundColor: ['#0B6FB8', '#9CCBF3', '#C5DFF5', '#0A3A66'].slice(0, label.length),
      borderWidth: 2,
      borderColor: '#fff'
    }]
  }, { cutout: '55%' }, ariaLabel);
}

function renderEmptyChartMsg(container, message) {
  if (!container) return;
  container.innerHTML = `<div class="chart-empty-msg">${message}</div>`;
}

// ============================================================
// 5. DATA WAKTU
// ============================================================
function renderChartWaktu(tahunFilter = 'semua') {
  if (tahunFilter === 'semua') {
    filteredDataWaktu = [...allData];
  } else {
    filteredDataWaktu = allData.filter(d => d.tanggal_onset && d.tanggal_onset.startsWith(tahunFilter));
  }

  // Pemberitahuan jika data belum memuat tanggal kejadian (kasus Dinkes saat ini)
  const adaTanggal = allData.some(d => d.tanggal_onset);
  const noteWaktu = document.getElementById('note-tidak-ada-tanggal');
  if (noteWaktu) noteWaktu.style.display = adaTanggal ? 'none' : 'block';

  // Tren bulanan
  const bulanan = {};
  filteredDataWaktu.forEach(d => {
    if (d.tanggal_onset) {
      const key = d.tanggal_onset.substring(0, 7);
      bulanan[key] = (bulanan[key] || 0) + 1;
    }
  });

  const sortedKeys = Object.keys(bulanan).sort();
  const labelsBulanan = sortedKeys.map(k => {
    const [y, m] = k.split('-');
    return `${NAMA_BULAN[parseInt(m, 10) - 1]} ${y}`;
  });

  createOrUpdateChart('chart-bulanan', 'line', {
    labels: labelsBulanan,
    datasets: [{
      label: 'Jumlah Kasus',
      data: sortedKeys.map(k => bulanan[k]),
      borderColor: '#0B6FB8',
      backgroundColor: 'rgba(11,111,184,0.1)',
      fill: true,
      tension: 0.3,
      pointBackgroundColor: '#0A3A66',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  }, {
    scales: {
      x: { ticks: { maxRotation: 45, font: { size: 10 } } }
    }
  }, 'Grafik tren kasus campak per bulan');

  // Minggu epidemiologi
  const mingguan = {};
  filteredDataWaktu.forEach(d => {
    if (d.tanggal_onset) {
      const date = new Date(d.tanggal_onset);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const week = getEpiWeek(date);
        const key = `${year}-W${String(week).padStart(2, '0')}`;
        mingguan[key] = (mingguan[key] || 0) + 1;
      }
    }
  });

  const sortedWeeks = Object.keys(mingguan).sort();
  createOrUpdateChart('chart-mingguan', 'bar', {
    labels: sortedWeeks.map(k => k.replace('-W', ' MW')),
    datasets: [{
      label: 'Jumlah Kasus',
      data: sortedWeeks.map(k => mingguan[k]),
      backgroundColor: '#9CCBF3',
      borderColor: '#0B6FB8',
      borderWidth: 1,
      borderRadius: 4,
      borderSkipped: false
    }]
  }, {
    scales: {
      x: { ticks: { maxRotation: 90, font: { size: 9 } } }
    }
  }, 'Grafik tren kasus campak per minggu epidemiologi');
}

function getEpiWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ============================================================
// 6. DATA TEMPAT (GRAFIK & TABEL PER KECAMATAN)
// ============================================================
function renderChartTempat() {
  const perKec = {};
  allData.forEach(d => {
    if (d.kecamatan) {
      perKec[d.kecamatan] = (perKec[d.kecamatan] || 0) + 1;
    }
  });

  // Semua kecamatan resmi ikut ditampilkan, termasuk yang belum ada kasus (0),
  // supaya tidak ada kecamatan yang "hilang" dari grafik & tabel.
  if (typeof KECAMATAN_LIST !== 'undefined' && Array.isArray(KECAMATAN_LIST)) {
    KECAMATAN_LIST.forEach(k => { if (!(k in perKec)) perKec[k] = 0; });
  }
  const sorted = Object.entries(perKec).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'id'));
  const labels = sorted.map(s => s[0]);
  const values = sorted.map(s => s[1]);

  const maxVal = Math.max(...values, 1);
  const colors = values.map(v => {
    const ratio = v / maxVal;
    const r = Math.round(156 + (10 - 156) * ratio);
    const g = Math.round(203 + (58 - 203) * ratio);
    const b = Math.round(243 + (102 - 243) * ratio);
    return `rgb(${r},${g},${b})`;
  });

  // Tinggi kontainer menyesuaikan jumlah batang agar tiap label muat (~28px per kecamatan)
  const wadahKec = document.getElementById('chart-kecamatan') && document.getElementById('chart-kecamatan').parentElement;
  if (wadahKec) wadahKec.style.height = Math.max(420, labels.length * 28 + 70) + 'px';

  createOrUpdateChart('chart-kecamatan', 'bar', {
    labels: labels,
    datasets: [{
      label: 'Jumlah Kasus',
      data: values,
      backgroundColor: colors,
      borderRadius: 6,
      borderSkipped: false
    }]
  }, {
    indexAxis: 'y',
    scales: {
      x: { beginAtZero: true },
      // autoSkip:false -> SEMUA nama kecamatan tampil (tidak ada label yang dilewati)
      y: { ticks: { font: { size: 11 }, autoSkip: false } }
    }
  }, 'Grafik kasus campak per kecamatan');

  // Render Tabel Tempat
  const tbody = document.getElementById('tabel-kecamatan-body');
  if (tbody) {
    tbody.innerHTML = '';
    sorted.forEach((item, idx) => {
      const jml = item[1];
      const displayJml = maskSmallKecamatan && jml < 5 ? '<5' : jml;
      const pct = allData.length > 0 ? ((jml / allData.length) * 100).toFixed(1) : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td><strong>${item[0]}</strong></td>
        <td>${displayJml}</td>
        <td>${pct}%</td>
        <td>
          ${jml > 0 ? `<a href="kecamatan.html?nama=${encodeURIComponent(item[0])}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="padding:3px 10px;font-size:0.75rem;">
            Detail ↗
          </a>` : '<span style="color:#8A97A6;font-size:0.8rem;">Tidak ada kasus</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Inisialisasi tombol ekspor tabel kecamatan
  initKecamatanTableExports(sorted);
}

function initKecamatanTableExports(sortedKec) {
  const tgl = new Date().toISOString().split('T')[0];

  const btnCsv = document.getElementById('btn-export-kec-tabel-csv');
  if (btnCsv) {
    btnCsv.onclick = () => {
      const rows = sortedKec.map((item, idx) => ({
        'No': idx + 1,
        'Kecamatan': item[0],
        'Jumlah Kasus': maskSmallKecamatan && item[1] < 5 ? '<5' : item[1],
        'Persentase': (allData.length ? (item[1] / allData.length) * 100 : 0).toFixed(1) + '%'
      }));
      if (typeof Papa !== 'undefined') {
        const csv = Papa.unparse(rows);
        downloadBlob(csv, `kasus_per_kecamatan_pekalongan_${tgl}.csv`, 'text/csv;charset=utf-8;');
      }
    };
  }

  const btnExcel = document.getElementById('btn-export-kec-tabel-excel');
  if (btnExcel) {
    btnExcel.onclick = () => {
      const rows = sortedKec.map((item, idx) => ({
        'No': idx + 1,
        'Kecamatan': item[0],
        'Jumlah Kasus': maskSmallKecamatan && item[1] < 5 ? '<5' : item[1],
        'Persentase': (allData.length ? (item[1] / allData.length) * 100 : 0).toFixed(1) + '%'
      }));
      if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Kasus per Kecamatan');
        XLSX.writeFile(wb, `kasus_per_kecamatan_pekalongan_${tgl}.xlsx`);
      }
    };
  }

  const cbMask = document.getElementById('check-mask-kecamatan');
  if (cbMask && !cbMask.dataset.bound) {
    cbMask.dataset.bound = 'true';
    cbMask.addEventListener('change', () => {
      maskSmallKecamatan = cbMask.checked;
      renderChartTempat();
    });
  }
}

// ============================================================
// 7. PETA LEAFLET, CHOROPLETH & MORAN'S I
// ============================================================
async function loadSpatialResources() {
  // 1. Muat data penduduk dari data/penduduk.csv
  try {
    const res = await fetch('data/penduduk.csv');
    if (res.ok) {
      const csvText = await res.text();
      if (typeof Papa !== 'undefined') {
        const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
        parsed.data.forEach(row => {
          const kec = (row.kecamatan || row.Kecamatan || '').trim();
          const pop = parseInt(row.penduduk || row.Penduduk || '0', 10);
          if (kec && pop > 0) {
            pendudukData[kec.toLowerCase()] = pop;
          }
        });
      }
    }
  } catch (e) {
    console.warn('data/penduduk.csv belum tersedia atau gagal dimuat:', e);
  }

  // 2. Muat data GeoJSON dari data/kecamatan.geojson
  try {
    const resGeo = await fetch('data/kecamatan.geojson');
    if (resGeo.ok) {
      geojsonData = await resGeo.json();
    }
  } catch (e) {
    console.warn('data/kecamatan.geojson belum tersedia atau gagal dimuat:', e);
  }
}

// ============================================================
// WARNA PETA: HIJAU (rendah) - KUNING (sedang) - MERAH (tinggi)
// Dibagi tiga tingkat berdasarkan rasio terhadap nilai tertinggi.
// ============================================================
const WARNA_PETA = {
  nol:    '#9AA5B1',  // tidak ada kasus (abu-abu)
  rendah: '#2E9E4F',  // hijau
  sedang: '#F2C200',  // kuning
  tinggi: '#D62F2F'   // merah
};

function getRiskLevel(val, maxVal) {
  if (!val || val <= 0 || !maxVal) return 'nol';
  const ratio = val / maxVal;
  if (ratio <= 1 / 3) return 'rendah';
  if (ratio <= 2 / 3) return 'sedang';
  return 'tinggi';
}

function getRiskColor(val, maxVal) {
  return WARNA_PETA[getRiskLevel(val, maxVal)];
}

// Titik tengah (centroid sederhana) poligon GeoJSON, untuk meletakkan titik tepat di wilayahnya
function hitungTitikTengah(geometry) {
  const rings = [];
  if (!geometry) return null;
  if (geometry.type === 'Polygon') rings.push(geometry.coordinates[0]);
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(poly => rings.push(poly[0]));
  else return null;

  let A = 0, cx = 0, cy = 0;
  rings.forEach(ring => {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
      const f = x0 * y1 - x1 * y0;
      A += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
  });
  if (A === 0) {
    const pts = rings.flat();
    if (!pts.length) return null;
    return [pts.reduce((a, c) => a + c[1], 0) / pts.length, pts.reduce((a, c) => a + c[0], 0) / pts.length];
  }
  A *= 0.5;
  return [cy / (6 * A), cx / (6 * A)]; // [lat, lng]
}

// Titik tiap kecamatan: utamakan KOORDINAT_KECAMATAN (dihitung dari koordinat desa);
// jika ada kecamatan yang belum punya koordinat, pakai titik tengah dari GeoJSON.
function getKoordinatKecamatan() {
  const hasil = {};
  const utama = typeof KOORDINAT_KECAMATAN !== 'undefined' ? KOORDINAT_KECAMATAN : {};
  for (const [k, v] of Object.entries(utama)) hasil[k] = v;
  if (typeof geojsonData !== 'undefined' && geojsonData && geojsonData.features) {
    geojsonData.features.forEach(feat => {
      const p = feat.properties || {};
      const nama = p.kecamatan || p.KECAMATAN || p.nama || p.WADMKC || '';
      if (nama && !hasil[nama]) {
        const c = hitungTitikTengah(feat.geometry);
        if (c) hasil[nama] = c;
      }
    });
  }
  return hasil;
}

// Pemeriksaan kecamatan terhadap peta: kasus yang tidak bisa digambar + koreksi otomatis nama + batas wilayah perkiraan
function buatCatatanPeta(perKec) {
  const namaGeo = new Set();
  let semuaKotak = true;
  if (geojsonData && geojsonData.features) {
    geojsonData.features.forEach(f => {
      const p = f.properties || {};
      namaGeo.add(String(p.kecamatan || p.KECAMATAN || p.nama || p.WADMKC || '').toLowerCase());
      const ring = f.geometry && f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : null;
      if (!ring || ring.length !== 5) semuaKotak = false;
    });
  }
  const tidakTerpetakan = Object.entries(perKec).filter(([k]) => !namaGeo.has(k.toLowerCase()));
  const audit = (typeof DataLoader !== 'undefined' && DataLoader.getAudit) ? DataLoader.getAudit() : null;
  const baris = [];

  if (tidakTerpetakan.length) {
    const total = tidakTerpetakan.reduce((a, b) => a + b[1], 0);
    baris.push(`⚠️ <strong>${total} kasus belum masuk peta</strong> karena wilayahnya tidak ada di batas kecamatan: ` +
      tidakTerpetakan.map(([k, n]) => `${k} (${n})`).join(', ') + '. Periksa kolom Kecamatan di spreadsheet.');
  }
  if (audit) {
    const koreksi = Object.entries(audit.koreksi);
    if (koreksi.length) baris.push('✏️ <strong>Nama kecamatan dikoreksi otomatis:</strong> ' + koreksi.map(([k, n]) => `${k} (${n} baris)`).join('; ') + '.');
    const tdk = Object.entries(audit.tidakDikenal);
    if (tdk.length) baris.push('❓ <strong>Kecamatan tidak dikenal:</strong> ' + tdk.map(([k, n]) => `${k} (${n})`).join('; ') + '.');
  }
  if (geojsonData && geojsonData.features && semuaKotak) {
    baris.push('🗺️ <strong>Batas kecamatan masih berupa kotak perkiraan</strong> (bukan batas resmi). Ganti <code>data/kecamatan.geojson</code> dengan batas administrasi asli.');
  }
  return baris.length ? baris.join('<br>') : '';
}

// Batas peta: dari GeoJSON bila ada, jika tidak dari titik-titik kecamatan
function hitungBatasPeta() {
  try {
    if (geojsonData && geojsonData.features && geojsonData.features.length) {
      const b = L.geoJSON(geojsonData).getBounds();
      if (b && b.isValid && b.isValid()) return b;
    }
    const pts = Object.values(getKoordinatKecamatan());
    if (pts.length) return L.latLngBounds(pts);
  } catch (e) { console.warn('Gagal menghitung batas peta:', e); }
  return null;
}

function sesuaikanTampilanPeta() {
  if (!mapInstance) return;
  mapInstance.invalidateSize();
  const batas = hitungBatasPeta();
  if (batas) mapInstance.fitBounds(batas, { padding: [12, 12], maxZoom: 12 });
}

function renderMap() {
  if (!mapInstance) {
    mapInstance = L.map('peta-kasus', {
      center: [-7.02, 109.63],
      zoom: 10,
      zoomControl: true,
      // Roda mouse tidak zoom peta kecuali peta diklik dulu, supaya scroll halaman tidak "nyangkut".
      // Di HP, peta bisa digeser satu jari dan dicubit untuk zoom (tinggi peta dibatasi
      // agar masih ada ruang di atas/bawah peta untuk menggulir halaman).
      scrollWheelZoom: false
    });
    mapInstance.on('click', () => mapInstance.scrollWheelZoom.enable());
    mapInstance.on('mouseout', () => mapInstance.scrollWheelZoom.disable());

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18
    }).addTo(mapInstance);

    mapLayerGroup = L.layerGroup().addTo(mapInstance);

    // Pas-kan peta ke seluruh Kabupaten Pekalongan (sekali saat dibuat), lalu ikuti rotasi layar HP
    sesuaikanTampilanPeta();
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(sesuaikanTampilanPeta, 250);
    });
    window.addEventListener('orientationchange', () => setTimeout(sesuaikanTampilanPeta, 350));
  }

  updateMapLayer();
  setTimeout(sesuaikanTampilanPeta, 300);
}

function initMapToolbar() {
  const layerBtns = document.querySelectorAll('.layer-btn');
  layerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      layerBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMapLayerType = btn.dataset.layer;
      updateMapLayer();
    });
  });

  const btnUnduhPeta = document.getElementById('btn-unduh-peta');
  if (btnUnduhPeta) {
    btnUnduhPeta.onclick = async () => {
      const mapContainer = document.getElementById('peta-kasus');
      if (typeof html2canvas !== 'undefined' && mapContainer) {
        btnUnduhPeta.textContent = '⏳ Mengambil peta...';
        try {
          const canvas = await html2canvas(mapContainer, { useCORS: true, allowTaint: true });
          const url = canvas.toDataURL('image/png');
          const tgl = new Date().toISOString().split('T')[0];
          downloadBlobUrl(url, `peta_surveilans_campak_pekalongan_${tgl}.png`);
        } catch (e) {
          alert('Gagal mengekspor gambar peta. Silakan coba kembali.');
        } finally {
          btnUnduhPeta.textContent = '📷 Unduh peta (PNG)';
        }
      }
    };
  }
}

function updateMapLayer() {
  if (!mapInstance || !mapLayerGroup) return;
  mapLayerGroup.clearLayers();

  // Hitung jumlah kasus per kecamatan
  const perKec = {};
  allData.forEach(d => {
    if (d.kecamatan) {
      perKec[d.kecamatan] = (perKec[d.kecamatan] || 0) + 1;
    }
  });

  const noticeBox = document.getElementById('map-notice-box');
  const catatanPeta = buatCatatanPeta(perKec);

  // Cek apakah GeoJSON ada jika memilih choropleth
  const isChoropleth = currentMapLayerType === 'choropleth-kasus' || currentMapLayerType === 'choropleth-insidensi';
  if (isChoropleth && (!geojsonData || !geojsonData.features || geojsonData.features.length === 0)) {
    if (noticeBox) {
      noticeBox.style.display = 'block';
      noticeBox.innerHTML = `
        ℹ️ <strong>Informasi Peta:</strong> File <code>data/kecamatan.geojson</code> belum ditemukan.
        Sistem secara otomatis menampilkan <strong>Lapisan Titik Kasus</strong>.
      `;
    }
    renderMapTitikKasus(perKec);
    updateMapLegend(false, 'kasus');
    return;
  }

  if (noticeBox) {
    noticeBox.style.display = catatanPeta ? 'block' : 'none';
    noticeBox.innerHTML = catatanPeta;
  }

  if (currentMapLayerType === 'titik') {
    renderMapTitikKasus(perKec);
    updateMapLegend(false, 'kasus');
  } else if (currentMapLayerType === 'choropleth-kasus') {
    renderMapChoropleth(perKec, 'kasus');
    updateMapLegend(true, 'kasus');
  } else if (currentMapLayerType === 'choropleth-insidensi') {
    renderMapChoropleth(perKec, 'insidensi');
    updateMapLegend(true, 'insidensi');
  }

  // Hitung & Tampilkan Moran's I
  renderMoransICard(perKec);
}

function renderMapTitikKasus(perKec) {
  const maxKasus = Math.max(...Object.values(perKec), 1);
  const coordsObj = getKoordinatKecamatan();
  const kecil = window.innerWidth < 600;
  const rMin = kecil ? 13 : 11;
  const rRentang = kecil ? 9 : 13;

  // Gambar dari kasus terbanyak ke tersedikit: lingkaran besar di bawah, kecil di atas,
  // sehingga titik kecamatan yang berdekatan tetap kelihatan dan bisa diketuk.
  const daftar = Object.entries(coordsObj)
    .map(([kec, coords]) => ({ kec, coords, jumlah: perKec[kec] || 0 }))
    .filter(x => x.jumlah > 0)
    .sort((x, y) => y.jumlah - x.jumlah);

  daftar.forEach(({ kec, coords, jumlah }) => {
    const level = getRiskLevel(jumlah, maxKasus);
    const radius = rMin + (jumlah / maxKasus) * rRentang;
    const marker = L.circleMarker(coords, {
      radius: radius,
      fillColor: WARNA_PETA[level],
      color: '#FFFFFF',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85
    });

    const labelTingkat = { rendah: 'Rendah', sedang: 'Sedang', tinggi: 'Tinggi' }[level];
    marker.bindPopup(`
      <strong>Kecamatan ${kec}</strong><br>
      Jumlah kasus: <strong>${jumlah}</strong> (${labelTingkat})<br>
      <a href="kecamatan.html?nama=${encodeURIComponent(kec)}" target="_blank" rel="noopener" class="popup-link-detail">
        Lihat detail kecamatan ↗
      </a>
    `);
    // Angka kasus langsung terlihat di titiknya (tanpa harus mengetuk)
    marker.bindTooltip(String(jumlah), {
      permanent: true, direction: 'center', className: 'map-count-label lvl-' + level, opacity: 1
    });
    marker.on('click', () => marker.openPopup());
    mapLayerGroup.addLayer(marker);
  });
}

function renderMapChoropleth(perKec, metricType) {
  // Hitung nilai metrik per kecamatan
  const metricMap = {};
  let maxMetric = 0;

  geojsonData.features.forEach(feat => {
    const p = feat.properties;
    const namaKec = p.kecamatan || p.KECAMATAN || p.nama || p.WADMKC || '';
    const kasus = perKec[namaKec] || 0;

    let val = kasus;
    if (metricType === 'insidensi') {
      const pop = pendudukData[namaKec.toLowerCase()] || 0;
      val = pop > 0 ? (kasus / pop) * 100000 : 0;
    }
    metricMap[namaKec] = val;
    if (val > maxMetric) maxMetric = val;
  });

  if (maxMetric === 0) maxMetric = 1;

  const geoLayer = L.geoJSON(geojsonData, {
    style: function (feat) {
      const p = feat.properties;
      const nama = p.kecamatan || p.KECAMATAN || p.nama || p.WADMKC || '';
      const val = metricMap[nama] || 0;
      return {
        fillColor: getChoroplethColor(val, maxMetric),
        weight: 1.5,
        color: '#FFFFFF',
        fillOpacity: 0.75
      };
    },
    onEachFeature: function (feat, layer) {
      const p = feat.properties;
      const nama = p.kecamatan || p.KECAMATAN || p.nama || p.WADMKC || '';
      const kasus = perKec[nama] || 0;
      const val = metricMap[nama] || 0;
      const metricLabel = metricType === 'insidensi' ? `Insidensi: <strong>${val.toFixed(1)} / 100k</strong>` : `Jumlah kasus: <strong>${kasus}</strong>`;

      layer.bindPopup(`
        <strong>Kecamatan ${nama}</strong><br>
        ${metricLabel}<br>
        <a href="kecamatan.html?nama=${encodeURIComponent(nama)}" target="_blank" rel="noopener" class="popup-link-detail">
          Lihat detail kecamatan ↗
        </a>
      `);

      layer.on({
        mouseover: (e) => {
          const l = e.target;
          l.setStyle({ weight: 3, color: '#0A3A66', fillOpacity: 0.9 });
        },
        mouseout: (e) => {
          geoLayer.resetStyle(e.target);
        },
        click: () => {
          layer.openPopup();
        }
      });
    }
  });

  mapLayerGroup.addLayer(geoLayer);
}

function getChoroplethColor(val, maxVal) {
  return getRiskColor(val, maxVal);
}

function updateMapLegend(isChoropleth, metricType = 'kasus') {
  if (mapLegendControl) {
    mapInstance.removeControl(mapLegendControl);
    mapLegendControl = null;
  }

  mapLegendControl = L.control({ position: 'bottomright' });
  mapLegendControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-legend-box');
    const title = metricType === 'insidensi' ? 'Insidensi per 100k' : 'Jumlah Kasus';
    div.innerHTML = `
      <div class="map-legend-title">${title}</div>
      <div class="map-legend-item"><span class="map-legend-color" style="background:${WARNA_PETA.tinggi};"></span> Tinggi</div>
      <div class="map-legend-item"><span class="map-legend-color" style="background:${WARNA_PETA.sedang};"></span> Sedang</div>
      <div class="map-legend-item"><span class="map-legend-color" style="background:${WARNA_PETA.rendah};"></span> Rendah</div>
      <div class="map-legend-item"><span class="map-legend-color" style="background:${WARNA_PETA.nol};"></span> Tidak ada kasus</div>
    `;
    return div;
  };
  mapLegendControl.addTo(mapInstance);
}

function renderMoransICard(perKec) {
  const cardBox = document.getElementById('moran-card-box');
  if (!cardBox) return;

  if (!geojsonData || !geojsonData.features || geojsonData.features.length < 3) {
    cardBox.style.display = 'none';
    return;
  }

  if (typeof Stats !== 'undefined' && Stats.hitungMoransI) {
    const hasil = Stats.hitungMoransI(perKec, geojsonData);
    if (hasil) {
      cardBox.style.display = 'block';
      document.getElementById('moran-badge-val').textContent = `I = ${hasil.I.toFixed(3)}`;
      document.getElementById('moran-desc-val').innerHTML = hasil.interpretasi;
    } else {
      cardBox.style.display = 'none';
    }
  }
}

// ============================================================
// 8. ANALISIS DESKRIPTIF
// ============================================================
function renderAnalysis() {
  if (allData.length === 0) {
    const kosong = {
      'analisis-kecamatan': '–', 'analisis-kecamatan-val': '0 kasus',
      'analisis-bulan': '–', 'analisis-bulan-val': '0 kasus',
      'analisis-umur': '–', 'analisis-umur-val': '0 kasus',
      'analisis-imun': '0%', 'analisis-imun-val': '0 dari 0 kasus'
    };
    Object.entries(kosong).forEach(([id, teks]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = teks;
    });
    return;
  }

  // Kecamatan tertinggi
  const perKec = {};
  allData.forEach(d => { if (d.kecamatan) perKec[d.kecamatan] = (perKec[d.kecamatan] || 0) + 1; });
  const kecTertinggi = Object.entries(perKec).sort((a, b) => b[1] - a[1])[0] || ['–', 0];

  // Bulan puncak
  const perBulan = {};
  allData.forEach(d => {
    if (d.tanggal_onset) {
      const parts = d.tanggal_onset.split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10) - 1;
        const key = NAMA_BULAN_PANJANG[m] || '–';
        perBulan[key] = (perBulan[key] || 0) + 1;
      }
    }
  });
  const bulanPuncak = Object.entries(perBulan).sort((a, b) => b[1] - a[1])[0] || ['–', 0];

  // Kelompok umur terbanyak
  const kelompokUmurConfig = (CONFIG && CONFIG.kelompokUmur) || [];
  const perUmur = {};
  kelompokUmurConfig.forEach(g => { perUmur[g.label] = 0; });
  allData.forEach(d => {
    const u = d.umur;
    const g = kelompokUmurConfig.find(item => u >= item.min && u <= item.max);
    if (g) perUmur[g.label]++;
  });
  const umurTerbanyak = Object.entries(perUmur).sort((a, b) => b[1] - a[1])[0] || ['–', 0];

  // Persentase belum imunisasi
  const belumImun = allData.filter(d =>
    d.status_imunisasi === 'Belum' || d.status_imunisasi === 'Tidak Lengkap'
  ).length;
  const pctBelumImun = ((belumImun / allData.length) * 100).toFixed(1);

  document.getElementById('analisis-kecamatan').textContent = kecTertinggi[0];
  document.getElementById('analisis-kecamatan-val').textContent = `${kecTertinggi[1]} kasus`;
  document.getElementById('analisis-bulan').textContent = bulanPuncak[0];
  document.getElementById('analisis-bulan-val').textContent = `${bulanPuncak[1]} kasus`;
  document.getElementById('analisis-umur').textContent = umurTerbanyak[0];
  document.getElementById('analisis-umur-val').textContent = `${umurTerbanyak[1]} kasus`;
  document.getElementById('analisis-imun').textContent = `${pctBelumImun}%`;
  document.getElementById('analisis-imun-val').textContent = `${belumImun} dari ${allData.length} kasus`;
}

// ============================================================
// 9. IMUNISASI
// ============================================================
function renderImunisasi() {
  const kelompokUmurLabels = ((CONFIG && CONFIG.kelompokUmur) || []).map(k => k.label);
  const statusList = ['Lengkap', 'Tidak Lengkap', 'Belum', 'Tidak Diketahui'];
  const statusColors = ['#0A3A66', '#0B6FB8', '#9CCBF3', '#C5DFF5'];

  const dataPerGroup = {};
  statusList.forEach(s => {
    dataPerGroup[s] = new Array(kelompokUmurLabels.length).fill(0);
  });

  const kuConfig = (CONFIG && CONFIG.kelompokUmur) || [];

  allData.forEach(d => {
    const u = d.umur;
    const idx = kuConfig.findIndex(item => u >= item.min && u <= item.max);
    if (idx >= 0 && dataPerGroup[d.status_imunisasi]) {
      dataPerGroup[d.status_imunisasi][idx]++;
    }
  });

  createOrUpdateChart('chart-imun-umur', 'bar', {
    labels: kelompokUmurLabels,
    datasets: statusList.map((s, i) => ({
      label: s,
      data: dataPerGroup[s],
      backgroundColor: statusColors[i],
      borderRadius: 4,
      borderSkipped: false
    }))
  }, {
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true }
    }
  }, 'Grafik status imunisasi per kelompok umur');

  // Imunisasi vs Status Kasus
  const kasusStatusList = ['Confirmed', 'Suspek', 'Discarded'];
  const dataImunKasus = {};
  statusList.forEach(s => { dataImunKasus[s] = [0, 0, 0]; });

  allData.forEach(d => {
    const kIdx = kasusStatusList.indexOf(d.status_kasus);
    if (kIdx >= 0 && dataImunKasus[d.status_imunisasi]) {
      dataImunKasus[d.status_imunisasi][kIdx]++;
    }
  });

  createOrUpdateChart('chart-imun-kasus', 'bar', {
    labels: kasusStatusList,
    datasets: statusList.map((s, i) => ({
      label: s,
      data: dataImunKasus[s],
      backgroundColor: statusColors[i],
      borderRadius: 4,
      borderSkipped: false
    }))
  }, {
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true }
    }
  }, 'Grafik status imunisasi per status kasus');
}

// ============================================================
// 10. KARTU INFO SURVEILANS
// ============================================================
function renderInfoCards() {
  if (allData.length === 0) {
    const kosong = {
      'info-orang-val': '–', 'info-orang-desc': 'Belum ada data kasus',
      'info-waktu-val': '–', 'info-waktu-desc': 'Belum ada data kasus',
      'info-tempat-val': '–', 'info-tempat-desc': 'Belum ada data kasus'
    };
    Object.entries(kosong).forEach(([id, teks]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = teks;
    });
    return;
  }

  // Umur
  const kuConfig = (CONFIG && CONFIG.kelompokUmur) || [];
  const perUmur = {};
  kuConfig.forEach(g => { perUmur[g.label] = 0; });
  allData.forEach(d => {
    const u = d.umur;
    const g = kuConfig.find(item => u >= item.min && u <= item.max);
    if (g) perUmur[g.label]++;
  });
  const umurMax = Object.entries(perUmur).sort((a, b) => b[1] - a[1])[0] || ['–', 0];
  document.getElementById('info-orang-val').textContent = umurMax[0];
  document.getElementById('info-orang-desc').textContent = `Kelompok umur terbanyak (${umurMax[1]} kasus)`;

  // Bulan
  const perBulan = {};
  allData.forEach(d => {
    if (d.tanggal_onset) {
      const parts = d.tanggal_onset.split('-');
      if (parts.length >= 2) {
        const m = parseInt(parts[1], 10) - 1;
        const key = NAMA_BULAN_PANJANG[m] || '–';
        perBulan[key] = (perBulan[key] || 0) + 1;
      }
    }
  });
  const bulanMax = Object.entries(perBulan).sort((a, b) => b[1] - a[1])[0] || ['–', 0];
  document.getElementById('info-waktu-val').textContent = bulanMax[0];
  document.getElementById('info-waktu-desc').textContent = `Bulan kasus tertinggi (${bulanMax[1]} kasus)`;

  // Kecamatan
  const perKec = {};
  allData.forEach(d => { if (d.kecamatan) perKec[d.kecamatan] = (perKec[d.kecamatan] || 0) + 1; });
  const kecMax = Object.entries(perKec).sort((a, b) => b[1] - a[1])[0] || ['–', 0];
  document.getElementById('info-tempat-val').textContent = kecMax[0];
  document.getElementById('info-tempat-desc').textContent = `Kecamatan kasus terbanyak (${kecMax[1]} kasus)`;
}

// ============================================================
// 11. MENU BARU: KORELASI STATISTIK OTOMATIS (STATS.JS)
// ============================================================
function initCorrelationControls() {
  const btnHitung = document.getElementById('btn-hitung-korelasi');
  if (btnHitung) {
    btnHitung.addEventListener('click', () => {
      renderCorrelation();
    });
  }

  const presetBtns = document.querySelectorAll('.btn-preset');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const v1 = btn.dataset.v1;
      const v2 = btn.dataset.v2;
      document.getElementById('select-var-1').value = v1;
      document.getElementById('select-var-2').value = v2;
      renderCorrelation();
    });
  });
}

function getVariableValues(varKey) {
  const kuConfig = (CONFIG && CONFIG.kelompokUmur) || [];

  return allData.map(d => {
    if (varKey === 'umur') {
      return typeof d.umur === 'number' ? d.umur : null;
    }
    if (varKey === 'kelompok_umur') {
      const u = d.umur;
      if (typeof u !== 'number') return null;
      const match = kuConfig.find(g => u >= g.min && u <= g.max);
      return match ? match.label : 'Lainnya';
    }
    if (varKey === 'jenis_kelamin') {
      return d.jenis_kelamin || 'Tidak Diketahui';
    }
    if (varKey === 'status_imunisasi') {
      return d.status_imunisasi || 'Tidak Diketahui';
    }
    if (varKey === 'status_kasus') {
      return d.status_kasus || 'Suspek';
    }
    if (varKey === 'kecamatan') {
      return d.kecamatan || 'Tidak Diketahui';
    }
    return String(d[varKey] || '–');
  });
}

function renderCorrelation() {
  if (typeof Stats === 'undefined') return;

  const v1 = document.getElementById('select-var-1').value;
  const v2 = document.getElementById('select-var-2').value;

  let arr1 = getVariableValues(v1);
  let arr2 = getVariableValues(v2);
  // Hapus pasangan data yang kosong (mis. umur tidak tercatat) agar tidak mengacaukan uji
  {
    const kosong = v => v === null || v === undefined || v === '–' || (typeof v === 'number' && !isFinite(v));
    const keep = arr1.map((_, i) => !kosong(arr1[i]) && !kosong(arr2[i]));
    arr1 = arr1.filter((_, i) => keep[i]);
    arr2 = arr2.filter((_, i) => keep[i]);
  }

  const isV1Numeric = v1 === 'umur';
  const isV2Numeric = v2 === 'umur';

  const badgeMetode = document.getElementById('badge-metode-uji');
  const chipsWadah = document.getElementById('chips-metrik');
  const visualWadah = document.getElementById('wadah-visual-korelasi');
  const interpretasiWadah = document.getElementById('wadah-interpretasi');
  const judulGrafik = document.getElementById('judul-grafik-korelasi');

  // Kasus 1: NUMERIK vs NUMERIK (Umur vs Umur atau dua numerik)
  if (isV1Numeric && isV2Numeric) {
    badgeMetode.textContent = 'Uji Pearson & Spearman';
    judulGrafik.textContent = 'Scatter Plot & Garis Tren';

    const pRes = Stats.hitungPearson(arr1, arr2);
    const sRes = Stats.hitungSpearman(arr1, arr2);

    chipsWadah.innerHTML = `
      <div class="metric-chip"><div class="chip-label">Pearson r</div><div class="chip-value">${pRes.r.toFixed(3)}</div></div>
      <div class="metric-chip"><div class="chip-label">p-value (Pearson)</div><div class="chip-value">${pRes.p < 0.001 ? '<0.001' : pRes.p.toFixed(3)}</div></div>
      <div class="metric-chip"><div class="chip-label">Spearman &rho;</div><div class="chip-value">${sRes.r.toFixed(3)}</div></div>
      <div class="metric-chip"><div class="chip-label">Sampel (n)</div><div class="chip-value">${pRes.n}</div></div>
    `;

    visualWadah.innerHTML = '';
    interpretasiWadah.innerHTML = Stats.interpretasiKorelasi(pRes.r, pRes.p, pRes.n, 'Pearson');

    // Scatter plot
    const scatterData = arr1.map((val, i) => ({ x: val, y: arr2[i] }));
    createOrUpdateChart('chart-korelasi-canvas', 'scatter', {
      datasets: [{
        label: `${v1} vs ${v2}`,
        data: scatterData,
        backgroundColor: 'rgba(11, 111, 184, 0.65)',
        pointRadius: 4
      }]
    }, {
      scales: {
        x: { title: { display: true, text: v1 } },
        y: { title: { display: true, text: v2 } }
      }
    }, 'Scatter plot korelasi numerik');
    return;
  }

  // Kasus 2: KATEGORIK vs KATEGORIK
  if (!isV1Numeric && !isV2Numeric) {
    badgeMetode.textContent = 'Tabel Silang & Uji Chi-Square';
    judulGrafik.textContent = `Distribusi Kasus: ${v1} vs ${v2}`;

    const kontingensi = Stats.buatTabelKontingensi(arr1, arr2);
    const chiRes = Stats.hitungChiSquare(kontingensi);

    // Cek apakah tabel 2x2 untuk Odds Ratio & Fisher
    let orRes = null;
    let fisherP = null;
    const is2x2 = kontingensi.unikX.length === 2 && kontingensi.unikY.length === 2;

    if (is2x2) {
      const uX = kontingensi.unikX;
      const uY = kontingensi.unikY;
      const a = kontingensi.matriks[uX[0]][uY[0]];
      const b = kontingensi.matriks[uX[0]][uY[1]];
      const c = kontingensi.matriks[uX[1]][uY[0]];
      const d = kontingensi.matriks[uX[1]][uY[1]];

      orRes = Stats.hitungOddsRatio2x2(a, b, c, d);
      if (chiRes.adaExpectedKecil) {
        fisherP = Stats.hitungFisherExact2x2(a, b, c, d);
      }
    }

    let chipsHtml = `
      <div class="metric-chip"><div class="chip-label">&chi;&sup2; (Chi-Square)</div><div class="chip-value">${chiRes.chiSq.toFixed(2)}</div></div>
      <div class="metric-chip"><div class="chip-label">df</div><div class="chip-value">${chiRes.df}</div></div>
      <div class="metric-chip"><div class="chip-label">p-value</div><div class="chip-value">${chiRes.p < 0.001 ? '<0.001' : chiRes.p.toFixed(3)}</div></div>
      <div class="metric-chip"><div class="chip-label">Cramér's V</div><div class="chip-value">${chiRes.cramerV.toFixed(3)}</div></div>
    `;

    if (orRes) {
      chipsHtml += `
        <div class="metric-chip"><div class="chip-label">Odds Ratio (OR)</div><div class="chip-value">${orRes.or.toFixed(2)}</div></div>
        <div class="metric-chip"><div class="chip-label">95% CI</div><div class="chip-value" style="font-size:0.85rem;">${orRes.ciBawah.toFixed(2)}–${orRes.ciAtas.toFixed(2)}</div></div>
      `;
    }

    if (fisherP !== null) {
      chipsHtml += `<div class="metric-chip"><div class="chip-label">Fisher's Exact p</div><div class="chip-value">${fisherP < 0.001 ? '<0.001' : fisherP.toFixed(3)}</div></div>`;
    }

    chipsWadah.innerHTML = chipsHtml;

    // Render Tabel Silang Kontingensi
    let tableHtml = `
      <div style="overflow-x:auto;">
        <table class="cross-table">
          <thead>
            <tr>
              <th>${v1} \\ ${v2}</th>
              ${kontingensi.unikY.map(y => `<th>${y}</th>`).join('')}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
    `;

    kontingensi.unikX.forEach(x => {
      tableHtml += `<tr><td><strong>${x}</strong></td>`;
      kontingensi.unikY.forEach(y => {
        const count = kontingensi.matriks[x][y];
        tableHtml += `<td>${count}</td>`;
      });
      tableHtml += `<td class="total-cell">${chiRes.rowTotals[x]}</td></tr>`;
    });

    tableHtml += `
            <tr>
              <td class="total-cell"><strong>Total</strong></td>
              ${kontingensi.unikY.map(y => `<td class="total-cell">${chiRes.colTotals[y]}</td>`).join('')}
              <td class="total-cell"><strong>${kontingensi.n}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    visualWadah.innerHTML = tableHtml;
    interpretasiWadah.innerHTML = Stats.interpretasiChiSquare(chiRes.chiSq, chiRes.df, chiRes.p, chiRes.cramerV, chiRes.adaExpectedKecil, orRes, fisherP);

    // Visualisasi grafik stacked bar
    const datasetsStacked = kontingensi.unikY.map((yVal, idx) => ({
      label: yVal,
      data: kontingensi.unikX.map(xVal => kontingensi.matriks[xVal][yVal]),
      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
      borderRadius: 4
    }));

    createOrUpdateChart('chart-korelasi-canvas', 'bar', {
      labels: kontingensi.unikX,
      datasets: datasetsStacked
    }, {
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true }
      }
    }, 'Grafik perbandingan korelasi kategorik');
    return;
  }

  // Kasus 3: NUMERIK vs KATEGORIK
  const numArr = isV1Numeric ? arr1 : arr2;
  const catArr = isV1Numeric ? arr2 : arr1;
  const numKey = isV1Numeric ? v1 : v2;
  const catKey = isV1Numeric ? v2 : v1;

  badgeMetode.textContent = 'Perbandingan Nilai & Distribusi Kategori';
  judulGrafik.textContent = `Rata-rata ${numKey} berdasarkan ${catKey}`;

  // Hitung rata-rata per kategori
  const grup = {};
  catArr.forEach((c, idx) => {
    if (!grup[c]) grup[c] = [];
    grup[c].push(numArr[idx]);
  });

  const catLabels = Object.keys(grup);
  const catAverages = catLabels.map(c => {
    const vals = grup[c];
    return vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  });

  chipsWadah.innerHTML = `
    <div class="metric-chip"><div class="chip-label">Kategori</div><div class="chip-value">${catLabels.length}</div></div>
    <div class="metric-chip"><div class="chip-label">Total Sampel</div><div class="chip-value">${numArr.length}</div></div>
    <div class="metric-chip"><div class="chip-label">Rata-rata Tertinggi</div><div class="chip-value">${Math.max(...catAverages).toFixed(1)}</div></div>
    <div class="metric-chip"><div class="chip-label">Rata-rata Terendah</div><div class="chip-value">${Math.min(...catAverages).toFixed(1)}</div></div>
  `;

  let detailTable = `
    <div style="overflow-x:auto;">
      <table class="cross-table">
        <thead>
          <tr>
            <th>Kategori (${catKey})</th>
            <th>Jumlah Kasus (n)</th>
            <th>Rata-rata Umur</th>
            <th>Min – Max</th>
          </tr>
        </thead>
        <tbody>
  `;

  catLabels.forEach((c, idx) => {
    const vals = grup[c];
    const mean = catAverages[idx];
    const minVal = vals.length > 0 ? Math.min(...vals) : 0;
    const maxVal = vals.length > 0 ? Math.max(...vals) : 0;
    detailTable += `
      <tr>
        <td><strong>${c}</strong></td>
        <td>${vals.length}</td>
        <td>${mean.toFixed(1)} thn</td>
        <td>${minVal} – ${maxVal} thn</td>
      </tr>
    `;
  });

  detailTable += `</tbody></table></div>`;
  visualWadah.innerHTML = detailTable;

  interpretasiWadah.innerHTML = `
    Perbandingan nilai variabel <strong>${numKey}</strong> menurut kategori <strong>${catKey}</strong> menunjukkan rata-rata tertinggi berada pada kelompok <strong>${catLabels[catAverages.indexOf(Math.max(...catAverages))]}</strong> (${Math.max(...catAverages).toFixed(1)} tahun) dan terendah pada kelompok <strong>${catLabels[catAverages.indexOf(Math.min(...catAverages))]}</strong> (${Math.min(...catAverages).toFixed(1)} tahun).
  `;

  createOrUpdateChart('chart-korelasi-canvas', 'bar', {
    labels: catLabels,
    datasets: [{
      label: `Rata-rata ${numKey}`,
      data: catAverages.map(a => parseFloat(a.toFixed(1))),
      backgroundColor: CHART_COLORS.slice(0, catLabels.length),
      borderRadius: 6
    }]
  }, {
    scales: {
      y: { beginAtZero: true }
    }
  }, 'Grafik rata-rata numerik per kategori');
}

// ============================================================
// 12. MENU BARU: LAPORAN, PAGINATION, PENCARIAN & PRIVASI
// ============================================================
function initReportControls() {
  // 1. Search
  const searchInput = document.getElementById('input-cari-kasus');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      reportSearchQuery = e.target.value.toLowerCase().trim();
      reportCurrentPage = 1;
      renderReportTable();
    });
  }

  // 2. Sorting
  const sortHeaders = document.querySelectorAll('#tabel-kasus-laporan th.sortable');
  sortHeaders.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (reportSortColumn === col) {
        reportSortAsc = !reportSortAsc;
      } else {
        reportSortColumn = col;
        reportSortAsc = true;
      }
      renderReportTable();
    });
  });

  // 3. Masking <5 checkbox
  const checkMask = document.getElementById('check-mask-laporan');
  if (checkMask) {
    checkMask.addEventListener('change', () => {
      maskSmallReport = checkMask.checked;
      renderReportTable();
    });
  }

  // 4. Pagination Buttons
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (reportCurrentPage > 1) {
        reportCurrentPage--;
        renderReportTable();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const filtered = getFilteredReportData();
      const maxPages = Math.ceil(filtered.length / reportPageSize) || 1;
      if (reportCurrentPage < maxPages) {
        reportCurrentPage++;
        renderReportTable();
      }
    });
  }

  // 5. Ekspor CSV Laporan
  const btnCsv = document.getElementById('btn-export-laporan-csv');
  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      exportReportData('csv');
    });
  }

  // 6. Ekspor Excel Laporan
  const btnExcel = document.getElementById('btn-export-laporan-excel');
  if (btnExcel) {
    btnExcel.addEventListener('click', () => {
      exportReportData('excel');
    });
  }

  // 7. Ekspor Laporan PDF Lengkap
  const btnPdf = document.getElementById('btn-export-pdf');
  if (btnPdf) {
    btnPdf.addEventListener('click', () => {
      exportReportPDF();
    });
  }

  // 8. Dokumen placeholder download
  const docBtns = document.querySelectorAll('.btn-doc-download');
  docBtns.forEach(b => {
    b.addEventListener('click', () => {
      const docName = b.dataset.doc;
      alert(`[Placeholder] Mengunduh berkas laporan surveilans resmi: ${docName}`);
    });
  });
}

function getFilteredReportData() {
  const whitelist = (CONFIG && CONFIG.WHITELIST_KOLOM) || [];

  let list = allData.filter(row => {
    if (!reportSearchQuery) return true;
    return (
      String(row.kecamatan || '').toLowerCase().includes(reportSearchQuery) ||
      String(row.desa || '').toLowerCase().includes(reportSearchQuery) ||
      String(row.status_kasus || '').toLowerCase().includes(reportSearchQuery) ||
      String(row.status_imunisasi || '').toLowerCase().includes(reportSearchQuery) ||
      String(row.tanggal_onset || '').toLowerCase().includes(reportSearchQuery)
    );
  });

  // Sorting
  list.sort((a, b) => {
    let valA = a[reportSortColumn];
    let valB = b[reportSortColumn];

    if (valA === undefined) valA = '';
    if (valB === undefined) valB = '';

    if (typeof valA === 'number' && typeof valB === 'number') {
      return reportSortAsc ? valA - valB : valB - valA;
    }
    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return reportSortAsc ? strA.localeCompare(strB) : strB.localeCompare(strA);
  });

  return list;
}

function renderReportTable() {
  const filtered = getFilteredReportData();
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / reportPageSize) || 1;

  if (reportCurrentPage > totalPages) reportCurrentPage = totalPages;
  if (reportCurrentPage < 1) reportCurrentPage = 1;

  const startIndex = (reportCurrentPage - 1) * reportPageSize;
  const pageRows = filtered.slice(startIndex, startIndex + reportPageSize);

  const tbody = document.getElementById('tabel-laporan-body');
  if (!tbody) return;

  tbody.innerHTML = '';
  pageRows.forEach((row, i) => {
    const no = startIndex + i + 1;
    const umurDisplay = maskSmallReport && row.umur < 5 ? '<5' : row.umur;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.id || no}</td>
      <td>${row.tanggal_onset || '–'}</td>
      <td>${umurDisplay} thn</td>
      <td>${row.jenis_kelamin || '–'}</td>
      <td>${row.status_imunisasi || '–'}</td>
      <td><strong>${row.status_kasus || '–'}</strong></td>
      <td>${row.kecamatan || '–'}</td>
      <td>${row.desa || '–'}</td>
    `;
    tbody.appendChild(tr);
  });

  // Info Pagination
  const infoEl = document.getElementById('pagination-info');
  if (infoEl) {
    const endCount = Math.min(startIndex + reportPageSize, totalItems);
    infoEl.textContent = `Menampilkan ${totalItems === 0 ? 0 : startIndex + 1}–${endCount} dari ${totalItems} data kasus (Hanya Kolom Whitelist)`;
  }

  const pageDisplay = document.getElementById('page-number-display');
  if (pageDisplay) pageDisplay.textContent = `${reportCurrentPage} / ${totalPages}`;

  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');
  if (btnPrev) btnPrev.disabled = reportCurrentPage <= 1;
  if (btnNext) btnNext.disabled = reportCurrentPage >= totalPages;
}

function exportReportData(format = 'csv') {
  const whitelist = (CONFIG && CONFIG.WHITELIST_KOLOM) || [];
  const tgl = new Date().toISOString().split('T')[0];

  // Penegakan Privasi: HANYA kolom whitelist yang disertakan
  const exportRows = allData.map(row => {
    const obj = {};
    whitelist.forEach(col => {
      let v = row[col] !== undefined ? row[col] : '';
      if (maskSmallReport && col === 'umur' && v < 5) v = '<5';
      obj[col] = v;
    });
    return obj;
  });

  if (format === 'csv') {
    if (typeof Papa !== 'undefined') {
      const csv = Papa.unparse(exportRows);
      downloadBlob(csv, `campak_pekalongan_${tgl}.csv`, 'text/csv;charset=utf-8;');
    }
  } else if (format === 'excel') {
    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data Kasus Whitelist');
      XLSX.writeFile(wb, `campak_pekalongan_${tgl}.xlsx`);
    }
  }
}

// ============================================================
// 13. EKSPOR LAPORAN PDF KOMPREHENSIF (JSPDF + HTML2CANVAS)
// ============================================================
async function exportReportPDF() {
  if (typeof jspdf === 'undefined') {
    alert('Library jsPDF belum tersedia.');
    return;
  }

  const btnPdf = document.getElementById('btn-export-pdf');
  const originalText = btnPdf ? btnPdf.textContent : '';
  if (btnPdf) btnPdf.textContent = '⏳ Menyusun Laporan PDF...';

  try {
    const { jsPDF } = jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const tglExport = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    const id = (CONFIG && CONFIG.identitas) || {};
    const status = DataLoader.getStatus();
    const statusText = status.isLive ? 'Data Live (Google Sheets)' : 'Data Contoh (Fiktif)';

    // 1. Header Identitas Akademik
    doc.setFillColor(11, 111, 184); // Biru utama
    doc.rect(0, 0, 210, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('LAPORAN SISTEM SURVEILANS KASUS CAMPAK', 105, 10, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`KABUPATEN PEKALONGAN — PERIODE 2026`, 105, 16, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`${id.universitas || ''} | ${id.fakultas || ''} | ${id.prodi || ''}`, 105, 22, { align: 'center' });

    // 2. Info Mahasiswa & Meta
    doc.setTextColor(43, 58, 77);
    doc.setFontSize(9);
    doc.text(`Penyusun: ${id.namaMahasiswa || '–'} ${id.nim ? `(NIM: ${id.nim})` : ''}`, 14, 34);
    doc.text(`Dosen Pembimbing: ${id.dosenPembimbing || '–'}`, 14, 39);
    doc.text(`Mitra / Lokasi: ${id.dinas || '–'}`, 14, 44);
    doc.text(`Tanggal Ekspor: ${tglExport} | Status Data: ${statusText}`, 14, 49);

    // Garis pemisah
    doc.setDrawColor(197, 223, 245);
    doc.line(14, 52, 196, 52);

    // 3. Ringkasan Kasus (Tabel / Kotak Ringkasan)
    const total = allData.length;
    const confirmed = allData.filter(d => d.status_kasus === 'Confirmed').length;
    const kecCount = new Set(allData.map(d => d.kecamatan).filter(Boolean)).size;
    const belumImun = allData.filter(d => d.status_imunisasi === 'Belum' || d.status_imunisasi === 'Tidak Lengkap').length;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(10, 58, 102);
    doc.text('1. RINGKASAN EPIDEMIOLOGI', 14, 58);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(43, 58, 77);
    doc.text(`• Total Kasus Terlaporkan: ${total} kasus`, 18, 64);
    doc.text(`• Kasus Konfirmasi Laboratorium (Confirmed): ${confirmed} kasus (${total > 0 ? ((confirmed / total) * 100).toFixed(1) : 0}%)`, 18, 69);
    doc.text(`• Wilayah Kecamatan Terdampak: ${kecCount} kecamatan`, 18, 74);
    doc.text(`• Kasus Belum / Tidak Lengkap Imunisasi: ${belumImun} kasus (${total > 0 ? ((belumImun / total) * 100).toFixed(1) : 0}%)`, 18, 79);

    // 4. Tangkapan Grafik Utama (Chart Umur & Chart Bulanan)
    let yPos = 88;
    const chartUmurCanvas = document.getElementById('chart-umur');
    const chartBulananCanvas = document.getElementById('chart-bulanan');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(10, 58, 102);
    doc.text('2. GRAFIK EPIDEMIOLOGIS UTAMA', 14, yPos);
    yPos += 6;

    if (chartUmurCanvas && chartInstances['chart-umur']) {
      const imgUmur = chartInstances['chart-umur'].toBase64Image();
      doc.addImage(imgUmur, 'PNG', 14, yPos, 88, 52);
    }
    if (chartBulananCanvas && chartInstances['chart-bulanan']) {
      const imgBulanan = chartInstances['chart-bulanan'].toBase64Image();
      doc.addImage(imgBulanan, 'PNG', 108, yPos, 88, 52);
    }

    yPos += 58;

    // 5. Analisis Korelasi Ringkas
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(10, 58, 102);
    doc.text('3. HASIL ANALISIS KORELASI & STATISTIK INFERENSIAL', 14, yPos);
    yPos += 6;

    const interpretasiText = document.getElementById('wadah-interpretasi')?.innerText || 'Analisis korelasi otomatis telah dijalankan.';
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(43, 58, 77);
    const splitInterpretasi = doc.splitTextToSize(interpretasiText, 182);
    doc.text(splitInterpretasi, 14, yPos);

    yPos += splitInterpretasi.length * 4.5 + 4;

    // 6. Catatan Privasi & Legalitas
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text('Catatan Privasi: Seluruh data dalam dokumen ini mematuhi standar kerahasiaan medis epidemiologi (tanpa nama & alamat individu).', 14, 280);

    const tgl = new Date().toISOString().split('T')[0];
    doc.save(`laporan_surveilans_campak_pekalongan_${tgl}.pdf`);
  } catch (err) {
    console.error('Error saat ekspor PDF:', err);
    alert('Terjadi kendala saat menyusun PDF. Silakan coba kembali.');
  } finally {
    if (btnPdf) btnPdf.textContent = originalText;
  }
}

// ============================================================
// 14. HELPER CHART.JS
// ============================================================
function createOrUpdateChart(canvasId, type, data, extraOptions = {}, ariaLabel = '') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (ariaLabel) {
    canvas.setAttribute('aria-label', ariaLabel);
    canvas.setAttribute('role', 'img');
  }

  // Jika chart sudah ada dan tipenya sama, perbarui data (tanpa canvas recreate)
  if (chartInstances[canvasId] && chartInstances[canvasId].config.type === type) {
    chartInstances[canvasId].data = data;
    chartInstances[canvasId].options = deepMerge(chartInstances[canvasId].options, extraOptions);
    chartInstances[canvasId].update();
    return;
  }

  // Jika tipe berubah atau belum ada, destroy dan buat baru
  if (chartInstances[canvasId]) {
    chartInstances[canvasId].destroy();
  }

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: type === 'pie' || type === 'doughnut' || (data.datasets && data.datasets.length > 1),
        position: 'bottom',
        labels: {
          padding: 12,
          usePointStyle: true,
          font: { family: "'Public Sans', sans-serif", size: 11 }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(10,58,102,0.92)',
        titleFont: { family: "'Public Sans', sans-serif" },
        bodyFont: { family: "'Public Sans', sans-serif" },
        cornerRadius: 8,
        padding: 10
      }
    },
    scales: type === 'pie' || type === 'doughnut' ? {} : {
      x: {
        grid: { display: false },
        ticks: { font: { family: "'Public Sans', sans-serif", size: 11 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(197,223,245,0.4)' },
        ticks: { font: { family: "'Public Sans', sans-serif", size: 11 } }
      }
    }
  };

  chartInstances[canvasId] = new Chart(canvas, {
    type: type,
    data: data,
    options: deepMerge(defaultOptions, extraOptions)
  });
}

function initChartDownloadListeners() {
  document.querySelectorAll('.btn-download-chart').forEach(btn => {
    btn.addEventListener('click', () => {
      const canvasId = btn.dataset.canvas;
      const chart = chartInstances[canvasId];
      if (chart) {
        const url = chart.toBase64Image();
        const tgl = new Date().toISOString().split('T')[0];
        downloadBlobUrl(url, `grafik_${canvasId}_${tgl}.png`);
      }
    });
  });
}

// ============================================================
// 15. NAVIGASI, ANIMASI & FILTER TAHUN
// ============================================================
function initNavigation() {
  const pills = document.querySelectorAll('.nav-pill');
  const sections = document.querySelectorAll('[data-section]');

  pills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = pill.getAttribute('href');
      const target = document.querySelector(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        pills.forEach(p => p.classList.remove('active'));
        const activePill = document.querySelector(`.nav-pill[href="#${id}"]`);
        if (activePill) {
          activePill.classList.add('active');
          const wrap = activePill.parentElement;
          if (wrap) {
            wrap.scrollLeft = activePill.offsetLeft - (wrap.clientWidth - activePill.offsetWidth) / 2;
          }
        }
      }
    });
  }, {
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  });

  sections.forEach(s => observer.observe(s));
}

function initScrollAnimations() {
  const elements = document.querySelectorAll('.fade-in');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  elements.forEach(el => observer.observe(el));
}

function initScrollToTop() {
  const btn = document.getElementById('scroll-top');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initFilterTahun() {
  const buttons = document.querySelectorAll('.filter-tahun');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tahun = btn.dataset.tahun;
      renderChartWaktu(tahun);
    });
  });
}

// ============================================================
// 16. UTILITY UMUM
// ============================================================
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function downloadBlob(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  downloadBlobUrl(url, filename);
}

function downloadBlobUrl(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
