* Validasi uji dashboard surveilans campak Kab. Pekalongan.
* 1) Buka data_campak_spss.sav  2) Jalankan sintaks ini (Run > All).
* Bandingkan baris "Pearson Chi-Square" (Value, df, Asymp. Sig.) dengan pembanding_hasil.csv / dashboard.
* Catatan: untuk tabel 2x2, SPSS juga menampilkan "Continuity Correction"; dashboard memakai Pearson tanpa koreksi.

FREQUENCIES VARIABLES=jk kel_umur imunisasi campak bulan_kasus /ORDER=ANALYSIS.
DESCRIPTIVES VARIABLES=umur_thn /STATISTICS=MEAN STDDEV MIN MAX.

CROSSTABS /TABLES=imunisasi BY campak /STATISTICS=CHISQ PHI /CELLS=COUNT EXPECTED ROW.
CROSSTABS /TABLES=jk BY campak /STATISTICS=CHISQ RISK PHI /CELLS=COUNT EXPECTED ROW.
CROSSTABS /TABLES=mcv1 BY campak /STATISTICS=CHISQ PHI /CELLS=COUNT EXPECTED ROW.
CROSSTABS /TABLES=kel_umur BY campak /STATISTICS=CHISQ PHI /CELLS=COUNT EXPECTED ROW.
CROSSTABS /TABLES=mata_merah BY campak /STATISTICS=CHISQ PHI /CELLS=COUNT EXPECTED ROW.
