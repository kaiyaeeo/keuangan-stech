const SPREADSHEET_ID = '1embeXKcM-5aLoGiyyA3WpPSYnqcPutmVGETGPJ5LP0U';
const SHEET_NAME = 'Transaksi';
const SHEET_PENGAJUAN = 'Pengajuan';
const SHEET_ANGGARAN = 'Anggaran';
const SALDO_MINIMUM = 1000000; 
const HASH_PASSWORD_ADMIN = 'fa76274fb5c27d986c3bdacdca40f9c5865acf7bf24c3e33af11cfbb06c1f112'; // default password: stech2026

let semuaDataArray = [];
let semuaDataPengajuan = [];
let semuaDataAnggaran = [];
let realisasiPerDivisiGlobal = {}; 
let modeAdminAktif = false;
let chartInstance = null;

// ---------- UTILITAS ----------

function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(angka);
}

// Bangun peta "nama header" -> index kolom.
// Ini membuat script tahan terhadap perubahan urutan/posisi kolom di Sheet
// (mis. kolom dimulai dari B, ada kolom kosong di A, dst) selama nama
// header di baris pertama Sheet tetap sama.
function buatPetaKolom(cols) {
    const peta = {};
    cols.forEach((col, i) => {
        if (col && col.label) {
            const key = col.label.toString().trim().toLowerCase();
            peta[key] = i;
        }
    });
    return peta;
}

function ambilSel(row, peta, namaHeader) {
    const idx = peta[namaHeader.toLowerCase()];
    if (idx === undefined) return null;
    return row.c[idx] || null;
}

function nilaiTeks(cell, fallback = '-') {
    if (!cell) return fallback;
    return (cell.v !== null && cell.v !== undefined) ? cell.v.toString() : fallback;
}

