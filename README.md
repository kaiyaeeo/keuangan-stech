# 📊 Soedirman Technophoria Financial Transparency Dashboard

[![Sistem Terhubung Real-Time](https://img.shields.io/badge/Database-Google%20Sheets-emerald?style=flat-flat&logo=google-sheets)](https://docs.google.com/spreadsheets/d/1embeXKcM-5aLoGiyyA3WpPSYnqcPutmVGETGPJ5LP0U/)
[![Framework Frontend](https://img.shields.io/badge/Frontend-Tailwind%20CSS%20v4-blue?style=flat-flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Visualisasi Data](https://img.shields.io/badge/Charts-Chart.js-ff6384?style=flat-flat&logo=chart.dotjs)](https://www.chartjs.org/)

Dashboard transparansi keuangan real-time yang dirancang khusus untuk manajemen arus kas masuk dan keluar pada *event* **Soedirman Technophoria Universitas Jenderal Soedirman (UNSOED)**. 

Sistem ini mengadopsi arsitektur *serverless data-fetching* yang menghubungkan antarmuka *frontend* secara langsung ke **Google Sheets API vviz** dan **Google Forms**. Hal ini memungkinkan seluruh panitia dan pihak eksternal memantau efisiensi anggaran, proporsi pengeluaran divisi, dan mutasi buku besar secara instan tanpa memerlukan manajemen server backend yang rumit.

---

## ✨ Fitur Utama

* **Arsitektur Real-Time:** Sinkronisasi otomatis data transaksi langsung dari Google Sheets saat halaman dimuat atau ketika tombol *Refresh* ditekan.
* **Desain Glassmorphism Estetik:** Tampilan antarmuka modern yang bersih dengan adaptasi palet warna pastel (*Soft Periwinkle*, *Sky Reflection*, *Thistle*, *Lavender Blush*, dan *Ivory*).
* **Proporsi Pengeluaran Dinamis:** Visualisasi *Doughnut Chart* interaktif menggunakan **Chart.js** untuk memetakan persentase alokasi dana per divisi secara otomatis.
* **Pusat Layanan Mandiri (Self-Service Hub):** Integrasi tautan langsung ke 3 Google Form manajemen (Lapor Dana Masuk, Lapor Dana Keluar, dan Pengajuan Dana) untuk otomatisasi alur kerja panitia.
* **Filter Mutasi Interaktif:** Fitur filter dinamis pada tabel buku besar untuk memisahkan transaksi berdasarkan kategori arus kas (Masuk/Keluar).
* **Indikator Efisiensi Kas:** Batang progres intuitif untuk memantau rasio beban pengeluaran operasional terhadap total pemasukan demi menghindari *overbudget*.

---

## 🛠️ Arsitektur & Teknologi

* **Frontend:** HTML5, JavaScript (ES6+ Vanilla), [Tailwind CSS v4](https://tailwindcss.com/) (via JIT Compiler CDN).
* **Data Visualization:** [Chart.js v4](https://www.chartjs.org/).
* **Database / Backend Engine:** Google Sheets API via Visualization Query Endpoint (`/gviz/tq`).
* **Data Input Layer:** Google Forms terintegrasi.

---

## 📂 Struktur Repositori

Proyek ini menggunakan pemisahan kode standar (*Separation of Concerns*) agar memudahkan proses *maintenance* dan pengembangan:

```text
├── index.html       # Struktur kerangka markup dokumen dan komponen UI
├── style.css        # Konfigurasi variabel palet warna dan efek Glassmorphism
├── script.js        # Logika Asynchronous Fetching, Math Engine, dan Chart Control
└── README.md        # Dokumentasi teknis proyek
