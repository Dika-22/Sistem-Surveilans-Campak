/**
 * STATS.JS – Analisis Korelasi & Analisis Spasial (Moran's I)
 * =========================================================
 * Modul ini menyediakan:
 * 1. Deteksi otomatis tipe data (Numerik vs Numerik, Kategorik vs Kategorik, Numerik vs Kategorik)
 * 2. Uji Pearson & Spearman r, p-value, n, scatter plot & tren
 * 3. Tabel silang (cross-tabulation), Chi-Square, p-value, Cramér's V
 * 4. Odds Ratio (OR) & 95% Confidence Interval untuk tabel 2x2
 * 5. Peringatan nilai harapan < 5 & Uji Eksak Fisher (2x2)
 * 6. Interpretasi otomatis dalam Bahasa Indonesia (arah, kekuatan, signifikansi alpha 0.05)
 * 7. Global Moran's I autokorelasi spasial berbasis bobot ketetanggaan wilayah
 */

const Stats = (function () {

  // ============================================================
  // DISTRIBUSI & STATISTIK MATEMATIKA
  // ============================================================

  /**
   * Log Gamma function Lanczos approximation
   */
  function logGamma(x) {
    const p = [
      676.5203681218851, -1259.1392167224028,
      771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.138571095836524,
      9.9843695780195716e-6, 1.5056327351493116e-7
    ];
    let g = 7;
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1;
    let a = 0.99999999999980993;
    for (let i = 0; i < p.length; i++) a += p[i] / (x + i + 1);
    let t = x + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  /**
   * Regularized lower incomplete gamma function P(s, x)
   */
  function lowerIncompleteGamma(s, x) {
    if (x <= 0) return 0;
    if (x < s + 1) {
      let sum = 1 / s;
      let term = 1 / s;
      for (let n = 1; n < 100; n++) {
        term *= x / (s + n);
        sum += term;
        if (term < sum * 1e-12) break;
      }
      return sum * Math.exp(-x + s * Math.log(x) - logGamma(s));
    }
    // Continued fraction
    let f = 1e-30;
    let c = 1e-30;
    let d = 0;
    for (let i = 1; i < 100; i++) {
      let a = (i % 2 === 1) ? ((i + 1) / 2 === 1 ? 1 : ((i + 1) / 2 - 1)) : -(s + i / 2 - 1);
      if (i > 1 && i % 2 === 1) a = -a; // correction handled below
      let an = (i === 1) ? 1 : (i % 2 === 0 ? (i / 2) - s : (i - 1) / 2);
      let bn = x + (i === 1 ? 0 : 0);
    }
    // Simple Wilson-Hilferty fallback for Chi-Square if needed
    return 1 - chiSquareCDF(x * 2, s * 2);
  }

  /**
   * Chi-Square Cumulative Distribution Function (1 - p-value)
   */
  // p-value EKSAK (setara SPSS): distribusi chi-square lewat fungsi gamma tak-lengkap
  function logGamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Q(a,x) = 1 - P(a,x): bagian ekor atas gamma tak-lengkap teregularisasi
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    const gln = logGamma(a);
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 500; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
      }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
    }
    let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (let i = 1; i <= 500; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return Math.exp(-x + a * Math.log(x) - gln) * h;
  }

  function chiSquarePValue(chiSq, df) {
    if (chiSq <= 0 || df <= 0) return 1.0;
    return Math.max(0, Math.min(1, gammaQ(df / 2, chiSq / 2)));
  }

  // Beta tak-lengkap teregularisasi (untuk p-value distribusi t)
  function betaI(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
    const front = Math.exp(lbeta + a * Math.log(x) + b * Math.log(1 - x));
    const cf = (xx, aa, bb) => {
      let qab = aa + bb, qap = aa + 1, qam = aa - 1, c = 1, d = 1 - qab * xx / qap;
      if (Math.abs(d) < 1e-300) d = 1e-300;
      d = 1 / d; let h = d;
      for (let m = 1; m <= 500; m++) {
        const m2 = 2 * m;
        let aa2 = m * (bb - m) * xx / ((qam + m2) * (aa + m2));
        d = 1 + aa2 * d; if (Math.abs(d) < 1e-300) d = 1e-300;
        c = 1 + aa2 / c; if (Math.abs(c) < 1e-300) c = 1e-300;
        d = 1 / d; h *= d * c;
        aa2 = -(aa + m) * (qab + m) * xx / ((aa + m2) * (qap + m2));
        d = 1 + aa2 * d; if (Math.abs(d) < 1e-300) d = 1e-300;
        c = 1 + aa2 / c; if (Math.abs(c) < 1e-300) c = 1e-300;
        d = 1 / d;
        const del = d * c; h *= del;
        if (Math.abs(del - 1) < 1e-14) break;
      }
      return h;
    };
    return x < (a + 1) / (a + b + 2)
      ? front * cf(x, a, b) / a
      : 1 - front * cf(1 - x, b, a) / b;
  }

  function normalCDF(z) {
    // Error function approximation
    const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
    const d = 0.3989422804014327 * Math.exp(-z * z / 2.0);
    const prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1.0 - prob : prob;
  }

  /**
   * p-value untuk t-distribution dengan df derajat kebebasan
   */
  function tDistributionPValue(t, df) {
    if (df <= 0) return 1.0;
    const absT = Math.abs(t);
    if (!isFinite(absT)) return 0;
    // p dua-sisi eksak: I_x(df/2, 1/2) dengan x = df/(df+t^2)
    return Math.max(0, Math.min(1, betaI(df / (df + absT * absT), df / 2, 0.5)));
  }

  // ============================================================
  // 1. KORELASI NUMERIK: PEARSON & SPEARMAN
  // ============================================================

  function hitungPearson(x, y) {
    const n = x.length;
    if (n < 3) return { r: 0, p: 1, n };

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    if (denX === 0 || denY === 0) return { r: 0, p: 1, n };

    const r = num / Math.sqrt(denX * denY);
    const clampedR = Math.max(-1, Math.min(1, r));
    const df = n - 2;
    const t = df > 0 && Math.abs(clampedR) < 1 ? clampedR * Math.sqrt(df / (1 - clampedR * clampedR)) : 999;
    const p = tDistributionPValue(t, df);

    return { r: clampedR, p, n };
  }

  function hitungRanks(arr) {
    const sorted = arr.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
    const ranks = new Array(arr.length);
    let i = 0;
    while (i < sorted.length) {
      let j = i;
      while (j < sorted.length - 1 && sorted[j + 1].val === sorted[j].val) {
        j++;
      }
      const rank = 1 + (i + j) / 2;
      for (let k = i; k <= j; k++) {
        ranks[sorted[k].idx] = rank;
      }
      i = j + 1;
    }
    return ranks;
  }

  function hitungSpearman(x, y) {
    const rankX = hitungRanks(x);
    const rankY = hitungRanks(y);
    return hitungPearson(rankX, rankY);
  }

  // ============================================================
  // 2. KORELASI KATEGORIK: TABEL SILANG, CHI-SQUARE, CRAMER'S V
  // ============================================================

  function buatTabelKontingensi(arrX, arrY) {
    const unikX = [...new Set(arrX)].filter(Boolean).sort();
    const unikY = [...new Set(arrY)].filter(Boolean).sort();

    // Inisialisasi matriks
    const matriks = {};
    unikX.forEach(ux => {
      matriks[ux] = {};
      unikY.forEach(uy => {
        matriks[ux][uy] = 0;
      });
    });

    for (let i = 0; i < arrX.length; i++) {
      const x = arrX[i];
      const y = arrY[i];
      if (matriks[x] && matriks[x][y] !== undefined) {
        matriks[x][y]++;
      }
    }

    return { unikX, unikY, matriks, n: arrX.length };
  }

  function hitungChiSquare(kontingensi) {
    const { unikX, unikY, matriks, n } = kontingensi;
    if (n === 0 || unikX.length < 2 || unikY.length < 2) {
      return {
        chiSq: 0,
        df: 0,
        p: 1,
        cramerV: 0,
        adaExpectedKecil: false,
        minExpected: 0,
        matriksExpected: {}
      };
    }

    const rowTotals = {};
    const colTotals = {};
    unikX.forEach(x => { rowTotals[x] = 0; });
    unikY.forEach(y => { colTotals[y] = 0; });

    unikX.forEach(x => {
      unikY.forEach(y => {
        const val = matriks[x][y];
        rowTotals[x] += val;
        colTotals[y] += val;
      });
    });

    let chiSq = 0;
    let adaExpectedKecil = false;
    let minExpected = Infinity;
    const matriksExpected = {};

    unikX.forEach(x => {
      matriksExpected[x] = {};
      unikY.forEach(y => {
        const exp = (rowTotals[x] * colTotals[y]) / n;
        matriksExpected[x][y] = exp;
        if (exp < 5) adaExpectedKecil = true;
        if (exp < minExpected) minExpected = exp;

        if (exp > 0) {
          const diff = matriks[x][y] - exp;
          chiSq += (diff * diff) / exp;
        }
      });
    });

    const r = unikX.length;
    const c = unikY.length;
    const df = (r - 1) * (c - 1);
    const p = chiSquarePValue(chiSq, df);

    // Cramér's V
    const minDim = Math.min(r - 1, c - 1);
    const cramerV = minDim > 0 ? Math.sqrt(chiSq / (n * minDim)) : 0;

    return {
      chiSq,
      df,
      p,
      cramerV: Math.min(1, cramerV),
      adaExpectedKecil,
      minExpected,
      rowTotals,
      colTotals,
      matriksExpected
    };
  }

  // ============================================================
  // 3. ODDS RATIO (OR) & FISHER'S EXACT (TABEL 2x2)
  // ============================================================

  function hitungOddsRatio2x2(a, b, c, d) {
    // a = terpapar sakit, b = terpapar tidak, c = non-terpapar sakit, d = non-terpapar tidak
    // Koreksi Haldane-Anscombe jika ada sel nol
    let adjA = a, adjB = b, adjC = c, adjD = d;
    if (a === 0 || b === 0 || c === 0 || d === 0) {
      adjA += 0.5;
      adjB += 0.5;
      adjC += 0.5;
      adjD += 0.5;
    }

    const or = (adjA * adjD) / (adjB * adjC);
    const seLnOR = Math.sqrt((1 / adjA) + (1 / adjB) + (1 / adjC) + (1 / adjD));
    const z = 1.96; // 95% CI
    const lnOR = Math.log(or);
    const ciBawah = Math.exp(lnOR - z * seLnOR);
    const ciAtas = Math.exp(lnOR + z * seLnOR);

    return { or, ciBawah, ciAtas };
  }

  function logFactorial(n) {
    let sum = 0;
    for (let i = 2; i <= n; i++) sum += Math.log(i);
    return sum;
  }

  function probFisherTable(a, b, c, d) {
    const n = a + b + c + d;
    const logP = logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d)
      - (logFactorial(n) + logFactorial(a) + logFactorial(b) + logFactorial(c) + logFactorial(d));
    return Math.exp(logP);
  }

  function hitungFisherExact2x2(a, b, c, d) {
    const pObserved = probFisherTable(a, b, c, d);
    const r1 = a + b;
    const r2 = c + d;
    const c1 = a + c;

    const minA = Math.max(0, c1 - r2);
    const maxA = Math.min(r1, c1);

    let pValue = 0;
    for (let x = minA; x <= maxA; x++) {
      const curA = x;
      const curB = r1 - x;
      const curC = c1 - x;
      const curD = r2 - curC;
      const p = probFisherTable(curA, curB, curC, curD);
      // Two-sided Fisher test
      if (p <= pObserved * 1.000000001) {
        pValue += p;
      }
    }
    return Math.min(1, pValue);
  }

  // ============================================================
  // 4. INTERPRETASI OTOMATIS (BAHASA INDONESIA)
  // ============================================================

  function interpretasiKorelasi(r, p, n, jenis = 'Pearson') {
    const absR = Math.abs(r);
    let kekuatan = 'Sangat Lemah';
    if (absR >= 0.80) kekuatan = 'Sangat Kuat';
    else if (absR >= 0.60) kekuatan = 'Kuat';
    else if (absR >= 0.40) kekuatan = 'Sedang';
    else if (absR >= 0.20) kekuatan = 'Lemah';

    const arah = r >= 0 ? 'positif (searah)' : 'negatif (berlawanan arah)';
    const isSignifikan = p < 0.05;

    let teks = `Berdasarkan uji ${jenis}, diperoleh nilai koefisien korelasi r = ${r.toFixed(3)} (p = ${p < 0.001 ? '<0.001' : p.toFixed(3)}). ` +
      `Hubungan tergolong <strong>${kekuatan}</strong> dengan arah <strong>${arah}</strong>. `;

    if (isSignifikan) {
      teks += `Terdapat korelasi yang <strong>signifikan secara statistik</strong> pada taraf nyata 5% (&alpha; = 0,05).`;
    } else {
      teks += `Korelasi <strong>tidak signifikan secara statistik</strong> pada taraf nyata 5% (&alpha; = 0,05), sehingga belum cukup bukti menyatakan adanya korelasi nyata dalam populasi.`;
    }

    if (n < 30) {
      teks += `<br><span class="text-warning-sm">⚠️ Perhatian: Jumlah data (n = ${n}) relatif sedikit. Hasil uji inferensial perlu disikapi hati-hati.</span>`;
    }

    return teks;
  }

  function interpretasiChiSquare(chiSq, df, p, cramerV, adaExpectedKecil, orInfo = null, fisherP = null) {
    let kekuatan = 'Sangat Lemah';
    if (cramerV >= 0.50) kekuatan = 'Sangat Kuat';
    else if (cramerV >= 0.30) kekuatan = 'Kuat';
    else if (cramerV >= 0.15) kekuatan = 'Sedang';
    else if (cramerV >= 0.08) kekuatan = 'Lemah';

    const isSignifikan = (fisherP !== null ? fisherP : p) < 0.05;

    let teks = `Uji Chi-Square menghasilkan nilai &chi;&sup2; = ${chiSq.toFixed(2)} (df = ${df}, p = ${p < 0.001 ? '<0.001' : p.toFixed(3)}) ` +
      `dengan kekuatan asosiasi Cramér's V = ${cramerV.toFixed(3)} (<strong>${kekuatan}</strong>). `;

    if (isSignifikan) {
      teks += `Terdapat hubungan asosiasi yang <strong>signifikan secara statistik</strong> (&alpha; = 0,05) antar kedua variabel. `;
    } else {
      teks += `Hubungan asosiasi <strong>tidak signifikan secara statistik</strong> (&alpha; = 0,05), kedua variabel cenderung independen. `;
    }

    if (orInfo) {
      teks += `<br><strong>Odds Ratio (OR):</strong> ${orInfo.or.toFixed(2)} ` +
        `(95% CI: ${orInfo.ciBawah.toFixed(2)} – ${orInfo.ciAtas.toFixed(2)}). `;
      if (orInfo.ciBawah > 1) {
        teks += `Kelompok terpapar memiliki risiko/kemungkinan lebih tinggi secara bermakna.`;
      } else if (orInfo.ciAtas < 1) {
        teks += `Kelompok terpapar memiliki kemungkinan lebih rendah secara bermakna (faktor protektif).`;
      } else {
        teks += `Interval kepercayaan memuat angka 1, perbedaan peluang tidak signifikan.`;
      }
    }

    if (adaExpectedKecil) {
      teks += `<br><span class="text-warning-sm">⚠️ Peringatan: Terdapat sel dengan nilai harapan (expected) < 5. ` +
        (fisherP !== null ? `Hasil Uji Eksak Fisher (p = ${fisherP < 0.001 ? '<0.001' : fisherP.toFixed(3)}) ditampilkan sebagai rujukan utama yang lebih valid.` : `Sebaiknya gabungkan kategori atau gunakan Uji Eksak Fisher.`) +
        `</span>`;
    }

    return teks;
  }

  // ============================================================
  // 5. GLOBAL MORAN'S I (AUTOKORELASI SPASIAL)
  // ============================================================

  /**
   * Menghitung Global Moran's I berdasarkan nilai kasus per kecamatan
   * dan bobot spasial dari GeoJSON
   */
  function hitungMoransI(kecamatanCounts, geojson) {
    if (!geojson || !geojson.features || geojson.features.length < 3) {
      return null;
    }

    // Ekstrak centroid untuk setiap kecamatan di geojson
    const wilayahList = [];
    geojson.features.forEach(feat => {
      const p = feat.properties;
      const nama = p.kecamatan || p.KECAMATAN || p.nama || p.WADMKC || '';
      if (!nama) return;

      // Titik pusat: utamakan KOORDINAT_KECAMATAN (titik yang sama dengan yang tampil di peta);
      // jika kecamatan tidak ada di sana, pakai rata-rata titik sudut poligonnya.
      let lat = 0, lon = 0, ptCount = 0;
      if (typeof KOORDINAT_KECAMATAN !== 'undefined' && KOORDINAT_KECAMATAN[nama]) {
        lat = KOORDINAT_KECAMATAN[nama][0];
        lon = KOORDINAT_KECAMATAN[nama][1];
        ptCount = 1;
      } else if (feat.geometry && feat.geometry.coordinates) {
        const coords = feat.geometry.coordinates[0]; // outer ring
        if (Array.isArray(coords)) {
          coords.forEach(pt => {
            if (Array.isArray(pt) && pt.length >= 2) {
              lon += pt[0];
              lat += pt[1];
              ptCount++;
            }
          });
        }
        if (ptCount > 0) { lat /= ptCount; lon /= ptCount; }
      }
      if (ptCount === 0) return; // tidak ada koordinat sama sekali -> lewati wilayah ini

      const val = kecamatanCounts[nama] || 0;
      wilayahList.push({ nama, lat, lon, val });
    });

    const N = wilayahList.length;
    if (N < 4) return null;

    // Rata-rata nilai
    const meanVal = wilayahList.reduce((acc, w) => acc + w.val, 0) / N;

    // Matriks Bobot Spasial Wij (Inverse Distance Weighting)
    let sumWij = 0;
    const W = [];
    for (let i = 0; i < N; i++) {
      W[i] = [];
      for (let j = 0; j < N; j++) {
        if (i === j) {
          W[i][j] = 0;
        } else {
          // Jarak Euclidean derajat sederhana (~111 km)
          const dlat = wilayahList[i].lat - wilayahList[j].lat;
          const dlon = wilayahList[i].lon - wilayahList[j].lon;
          const dist = Math.sqrt(dlat * dlat + dlon * dlon);
          const weight = dist > 0 ? 1 / dist : 1;
          W[i][j] = weight;
          sumWij += weight;
        }
      }
    }

    // Varians / penyebut
    let penyebut = 0;
    for (let i = 0; i < N; i++) {
      const diff = wilayahList[i].val - meanVal;
      penyebut += diff * diff;
    }

    if (penyebut === 0 || sumWij === 0) {
      return { I: 0, expectedI: -1 / (N - 1), zScore: 0, pValue: 1, interpretasi: 'Variasi nilai nol' };
    }

    // Pembilang
    let pembilang = 0;
    for (let i = 0; i < N; i++) {
      const diffI = wilayahList[i].val - meanVal;
      for (let j = 0; j < N; j++) {
        const diffJ = wilayahList[j].val - meanVal;
        pembilang += W[i][j] * diffI * diffJ;
      }
    }

    const I = (N / sumWij) * (pembilang / penyebut);
    const expectedI = -1 / (N - 1);

    // Uji signifikansi: permutasi acak (999x) atas nilai kasus antar kecamatan.
    // Pembangkit acak diberi seed tetap agar angka p tidak berubah-ubah tiap halaman dimuat ulang.
    const nilai = wilayahList.map(w => w.val);
    function hitungI(vals) {
      let pb = 0;
      for (let i = 0; i < N; i++) {
        const di = vals[i] - meanVal;
        for (let j = 0; j < N; j++) pb += W[i][j] * di * (vals[j] - meanVal);
      }
      return (N / sumWij) * (pb / penyebut);
    }
    let seed = 20260101;
    const acak = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const PERM = 999;
    let lebihEkstrem = 0;
    const acakNilai = nilai.slice();
    for (let k = 0; k < PERM; k++) {
      for (let i = N - 1; i > 0; i--) { const j = Math.floor(acak() * (i + 1)); const tmp = acakNilai[i]; acakNilai[i] = acakNilai[j]; acakNilai[j] = tmp; }
      if (Math.abs(hitungI(acakNilai) - expectedI) >= Math.abs(I - expectedI) - 1e-12) lebihEkstrem++;
    }
    const pValue = (lebihEkstrem + 1) / (PERM + 1);

    // Interpretasi (taraf nyata 0,05)
    let statusPola, detail;
    if (pValue < 0.05 && I > expectedI) {
      statusPola = 'Mengelompok (Clustered / Klaster Positif)';
      detail = 'Wilayah dengan jumlah kasus tinggi cenderung bertetangga dengan wilayah berkejadian tinggi pula.';
    } else if (pValue < 0.05 && I < expectedI) {
      statusPola = 'Menyebar (Dispersed / Berseberangan)';
      detail = 'Wilayah dengan kasus tinggi berdekatan dengan wilayah dengan kasus rendah.';
    } else {
      statusPola = 'Acak (Random)';
      detail = 'Tidak ditemukan pola autokorelasi spasial yang signifikan (p ≥ 0,05); persebaran kasus tidak berbeda nyata dari acak.';
    }

    return {
      I,
      expectedI,
      N,
      pValue,
      statusPola,
      detail,
      interpretasi: `Indeks Moran's I = ${I.toFixed(3)} (E[I] = ${expectedI.toFixed(3)}), p-value permutasi = ${pValue.toFixed(3)}. Pola persebaran spasial: <strong>${statusPola}</strong>. ${detail}`
    };
  }

  // API Publik
  return {
    hitungPearson,
    hitungSpearman,
    buatTabelKontingensi,
    hitungChiSquare,
    hitungOddsRatio2x2,
    hitungFisherExact2x2,
    interpretasiKorelasi,
    interpretasiChiSquare,
    hitungMoransI
  };
})();

if (typeof window !== 'undefined') {
  window.Stats = Stats;
}