// gviz mengembalikan tanggal dalam bentuk string "Date(tahun,bulan,tanggal)" (bulan 0-based)
// pada properti .v. Fungsi ini mengubahnya jadi objek Date asli untuk keperluan filter rentang tanggal.
function parseTanggalCell(cell) {
    if (!cell) return null;
    const v = cell.v;
    if (typeof v === 'string' && v.startsWith('Date(')) {
        const m = v.match(/Date\((\d+),(\d+),(\d+)/);
        if (m) return new Date(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
    }
    const teks = cell.f || v;
    const d = new Date(teks);
    return isNaN(d.getTime()) ? null : d;
}

// ---------- AMBIL DATA DARI GOOGLE SHEETS ----------

async function muatDataKeuangan() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${SHEET_NAME}&tq=`;

    try {
        const respon = await fetch(url);
        if (!respon.ok) throw new Error('Gagal fetch');
        const teks = await respon.text();

        const jsonMurni = JSON.parse(teks.substring(teks.indexOf("{"), teks.lastIndexOf("}") + 1));
        const rows = jsonMurni.table.rows;
        const peta = buatPetaKolom(jsonMurni.table.cols);

        semuaDataArray = [];
        let totalMasuk = 0, totalKeluar = 0;
        let pengeluaranDivisi = {};

        rows.forEach(row => {
            const cellNo      = ambilSel(row, peta, 'No');
            const cellTanggal = ambilSel(row, peta, 'Tanggal');
            const cellJenis   = ambilSel(row, peta, 'Jenis Transaksi');
            const cellRincian = ambilSel(row, peta, 'Rincian');
            const cellPJ      = ambilSel(row, peta, 'Penanggung Jawab');
            const cellDivisi  = ambilSel(row, peta, 'Divisi');
            const cellNominal = ambilSel(row, peta, 'Nominal');
            const cellSumber  = ambilSel(row, peta, 'Sumber Dana');
            const cellBukti   = ambilSel(row, peta, 'Bukti');
            const cellStatus  = ambilSel(row, peta, 'Status');

            const jenisRaw = nilaiTeks(cellJenis, '').toLowerCase();
            if (!jenisRaw) return; // baris kosong, lewati

            const isMasuk  = jenisRaw.includes('masuk');
            const kategori = isMasuk ? 'masuk' : 'keluar';

            const no         = nilaiTeks(cellNo, '-');
            const tanggal    = cellTanggal ? (cellTanggal.f || cellTanggal.v) : '-';
            const rincian    = nilaiTeks(cellRincian, '-');
            const pj         = nilaiTeks(cellPJ, '-');
            const divisi     = nilaiTeks(cellDivisi, 'Umum');
            const nominal    = cellNominal ? (parseFloat(cellNominal.v) || 0) : 0;
            const sumberDana = nilaiTeks(cellSumber, '-');
            const bukti      = cellBukti ? nilaiTeks(cellBukti, '') : '';
            const statusRaw  = nilaiTeks(cellStatus, '-');
            const statusLc   = statusRaw.toLowerCase();
            const isLunas    = statusLc.includes('lunas') && !statusLc.includes('belum');

            if (isMasuk) {
                totalMasuk += nominal;
            } else {
                totalKeluar += nominal;
                const namaDivisi = divisi || 'Umum';
                pengeluaranDivisi[namaDivisi] = (pengeluaranDivisi[namaDivisi] || 0) + nominal;
            }

            semuaDataArray.push({
                no, tanggal, tanggalDate: parseTanggalCell(cellTanggal), jenis: jenisRaw, kategori, rincian, pj,
                divisi, nominal, sumberDana, bukti,
                status: statusRaw, isLunas
            });
        });

        // ---- Update kartu ringkasan ----
        document.getElementById('total-masuk').innerText  = formatRupiah(totalMasuk);
        document.getElementById('total-keluar').innerText = formatRupiah(totalKeluar);

        const sisaSaldo = totalMasuk - totalKeluar;
        const elSaldo   = document.getElementById('sisa-saldo');
        elSaldo.innerText   = formatRupiah(sisaSaldo);
        elSaldo.style.color = sisaSaldo < 0 ? 'var(--red)' : 'var(--black)';

        const rasioSaldo = totalMasuk > 0 ? Math.min((sisaSaldo / totalMasuk) * 100, 100) : 0;
        document.getElementById('saldo-progress').style.width = `${Math.max(rasioSaldo, 0)}%`;

        perbaruiPeringatanSaldoMinimum(sisaSaldo);

        realisasiPerDivisiGlobal = pengeluaranDivisi;

        isiOpsiFilterDivisi(semuaDataArray);
        terapkanFilterTransaksi();
        updateGrafikDivisi(pengeluaranDivisi);
        perbaruiAlertBukti(semuaDataArray);

    } catch (error) {
        console.error("Gagal memuat data:", error);
        document.getElementById('tabel-transaksi').innerHTML = `
            <tr>
                <td colspan="9" style="padding: 48px 24px; text-align: center;">
                    <div style="font-family: 'Space Mono', monospace; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--red); margin-bottom: 8px;">[ERROR] Gagal memuat data</div>
                    <p style="font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #666;">Pastikan tab "Transaksi" ada dan akses Google Sheets = Viewer publik.</p>
                </td>
            </tr>
        `;
    }
}

// ---------- RENDER TABEL ----------

function tampilkanDataKeTabel(data) {
    const el = document.getElementById('tabel-transaksi');
    el.innerHTML = '';

    if (data.length === 0) {
        el.innerHTML = `<tr><td colspan="9" style="padding: 48px 24px; text-align: center; font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #999; text-transform: uppercase; letter-spacing: 0.08em;">// Tidak ada transaksi</td></tr>`;
        return;
    }

    data.forEach(item => {
        const isMasuk      = item.kategori === 'masuk';
        const warnaNominal = isMasuk ? '#1a6a8f' : '#5a3fa0';
        const tanda        = isMasuk ? '+' : '−';
        const tanpaBukti    = !isMasuk && (!item.bukti || !item.bukti.startsWith('http'));

        const buktiHtml = item.bukti && item.bukti.startsWith('http')
            ? `<a href="${item.bukti}" target="_blank" rel="noopener" class="bukti-link">Lihat ↗</a>`
            : (tanpaBukti
                ? `<span style="font-family:'Space Mono',monospace; font-size:0.6rem; font-weight:700; color:var(--red); text-transform:uppercase;">⚠ Belum ada</span>`
                : `<span style="opacity:0.35; font-family:'Space Mono',monospace; font-size:0.65rem;">—</span>`);

        const statusHtml = item.status && item.status !== '-'
            ? `<span class="badge ${item.isLunas ? 'badge-lunas' : 'badge-belum'}">${item.status}</span>`
            : `<span style="opacity:0.35; font-family:'Space Mono',monospace; font-size:0.65rem;">—</span>`;

        el.innerHTML += `
            <tr class="${tanpaBukti ? 'row-warning' : ''}">
                <td style="padding: 13px 16px; font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #888;">${item.no}</td>
                <td style="padding: 13px 16px; font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #888; white-space: nowrap;">${item.tanggal}</td>
                <td style="padding: 13px 16px;">
                    <div style="font-weight: 700; font-size: 0.78rem; margin-bottom: 5px;">${item.rincian}</div>
                    <span class="badge ${isMasuk ? 'badge-masuk' : 'badge-keluar'}">${item.jenis}</span>
                </td>
                <td style="padding: 13px 16px; font-size: 0.75rem; white-space: nowrap;">${item.pj}</td>
                <td style="padding: 13px 16px;">
                    <span class="divisi-chip">${item.divisi}</span>
                </td>
                <td style="padding: 13px 16px; font-size: 0.72rem; white-space: nowrap;">${item.sumberDana}</td>
                <td style="padding: 13px 16px; text-align: right; font-family: 'Space Mono', monospace; font-weight: 700; font-size: 0.82rem; color: ${warnaNominal}; white-space: nowrap;">
                    ${tanda} ${formatRupiah(item.nominal)}
                </td>
                <td style="padding: 13px 16px; text-align: center; white-space: nowrap;">${buktiHtml}</td>
                <td style="padding: 13px 16px; text-align: center; white-space: nowrap;">${statusHtml}</td>
            </tr>
        `;
    });
}

