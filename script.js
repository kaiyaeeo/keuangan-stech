const SPREADSHEET_ID = '1embeXKcM-5aLoGiyyA3WpPSYnqcPutmVGETGPJ5LP0U';
const SHEET_NAME = 'Transaksi';

let semuaDataArray = [];
let chartInstance = null;

function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(angka);
}

async function muatDataKeuangan() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${SHEET_NAME}&tq=`;

    try {
        const respon = await fetch(url);
        if (!respon.ok) throw new Error('Gagal fetch');
        const teks = await respon.text();

        const jsonMurni = JSON.parse(teks.substring(teks.indexOf("{"), teks.lastIndexOf("}") + 1));
        const rows = jsonMurni.table.rows;

        semuaDataArray = [];
        let totalMasuk = 0, totalKeluar = 0;
        let pengeluaranDivisi = {};

        rows.forEach(row => {
            const tanggal    = row.c[0] ? row.c[0].f || row.c[0].v : '-';
            const keterangan = row.c[1] ? row.c[1].v : '-';
            const kategori   = row.c[2] ? row.c[2].v : '';
            const nominal    = row.c[3] ? parseFloat(row.c[3].v) || 0 : 0;
            const divisi     = row.c[4] ? row.c[4].v : '-';

            if (!kategori) return;
            const kategoriClean = kategori.toLowerCase().trim();

            if (kategoriClean === 'masuk') totalMasuk += nominal;
            if (kategoriClean === 'keluar') {
                totalKeluar += nominal;
                const namaDivisi = divisi || 'Umum';
                pengeluaranDivisi[namaDivisi] = (pengeluaranDivisi[namaDivisi] || 0) + nominal;
            }

            semuaDataArray.push({ tanggal, keterangan, kategori: kategoriClean, nominal, divisi });
        });

        document.getElementById('total-masuk').innerText  = formatRupiah(totalMasuk);
        document.getElementById('total-keluar').innerText = formatRupiah(totalKeluar);

        const sisaSaldo = totalMasuk - totalKeluar;
        const elSaldo   = document.getElementById('sisa-saldo');
        elSaldo.innerText  = formatRupiah(sisaSaldo);
        elSaldo.style.color = sisaSaldo < 0 ? 'var(--red)' : 'var(--black)';

        const rasioSaldo = totalMasuk > 0 ? Math.min((sisaSaldo / totalMasuk) * 100, 100) : 0;
        document.getElementById('saldo-progress').style.width = `${Math.max(rasioSaldo, 0)}%`;

        const rasioBeban = totalMasuk > 0 ? Math.min((totalKeluar / totalMasuk) * 100, 100) : 0;
        document.getElementById('rasio-teks').innerText        = `${rasioBeban.toFixed(1)}%`;
        document.getElementById('rasio-bar').style.width       = `${rasioBeban}%`;

        tampilkanDataKeTabel(semuaDataArray);
        updateGrafikDivisi(pengeluaranDivisi);

    } catch (error) {
        console.error("Gagal memuat data:", error);
        document.getElementById('tabel-transaksi').innerHTML = `
            <tr>
                <td colspan="4" style="padding: 48px 24px; text-align: center;">
                    <div style="font-family: 'Space Mono', monospace; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--red); margin-bottom: 8px;">[ERROR] Gagal memuat data</div>
                    <p style="font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #666;">Pastikan tab "Transaksi" ada dan akses Google Sheets = Viewer publik.</p>
                </td>
            </tr>
        `;
    }
}

function tampilkanDataKeTabel(data) {
    const el = document.getElementById('tabel-transaksi');
    el.innerHTML = '';

    if (data.length === 0) {
        el.innerHTML = `<tr><td colspan="4" style="padding: 48px 24px; text-align: center; font-family: 'Space Mono', monospace; font-size: 0.65rem; color: #999; text-transform: uppercase; letter-spacing: 0.08em;">// Tidak ada transaksi</td></tr>`;
        return;
    }

    data.forEach(item => {
        const isMasuk      = item.kategori === 'masuk';
        const warnaNominal = isMasuk ? '#1a6a8f' : '#5a3fa0';
        const tanda        = isMasuk ? '+' : '−';

        el.innerHTML += `
            <tr>
                <td style="padding: 13px 20px; font-family: 'Space Mono', monospace; font-size: 0.6rem; color: #888; white-space: nowrap;">${item.tanggal}</td>
                <td style="padding: 13px 20px;">
                    <div style="font-weight: 700; font-size: 0.78rem; margin-bottom: 5px;">${item.keterangan}</div>
                    <span class="badge ${isMasuk ? 'badge-masuk' : 'badge-keluar'}">${item.kategori}</span>
                </td>
                <td style="padding: 13px 20px;">
                    <span class="divisi-chip">${item.divisi}</span>
                </td>
                <td style="padding: 13px 20px; text-align: right; font-family: 'Space Mono', monospace; font-weight: 700; font-size: 0.82rem; color: ${warnaNominal}; white-space: nowrap;">
                    ${tanda} ${formatRupiah(item.nominal)}
                </td>
            </tr>
        `;
    });
}

function filterData() {
    const v = document.getElementById('filter-kategori').value;
    tampilkanDataKeTabel(v === 'semua' ? semuaDataArray : semuaDataArray.filter(i => i.kategori === v));
}

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

window.onload = muatDataKeuangan;