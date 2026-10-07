const SPREADSHEET_ID = '1embeXKcM-5aLoGiyyA3WpPSYnqcPutmVGETGPJ5LP0U';
const SHEET_NAME = 'Transaksi';

let semuaDataArray = [];

// ---------- UTILITAS ----------

function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(angka);
}

// Bangun peta "nama header" -> index kolom.
// Tahan terhadap perubahan urutan/posisi kolom di Sheet selama nama header tetap.
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

        isiOpsiFilterDivisi(semuaDataArray);
        terapkanFilterTransaksi();
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

// ---------- MUAT SEMUA ----------

async function muatSemuaData() {
    await muatDataKeuangan();
}

// ---------- INIT ----------

window.onload = muatSemuaData;