// ---------- FILTER ----------

// ---------- FILTER & PENCARIAN ----------

function isiOpsiFilterDivisi(data) {
    const select = document.getElementById('filter-divisi');
    const nilaiSebelumnya = select.value;
    const daftarDivisi = [...new Set(data.map(i => i.divisi))].sort();

    select.innerHTML = '<option value="semua">Semua Divisi</option>';
    daftarDivisi.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        select.appendChild(opt);
    });

    // pertahankan pilihan sebelumnya kalau masih ada di daftar baru
    if ([...select.options].some(o => o.value === nilaiSebelumnya)) {
        select.value = nilaiSebelumnya;
    }
}

function terapkanFilterTransaksi() {
    const kategori   = document.getElementById('filter-kategori').value;
    const divisi      = document.getElementById('filter-divisi').value;
    const teksCari    = document.getElementById('cari-transaksi').value.trim().toLowerCase();
    const tanggalDari = document.getElementById('tanggal-dari').value;
    const tanggalSampai = document.getElementById('tanggal-sampai').value;

    let hasil = semuaDataArray;

    if (kategori !== 'semua') {
        hasil = hasil.filter(i => i.kategori === kategori);
    }

    if (divisi !== 'semua') {
        hasil = hasil.filter(i => i.divisi === divisi);
    }

    if (teksCari) {
        hasil = hasil.filter(i =>
            i.rincian.toLowerCase().includes(teksCari) ||
            i.pj.toLowerCase().includes(teksCari) ||
            i.divisi.toLowerCase().includes(teksCari) ||
            i.sumberDana.toLowerCase().includes(teksCari)
        );
    }

    if (tanggalDari) {
        const dari = new Date(tanggalDari);
        hasil = hasil.filter(i => i.tanggalDate && i.tanggalDate >= dari);
    }

    if (tanggalSampai) {
        const sampai = new Date(tanggalSampai);
        sampai.setHours(23, 59, 59, 999); // inklusif sampai akhir hari
        hasil = hasil.filter(i => i.tanggalDate && i.tanggalDate <= sampai);
    }

    tampilkanDataKeTabel(hasil);
}

function resetFilterTransaksi() {
    document.getElementById('filter-kategori').value = 'semua';
    document.getElementById('filter-divisi').value = 'semua';
    document.getElementById('cari-transaksi').value = '';
    document.getElementById('tanggal-dari').value = '';
    document.getElementById('tanggal-sampai').value = '';
    terapkanFilterTransaksi();
}

// ---------- PERINGATAN SALDO MINIMUM ----------

