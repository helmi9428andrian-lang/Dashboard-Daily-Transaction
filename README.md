# Dashboard Keuangan Pribadi

Aplikasi dashboard analisis keuangan pribadi berbasis React, TypeScript, Tailwind CSS, dan Express yang mendukung impor/ekspor spreadsheet Excel (`.xlsx`/`.csv`), laporan PDF, pelacakan mutasi rekening, serta pemantauan live saham IHSG dan kurs valas.

## Fitur Utama

- **Ringkasan Keuangan & Grafik Interaktif**: Arus kas harian, tren pemasukan vs pengeluaran bulanan, serta rincian kategori dengan filter akun, kategori, rentang nominal, dan persentase.
- **Template Akun & Dropdown Transaksi**: Pilihan akun siap pakai (Rekening Bank, E-Wallet, Tunai, Investasi & Valas) beserta kategori & subkategori dalam bentuk dropdown yang dapat ditambah langsung.
- **Akun & Transfer**: Grafik akun paling sering digunakan, arus masuk vs keluar per akun, riwayat transfer, dan pengelolaan daftar template akun.
- **Investasi & Valas (Live IHSG & Kurs)**: Pelacakan indeks IHSG (`^JKSE`), harga saham BEI/IDX secara live, daftar pantau (*watchlist*), konversi otomatis mata uang asing (`USD`, `SGD`, `JPY`, `GBP`, `EUR`, dll.), serta sinkronisasi kurs spot.
- **Spreadsheet & Laporan PDF**: Unduh template pencatatan Excel, impor massal `.xlsx`/`.csv` dengan pemetaan kolom otomatis, ekspor cadangan Excel, serta cetak PDF Laporan dan Diagram.

## Menjalankan Secara Lokal

Prasyarat: **Node.js v22+**

```bash
npm install
npm run dev
```

Aplikasi berjalan pada `http://localhost:3000`.

## Build & Production (Hosting Node.js)

```bash
npm run build
npm start
```

Server akan membaca port dari environment variable `PORT` secara otomatis (default `3000`).

> **Catatan Data**: Seluruh catatan transaksi disimpan di browser pengguna (`localStorage`) dan dilengkapi data *dummy* awal agar dashboard dapat langsung dicoba tanpa data pribadi.
