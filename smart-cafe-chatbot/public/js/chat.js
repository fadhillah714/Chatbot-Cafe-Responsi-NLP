        const chatForm = document.getElementById('chat-form');
        const input = document.getElementById('input');
        const chatContainer = document.getElementById('chat-container');
        const sendBtn = document.getElementById('send-btn');
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        const headerEl = document.querySelector('header');
        const footerEl = document.querySelector('footer');

        // stroke="currentColor" (bukan hex hardcode) -- warna linework ikut
        // "color" milik elemen pembungkus (.avatar / .row.user .avatar di
        // CSS), supaya otomatis theme-reactive dan berbeda per role bot/user.
        const CUP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 8h13v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8Z"></path>
            <path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2"></path>
            <line x1="6" y1="2" x2="6" y2="4"></line>
            <line x1="10" y1="2" x2="10" y2="4"></line>
            <line x1="14" y1="2" x2="14" y2="4"></line>
        </svg>`;

        const PERSON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"></circle>
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6"></path>
        </svg>`;

        // Ikon bulan & lolipop -- dari Lucide (icon set yang sama gaya
        // linework-nya dengan CUP_ICON/PERSON_ICON di atas: viewBox 24x24,
        // stroke-width 2, round cap/join, stroke="currentColor").
        const MOON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"></path>
        </svg>`;

        const LOLLIPOP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
            <path d="M11 11a2 2 0 0 0 4 0 4 4 0 0 0-8 0 6 6 0 0 0 12 0"></path>
        </svg>`;

        // ---------- Tema tampilan: Normal -> Dark -> Playful -> Normal ----------
        const THEMES = ['normal', 'dark', 'playful'];
        const THEME_CONFIG = {
            normal:  { icon: CUP_ICON,      label: 'Default Mode' },
            dark:    { icon: MOON_ICON,     label: 'Dark Mode' },
            playful: { icon: LOLLIPOP_ICON, label: 'Playful Mode' },
        };

        function applyTheme(theme) {
            // Atribut WAJIB di <html> (documentElement), bukan <body> --
            // "html,body{ background:var(--cream); }" mem-paint html dan body
            // sebagai elemen terpisah. html adalah leluhur body (dan justru
            // = :root), jadi override di body tidak pernah "naik" ke html --
            // html tetap resolve --cream dari :root dasar (terang), sisanya
            // sisa area viewport di bawah tinggi body jadi kotak krem yang
            // tidak ikut tema. Pasang di <html> supaya satu-satunya sumber
            // kebenaran dan otomatis diwarisi ke seluruh dokumen.
            document.documentElement.setAttribute('data-theme', theme);
            const badge = document.getElementById('theme-toggle');
            badge.querySelector('.theme-icon').innerHTML = THEME_CONFIG[theme].icon;
            badge.querySelector('.theme-label').textContent = THEME_CONFIG[theme].label;
            localStorage.setItem('cafebot-theme', theme);
        }

        document.getElementById('theme-toggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'normal';
            const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
            applyTheme(next);
        });

        applyTheme(localStorage.getItem('cafebot-theme') || 'normal');

        // ---------- Halaman (bukan kartu) yang scroll: jaga konten tidak
        // ketutupan header/footer fixed dengan menyamakan padding body ----------
        function syncChromePadding(){
            document.body.style.paddingTop = headerEl.offsetHeight + 'px';
            // Minimal 130px -- kalau kurang, pesan berhenti tepat di tepi
            // composer dan fade tidak sempat kelihatan bekerja.
            document.body.style.paddingBottom = Math.max(footerEl.offsetHeight + 20, 130) + 'px';
            // --header-height dipakai .top-fade supaya posisinya selalu pas
            // di bawah garis header, walau tinggi header berubah (mis. media
            // query mobile mengecilkan padding-nya).
            document.documentElement.style.setProperty('--header-height', headerEl.offsetHeight + 'px');
        }
        window.addEventListener('load', syncChromePadding);
        window.addEventListener('resize', syncChromePadding);
        new ResizeObserver(syncChromePadding).observe(footerEl);
        syncChromePadding();

        // ---------- Katalog menu untuk widget (fetch sekali saat halaman dimuat) ----------
        let menuCache = null;
        async function ensureMenuCache(){
            if (menuCache !== null) return menuCache;
            try {
                const res = await fetch(window.CHAT_MENU_URL);
                const data = await res.json();
                menuCache = data.items || [];
            } catch (e) {
                menuCache = [];
            }
            return menuCache;
        }
        window.addEventListener('load', ensureMenuCache);

        // ---------- Kunci composer selama alur pemesanan berjalan ----------
        // orderingInProgress: true sejak widget menu pertama muncul, sampai
        // salah satu titik akhir (Batal Pesan / Cash / sukses QRIS).
        // awaitingReply: true selagi menunggu balasan /predict -- menggantikan
        // toggle manual sendBtn.disabled yang lama, supaya cuma ADA SATU
        // tempat yang memutuskan boleh/tidaknya mengetik & mengirim.
        let orderingInProgress = false;
        let awaitingReply = false;

        function updateComposerState(){
            const hasText = input.value.trim().length > 0;
            const locked = orderingInProgress || awaitingReply;
            input.disabled = locked;
            sendBtn.disabled = locked || !hasText;
            sendBtn.classList.toggle('is-ready', !sendBtn.disabled);
        }

        function formatRupiah(n){
            return 'Rp ' + n.toLocaleString('id-ID');
        }

        // ---------- Popup deskripsi menu (?) -- satu overlay global, dipakai
        // oleh SEMUA widget/baris. Murni tampilan, tidak menyentuh qty/state
        // pemesanan apapun. Diletakkan di document.body supaya position:fixed-nya
        // tidak pernah ke-clip oleh bubble/widget manapun (yang punya overflow
        // sendiri), dan z-index-nya sengaja sangat tinggi (9999) supaya selalu
        // di atas seluruh bubble chat lain.
        let activeInfoPopup = null;
        let activeInfoBtn = null;

        function closeInfoPopup(){
            if (activeInfoPopup) {
                activeInfoPopup.remove();
                activeInfoPopup = null;
                activeInfoBtn = null;
            }
        }

        function openInfoPopup(btn, text){
            closeInfoPopup();

            const popup = document.createElement('div');
            popup.className = 'menu-info-popup';
            popup.textContent = text;
            document.body.appendChild(popup);

            const margin = 8;
            const btnRect = btn.getBoundingClientRect();
            const popupRect = popup.getBoundingClientRect();
            const viewportW = window.innerWidth;
            const viewportH = window.innerHeight;

            let left = btnRect.right + margin;
            let top = btnRect.top + btnRect.height / 2 - popupRect.height / 2;
            let placedSideways = false;

            // 1. Coba di KANAN tombol dulu
            if (left + popupRect.width <= viewportW - margin) {
                placedSideways = true;
            } else {
                // 2. Kalau tidak muat, coba di KIRI tombol
                const leftAlt = btnRect.left - popupRect.width - margin;
                if (leftAlt >= margin) {
                    left = leftAlt;
                    placedSideways = true;
                }
            }

            // 3. Kalau dua-duanya tidak muat (mis. layar sempit ~400px),
            // tampil mengambang di ATAS (atau BAWAH kalau atas juga tidak cukup)
            if (!placedSideways) {
                left = Math.min(Math.max(btnRect.left + btnRect.width / 2 - popupRect.width / 2, margin), viewportW - popupRect.width - margin);
                const above = btnRect.top - popupRect.height - margin;
                top = above >= margin ? above : btnRect.bottom + margin;
            }

            // Jaga-jaga tetap dalam viewport secara vertikal
            top = Math.min(Math.max(top, margin), viewportH - popupRect.height - margin);

            popup.style.left = left + 'px';
            popup.style.top = top + 'px';

            activeInfoPopup = popup;
            activeInfoBtn = btn;
        }

        // Klik di luar popup (atau scroll/resize halaman) menutupnya.
        document.addEventListener('click', (e) => {
            if (!activeInfoPopup) return;
            if (e.target === activeInfoBtn || activeInfoPopup.contains(e.target)) return;
            closeInfoPopup();
        });
        document.addEventListener('scroll', () => closeInfoPopup(), true);
        window.addEventListener('resize', () => closeInfoPopup());

        // Tag intent yang memicu widget menu, BUKAN bubble teks biasa.
        function TRIGGER_WIDGET(intent){
            if (!intent) return false;
            if (intent === 'mau_pesan') return true;
            if (intent === 'tanya_menu') return true;
            if (intent.startsWith('harga_')) return true;
            return false;
        }

        function scrollToBottom(){
            window.scrollTo({ top: document.documentElement.scrollHeight, behavior:'auto' });
        }

        // ---------- Format & refresh label waktu dinamis ----------
        function formatMessageTime(ts){
            const d = new Date(ts);
            const now = new Date();
            const sameDay = d.getFullYear() === now.getFullYear() &&
                             d.getMonth() === now.getMonth() &&
                             d.getDate() === now.getDate();
            const pad = n => String(n).padStart(2, '0');
            const hm = pad(d.getHours()) + ':' + pad(d.getMinutes());

            if (sameDay) {
                const elapsedSec = (now - d) / 1000;
                return elapsedSec < 30 ? 'Baru saja' : hm;
            }
            const tanggal = pad(d.getDate()) + '/' + pad(d.getMonth()+1) + '/' + d.getFullYear();
            return hm + ' · ' + tanggal;
        }

        function refreshTimestamps(){
            document.querySelectorAll('.meta[data-ts]').forEach(el => {
                const label = el.querySelector('.meta-label');
                if (label) {
                    label.textContent = el.dataset.sender + ' · ' + formatMessageTime(Number(el.dataset.ts));
                }
            });
        }
        setInterval(refreshTimestamps, 5000);

        // ---------- Tambah bubble pesan ke layar ----------
        function addMessage(text, isUser = false) {
            const row = document.createElement('div');
            row.className = 'row ' + (isUser ? 'user' : 'bot');

            const formattedText = text.replace(/\n/g, '<br>');
            const sender = isUser ? 'Kamu' : 'Cafebot';
            const icon = isUser ? PERSON_ICON : CUP_ICON;

            row.innerHTML = `
                <div class="bubble">${formattedText}</div>
                <div class="meta" data-ts="${Date.now()}" data-sender="${sender}">
                    <span class="avatar">${icon}</span>
                    <span class="meta-label"></span>
                </div>
            `;

            chatContainer.appendChild(row);
            refreshTimestamps();
            scrollToBottom();
            return row;
        }

        // ---------- Typing indicator ----------
        function showTyping() {
            const row = document.createElement('div');
            row.className = 'row bot';
            row.id = 'typing-row';
            row.innerHTML = `
                <div class="bubble">
                    <span class="typing-dots"><span></span><span></span><span></span></span>
                </div>
            `;
            chatContainer.appendChild(row);
            scrollToBottom();
        }

        function hideTyping() {
            const row = document.getElementById('typing-row');
            if (row) row.remove();
        }

        // ---------- Bubble bot berisi elemen DOM widget (bukan teks polos) ----------
        // Meniru struktur row/bubble/meta persis seperti addMessage(), supaya avatar,
        // timestamp dinamis, dan gaya bubble tetap konsisten dengan pesan biasa.
        function addWidgetMessage(contentEl) {
            const row = document.createElement('div');
            row.className = 'row bot';

            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.appendChild(contentEl);

            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.dataset.ts = Date.now();
            meta.dataset.sender = 'Cafebot';
            meta.innerHTML = `<span class="avatar">${CUP_ICON}</span><span class="meta-label"></span>`;

            row.appendChild(bubble);
            row.appendChild(meta);

            chatContainer.appendChild(row);
            refreshTimestamps();
            scrollToBottom();
            return row;
        }

        // ---------- Widget menu: 3 section (Kopi/Non-Kopi/Makanan) + stepper + total ----------
        // State qty per-widget disimpan di closure `qty` -- tiap panggilan
        // createMenuWidget() dapat objek qty BARU, jadi widget lama di riwayat
        // chat tidak pernah ikut berubah saat widget baru dibuka.
        function createMenuWidget(){
            // Satu sumber kebenaran per widget instance (closure) -- baik stepper
            // di daftar kategori maupun stepper mini di bagian "Pesanan" sama-sama
            // memanggil changeQty(), yang SELALU diakhiri dengan renderBody() supaya
            // ketiganya (kategori, Pesanan, Total) tidak pernah bisa saling beda.
            const qty = {};
            const categories = [
                { key: 'kopi', label: 'Kopi' },
                { key: 'non_kopi', label: 'Non-Kopi' },
                { key: 'makanan', label: 'Makanan' },
            ];
            const items = menuCache || [];
            items.forEach(item => { qty[item.id] = 0; });

            const wrap = document.createElement('div');
            wrap.className = 'widget-box';

            // Wadah bagian yang di-render ULANG SELURUHNYA tiap qty berubah:
            // daftar kategori + bagian Pesanan + Total. display:contents supaya
            // anak-anaknya tetap dianggap flex-item langsung dari .widget-box
            // (gap 14px antar bagian tetap konsisten seperti sebelum ada wrapper ini).
            const bodyContainer = document.createElement('div');
            bodyContainer.style.display = 'contents';
            wrap.appendChild(bodyContainer);

            const btnCancel = document.createElement('button');
            btnCancel.type = 'button';
            btnCancel.className = 'btn-outline';
            btnCancel.textContent = 'Batal Pesan';

            const btnOrder = document.createElement('button');
            btnOrder.type = 'button';
            btnOrder.className = 'btn-primary';
            btnOrder.textContent = 'Pesan Sekarang';
            btnOrder.disabled = true;

            const actions = document.createElement('div');
            actions.className = 'menu-actions';
            actions.appendChild(btnCancel);
            actions.appendChild(btnOrder);
            wrap.appendChild(actions);

            const hint = document.createElement('div');
            hint.className = 'menu-widget-hint';
            hint.textContent = 'Silahkan kak, bisa dicek atau dipilih di menu ya 😊';
            wrap.appendChild(hint);

            function currentTotal(){
                return items.reduce((sum, item) => sum + (qty[item.id] || 0) * item.price, 0);
            }

            // Item dengan qty>0, urutannya ikut urutan kemunculan di daftar kategori
            // (Kopi -> Non-Kopi -> Makanan) -- BUKAN urutan "terakhir diklik".
            function orderedSelectedItems(){
                const result = [];
                categories.forEach(cat => {
                    items.filter(i => i.category === cat.key && (qty[i.id] || 0) > 0)
                        .forEach(i => result.push(i));
                });
                return result;
            }

            function buildItemRow(item, { mini = false, showLineTotal = false, showInfo = true } = {}){
                const row = document.createElement('div');
                row.className = 'menu-item-row';

                const main = document.createElement('div');
                main.className = 'menu-item-row-main';

                const nameWrap = document.createElement('span');
                nameWrap.className = 'menu-item-name-wrap';

                const name = document.createElement('span');
                name.className = 'menu-item-name';
                name.textContent = item.name;
                nameWrap.appendChild(name);

                const price = document.createElement('span');
                price.className = 'menu-item-price';
                price.textContent = formatRupiah(showLineTotal ? item.price * qty[item.id] : item.price);

                const stepper = document.createElement('div');
                stepper.className = mini ? 'stepper stepper-mini' : 'stepper';

                const btnMinus = document.createElement('button');
                btnMinus.type = 'button';
                btnMinus.textContent = '−';
                btnMinus.addEventListener('click', () => changeQty(item.id, -1));

                const qtyLabel = document.createElement('span');
                qtyLabel.className = 'qty';
                qtyLabel.textContent = String(qty[item.id] || 0);

                const btnPlus = document.createElement('button');
                btnPlus.type = 'button';
                btnPlus.textContent = '+';
                btnPlus.addEventListener('click', () => changeQty(item.id, 1));

                stepper.appendChild(btnMinus);
                stepper.appendChild(qtyLabel);
                stepper.appendChild(btnPlus);

                // Grup {stepper, tombol (?)} dibungkus terpisah dari .stepper itu
                // sendiri -- kalau (?) ditaruh SEBAGAI ANAK .stepper, selector CSS
                // ".stepper button" (lebih spesifik dari ".menu-info-btn") akan
                // menimpa bentuk/warnanya jadi bulat putih seperti tombol +/-.
                // Dengan dibungkus di sini, ".menu-info-btn" tidak lagi bentrok.
                const actionsGroup = document.createElement('div');
                actionsGroup.className = 'menu-item-actions';
                actionsGroup.appendChild(stepper);

                // Tombol (?) HANYA di daftar kategori (showInfo=true) -- TIDAK di
                // bagian "Pesanan" (showInfo=false). Murni informatif: buka/tutup
                // popup deskripsi, TIDAK memanggil changeQty/renderBody -- tidak
                // mengubah qty, tidak memicu pesan, tidak menutup widget.
                if (showInfo && item.description) {
                    const infoBtn = document.createElement('button');
                    infoBtn.type = 'button';
                    infoBtn.className = 'menu-info-btn';
                    infoBtn.textContent = '?';
                    infoBtn.setAttribute('aria-label', 'Info ' + item.name);

                    // lastHoverOpenAt menghindari race klasik: klik mouse yang
                    // datang lewat gerakan (bukan sudah nangkring di tombol)
                    // SELALU memicu mouseenter dulu sebelum click di browser asli.
                    // Tanpa guard ini, hover akan membuka popup lalu click yang
                    // menyusul langsung menutupnya lagi (kelap-kelip sekali klik).
                    let lastHoverOpenAt = 0;

                    infoBtn.addEventListener('mouseenter', () => {
                        openInfoPopup(infoBtn, item.description);
                        lastHoverOpenAt = Date.now();
                    });
                    infoBtn.addEventListener('mouseleave', () => {
                        if (activeInfoBtn === infoBtn) closeInfoPopup();
                    });
                    infoBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const justOpenedByHover = (Date.now() - lastHoverOpenAt) < 250;
                        if (activeInfoBtn === infoBtn) {
                            if (!justOpenedByHover) closeInfoPopup();
                        } else {
                            openInfoPopup(infoBtn, item.description);
                        }
                    });

                    actionsGroup.appendChild(infoBtn);
                }

                main.appendChild(nameWrap);
                main.appendChild(price);
                main.appendChild(actionsGroup);
                row.appendChild(main);
                return row;
            }

            function renderBody(){
                bodyContainer.innerHTML = '';

                // 1. Daftar kategori (persis seperti sebelumnya)
                categories.forEach(cat => {
                    const catItems = items.filter(i => i.category === cat.key);
                    if (catItems.length === 0) return;

                    const title = document.createElement('div');
                    title.className = 'menu-section-title menu-category-title';
                    title.textContent = cat.label;
                    bodyContainer.appendChild(title);

                    catItems.forEach(item => {
                        bodyContainer.appendChild(buildItemRow(item, { mini: false, showLineTotal: false, showInfo: true }));
                    });
                });

                // 2. Bagian "Pesanan" -- HANYA dirender kalau ada minimal 1 item qty>0
                const selected = orderedSelectedItems();
                if (selected.length > 0) {
                    const divider = document.createElement('div');
                    divider.className = 'menu-divider';
                    bodyContainer.appendChild(divider);

                    // Wadah visual (background + border mustard muda) khusus bagian
                    // "Pesanan" -- struktur/state tidak berubah, ini murni kosmetik.
                    const pesananBox = document.createElement('div');
                    pesananBox.className = 'menu-pesanan-box';

                    const pesananTitle = document.createElement('div');
                    pesananTitle.className = 'menu-section-title menu-pesanan-title';
                    pesananTitle.textContent = 'Pesanan';
                    pesananBox.appendChild(pesananTitle);

                    selected.forEach(item => {
                        pesananBox.appendChild(buildItemRow(item, { mini: true, showLineTotal: true, showInfo: false }));
                    });

                    bodyContainer.appendChild(pesananBox);
                }

                // 3. Total
                const total = currentTotal();
                const totalRow = document.createElement('div');
                totalRow.className = 'menu-total-row';
                totalRow.innerHTML = `<span>Total</span><span>${formatRupiah(total)}</span>`;
                bodyContainer.appendChild(totalRow);

                btnOrder.disabled = total <= 0;
            }

            function changeQty(itemId, delta){
                const current = qty[itemId] || 0;
                qty[itemId] = Math.max(0, Math.min(20, current + delta));
                renderBody();
            }

            function freeze(){
                wrap.classList.add('frozen');
                wrap.querySelectorAll('button').forEach(b => b.disabled = true);
            }

            btnCancel.addEventListener('click', () => {
                freeze();
                showTyping();
                setTimeout(() => {
                    hideTyping();
                    orderingInProgress = false;
                    updateComposerState();
                    addMessage('Baik kak, ada yang bisa dibantu lagi?', false);
                }, 700);
            });

            btnOrder.addEventListener('click', () => {
                const total = currentTotal();
                if (total <= 0) return;

                const summaryItems = orderedSelectedItems();

                freeze();

                // Ganti isi widget jadi ringkasan read-only (tetap kelihatan sebagai
                // riwayat, bukan dihapus).
                wrap.innerHTML = '';
                const summaryTitle = document.createElement('div');
                summaryTitle.className = 'menu-section-title';
                summaryTitle.textContent = 'Ringkasan Pesanan';
                wrap.appendChild(summaryTitle);

                summaryItems.forEach(item => {
                    const line = document.createElement('div');
                    line.className = 'menu-item-row';
                    const main = document.createElement('div');
                    main.className = 'menu-item-row-main';
                    const name = document.createElement('span');
                    name.className = 'menu-item-name';
                    name.textContent = `${item.name} ×${qty[item.id]}`;
                    const price = document.createElement('span');
                    price.className = 'menu-item-price';
                    price.textContent = formatRupiah(item.price * qty[item.id]);
                    main.appendChild(name);
                    main.appendChild(price);
                    line.appendChild(main);
                    wrap.appendChild(line);
                });

                const finalTotalRow = document.createElement('div');
                finalTotalRow.className = 'menu-total-row';
                finalTotalRow.innerHTML = `<span>Total</span><span>${formatRupiah(total)}</span>`;
                wrap.appendChild(finalTotalRow);

                showTyping();
                setTimeout(() => {
                    hideTyping();
                    addPaymentWidget(total);
                }, 700);
            });

            renderBody();
            return wrap;
        }

        // ---------- Widget pembayaran: pilih Cash / QRIS ----------
        function addPaymentWidget(total){
            const wrap = document.createElement('div');
            wrap.className = 'widget-box';

            const text = document.createElement('div');
            text.textContent = 'Mau bayar cash atau QRIS kak?';
            wrap.appendChild(text);

            const btnCash = document.createElement('button');
            btnCash.type = 'button';
            btnCash.textContent = 'Cash';

            const btnQris = document.createElement('button');
            btnQris.type = 'button';
            btnQris.textContent = 'QRIS';

            const payButtons = document.createElement('div');
            payButtons.className = 'pay-buttons';
            payButtons.appendChild(btnCash);
            payButtons.appendChild(btnQris);
            wrap.appendChild(payButtons);

            function freeze(){
                wrap.classList.add('frozen');
                btnCash.disabled = true;
                btnQris.disabled = true;
            }

            btnCash.addEventListener('click', () => {
                freeze();
                showTyping();
                setTimeout(() => {
                    hideTyping();
                    orderingInProgress = false;
                    updateComposerState();
                    addMessage(`Silakan bayar di kasir kak, total ${formatRupiah(total)} ya. Terima kasih! 🙏`, false);
                }, 700);
            });

            btnQris.addEventListener('click', () => {
                freeze();
                showTyping();
                setTimeout(() => {
                    hideTyping();
                    addQrisWidget(total);
                }, 700);
            });

            addWidgetMessage(wrap);
        }

        // ---------- Widget QRIS: gambar placeholder + konfirmasi pembayaran ----------
        function addQrisWidget(total){
            const wrap = document.createElement('div');
            wrap.className = 'widget-box qris-widget';

            const img = document.createElement('img');
            img.src = '/images/qris_cafe.png';
            img.alt = 'QRIS';
            img.className = 'qris-image';
            wrap.appendChild(img);

            const text = document.createElement('div');
            text.textContent = `Silakan bayar berdasarkan nominal berikut ya kak, ${formatRupiah(total)}`;
            wrap.appendChild(text);

            const btnConfirm = document.createElement('button');
            btnConfirm.type = 'button';
            btnConfirm.className = 'qris-confirm-btn';
            btnConfirm.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><polyline points="21 3 21 9 15 9"></polyline></svg><span>Konfirmasi Pembayaran</span>`;
            wrap.appendChild(btnConfirm);

            btnConfirm.addEventListener('click', () => {
                btnConfirm.disabled = true;
                btnConfirm.classList.add('spinning');
                setTimeout(() => {
                    btnConfirm.classList.remove('spinning');
                    wrap.classList.add('frozen');
                    showTyping();
                    setTimeout(() => {
                        hideTyping();
                        orderingInProgress = false;
                        updateComposerState();
                        addMessage('Pembayaran berhasil dikonfirmasi kak! Pesanan kamu sedang diproses, ditunggu ya 🙏☕', false);
                    }, 700);
                }, 2500);
            });

            addWidgetMessage(wrap);
        }

        // ---------- Auto-grow textarea ----------
        const MAX_INPUT_HEIGHT = 120;
        function autoGrow(){
            input.style.height = 'auto';
            const next = Math.min(input.scrollHeight, MAX_INPUT_HEIGHT);
            input.style.height = next + 'px';
            input.style.overflowY = input.scrollHeight > MAX_INPUT_HEIGHT ? 'auto' : 'hidden';
            chatForm.classList.toggle('multiline', input.scrollHeight > 52);
            syncChromePadding();
            updateComposerState();
        }
        input.addEventListener('input', autoGrow);
        updateComposerState();

        input.addEventListener('keydown', function(e){
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm.requestSubmit();
            }
        });

        // ---------- Kirim pesan ----------
        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = input.value.trim();
            if (!message) return;

            addMessage(message, true);
            input.value = '';
            input.style.height = 'auto';
            chatForm.classList.remove('multiline');
            syncChromePadding();

            awaitingReply = true;
            updateComposerState();
            showTyping();

            try {
                const response = await fetch(window.CHAT_SEND_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': csrfToken
                    },
                    body: JSON.stringify({ message: message })
                });

                const data = await response.json();
                hideTyping();

                if (TRIGGER_WIDGET(data.intent)) {
                    await ensureMenuCache();
                    // Widget menu baru muncul -- kunci composer sampai salah satu
                    // titik akhir alur pemesanan tercapai (Batal Pesan / Cash / sukses QRIS).
                    orderingInProgress = true;
                    addWidgetMessage(createMenuWidget());
                } else {
                    addMessage(data.reply, false);
                }
            } catch (error) {
                hideTyping();
                addMessage("Aduh kak, koneksi internet/sistem sedang bermasalah. Coba sesaat lagi ya!", false);
            } finally {
                awaitingReply = false;
                updateComposerState();
                input.focus();
            }
        });

        // Pesan sambutan awal
        addMessage(
            "Halo, kak! Selamat datang di Cafe Kita 😊 Di sini kakak bisa:\n" +
            "• Tanya menu & harga (contoh: 'harga americano berapa?')\n" +
            "• Minta rekomendasi (contoh: 'rekomendasiin kopi dong')\n" +
            "• Langsung pesan cukup ketik 'mau pesan' atau 'lihat menu', nanti muncul daftar menu lengkap dengan tombol jumlah, tinggal atur pesanan lalu pilih bayar. Mudah kok!\n" +
            "Ada yang bisa dibantu hari ini, kak?",
            false
        );