function perbaruiPeringatanSaldoMinimum(sisaSaldo) {
    const el = document.getElementById('saldo-minimum-teks');
    if (!el) return;

    if (sisaSaldo < SALDO_MINIMUM) {
        const kurang = SALDO_MINIMUM - sisaSaldo;
        el.innerHTML = `⚠ Di bawah cadangan minimum Rp1.000.000 — kurang ${formatRupiah(kurang)}`;
        el.style.color = 'var(--red)';
    } else {
        el.innerHTML = `✓ Cadangan minimum Rp1.000.000 aman`;
        el.style.color = '#3a6b3a';
    }
}

// ---------- CHART DIVISI ----------

function updateGrafikDivisi(dataDivisi) {
    const labels = Object.keys(dataDivisi);
    const values = Object.values(dataDivisi);
    const ctx    = document.getElementById('chartDivisi').getContext('2d');

    if (chartInstance) chartInstance.destroy();
    if (labels.length === 0) return;

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: ['#FF8787', '#FDE047', '#70BDB2', '#3CCF6E', '#E8433A'],
                borderWidth: 3,
                borderColor: '#0A0A0A',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { size: 10, weight: '700', family: 'Space Mono' },
                        boxWidth: 12, boxHeight: 12,
                        padding: 12,
                        color: '#0A0A0A',
                    }
                },
                tooltip: {
                    backgroundColor: '#0A0A0A',
                    titleColor: '#70BDB2',
                    bodyColor: '#FAFAF5',
                    padding: 12,
                    titleFont: { weight: '700', family: 'Space Mono', size: 11 },
                    bodyFont:  { family: 'Space Mono', size: 11 },
                    callbacks: {
                        label: ctx => ` ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(ctx.parsed)}`
                    }
                }
            },
            cutout: '60%',
        }
    });
}

// ---------- AMBIL DATA PENGAJUAN DARI GOOGLE SHEETS ----------

async function muatDataPengajuan() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${SHEET_PENGAJUAN}&tq=`;

    try {
        const respon = await fetch(url);
        if (!respon.ok) throw new Error('Gagal fetch');
        const teks = await respon.text();

        const jsonMurni = JSON.parse(teks.substring(teks.indexOf("{"), teks.lastIndexOf("}") + 1));
        const rows = jsonMurni.table.rows;
        const peta = buatPetaKolom(jsonMurni.table.cols);

        semuaDataPengajuan = [];

        rows.forEach(row => {
            const cellNo      = ambilSel(row, peta, 'No');
            const cellTanggal = ambilSel(row, peta, 'Tanggal Pengajuan');
            const cellDivisi  = ambilSel(row, peta, 'Divisi');
            const cellRincian = ambilSel(row, peta, 'Rincian Kebutuhan');
            const cellPJ      = ambilSel(row, peta, 'Penanggung Jawab');
            const cellNominal = ambilSel(row, peta, 'Nominal Diajukan');
            const cellMetode  = ambilSel(row, peta, 'Metode Pengajuan');
            const cellNota    = ambilSel(row, peta, 'Nota Fisik dari Bendahara');
            const cellStatus  = ambilSel(row, peta, 'Status');

            const rincian = nilaiTeks(cellRincian, '');
            if (!rincian) return; // baris kosong, lewati

            const no       = nilaiTeks(cellNo, '-');
            const tanggal  = cellTanggal ? (cellTanggal.f || cellTanggal.v) : '-';
            const divisi   = nilaiTeks(cellDivisi, 'Umum');
            const pj       = nilaiTeks(cellPJ, '-');
            const nominal  = cellNominal ? (parseFloat(cellNominal.v) || 0) : 0;
            const metode   = nilaiTeks(cellMetode, '-');
            const notaFisik= nilaiTeks(cellNota, '-');
            const statusRaw= nilaiTeks(cellStatus, 'Menunggu');
            const statusLc = statusRaw.toLowerCase();

            semuaDataPengajuan.push({ no, tanggal, divisi, rincian, pj, nominal, metode, notaFisik, status: statusRaw, statusLc });
        });

        tampilkanDataPengajuan(semuaDataPengajuan);

    } catch (error) {
        console.error("Gagal memuat data pengajuan:", error);
        document.getElementById('tabel-pengajuan').innerHTML = `
            <tr>
                <td colspan="7" style="padding: 48px 24px; text-align: center;">
                    <div style="font-family: 'Space Mono', monospace; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--red); margin-bottom: 8px;">[ERROR] Gagal memuat data</div>
                    <p style="font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #666;">Pastikan tab "Pengajuan" ada dan akses Google Sheets = Viewer publik.</p>
                </td>
            </tr>
        `;
    }
}

function tampilkanDataPengajuan(data) {
    const el = document.getElementById('tabel-pengajuan');
    el.innerHTML = '';

    if (data.length === 0) {
        el.innerHTML = `<tr><td colspan="9" style="padding: 48px 24px; text-align: center; font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #999; text-transform: uppercase; letter-spacing: 0.08em;">// Tidak ada pengajuan</td></tr>`;
        return;
    }

    data.forEach(item => {
        let kelasBadge = 'badge-menunggu';
        if (item.statusLc.includes('disetujui')) kelasBadge = 'badge-disetujui';
        else if (item.statusLc.includes('ditolak')) kelasBadge = 'badge-ditolak';

        const notaBelum = item.notaFisik.toLowerCase().includes('belum');

        el.innerHTML += `
            <tr>
                <td style="padding: 13px 16px; font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #888;">${item.no}</td>
                <td style="padding: 13px 16px; font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #888; white-space: nowrap;">${item.tanggal}</td>
                <td style="padding: 13px 16px;">
                    <span class="divisi-chip">${item.divisi}</span>
                </td>
                <td style="padding: 13px 16px; font-size: 0.78rem; font-weight: 700;">${item.rincian}</td>
                <td style="padding: 13px 16px; font-size: 0.75rem; white-space: nowrap;">${item.pj}</td>
                <td style="padding: 13px 16px; font-size: 0.7rem; white-space: nowrap;">${item.metode}</td>
                <td style="padding: 13px 16px; font-size: 0.7rem; white-space: nowrap; ${notaBelum ? 'color: var(--red); font-weight: 700;' : ''}">${item.notaFisik}</td>
                <td style="padding: 13px 16px; text-align: right; font-family: 'Space Mono', monospace; font-weight: 700; font-size: 0.82rem; white-space: nowrap;">
                    ${formatRupiah(item.nominal)}
                </td>
                <td style="padding: 13px 16px; text-align: center; white-space: nowrap;">
                    <span class="badge ${kelasBadge}">${item.status}</span>
                </td>
            </tr>
        `;
    });
}

