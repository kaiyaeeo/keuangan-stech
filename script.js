// Masukkan ID Spreadsheet kamu di sini
const SPREADSHEET_ID = '1embeXKcM-5aLoGiyyA3WpPSYnqcPutmVGETGPJ5LP0U';
const SHEET_NAME = 'Transaksi';

let semuaDataArray = []; 
let chartInstance = null; 

// Fungsi utility untuk memformat nominal angka biasa menjadi format mata uang Rupiah
function formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(angka);
}

// Fungsi utama menarik data dari database Google Sheets secara real-time
async function muatDataKeuangan() {
    // Jalur pintas API Visualisasi Google untuk mendapatkan data berstruktur JSON murni
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${SHEET_NAME}&tq=`;
    
    try {
        const respon = await fetch(url);
        if (!respon.ok) throw new Error('Gagal fetch data dari server cloud Google Sheets');
        const teks = await respon.text();
        
        // Memotong pembungkus fungsi string bawaan API Google gviz agar menghasilkan JSON valid
        const jsonMurni = JSON.parse(teks.substring(teks.indexOf("{"), teks.lastIndexOf("}") + 1));
        const rows = jsonMurni.table.rows;

        semuaDataArray = [];
        let totalMasuk = 0;
        let totalKeluar = 0;
        let pengeluaranDivisi = {};

        rows.forEach(row => {
            // Pemetaan indeks array kolom: 0=Tanggal, 1=Keterangan, 2=Kategori, 3=Nominal, 4=Divisi
            const tanggal = row.c[0] ? row.c[0].f || row.c[0].v : '-';
            const keterangan = row.c[1] ? row.c[1].v : '-';
            const kategori = row.c[2] ? row.c[2].v : '';
            const nominal = row.c[3] ? parseFloat(row.c[3].v) || 0 : 0;
            const divisi = row.c[4] ? row.c[4].v : '-';

            if (!kategori) return; // Mengabaikan iterasi jika kolom kategori baris kosong

            const kategoriClean = kategori.toLowerCase().trim();

            if (kategoriClean === 'masuk') totalMasuk += nominal;
            if (kategoriClean === 'keluar') {
                totalKeluar += nominal;
                const namaDivisi = divisi || 'Umum';
                pengeluaranDivisi[namaDivisi] = (pengeluaranDivisi[namaDivisi] || 0) + nominal;
            }

            semuaDataArray.push({ tanggal, keterangan, kategori: kategoriClean, nominal, divisi });
        });

        // Manipulasi DOM pada komponen info widget atas
        document.getElementById('total-masuk').innerText = formatRupiah(totalMasuk);
        document.getElementById('total-keluar').innerText = formatRupiah(totalKeluar);
        
        const sisaSaldo = totalMasuk - totalKeluar;
        const elemenSaldo = document.getElementById('sisa-saldo');
        elemenSaldo.innerText = formatRupiah(sisaSaldo);
        elemenSaldo.className = sisaSaldo < 0 ? "text-3xl font-black text-rose-600 mt-3" : "text-3xl font-black text-slate-800 mt-3";

        // Kontrol kalkulasi visual komponen progress bar sisa kas
        const rasioSaldo = totalMasuk > 0 ? Math.min((sisaSaldo / totalMasuk) * 100, 100) : 0;
        document.getElementById('saldo-progress').style.width = `${Math.max(rasioSaldo, 0)}%`;

        // Kontrol kalkulasi rasio efisiensi budget beban operasional
        const rasioBeban = totalMasuk > 0 ? Math.min((totalKeluar / totalMasuk) * 100, 100) : 0;
        document.getElementById('rasio-teks').innerText = `${rasioBeban.toFixed(1)}%`;
        document.getElementById('rasio-bar').style.width = `${rasioBeban}%`;
        
        // Memicu render tabel mutasi buku besar & diagram lingkaran
        tampilkanDataKeTabel(semuaDataArray);
        updateGrafikDivisi(pengeluaranDivisi);

    } catch (error) {
        console.error("Gagal memuat data keuangan:", error);
        document.getElementById('tabel-transaksi').innerHTML = `
            <tr>
                <td colspan="4" class="px-6 py-10 text-center text-rose-500 font-bold bg-rose-50/50">
                    ⚠️ Gagal memuat data keuangan secara real-time. <br>
                    <span class="text-[11px] font-medium text-gray-500">Pastikan nama tab di Google Sheets adalah "Transaksi" dan hak aksesnya sudah disetel ke "Siapa saja yang memiliki link" (Viewer).</span>
                </td>
            </tr>
        `;
    }
}

// Fungsi render mutasi daftar transaksi ke dalam tabel HTML secara terstruktur
function tampilkanDataKeTabel(data) {
    const elemenTabel = document.getElementById('tabel-transaksi');
    elemenTabel.innerHTML = '';

    if (data.length === 0) {
        elemenTabel.innerHTML = `<tr><td colspan="4" class="px-6 py-10 text-center text-gray-400">Tidak ada data transaksi ditemukan.</td></tr>`;
        return;
    }

    data.forEach(item => {
        const isMasuk = item.kategori === 'masuk';
        const kelasBadgeKategori = isMasuk 
            ? 'bg-[#75ADC9]/20 text-[#4c819c] border border-[#75ADC9]/30' 
            : 'bg-[#9580D4]/20 text-[#6754a3] border border-[#9580D4]/30';

        const barisHtml = `
            <tr class="hover:bg-white/40 transition duration-150">
                <td class="px-6 py-4 text-gray-400 font-mono text-[11px] whitespace-nowrap">${item.tanggal}</td>
                <td class="px-6 py-4">
                    <div class="font-bold text-gray-800">${item.keterangan}</div>
                    <span class="inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] ${kelasBadgeKategori} uppercase tracking-wider">${item.kategori}</span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="bg-white/80 border border-gray-200/50 px-2.5 py-1 rounded-xl text-gray-600 text-[11px] font-bold shadow-xs">${item.divisi}</span>
                </td>
                <td class="px-6 py-4 text-right font-bold text-base whitespace-nowrap ${isMasuk ? 'text-[#75ADC9]' : 'text-[#9580D4]'}">
                    ${isMasuk ? '+' : '-'}${formatRupiah(item.nominal)}
                </td>
            </tr>
        `;
        elemenTabel.innerHTML += barisHtml;
    });
}

// Fungsi penanganan filter dropdown interaktif
function filterData() {
    const filterValue = document.getElementById('filter-kategori').value;
    if (filterValue === 'semua') {
        tampilkanDataKeTabel(semuaDataArray);
    } else {
        const dataFiltered = semuaDataArray.filter(item => item.kategori === filterValue);
        tampilkanDataKeTabel(dataFiltered);
    }
}

// Fungsi kontrol inisialisasi & re-draw chart lingkaran (Doughnut Chart) Chart.js
function updateGrafikDivisi(dataDivisi) {
    const labels = Object.keys(dataDivisi);
    const values = Object.values(dataDivisi);
    const ctx = document.getElementById('chartDivisi').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy(); // Hancurkan sisa instansiasi objek chart lama agar tidak tumpang tindih
    }

    if (labels.length === 0) return; 

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ['#9580D4', '#75ADC9', '#CDB9DD', '#E2D9E2', '#F4F7EA'],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10, weight: 'bold' }, boxWidth: 12, padding: 12 } }
            },
            cutout: '65%'
        }
    });
}

// Lifecycle Hooks: Memicu request data sesaat setelah window browser selesai memuat struktur DOM
window.onload = muatDataKeuangan;