function filterPengajuan() {
    const v = document.getElementById('filter-status-pengajuan').value;
    tampilkanDataPengajuan(v === 'semua' ? semuaDataPengajuan : semuaDataPengajuan.filter(i => i.statusLc.includes(v)));
}

// ---------- DETEKSI TRANSAKSI TANPA BUKTI ----------

function perbaruiAlertBukti(data) {
    const jumlahTanpaBukti = data.filter(i => i.kategori === 'keluar' && (!i.bukti || !i.bukti.startsWith('http'))).length;
    const elAlert = document.getElementById('alert-bukti');
    const elText  = document.getElementById('alert-bukti-text');

    if (jumlahTanpaBukti > 0) {
        elText.innerText = `${jumlahTanpaBukti} transaksi pengeluaran belum punya bukti/nota — cek tabel di bawah (baris bergaris merah)`;
        elAlert.style.display = 'block';
    } else {
        elAlert.style.display = 'none';
    }
}

// ---------- AMBIL DATA ANGGARAN & BANDINGKAN DENGAN REALISASI ----------

async function muatDataAnggaran() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${SHEET_ANGGARAN}&tq=`;
    const elList = document.getElementById('anggaran-list');

    try {
        const respon = await fetch(url);
        if (!respon.ok) throw new Error('Gagal fetch');
        const teks = await respon.text();

        const jsonMurni = JSON.parse(teks.substring(teks.indexOf("{"), teks.lastIndexOf("}") + 1));
        const rows = jsonMurni.table.rows;
        const peta = buatPetaKolom(jsonMurni.table.cols);

        semuaDataAnggaran = [];

        rows.forEach(row => {
            const cellDivisi = ambilSel(row, peta, 'Divisi');
            const cellBudget = ambilSel(row, peta, 'Budget');

            const divisi = nilaiTeks(cellDivisi, '');
            if (!divisi) return; // baris kosong, lewati

            const budget = cellBudget ? (parseFloat(cellBudget.v) || 0) : 0;
            semuaDataAnggaran.push({ divisi, budget });
        });

        tampilkanAnggaran(semuaDataAnggaran);

    } catch (error) {
        console.error("Gagal memuat data anggaran:", error);
        elList.innerHTML = `<p style="font-family: 'Space Mono', monospace; font-size: 0.65rem; color: var(--red); text-transform: uppercase; letter-spacing: 0.08em;">[ERROR] Gagal memuat data. Pastikan tab "Anggaran" ada dengan kolom Divisi &amp; Budget.</p>`;
    }
}

function tampilkanAnggaran(dataAnggaran) {
    const elList = document.getElementById('anggaran-list');
    elList.innerHTML = '';

    if (dataAnggaran.length === 0) {
        elList.innerHTML = `<p style="font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #999; text-transform: uppercase; letter-spacing: 0.08em;">// Belum ada data anggaran. Tambahkan tab "Anggaran" dengan kolom Divisi &amp; Budget.</p>`;
        return;
    }

    dataAnggaran.forEach(item => {
        const realisasi = realisasiPerDivisiGlobal[item.divisi] || 0;
        const persen = item.budget > 0 ? Math.min((realisasi / item.budget) * 100, 100) : 0;

        let kelasWarna = 'safe';
        if (persen >= 100) kelasWarna = 'danger';
        else if (persen >= 75) kelasWarna = 'warning';

        const overBudget = item.budget > 0 && realisasi > item.budget;

        elList.innerHTML += `
            <div class="budget-item">
                <div class="budget-item-head">
                    <span class="divisi-chip">${item.divisi}</span>
                    <span class="budget-item-nominal">
                        ${formatRupiah(realisasi)} / ${formatRupiah(item.budget)}
                        ${overBudget ? '<span style="color:var(--red);"> · Melebihi anggaran!</span>' : ''}
                    </span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill ${kelasWarna}" style="width: ${Math.max(persen, 2)}%;"></div>
                </div>
            </div>
        `;
    });
}

// ---------- MODE ADMIN (proteksi ringan) ----------
// Catatan: ini proteksi RINGAN untuk mencegah orang iseng melihat nominal
// per transaksi & link bukti nota. Password di-hash (SHA-256) supaya tidak
// polos terbaca di source code, tapi ini BUKAN keamanan tingkat tinggi —
// jangan taruh data yang benar-benar rahasia di balik ini.

async function hashSHA256(teks) {
    const enc = new TextEncoder().encode(teks);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function bukaModeAdmin() {
    if (modeAdminAktif) {
        keluarModeAdmin();
        return;
    }
    const pass = prompt('Masukkan password admin bendahara:');
    if (pass === null) return;

    const hash = await hashSHA256(pass);
    if (hash === HASH_PASSWORD_ADMIN) {
        modeAdminAktif = true;
        document.body.classList.add('mode-admin');
        sessionStorage.setItem('stechModeAdmin', '1');
        perbaruiTombolAdmin();
    } else {
        alert('Password salah.');
    }
}

function keluarModeAdmin() {
    modeAdminAktif = false;
    document.body.classList.remove('mode-admin');
    sessionStorage.removeItem('stechModeAdmin');
    perbaruiTombolAdmin();
}

function perbaruiTombolAdmin() {
    const btn = document.getElementById('tombol-admin');
    if (!btn) return;
    btn.innerHTML = modeAdminAktif ? '🔓 Keluar Mode Admin' : '🔒 Mode Admin';
}

function pulihkanSesiAdmin() {
    if (sessionStorage.getItem('stechModeAdmin') === '1') {
        modeAdminAktif = true;
        document.body.classList.add('mode-admin');
        perbaruiTombolAdmin();
    }
}

// ---------- MUAT SEMUA (Transaksi + Pengajuan + Anggaran) ----------

async function muatSemuaData() {
    // Anggaran butuh data realisasi pengeluaran dari Transaksi, jadi ditunggu dulu.
    await muatDataKeuangan();
    muatDataPengajuan();
    muatDataAnggaran();
}

// ---------- INIT ----------

window.onload = () => {
    pulihkanSesiAdmin();
    muatSemuaData();
};