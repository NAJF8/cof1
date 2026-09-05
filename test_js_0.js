
        // ════════════════════════════════════════════════════════
        // 101 COFFEE — CLIENT ENGINE & REALTIME SYNC
        // ════════════════════════════════════════════════════════
        const firebaseConfig = {
            apiKey: "AIzaSyD2oQ1UGsFrIqSu2nQX6m6zQbkQ3AEYwhM",
            authDomain: "coffee-30fa7.firebaseapp.com",
            databaseURL: "https://coffee-30fa7-default-rtdb.firebaseio.com",
            projectId: "coffee-30fa7",
            storageBucket: "coffee-30fa7.firebasestorage.app",
            messagingSenderId: "270560177888",
            appId: "1:270560177888:web:25445d71b2a7097515ea85",
            measurementId: "G-GS7B79LHCE"
        };
        let db = null, auth = null, cloudFunctions = null;
        try {
            if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            auth = firebase.auth();
            cloudFunctions = typeof firebase.functions === 'function' ? firebase.functions() : null;
        } catch (e) {
            console.error("Firebase init failed", e);
        }

        // ── Splash Screen ──────────────────────────────────────
        setTimeout(() => {
            const s = document.getElementById("splashScreen");
            if (s) {
                s.style.transition = "opacity .5s ease";
                s.style.opacity = "0";
                setTimeout(() => s.style.display = "none", 500);
            }
        }, 1800);
        window.addEventListener("click", () => {
            const s = document.getElementById("splashScreen");
            if (s && s.style.display !== "none") s.style.display = "none";
        }, { once: true });

        // ── Storage Helpers ────────────────────────────────────
        const _load = (k, fb) => {
            try {
                const v = localStorage.getItem("coffee101_" + k);
                return v ? JSON.parse(v) : fb;
            } catch { return fb; }
        };
        const _save = (k, v) => {
            try { localStorage.setItem("coffee101_" + k, JSON.stringify(v)); } catch(e){}
        };

        // ── Bilingual Engine (AR / EN) ─────────────────────────
        let currentLang = _load("lang", "ar");
        const I18N = {
            ar: {
                nav_menu: "المنيو",
                nav_events: "الفعاليات",
                nav_room: "حجز الغرفة",
                nav_about: "من نحن",
                nav_location: "الموقع",
                header_loyalty: "الولاء",
                hero_eyebrow: "COFFEE • SWEETS • DRINKS",
                hero_title: "مزاجك يستاهل<br><em class=\"shop-name-txt\">101 COFFEE</em> 🤎",
                hero_sub: "اختار طلبك واستمتع بأشهى أنواع القهوة والمشروبات",
                browse_menu: "تصفح المنيو",
                discover_eyebrow: "DISCOVER",
                choose_mood: "اختار مزاجك",
                menu_eyebrow: "OUR MENU",
                menu_title: "المنيو",
                events_eyebrow: "EVENTS & GATHERINGS",
                events_title: "الفعاليات وأيام 101",
                candle_day_title: "🕯️ يوم الشموع في 101 COFFEE",
                candle_day_desc: "فعالية شهرية حصرية في 14 من كل شهر. أجواء هادئة دافئة على ضوء الشموع وتجربة قهوة استثنائية.",
                btn_book_candle: "حجز مقعد في يوم الشموع 🕯️",
                room_eyebrow: "RESERVATION",
                room_title: "حجز غرفة الاجتماعات",
                form_name: "الاسم",
                form_phone: "رقم الهاتف",
                form_date: "التاريخ",
                form_time: "الوقت",
                form_notes: "ملاحظات إضافية",
                btn_confirm_whatsapp: "تأكيد الحجز عبر WhatsApp 📱",
                about_eyebrow: "ABOUT US",
                about_title: "من نحن",
                about_desc: "101 COFFEE HOUSE — وجهتك المثالية لتجربة القهوة المختصة الفاخرة في قلب مدينة النجف الأشرف. نقدم أشهى أنواع القهوة والمشروبات والحلويات، في أجواء هادئة ومريحة تناسب جميع المناسبات.",
                about_quote: "\"مزاجك يستاهل الأفضل — وأفضل قهوة تجدها عندنا\"",
                stat_products: "منتج مميز",
                stat_cats: "أقسام",
                stat_coffee: "قهوة مختصة",
                rating_eyebrow: "FEEDBACK",
                rating_title: "⭐ تقييم تجربتك",
                rating_sub: "رأيك يهمنا في 101 COFFEE لنقدم لك دائماً أفضل جودة ومذاق!",
                btn_send_rating: "إرسال التقييم ⭐",
                loyalty_member_label: "اسم العضو",
                loyalty_current_balance: "رصيد القلوب الحالي:",
                loyalty_pin_label: "رمز PIN الخاص بك:",
                btn_my_rewards: "🎁 مكافآتي المستحقة",
                btn_login_google: "تسجيل الدخول بـ Google / حسابي",
                btn_logout: "تسجيل الخروج",
                loyalty_guest_title: "مكافآت 101 ❤️",
                loyalty_guest_copy: "كل زيارة تقرّبك أكثر من مفاجأتك.",
                loyalty_preview_note: "للاستكشاف فقط — لا يتم حفظ أي تغيير في الحساب.",
                loyalty_login_account: "دخول إلى حسابي",
                loyalty_card_account: "بطاقتي | حساب العميل",
                loyalty_surprise_copy: "كمّل قلوبك وخلي مفاجأتك علينا ❤️",
                loyalty_view_card: "عرض بطاقتي",
                search_placeholder: "بحث...",
                ai_input_placeholder: "اكتب ذوقك أو ما تشتهيه..."
            },
            en: {
                nav_menu: "Menu",
                nav_events: "Events",
                nav_room: "Meeting Room",
                nav_about: "About Us",
                nav_location: "Location",
                header_loyalty: "Loyalty",
                hero_eyebrow: "COFFEE • SWEETS • DRINKS",
                hero_title: "You Deserve The Best<br><em class=\"shop-name-txt\">101 COFFEE</em> 🤎",
                hero_sub: "Choose your favorite coffee, specialty drinks, and delicious desserts.",
                browse_menu: "Explore Menu",
                discover_eyebrow: "DISCOVER",
                choose_mood: "Choose Your Mood",
                menu_eyebrow: "OUR MENU",
                menu_title: "Menu",
                events_eyebrow: "EVENTS & GATHERINGS",
                events_title: "Events & 101 Days",
                candle_day_title: "🕯️ Candle Day at 101 COFFEE",
                candle_day_desc: "Monthly exclusive event on the 14th of each month. Cozy candlelit atmosphere & exceptional coffee experience.",
                btn_book_candle: "Reserve Seat for Candle Day 🕯️",
                room_eyebrow: "RESERVATION",
                room_title: "Meeting Room Booking",
                form_name: "Full Name",
                form_phone: "Phone Number",
                form_date: "Date",
                form_time: "Time",
                form_notes: "Additional Notes",
                btn_confirm_whatsapp: "Confirm Booking via WhatsApp 📱",
                about_eyebrow: "ABOUT US",
                about_title: "About Us",
                about_desc: "101 COFFEE HOUSE — Your premier destination for specialty coffee in the heart of Najaf. We offer exquisite beverages and sweets in a relaxing atmosphere.",
                about_quote: "\"You deserve the best — and the finest coffee is found here\"",
                stat_products: "Unique Items",
                stat_cats: "Categories",
                stat_coffee: "Specialty Coffee",
                rating_eyebrow: "FEEDBACK",
                rating_title: "⭐ Rate Your Experience",
                rating_sub: "Your feedback helps 101 COFFEE deliver the utmost quality and taste!",
                btn_send_rating: "Submit Rating ⭐",
                loyalty_member_label: "Member Name",
                loyalty_current_balance: "Current Hearts Balance:",
                loyalty_pin_label: "Your Private PIN:",
                btn_my_rewards: "🎁 My Available Rewards",
                btn_login_google: "Sign in with Google / My Account",
                btn_logout: "Sign Out",
                loyalty_guest_title: "101 Rewards ❤️",
                loyalty_guest_copy: "Every visit brings you closer to your surprise.",
                loyalty_preview_note: "Explore only — this never changes your account.",
                loyalty_login_account: "Sign in to my account",
                loyalty_card_account: "My Card | Customer Account",
                loyalty_surprise_copy: "Complete your hearts and leave the surprise to us ❤️",
                loyalty_view_card: "View my card",
                search_placeholder: "Search menu...",
                ai_input_placeholder: "Type your taste or cravings..."
            }
        };

        function t(key) {
            return (I18N[currentLang] && I18N[currentLang][key]) || (I18N['ar'] && I18N['ar'][key]) || key;
        }

        function setText(id, text) {
            const element = document.getElementById(id);
            if (element) element.textContent = text;
        }

        function updateLanguageDependentUI() {
            const en = currentLang === 'en';
            setText('loyaltyLoginTitle', en ? 'Sign in to 101 Rewards' : 'تسجيل الدخول إلى مكافآت 101');
            setText('loyaltyLoginSubtitle', en ? 'Choose how you would like to access your loyalty account' : 'اختر طريقة تسجيل الدخول إلى حساب الولاء');
            setText('loyaltyLoginDivider', en ? 'or' : 'أو');
            setText('membershipLoginIdLabel', en ? 'Membership Number' : 'رقم العضوية');
            setText('membershipLoginPinLabel', en ? 'PIN' : 'رمز PIN');
            setText('membershipLoginSubmit', en ? 'Sign In' : 'تسجيل الدخول');
            setText('welcomeTitle', en ? 'Welcome to 101 Rewards ❤️' : 'أهلًا بك في مكافآت 101 ❤️');
            setText('welcomeCopy', en ? 'We are delighted to welcome you to the 101 COFFEE family.' : 'يسعدنا انضمامك إلى عائلة 101 COFFEE.');
            setText('welcomeMembershipLabel', en ? 'Your membership number' : 'رقم عضويتك');
            setText('welcomePinLabel', en ? 'Your private PIN' : 'رمز PIN الخاص بك');
            setText('welcomeHelp', en ? 'Keep these details so you can access your loyalty account later.' : 'احتفظ برقم العضوية ورمز PIN، يمكنك استخدامهما للدخول إلى حساب الولاء لاحقًا.');
            setText('welcomeStartBtn', en ? 'Start now' : 'ابدأ الآن');
            setText('aiChatTitle', en ? '101 Smart Barista ☕' : 'باريستا 101 الذكي ☕');
            setText('aiChatSubtitle', en ? 'Ready to help you choose your order' : 'جاهز لمساعدتك في اختيار طلبك');
            setText('aiChatSubmit', en ? 'Send' : 'إرسال');
            if (loyaltyAuthStatusKey === 'provision_pending') setText('loyaltyAuthStatus', en ? 'Signed in successfully, but your rewards account needs activation.' : 'تم تسجيل الدخول بنجاح، لكن حساب المكافآت يحتاج إلى تفعيل.');
            if (loyaltyAuthStatusKey === 'provision_pending' && currentFirebaseUser) showPendingLoyaltyState(currentFirebaseUser);
            const googleLabel = document.querySelector('.google-login-label');
            if (googleLabel && !document.getElementById('loyaltyGoogleBtn')?.disabled) googleLabel.textContent = en ? 'Continue with Google' : 'تسجيل الدخول بواسطة Google';
            const candleRecurring = document.getElementById('candleRecurringBadge');
            if (candleRecurring) candleRecurring.textContent = en ? 'Every 14th of the month 🕯️' : '14 من كل شهر 🕯️';
        }

        function setLanguage(lang) {
            currentLang = lang;
            _save("lang", lang);
            document.documentElement.lang = lang;
            document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
            
            const btnTxt = document.getElementById('langSwitchTxt');
            if (btnTxt) btnTxt.textContent = (lang === 'ar') ? 'English' : 'عربي';

            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (key && I18N[lang] && I18N[lang][key]) {
                    el.innerHTML = I18N[lang][key];
                }
            });

            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (key && I18N[lang] && I18N[lang][key]) {
                    el.placeholder = I18N[lang][key];
                }
            });

            renderCategoryNav();
            renderCatalog(currentCat);
            updateLanguageDependentUI();
            updateCandleDayUI();
            const aboutTitle = document.getElementById('aboutTitleText');
            const aboutDesc = document.getElementById('aboutDescText');
            const aboutQuote = document.getElementById('aboutQuoteText');
            if (aboutTitle && settings) aboutTitle.textContent = lang === 'en' ? (settings.aboutEnTitle || aboutTitle.textContent) : (settings.aboutArTitle || aboutTitle.textContent);
            if (aboutDesc && settings) aboutDesc.textContent = lang === 'en' ? (settings.aboutEnDesc || aboutDesc.textContent) : (settings.aboutArDesc || aboutDesc.textContent);
            if (aboutQuote && settings) aboutQuote.textContent = lang === 'en' ? (settings.aboutEnQuote || t('about_quote')) : (settings.aboutArQuote || t('about_quote'));
        }

        window.toggleLanguage = function() {
            setLanguage(currentLang === 'ar' ? 'en' : 'ar');
        };

        // ── State Variables ────────────────────────────────────
        let products = [],
            categoriesDB = [],
            rewardsDB = [],
            bookings = [],
            eventsDB = [],
            tablesDB = [],
            eventBookingsDB = [],
            backgroundSettings = { enabled: false, type: 'none', imageUrl: '', videoUrl: '', fallbackImageUrl: '' },
            candleSettings = { enabled: true, startTime: '16:00', endTime: '18:00', capacity: 10, price: 0 },
            aiConfig = { enabled: true, provider: 'smart_rules', model: 'gemini-1.5-flash', welcomeAr: 'أهلاً بك في 101 COFFEE! ☕ أنا باريستا 101 الذكي، كيف تحب تشرب قهوتك اليوم؟', welcomeEn: 'Welcome to 101 COFFEE! ☕ I am Barista 101, how would you like your coffee today?' },
            settings = {
                shopName: "101 COFFEE",
                whatsapp: "9647800000000",
                roomWhatsapp: "",
                instagram: "101coffee",
                mapUrl: "",
                address: "النجف الأشرف",
                roomPrice: 10000,
                enablePopular: true,
                enableOffers: true,
                enableLoyalty: true,
                ordersOpen: true,
                showAllCategoryTab: true,
                showAllCategories: true
            };

        let cart = _load("cart", []),
            previewHearts = 0,
            currentCat = "all",
            loyaltyCustomer = null,
            loyaltyCustomerRef = null,
            currentFirebaseUser = null,
            loyaltyAuthStatusKey = '',
            isPinRevealed = false,
            selectedRatingStars = 5,
            userPinRaw = "••••",
            lastOrderId = '';

        const deliveryAreas = [
            { name: "النجف المركز", price: 2000 },
            { name: "الكوفة", price: 3000 }
        ];

        // ── Helper Utilities ───────────────────────────────────
        const money = n => new Intl.NumberFormat("en-US").format(Number(n) || 0) + (currentLang === 'en' ? " IQD" : " د.ع");
        const localizedText = (record, field) => {
            if (!record) return '';
            const suffix = currentLang === 'en' ? 'En' : 'Ar';
            const otherSuffix = currentLang === 'en' ? 'Ar' : 'En';
            return record[`${field}${suffix}`] || record[`${field}${otherSuffix}`] || record[field] || '';
        };
        const productName = product => localizedText(product, 'name');
        const productDescription = product => localizedText(product, 'description');
        const categoryName = category => localizedText(category, 'name');
        const categoryKey = category => String(category?.categoryId || category?.name || category?.nameAr || category?.id || '');
        const productCategoryKey = product => String(product?.categoryId || product?.category || '');
        const eventTitle = event => localizedText(event, 'title') || localizedText(event, 'name');
        const eventDescription = event => localizedText(event, 'description');
        const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
        const sameId = (a, b) => String(a ?? '') === String(b ?? '');
        function showToast(message, kind = 'info') {
            let toast = document.getElementById('appToast');
            if (!toast) { toast = document.createElement('div'); toast.id = 'appToast'; document.body.appendChild(toast); }
            toast.textContent = message; toast.dataset.kind = kind; toast.className = 'app-toast show';
            clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
        }
        const findProduct = id => products.find(p => sameId(p.id, id));
        const cartQtyOf = id => {
            const r = cart.find(x => sameId(x.id, id) || sameId(x.productId, id));
            return r ? Math.max(0, Number(r.qty ?? r.quantity) || 0) : 0;
        };
        const attrEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const clickEl = e => { const t = e && e.target; return t ? (t.nodeType === 1 ? t : t.parentElement) : null; };

        function safeImgSrc(url) {
            if (!url) return '';
            const u = String(url).trim();
            if (/^https?:\/\//i.test(u)) return u;
            if (u.startsWith('/') || u.startsWith('./') || u.startsWith('../') || u.startsWith('images/')) return u;
            return '';
        }

        function imgH(p, cls = "") {
            const src = safeImgSrc(p.image);
            return src ?
                `<img class="${cls}" src="${esc(src)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">` :
                `<span class="placeholder-icon" aria-hidden="true">☕</span>`;
        }

        // ── DYNAMIC BACKGROUND RENDERING ───────────────────────
        function renderBackground() {
            const wrap = document.getElementById('siteBgWrap');
            const overlay = document.getElementById('siteBgOverlay');
            if (!wrap || !overlay) return;

            if (!backgroundSettings.enabled || backgroundSettings.type === 'none') {
                wrap.style.display = 'none';
                wrap.innerHTML = '';
                overlay.style.display = 'none';
                return;
            }

            wrap.style.display = 'block';
            overlay.style.display = 'block';

            const imageUrl = safeImgSrc(backgroundSettings.imageUrl);
            const videoUrl = safeImgSrc(backgroundSettings.videoUrl);
            const fallbackUrl = safeImgSrc(backgroundSettings.fallbackImageUrl || imageUrl);
            if (backgroundSettings.type === 'video' && videoUrl) {
                wrap.innerHTML = `<video src="${esc(videoUrl)}" autoplay muted loop playsinline poster="${esc(fallbackUrl)}" onerror="handleHeroVideoError(this)"></video>`;
            } else if (imageUrl) {
                wrap.innerHTML = `<img src="${esc(imageUrl)}" alt="Background">`;
            } else {
                wrap.style.display = 'none';
                overlay.style.display = 'none';
            }
        }

        window.handleHeroVideoError = function(video) {
            const fallback = safeImgSrc(backgroundSettings.fallbackImageUrl || backgroundSettings.imageUrl);
            if (!fallback || !video?.parentElement) return;
            const img = document.createElement('img');
            img.src = fallback;
            img.alt = '101 COFFEE';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
            video.replaceWith(img);
        };

        // ── CATEGORY NAVIGATION ────────────────────────────────
        function renderCategoryNav() {
            const nav = document.getElementById("categoryNav");
            if (!nav) return;
            const active = categoriesDB.filter(c => c.active !== false && categoryKey(c));
            const showAll = settings.showAllCategories !== false && settings.showAllCategoryTab !== false;

            if (!showAll && currentCat === 'all' && active.length) {
                currentCat = categoryKey(active[0]);
            }

            let html = '';
            if (showAll) {
                html += `<button class="category-btn category-tone-2 ${currentCat==='all'?'active':''}" data-cat="all" aria-pressed="${currentCat==='all'}">${currentLang==='en'?'All':'الكل'}</button>`;
            }
            active.forEach((c, index) => {
                const key = categoryKey(c);
                html += `<button class="category-btn category-tone-${index % 4} ${currentCat===key?'active':''}" data-cat="${attrEsc(key)}" aria-pressed="${currentCat===key}">${esc(categoryName(c))}</button>`;
            });
            html += `<button class="category-btn category-tone-0 ${currentCat==='events'?'active':''}" data-cat="events" aria-pressed="${currentCat==='events'}">🎉 ${currentLang==='en'?'Events':'الفعاليات'}</button>`;

            nav.innerHTML = html;
            nav.onclick = e => {
                const b = e.target.closest("[data-cat]");
                if (!b) return;
                nav.querySelectorAll(".category-btn").forEach(x => {
                    x.classList.remove("active");
                    x.setAttribute('aria-pressed', 'false');
                });
                b.classList.add("active");
                b.setAttribute('aria-pressed', 'true');
                currentCat = b.dataset.cat;
                clearHeaderSearch();
                renderCatalog(currentCat);
                document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
            };
        }

        // ── PRODUCT CARD RENDERER ──────────────────────────────
        function card(p, inList = true) {
            const isSoon = p.comingSoon;
            const old = p.discount && p.oldPrice ? `<span class="old-price">${money(p.oldPrice)}</span>` : "";
            let badge = "";
            if (isSoon) badge = currentLang==='en'?"Soon ✨":"قريباً ✨";
            else if (p.discount || p.offer) badge = currentLang==='en'?"Offer 🏷️":"خصم 🏷️";
            else if (p.newItem) badge = currentLang==='en'?"New 🆕":"جديد 🆕";
            else if (p.popular) badge = currentLang==='en'?"Popular 🔥":"الأكثر طلباً 🔥";
            const bHtml = badge ? `<span class="badge ${isSoon?'coming-soon-badge':''}" aria-label="${badge}">${badge}</span>` : "";
            const role = inList ? 'role="listitem"' : '';
            return `<article class="product-card${isSoon?' coming-soon-card':''}" data-id="${esc(String(p.id))}" ${role} tabindex="0">
              <div class="product-img">${imgH(p)}${bHtml}</div>
              <div class="product-info">
                <h3>${esc(productName(p))}</h3>
                <p>${esc(productDescription(p))}</p>
                <div class="price-row">
                  <div class="price">${old}<strong>${isSoon?(currentLang==='en'?"Soon":"قريباً جداً"):money(p.price)}</strong></div>
                  <div class="card-actions">${cardActionsHTML(p)}</div>
                </div>
              </div>
            </article>`;
        }

        function cardActionsHTML(p) {
            if (p.comingSoon) return `<span aria-hidden="true">⏳</span>`;
            const q = cartQtyOf(p.id);
            const pid = attrEsc(String(p.id));
            if (!q) return `<button type="button" class="add-btn" data-add="${pid}" aria-label="Add to cart">+</button>`;
            return `<div class="card-tools">
              <button type="button" class="add-btn" data-card-cart="${pid}" aria-label="Open cart">🛒</button>
              <div class="card-qty">
                <button type="button" class="add-btn" data-card-minus="${pid}" aria-label="Minus">−</button>
                <b>${q}</b>
                <button type="button" class="add-btn" data-card-plus="${pid}" aria-label="Plus">+</button>
              </div>
            </div>`;
        }

        function refreshCardActions(id) {
            const p = findProduct(id);
            document.querySelectorAll(`.product-card[data-id="${CSS.escape(String(id))}"] .card-actions`).forEach(el => {
                el.innerHTML = p ? cardActionsHTML(p) : '';
            });
        }

        // ── DYNAMIC SECTIONS ───────────────────────────────────
        function renderDynamic() {
            renderAboutStats();
            const soon = document.getElementById("comingSoonArea"),
                  pop = document.getElementById("popularArea"),
                  off = document.getElementById("offersArea");
            if (soon) {
                const sl = products.filter(p => p.comingSoon);
                soon.innerHTML = sl.length ? `<div class="feature-section"><span class="eyebrow">COMING SOON</span><h2>${currentLang==='en'?'Coming Soon ✨':'قريباً ✨'}</h2><div class="feature-products">${sl.map(p=>card(p,false)).join('')}</div></div>` : "";
            }
            if (pop && settings.enablePopular) {
                const pl = products.filter(p => p.popular && !p.comingSoon).slice(0, 4);
                pop.innerHTML = pl.length ? `<div class="feature-section"><span class="eyebrow">TOP RATED</span><h2>${currentLang==='en'?'Most Popular 🔥':'الأكثر طلباً 🔥'}</h2><div class="feature-products">${pl.map(p=>card(p,false)).join('')}</div></div>` : "";
            } else if (pop) pop.innerHTML = "";
            if (off && settings.enableOffers) {
                const ol = products.filter(p => (p.offer || p.discount) && !p.comingSoon).slice(0, 4);
                off.innerHTML = ol.length ? `<div class="feature-section"><span class="eyebrow">SPECIAL OFFERS</span><h2>${currentLang==='en'?'Special Offers 🎁':'العروض والخصومات 🎁'}</h2><div class="feature-products">${ol.map(p=>card(p,false)).join('')}</div></div>` : "";
            } else if (off) off.innerHTML = "";
        }

        // ── CATALOG ────────────────────────────────────────────
        function renderCatalog(cat = "all") {
            currentCat = cat;
            const grid = document.getElementById("productsGrid");
            if (!grid) return;
            if (cat === "events") {
                renderEventsCatalog();
                return;
            }
            const list = products.filter(p => !p.hidden && !p.comingSoon && (cat === "all" || productCategoryKey(p) === cat));
            const lbl = document.getElementById("searchResultsLabel");
            if (lbl) lbl.textContent = "";
            grid.innerHTML = list.length ? list.map(p => card(p)).join('') : `<div class="empty-state" style="grid-column:1/-1">${currentLang==='en'?'No products available.':'لا توجد منتجات حالياً.'}</div>`;
            attachGridEvents();
        }

        function renderEventsCatalog() {
            const grid = document.getElementById("productsGrid");
            if (!grid) return;
            const lbl = document.getElementById("searchResultsLabel");
            if (lbl) lbl.textContent = "";
            const today = new Date().toISOString().slice(0, 10);
            const activeEvents = eventsDB
                .filter(e => e && (e.isActive !== false) && (e.status || 'active') !== 'cancelled' && (!e.date || String(e.date) >= today))
                .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
            grid.innerHTML = activeEvents.length ? activeEvents.map(eventCard).join('') : `<div class="empty-state" style="grid-column:1/-1">${currentLang==='en'?'No events available.':'لا توجد فعاليات حالياً.'}</div>`;
            grid.onclick = e => {
                const b = e.target.closest("[data-book-event]");
                if (b) openEventBooking(b.dataset.bookEvent);
            };
        }

        function eventCard(e) {
            const src = safeImgSrc(e.image);
            const seats = Number(e.capacity) || 0;
            const taken = eventBookingsDB.filter(b => b.eventId === e.id && b.status !== 'cancelled').length;
            const available = seats ? Math.max(0, seats - taken) : (currentLang==='en'?'Available':'متاحة');
            return `<article class="product-card event-card" data-id="${esc(e.id)}" role="listitem">
              <div class="product-img">${src?`<img src="${esc(src)}" alt="${esc(eventTitle(e))}" loading="lazy">`:`<span class="placeholder-icon">🎉</span>`}</div>
              <div class="product-info">
                <h3>${esc(eventTitle(e))}</h3>
                <p>${esc(eventDescription(e))}</p>
                <div class="event-meta">
                  <span><b>${currentLang==='en'?'Date:':'التاريخ:'}</b><em dir="ltr">${esc(e.date||'-')}</em></span>
                  <span><b>${currentLang==='en'?'Time:':'الوقت:'}</b><em dir="ltr">${esc(e.startTime||'-')}${e.endTime?' - '+esc(e.endTime):''}</em></span>
                  <span><b>${currentLang==='en'?'Price:':'السعر:'}</b><em>${Number(e.price)===0?(currentLang==='en'?'Free':'مجاني'):money(e.price||0)}</em></span>
                  <span><b>${currentLang==='en'?'Seats:':'المقاعد:'}</b><em>${esc(available)}${seats?` / ${seats}`:''}</em></span>
                </div>
                <button class="primary-btn full" type="button" data-book-event="${esc(e.id)}">${currentLang==='en'?'Book Now':'حجز الآن'}</button>
              </div>
            </article>`;
        }

        function productIdFromAction(btn){
            if(!btn) return '';
            return btn.getAttribute('data-add')
                || btn.getAttribute('data-card-plus')
                || btn.getAttribute('data-card-minus')
                || btn.getAttribute('data-card-cart')
                || btn.closest('.product-card')?.getAttribute('data-id')
                || '';
        }

        function handleCardCartClick(e){
            const el=clickEl(e);
            if(!el||typeof el.closest!=='function') return false;
            const btn=el.closest('[data-add],[data-card-plus],[data-card-minus],[data-card-cart]');
            if(!btn) return false;
            e.preventDefault();
            e.stopPropagation();
            if(typeof e.stopImmediatePropagation==='function') e.stopImmediatePropagation();
            const id=productIdFromAction(btn);
            if(!id) return true;
            if(btn.hasAttribute('data-add')||btn.hasAttribute('data-card-plus')) addToCart(id,1);
            else if(btn.hasAttribute('data-card-minus')) chCart(id,-1);
            else if(btn.hasAttribute('data-card-cart')) openCart();
            return true;
        }

        function attachGridEvents(){
            const grid=document.getElementById("productsGrid"); if(!grid) return;
            grid.onclick=e=>{
                if(handleCardCartClick(e)) return;
                const el=clickEl(e);
                if(!el||typeof el.closest!=='function') return;
                if(el.closest('.card-actions,.card-tools,.card-qty,.add-btn')) return;
                const i=el.closest(".product-card[data-id]");
                if(i && !i.classList.contains("coming-soon-card") && !i.classList.contains("event-card")) openProduct(i.dataset.id);
            };
        }

        // ── CART MANAGEMENT ────────────────────────────────────
        function addToCart(id, qty = 1) {
            const p = findProduct(id);
            if (!p || p.comingSoon) return;
            const row = cart.find(x => sameId(x.id, id));
            if (row) {
                row.qty += qty;
            } else {
                cart.push({ id: p.id, name: productName(p), price: p.price, image: p.image, qty: qty });
            }
            _save("cart", cart);
            renderCart();
            refreshCardActions(id);
        }

        function chCart(id, n) {
            const row = cart.find(x => sameId(x.id, id));
            if (!row) return;
            row.qty += n;
            if (row.qty <= 0) {
                cart = cart.filter(x => !sameId(x.id, id));
            }
            _save("cart", cart);
            renderCart();
            refreshCardActions(id);
        }

        function removeCart(id) {
            cart = cart.filter(x => !sameId(x.id, id));
            _save("cart", cart);
            renderCart();
            refreshCardActions(id);
        }

        function clearCart() {
            cart = [];
            _save("cart", cart);
            renderCart();
            products.forEach(p => refreshCardActions(p.id));
        }

        function openCart() {
            if (!document.body.classList.contains('modal-open')) { lockedScrollY = window.scrollY || 0; document.body.style.top = `-${lockedScrollY}px`; document.body.classList.add('modal-open'); }
            document.getElementById("cartDrawer")?.classList.add("open");
            document.getElementById("drawerBackdrop")?.classList.add("open");
        }

        function closeCart() {
            document.getElementById("cartDrawer")?.classList.remove("open");
            document.getElementById("drawerBackdrop")?.classList.remove("open");
            if (!document.querySelector('.modal.open, .drawer.open, .ai-chat-drawer.open')) { document.body.classList.remove('modal-open'); document.body.style.top=''; window.scrollTo(0, lockedScrollY); }
        }

        const ABOUT_STAT_ICONS = { coffee:'<svg class="about-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 7h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm14 2h1a3 3 0 0 0 0 6h-1v-2h1a1 1 0 0 0 0-2h-1V9ZM6 3h9v2H6V3Z"/></svg>', categories:'<svg class="about-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 5h16v4H4V5Zm0 5h16v4H4v-4Zm0 5h16v4H4v-4Z"/></svg>', star:'<svg class="about-stat-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3.1 6.3 7 .9-5.1 4.9 1.3 6.9-6.3-3.3-6.3 3.3 1.3-6.9-5.1-4.9 7-.9L12 2Z"/></svg>' };
        const DEFAULT_ABOUT_STATS = [{id:'coffee',value:'',titleAr:'قهوة مختصة',titleEn:'Specialty Coffee',icon:'coffee',show:true,order:1,calculation:'manual'},{id:'categories',value:'',titleAr:'أقسام',titleEn:'Categories',icon:'categories',show:true,order:2,calculation:'categories'},{id:'products',value:'',titleAr:'منتج مميز',titleEn:'Featured Products',icon:'star',show:true,order:3,calculation:'products'}];
        function renderAboutStats() { const grid=document.getElementById('aboutStatsGrid'); if(!grid)return; const source=Array.isArray(settings.aboutStats)&&settings.aboutStats.length?settings.aboutStats:DEFAULT_ABOUT_STATS; const productCount=products.filter(p=>!p.hidden&&p.active!==false).length, categoryCount=categoriesDB.filter(c=>c.active!==false&&categoryKey(c)).length; grid.innerHTML=source.filter(s=>s&&s.show!==false).slice().sort((a,b)=>Number(a.order||0)-Number(b.order||0)).map(s=>{const mode=s.calculation||'manual', value=mode==='products'?productCount:mode==='categories'?categoryCount:(s.value??''), title=currentLang==='en'?(s.titleEn||s.titleAr||''):(s.titleAr||s.titleEn||''); return `<div class="about-stat">${ABOUT_STAT_ICONS[s.icon]||ABOUT_STAT_ICONS.star}${value!==''?`<strong>${esc(String(value))}</strong>`:''}<span>${esc(title)}</span></div>`;}).join(''); }

        // Keep every overlay/modal from moving the page behind it, including iOS Safari.
        let lockedScrollY = 0;
        function setModalOpen(modal, open) {
            if (!modal) return;
            if (open) {
                if (!document.body.classList.contains('modal-open')) {
                    lockedScrollY = window.scrollY || 0;
                    document.body.style.top = `-${lockedScrollY}px`;
                }
                document.body.classList.add('modal-open');
                modal.classList.add('open');
            } else {
                modal.classList.remove('open');
                if (!document.querySelector('.modal.open, .drawer.open, .ai-chat-drawer.open')) {
                    document.body.classList.remove('modal-open');
                    document.body.style.top = '';
                    window.scrollTo(0, lockedScrollY);
                }
            }
        }

        function renderCart() {
            const el = document.getElementById("cartItems");
            const count = document.getElementById("cartCount");
            const total = document.getElementById("cartTotal");
            if (!el) return;

            let totalVal = 0, countVal = 0;
            if (!cart.length) {
                el.innerHTML = `<div class="empty-state">${currentLang==='en'?'Cart is empty ☕':'السلة فارغة ☕'}</div>`;
            } else {
                el.innerHTML = cart.map(r => {
                    const p = findProduct(r.id) || r;
                    const line = (p.price || 0) * r.qty;
                    totalVal += line;
                    countVal += r.qty;
                    return `<div class="cart-row">
                        <div class="cart-thumb">${imgH(p)}</div>
                        <div>
                            <h4>${esc(productName(findProduct(p.id)) || p.name)}</h4>
                            <small>${money(line)}</small>
                            <div class="mini-qty">
                                <button type="button" data-mini-minus="${attrEsc(String(p.id))}">−</button>
                                <b>${r.qty}</b>
                                <button type="button" data-mini-plus="${attrEsc(String(p.id))}">+</button>
                            </div>
                        </div>
                        <button type="button" class="delete-btn" data-mini-del="${attrEsc(String(p.id))}">×</button>
                    </div>`;
                }).join('');
            }

            if (count) count.textContent = countVal;
            if (total) total.textContent = money(totalVal);

            el.onclick = e => {
                const m = e.target.closest("[data-mini-minus]");
                const pl = e.target.closest("[data-mini-plus]");
                const d = e.target.closest("[data-mini-del]");
                if (m) chCart(m.dataset.miniMinus, -1);
                else if (pl) chCart(pl.dataset.miniPlus, 1);
                else if (d) removeCart(d.dataset.miniDel);
            };
        }

        // ── PRODUCT DETAILS MODAL ──────────────────────────────
        function openProduct(id) {
            const p = findProduct(id);
            if (!p || p.comingSoon) return;
            const modal = document.getElementById("productModal");
            const detail = document.getElementById("productDetail");
            if (!modal || !detail) return;

            detail.innerHTML = `<div class="product-detail">
                <div class="detail-img">${imgH(p)}</div>
                <div>
                    <span class="eyebrow">${esc(categoryName(categoriesDB.find(c => categoryKey(c) === productCategoryKey(p))) || p.category || '')}</span>
                    <h2>${esc(productName(p))}</h2>
                    <p>${esc(productDescription(p))}</p>
                    <div class="price"><strong>${money(p.price)}</strong></div>
                    <div class="qty">
                        <button type="button" id="detailMinus">−</button>
                        <strong id="detailQty">1</strong>
                        <button type="button" id="detailPlus">+</button>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center"><button class="primary-btn full" id="detailAdd">${currentLang==='en'?'Add to Cart 🛒':'أضف للسلة 🛒'}</button><button type="button" class="share-btn" id="detailShare" aria-label="${currentLang==='en'?'Share product':'مشاركة المنتج'}" title="${currentLang==='en'?'Share product':'مشاركة المنتج'}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4A3 3 0 0 0 15 5c0 .2.02.4.06.59L8.91 9.17a3 3 0 1 0 0 5.66l6.15 3.58A3 3 0 1 0 16 17c0-.2-.02-.4-.06-.59l6.15-3.58A3 3 0 0 0 18 8Z"/></svg></button></div>
                </div>
            </div>`;

            let qty = 1;
            document.getElementById("detailMinus").onclick = () => {
                qty = Math.max(1, qty - 1);
                document.getElementById("detailQty").textContent = qty;
            };
            document.getElementById("detailPlus").onclick = () => {
                qty++;
                document.getElementById("detailQty").textContent = qty;
            };
            document.getElementById("detailAdd").onclick = () => {
                addToCart(p.id, qty);
                setModalOpen(modal, false);
            };
            document.getElementById('detailShare').onclick = () => shareProduct(p);
            setModalOpen(modal, true);
        }

        async function shareProduct(product) { const name=productName(product), description=productDescription(product), url=`${location.href.split('#')[0]}#product-${encodeURIComponent(String(product.id))}`, text=`${name}${description?` — ${description}`:''} — ${money(product.price)}`; try { if(navigator.share){await navigator.share({title:name,text,url});return;} if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(`${text}\n${url}`); else {const area=document.createElement('textarea');area.value=`${text}\n${url}`;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();} showToast(currentLang==='en'?'Product link copied.':'تم نسخ رابط المنتج.');} catch(error) {if(error?.name!=='AbortError')showToast(currentLang==='en'?'Could not share this product.':'تعذرت مشاركة المنتج.','error');} }

        // ── CHECKOUT & WHATSAPP ────────────────────────────────
        function showCheckout() {
            if (!cart.length) return alert(currentLang==='en'?"Cart is empty.":"السلة فارغة.");
            if (settings.ordersOpen === false) return alert(currentLang==='en'?"Orders are currently closed.":"الطلبات متوقفة حاليًا.");
            const m = document.getElementById("checkoutModal");
            if (!m) return;
            const areaSel = document.getElementById("areaSelect");
            if (areaSel) {
                areaSel.innerHTML = deliveryAreas.map(a => `<option value="${a.name}">${a.name} — ${money(a.price)}</option>`).join("");
            }
            updateCheckoutSummary();
            setModalOpen(m, true);
        }

        function updateCheckoutSummary() {
            const el = document.getElementById("checkoutSummary");
            if (!el) return;
            const subtotal = cart.reduce((s, r) => { const p = findProduct(r.id) || r; return s + ((Number(p.price) || 0) * (Number(r.qty) || 0)); }, 0);
            const isDelivery = document.querySelector('input[name="type"]:checked')?.value === "delivery";
            const deliveryAreaName = document.getElementById("areaSelect")?.value;
            const deliveryPrice = isDelivery ? Number(deliveryAreas.find(a => a.name === deliveryAreaName)?.price || 0) : 0;
            el.innerHTML = `<div class="summary-line"><span>${currentLang==='en'?'Items Total:':'مجموع المنتجات:'}</span><strong>${money(subtotal)}</strong></div>
            <div class="summary-line"><span>${currentLang==='en'?'Delivery:':'التوصيل:'}</span><strong>${money(deliveryPrice)}</strong></div>
            <hr style="border:0;border-top:1px solid var(--border);margin:8px 0;">
            <div class="summary-line"><span style="font-weight:900">${currentLang==='en'?'Grand Total:':'المجموع النهائي:'}</span><strong style="color:var(--primary);font-size:16px">${money(subtotal + deliveryPrice)}</strong></div>`;
        }

        async function handleCheckoutSubmit(e) {
            e.preventDefault();
            if (settings.ordersOpen === false) return alert("الطلبات متوقفة.");
            const f = new FormData(e.target);
            const type = f.get("type");
            const subtotal = cart.reduce((s, r) => { const p = findProduct(r.id) || r; return s + ((Number(p.price) || 0) * (Number(r.qty) || 0)); }, 0);
            const deliveryPrice = type === "delivery" ? Number(deliveryAreas.find(a => a.name === f.get("area"))?.price || 0) : 0;
            
            let msg = `السلام عليكم 🌹\nطلب جديد من 101 COFFEE:\n\n`;
            cart.forEach(r => {
                msg += `☕ ${r.name} × ${r.qty} = ${money((r.price || 0) * r.qty)}\n`;
            });
            msg += `\n💵 المجموع الكلي: ${money(subtotal + deliveryPrice)}\n👤 الاسم: ${f.get("name")}\n📱 الهاتف: ${f.get("phone")}\n`;
            if (type === "delivery") msg += `🛵 نوع الطلب: توصيل - ${f.get("area")}\n🏠 العنوان: ${f.get("address")}\n📍 أقرب نقطة دالة: ${f.get("landmark") || "-"}\n`;
            else if (type === "car") msg += `🚗 استلام من السيارة\n🚘 السيارة: ${f.get('carModel') || '-'}\n🎨 اللون: ${f.get('carColor') || '-'}\n🔢 اللوحة: ${f.get('carPlate') || '-'}\n`;
            else msg += `🚶‍♂️ نوع الطلب: استلام من المحل\n`;
            msg += `📝 ملاحظات: ${f.get("notes") || "-"}\n`;
            if (!cart.length) return showToast(currentLang === 'en' ? 'Cart is empty.' : 'السلة فارغة.', 'error');
            if (!f.get('name')?.trim() || !f.get('phone')?.trim()) return showToast(currentLang === 'en' ? 'Please enter your name and phone number.' : 'يرجى إدخال الاسم ورقم الهاتف.', 'error');
            if (type === 'delivery' && (!f.get('area') || !f.get('address')?.trim())) return showToast(currentLang === 'en' ? 'Please select an area and enter the delivery address.' : 'يرجى اختيار المنطقة وإدخال عنوان التوصيل.', 'error');
            if (type === 'car' && (!f.get('carModel')?.trim() || !f.get('carColor')?.trim() || !f.get('carPlate')?.trim())) return showToast(currentLang === 'en' ? 'Please enter the car model, color, and plate.' : 'يرجى إدخال موديل السيارة ولونها ورقم اللوحة.', 'error');
            document.getElementById('giftForm')?.addEventListener('submit',async event=>{event.preventDefault();const error=document.getElementById('giftFormError');error.textContent='';const senderName=document.getElementById('giftSenderName').value.trim(),senderPhone=document.getElementById('giftSenderPhone').value.trim(),recipientName=document.getElementById('giftRecipientName').value.trim(),recipientPhone=document.getElementById('giftRecipientPhone').value.trim(),message=document.getElementById('giftMessage').value.trim(),anonymous=document.getElementById('giftAnonymous').checked,total=giftValueForSelection();if(!giftSettings.enabled)return error.textContent='نظام الهدايا غير متاح حالياً.';if(!senderName||!senderPhone||!recipientName||!recipientPhone||!giftSelection.type||!total)return error.textContent='يرجى إكمال بيانات الهدية واختيار قيمتها.';if(total<Number(giftSettings.minValue||1)||total>Number(giftSettings.maxValue||9999999))return error.textContent='قيمة الهدية خارج الحدود المسموحة.';if(anonymous&&!giftSettings.allowAnonymous)return error.textContent='الهدايا المجهولة غير مفعلة حالياً.';if(!db)return error.textContent='تعذر الاتصال بقاعدة البيانات، حاول مرة أخرى.';if (window._lastGiftOrder && window._lastGiftOrder.senderPhone === senderPhone && window._lastGiftOrder.recipientPhone === recipientPhone && window._lastGiftOrder.total === total && (Date.now() - window._lastGiftOrder.time < 60000)) {const existingCode = window._lastGiftOrder.orderCode;showToast('تم إنشاء طلب الهدية بنجاح 🎁', 'success');error.innerHTML = `<span style="color:#27ae60">تم إنشاء الهدية مسبقاً. رقم الطلب: ${existingCode}</span>`;return;}const selected=giftSelection.productIds.map(id=>giftEligibleProducts().find(p=>String(p.id)===String(id))).filter(Boolean);const ref=db.ref('gift_orders').push();const giftId=ref.key;const orderCode=`GIFT-101-${String(giftId).slice(-6).toUpperCase()}`;const expiresAt=Date.now()+Number(giftSettings.defaultExpiryDays||30)*86400000;const order={giftId,orderCode,senderName,senderPhone,recipientName,recipientPhone,anonymous,message,giftType:giftSelection.type,productId:selected.length===1?String(selected[0].id):null,productIds:selected.map(p=>String(p.id)),productName:selected.map(p=>p.name).join(' + ')||null,giftValue:total,paymentMethod:'bank_transfer',paymentStatus:'pending',giftStatus:'awaiting_payment',createdAt:firebase.database.ServerValue.TIMESTAMP,expiresAt,confirmedAt:null,redeemedAt:null,redeemedBy:null};const btn=document.getElementById('giftSubmit');btn.disabled=true;btn.textContent='جارٍ إنشاء طلب الهدية…';console.log('[GIFT_ORDER_WRITE_START]', { giftId, orderCode });try{await ref.set(order);const snap = await ref.once('value');if(!snap.exists()){throw new Error('Read-back verification failed');}console.log('[GIFT_ORDER_WRITE_SUCCESS]');window._lastGiftOrder = { time: Date.now(), senderPhone, recipientPhone, total, orderCode };showToast('تم إنشاء طلب الهدية بنجاح 🎁', 'success');error.innerHTML = `<span style="color:#27ae60">تم إنشاء طلب الهدية بنجاح 🎁<br>رقم طلبك: <strong>${orderCode}</strong></span>`;}catch(e){console.error('[GIFT_ORDER_WRITE_FAILED]', { stage: 'Firebase Write', giftId, orderCode, code: e.code, message: e.message });error.textContent='تعذر إنشاء طلب الهدية، حاول مرة أخرى.';btn.disabled=false;btn.textContent='🎁 احجز الهدية وحوّل';return;}console.log('[GIFT_POST_SAVE_START]');try{await db.ref('gift_logs').push({type:'gift_created',giftId,uid:auth?.currentUser?.uid||null,role:'customer',timestamp:firebase.database.ServerValue.TIMESTAMP});}catch(e){console.warn('[GIFT_POST_SAVE_FAILED]', { stage: 'Gift Logs Write', code: e.code, message: e.message });}try{const wa=(giftSettings.whatsapp||'').replace(/\D/g,'').replace(/^0/,'964');if(!wa)throw new Error('WhatsApp is not configured');console.log('[GIFT_SETTINGS_LOAD_SUCCESS]');const giftName=order.productName||giftMoney(total);const senderVisible=anonymous?'هدية مجهولة':senderName;let waTemplate=giftSettings.whatsappMessage||'';if(!waTemplate.trim() || waTemplate.includes('{{') || waTemplate.includes('?')){waTemplate=`مرحباً 101 COFFEE ❤️\nأرغب بتأكيد طلب الهدية وإرسال إثبات التحويل.\n\nرقم الطلب: {{orderCode}}\nاسم المُهدي: {{senderName}}\nنوع الهدية: {{giftName}}\nالقيمة: {{giftValue}}\nاسم المستلم: {{recipientName}}`;}else{waTemplate=waTemplate.replace(/{{/g,'❤️').replace(/\?/g,'❤️');}const text=waTemplate.replace('{{orderCode}}',orderCode).replace('{{senderName}}',senderVisible).replace('{{giftName}}',giftName).replace('{{giftValue}}',giftMoney(total)).replace('{{recipientName}}',recipientName);console.log('[GIFT_WHATSAPP_BUILD_SUCCESS]');const waUrl = `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;const popup = window.open(waUrl,'_blank','noopener');if(!popup){throw new Error('Popup blocked');}console.log('[GIFT_WHATSAPP_OPEN_SUCCESS]');error.innerHTML = `<span style="color:#27ae60">تم إنشاء طلب الهدية بنجاح 🎁<br>رقم طلبك: <strong>${orderCode}</strong><br>أرسل صورة التحويل لتثبيت الهدية.</span>`;}catch(e){console.error('[GIFT_WHATSAPP_FAILED]', { stage: 'WhatsApp', code: e.code, message: e.message });const waLink = giftSettings.whatsapp ? `https://wa.me/${giftSettings.whatsapp.replace(/\D/g,'').replace(/^0/,'964')}?text=${encodeURIComponent('أرغب بتأكيد طلب الهدية. رقم الطلب: '+orderCode)}` : '#';error.innerHTML = `<span style="color:#e67e22">تم إنشاء الهدية بنجاح، لكن تعذر فتح WhatsApp تلقائياً. يمكنك متابعة التأكيد من رقم الطلب التالي: <strong>${orderCode}</strong></span><br><br><a href="${waLink}" target="_blank" class="btn btn-primary" style="display:inline-block;margin-top:10px;text-decoration:none;color:white;padding:8px 16px;border-radius:8px;">فتح WhatsApp</a>`;}btn.textContent='🎁 احجز الهدية وحوّل';refreshGiftPayment();});
            if (!db) return showToast(currentLang === 'en' ? 'Orders are temporarily unavailable.' : 'حفظ الطلبات غير متاح مؤقتًا.', 'error');

            // Reserve the window during the direct click event; navigate it only after Firebase confirms the write.
            const whatsappWindow = window.open('', '_blank');
            if (!whatsappWindow) return showToast(currentLang === 'en' ? 'Please allow popups to open WhatsApp.' : 'يرجى السماح بالنوافذ المنبثقة لفتح واتساب.', 'error');
            const orderId = db.ref('orders').push().key;
            const orderCode = `101-${String(orderId).replace(/[^a-zA-Z0-9]/g,'').slice(-10).toUpperCase()}`;
            const cleanItems = cart.map(r => {
                const p = findProduct(r.id) || r;
                return { id:String(r.id), name:String(productName(p) || p.name || ''), price:Number(p.price)||0, quantity:Number(r.qty)||0 };
            });
            const orderRecord = {
                orderId, orderCode,
                items: cleanItems,
                subtotal: Number(subtotal), deliveryFee: Number(deliveryPrice), total: Number(subtotal + deliveryPrice),
                orderType: String(type || 'pickup'),
                customerName: String(f.get('name') || ''), name: String(f.get('name') || ''), phone: String(f.get('phone') || ''),
                notes: String(f.get('notes') || ''), area: String(f.get('area') || ''), address: String(f.get('address') || ''),
                carDetails: type === 'car' ? { model:String(f.get('carModel')||''), color:String(f.get('carColor')||''), plate:String(f.get('carPlate')||'') } : null,
                status: 'pending', source: 'customer-menu',
                customerUid: currentFirebaseUser?.uid || null,
                membershipNumber: loyaltyCustomer?.id || null,
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };
            try {
                await db.ref(`orders/${orderId}`).set(orderRecord);
                lastOrderId = orderId;
                window.sessionStorage?.setItem('coffee101_lastOrderId', lastOrderId);
                window.sessionStorage?.setItem('coffee101_lastOrderCode', orderCode);
            } catch (error) {
                whatsappWindow.close();
                console.error('[ORDER_SAVE_FAILED]', { code:error?.code, message:error?.message, path:`orders/${orderId}`, operation:'set' });
                return showToast(currentLang === 'en' ? 'We could not save the order. Please try again.' : 'تعذر حفظ الطلب، يرجى المحاولة مرة أخرى.', 'error');
            }
            showToast(`${currentLang==='en'?'Your order number:':'رقم طلبك:'} ${orderCode}`);
            const cleanPhone = (settings.whatsapp || "9647800000000").replace(/\D/g, "").replace(/^0/, "964");
            if (!cleanPhone) { whatsappWindow.close(); return showToast(currentLang === 'en' ? 'WhatsApp number is not configured.' : 'رقم واتساب غير مُعدّ.', 'error'); }
            whatsappWindow.location.replace(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`);
            setModalOpen(document.getElementById("checkoutModal"), false);
        }

        // ── CANDLE DAY & EVENT BOOKINGS ────────────────────────
        function calcNextCandleDate() {
            const now = new Date();
            let year = now.getFullYear();
            let month = now.getMonth();
            if (now.getDate() > 14) {
                month++;
                if (month > 11) { month = 0; year++; }
            }
            const d = new Date(year, month, 14);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-14`;
        }

        function updateCandleDayUI() {
            const banner = document.getElementById('candleDayBanner');
            if (!banner) return;
            if (candleSettings.enabled === false) {
                banner.style.display = 'none';
                return;
            }
            banner.style.display = 'block';
            const nextDate = calcNextCandleDate();
            const dateTxt = document.getElementById('candleNextDateTxt');
            if (dateTxt) dateTxt.textContent = `${nextDate} (14)`;
            const timeTxt = document.getElementById('candleTimeTxt');
            if (timeTxt && candleSettings.startTime) {
                timeTxt.textContent = `${candleSettings.startTime} - ${candleSettings.endTime || '6:00 PM'}`;
            }
            const candleEvent = eventsDB.find(event => event?.id === 'candle_day' || event?.isCandleDay);
            const price = Number(candleEvent?.price ?? candleSettings.price ?? 0);
            const priceBadge = document.getElementById('candlePriceBadge');
            if (priceBadge) priceBadge.textContent = price === 0
                ? (currentLang === 'en' ? 'Free' : 'مجاني')
                : money(price);
        }

        window.openCandleDayBooking = function() {
            const ev = eventsDB.find(x => x.id === 'candle_day') || {
                id: 'candle_day',
                name: '🕯️ يوم الشموع', nameAr: '🕯️ يوم الشموع', nameEn: '🕯️ Candle Day',
                date: calcNextCandleDate(),
                startTime: candleSettings.startTime || '16:00',
                endTime: candleSettings.endTime || '18:00',
                price: Number(candleSettings.price || 0),
                capacity: candleSettings.capacity || 10
            };
            openEventBooking(ev.id, ev);
        };

        function openEventBooking(eventId, customEvent = null) {
            const ev = customEvent || eventsDB.find(x => x.id === eventId);
            if (!ev) return showToast(currentLang === 'en' ? 'Event details are not available yet.' : 'تفاصيل الفعالية غير متاحة حاليًا.', 'error');
            if (ev.isActive === false || ev.status === 'cancelled' || ev.status === 'disabled') return showToast(currentLang === 'en' ? 'This event is currently unavailable.' : 'هذه الفعالية غير متاحة حاليًا.', 'error');
            const modal = document.getElementById("eventBookingModal");
            if (!modal) return;
            
            document.getElementById("eventBookingId").value = ev.id;
            document.getElementById("eventBookingNameDisplay").value = eventTitle(ev);
            document.getElementById("eventBookingDate").value = ev.date || "-";
            document.getElementById("eventBookingTime").value = `${ev.startTime || "-"}${ev.endTime ? " - " + ev.endTime : ""}`;
            
            const tableSel = document.getElementById("eventBookingTable");
            if (tableSel) {
                const activeTables = tablesDB.filter(t => t && t.isActive !== false);
                tableSel.innerHTML = activeTables.length ?
                    activeTables.map(t => {
                        const taken = eventBookingsDB.some(b => b.eventId === ev.id && b.date === ev.date && b.tableId === t.id && b.status !== 'cancelled');
                        return `<option value="${esc(t.id)}" ${taken ? 'disabled' : ''}>${esc(t.name)}${taken ? ' — محجوز / غير متاح' : ''}</option>`;
                    }).join('') :
                    `<option value="general">طاولة عامة</option>`;
            }

            const sum = document.getElementById("eventBookingSummary");
            if (sum) {
                sum.innerHTML = `<div class="summary-line"><span>${currentLang === 'en' ? 'Price per person:' : 'السعر للشخص:'}</span><strong>${Number(ev.price) === 0 ? (currentLang === 'en' ? 'Free' : 'مجاني') : money(ev.price)}</strong></div>`;
            }
            setModalOpen(modal, true);
        }

        function bookingKey(...parts) {
            return parts.map(value => String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')).join('__');
        }

        function handleEventBookingSubmit(e) {
            e.preventDefault();
            const f = new FormData(e.target);
            const eventId = f.get("eventId");
            const eventName = f.get("eventName");
            const date = f.get("date");
            const time = f.get("time");
            const tableId = f.get("tableId");
            const tableName = document.getElementById('eventBookingTable')?.selectedOptions?.[0]?.textContent || tableId || 'طاولة عامة';
            const name = f.get("name");
            const phone = f.get("phone");

            if (!name || !phone) return alert("يرجى ملء جميع الحقول المطلوبة.");

            const bookingData = {
                eventId, eventName, date, time, startTime: time, tableId, tableName, name, phone,
                price: Number(eventsDB.find(x => x.id === eventId)?.price || 0),
                status: 'confirmed',
                createdAt: firebase.database.ServerValue.TIMESTAMP
            };

            const msg = `حجز فعالية في 101 COFFEE 🎉\n\nالفعالية: ${eventName}\n👤 الاسم: ${name}\n📱 الهاتف: ${phone}\n📅 التاريخ: ${date}\n⏰ الوقت: ${time}\n🪑 الطاولة: ${tableId}\n`;
            const cleanPhone = (settings.whatsapp || "9647800000000").replace(/\D/g, "").replace(/^0/, "964");
            const bookingId = bookingKey(eventId, date, tableId);
            db.ref(`eventBookings/${bookingId}`).set({ ...bookingData, bookingId }).then(() => {
                window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                setModalOpen(document.getElementById("eventBookingModal"), false);
            }).catch(err => {
                console.error('[CANDLE_BOOKING_FAILED]', {code:err?.code,message:err?.message,path:`eventBookings/${bookingId}`,operation:'set'});
                const duplicate = err?.code === 'PERMISSION_DENIED' || err?.code === 'permission-denied';
                showToast(duplicate ? 'هذا الموعد أو الطاولة محجوزة مسبقًا.' : 'تعذر حفظ الحجز، يرجى المحاولة مرة أخرى.', 'error');
            });
        }

        // ── MEETING ROOM RESERVATION ───────────────────────────
        function initMeetingRoomForm() {
            const form = document.getElementById("bookingForm");
            if (!form) return;
            
            const dateInput = document.getElementById("bookingDate");
            const timeInput = document.getElementById("bookingTime");

            if (dateInput && timeInput) {
                // Populate 7 days dropdown
                const dateSelect = document.createElement("select");
                dateSelect.id = "bookingDate";
                dateSelect.name = "bookingDate";
                dateSelect.required = true;
                dateSelect.style.cssText = "width:100%;padding:11px 12px;border-radius:11px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-family:Cairo;outline:none;";

                const daysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
                const today = new Date();

                for (let i = 0; i < 7; i++) {
                    const d = new Date(today);
                    d.setDate(today.getDate() + i);
                    const dayName = daysAr[d.getDay()];
                    const dd = String(d.getDate()).padStart(2, '0');
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const yyyy = d.getFullYear();
                    const valDate = `${yyyy}-${mm}-${dd}`;
                    const opt = document.createElement("option");
                    opt.value = valDate;
                    opt.textContent = `${dayName} ${dd}/${mm}/${yyyy}`;
                    dateSelect.appendChild(opt);
                }
                dateInput.parentNode.replaceChild(dateSelect, dateInput);

                // Time slots dropdown
                const timeSelect = document.createElement("select");
                timeSelect.id = "bookingTime";
                timeSelect.name = "bookingTime";
                timeSelect.required = true;
                timeSelect.style.cssText = "width:100%;padding:11px 12px;border-radius:11px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);font-family:Cairo;outline:none;";

                const hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];

                const updateTimes = () => {
                    timeSelect.innerHTML = "";
                    const selDate = dateSelect.value;
                    for (let i = 0; i < hours.length - 1; i++) {
                        const startH = hours[i], endH = hours[i+1];
                        const timeTxt = `${startH} - ${endH}`;
                        const isBooked = bookings.some(b => b.date === selDate && b.time === startH && b.status !== 'cancelled');
                        const opt = document.createElement("option");
                        opt.value = startH;
                        if (isBooked) {
                            opt.textContent = `${timeTxt} — محجوز / غير متاح`;
                            opt.disabled = true;
                            opt.style.color = "red";
                        } else {
                            opt.textContent = timeTxt;
                        }
                        timeSelect.appendChild(opt);
                    }
                };

                dateSelect.addEventListener("change", updateTimes);
                timeInput.parentNode.replaceChild(timeSelect, timeInput);
                updateTimes();
            }

            form.onsubmit = e => {
                e.preventDefault();
                const f = new FormData(form);
                const name = f.get("bookingName") || "زبون";
                const phone = f.get("bookingPhone") || "-";
                const date = f.get("bookingDate");
                const time = f.get("bookingTime");
                const notes = f.get("bookingNotes") || "-";

                if (!name || !phone || !date || !time) return alert("يرجى ملء جميع معلومات الحجز.");

                const targetPhone = (settings.roomWhatsapp || settings.whatsapp || "9647800000000").replace(/\D/g, "").replace(/^0/, "964");
                const msg = `حجز غرفة اجتماعات 📅\n\n👤 الاسم: ${name}\n📱 الهاتف: ${phone}\n📅 التاريخ: ${date}\n⏰ الوقت: ${time}\n💰 السعر: ${money(settings.roomPrice || 10000)} (للساعة الواحدة)\n📝 ملاحظات: ${notes}\n`;
                const bookingId = bookingKey(date, time);
                db.ref(`bookings/${bookingId}`).set({ bookingId, name, phone, date, time, notes, price:Number(settings.roomPrice || 10000), status:'pending', createdAt:firebase.database.ServerValue.TIMESTAMP }).then(() => {
                    window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                    showToast('تم حفظ الحجز وإرسال تفاصيله عبر واتساب!');
                }).catch(err => {
                    console.error('[WORKSHOP_BOOKING_FAILED]', {code:err?.code,message:err?.message,path:`bookings/${bookingId}`,operation:'set'});
                    const duplicate = err?.code === 'PERMISSION_DENIED' || err?.code === 'permission-denied';
                    showToast(duplicate ? 'هذا الموعد محجوز مسبقًا.' : 'تعذر حفظ الحجز، يرجى المحاولة مرة أخرى.', 'error');
                });
            };
        }

        // ── GOOGLE AUTH & LOYALTY CARD ─────────────────────────
        window.previewAddHeart = function(n) {
            previewHearts += n;
            if (previewHearts < 0) previewHearts = 0;
            if (previewHearts > 5) previewHearts = 5;
            const cnt = document.getElementById('loyaltyPreviewCount');
            if (cnt) cnt.textContent = previewHearts;
            const heartsContainer = document.getElementById('loyaltyPreviewHearts');
            if (heartsContainer) {
                heartsContainer.innerHTML = Array.from({length: 5}, (_, i) => 
                    `<span class="heart ${i < previewHearts ? 'filled' : ''}">❤️</span>`
                ).join('');
            }
        };

        window.togglePinVisibility = function() {
            isPinRevealed = !isPinRevealed;
            const pinDisplay = document.getElementById('cardDisplayPin');
            const summaryPin = document.getElementById('summaryDisplayPin');
            const pinBtn = document.querySelector('.btn-pin-toggle');
            const summaryPinBtn = document.getElementById('summaryPinToggle');
            if (pinDisplay) pinDisplay.textContent = isPinRevealed ? userPinRaw : '••••';
            if (summaryPin) summaryPin.textContent = isPinRevealed ? userPinRaw : '••••';
            if (pinBtn) pinBtn.textContent = isPinRevealed ? '🙈' : '👁️';
            if (summaryPinBtn) summaryPinBtn.textContent = isPinRevealed ? '🙈' : '👁';
        };
        window.toggleCardPinReveal = window.togglePinVisibility;

        function loyaltyErrorMessage(error) {
            const code = error?.code || '';
            const messages = {
                'auth/invalid-api-key': currentLang === 'en' ? 'Firebase API key is invalid.' : 'مفتاح Firebase غير صالح.',
                'auth/api-key-not-valid': currentLang === 'en' ? 'Firebase API key is invalid.' : 'مفتاح Firebase غير صالح.',
                'auth/unauthorized-domain': currentLang === 'en' ? 'This domain is not authorized in Firebase.' : 'هذا النطاق غير مضاف إلى Authorized Domains في Firebase.',
                'auth/popup-closed-by-user': currentLang === 'en' ? 'Google sign-in was cancelled.' : 'تم إغلاق نافذة Google.',
                'auth/popup-blocked': currentLang === 'en' ? 'The browser blocked the Google window. Please allow popups.' : 'المتصفح منع نافذة Google. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.',
                'auth/configuration-not-found': currentLang === 'en' ? 'Google provider is not enabled in Firebase.' : 'يجب تفعيل مزود Google في Firebase.',
                'functions/not-found': currentLang === 'en' ? 'The secure account service is not deployed yet.' : 'خدمة الحساب الآمنة غير منشورة على Firebase بعد.'
            };
            return messages[code] || (currentLang === 'en' ? 'Could not sign in. Please try again.' : 'تعذر تسجيل الدخول، يرجى المحاولة مرة أخرى.');
        }

        function showLoyaltyLoginError(error) {
            console.error('Loyalty authentication error:', error);
            console.error('Firebase error code:', error?.code);
            console.error('Firebase error message:', error?.message);
            const message = document.getElementById('loyaltyLoginError');
            if (message) message.textContent = loyaltyErrorMessage(error);
            document.getElementById('loyaltyLoginModal')?.classList.add('open');
        }

        window.signInForLoyalty = async function() {
            if (!auth) { showLoyaltyLoginError(new Error('Firebase Auth is unavailable.')); return; }
            const btn = document.getElementById('loyaltyGoogleBtn');
            const label = btn?.querySelector('.google-login-label');
            const message = document.getElementById('loyaltyLoginError');
            if (message) message.textContent = '';
            if (btn) btn.disabled = true;
            if (label) label.textContent = currentLang === 'en' ? 'Signing in…' : 'جاري تسجيل الدخول…';
            try {
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.addScope('email');
                const result = await auth.signInWithPopup(provider).catch(async error => {
                    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error.code)) {
                        await auth.signInWithRedirect(provider);
                        return null;
                    }
                    throw error;
                });
                if (result && !result.user) throw new Error('Google sign-in did not return a Firebase user.');
            } catch (error) {
                showLoyaltyLoginError(error);
            } finally {
                if (btn) btn.disabled = false;
                if (label) label.textContent = currentLang === 'en' ? 'Sign in with Google' : 'تسجيل الدخول بواسطة Google';
            }
        };

        function showWelcomeModal(membership, pin) {
            const modal = document.getElementById('welcomeModal');
            const membershipEl = document.getElementById('welcomeMembership');
            const pinEl = document.getElementById('welcomePin');
            if (!modal || !membershipEl || !pinEl) return;
            membershipEl.textContent = membership;
            pinEl.textContent = pin;
            modal.classList.add('open');
        }

        function resetLoyaltyGuestUI() {
            if (loyaltyCustomerRef) loyaltyCustomerRef.off();
            loyaltyCustomerRef = null;
            if (window.loyaltyPendingRef) { window.loyaltyPendingRef.off(); window.loyaltyPendingRef = null; }
            loyaltyCustomer = null;
            currentFirebaseUser = null;
            loyaltyAuthStatusKey = '';
            userPinRaw = '••••';
            isPinRevealed = false;
            document.getElementById('loyaltyCardRefBox')?.style.setProperty('display', 'none');
            document.getElementById('loyaltyExplorer')?.style.setProperty('display', 'block');
            document.getElementById('loyaltyDetailsBackdrop')?.classList.remove('open');
            const guest = document.getElementById('loyaltyGuestContent');
            const member = document.getElementById('loyaltyMemberContent');
            if (guest) guest.style.display = 'block';
            if (member) member.style.display = 'none';
            document.getElementById('loyaltyLoginModal')?.classList.remove('open');
            document.getElementById('welcomeModal')?.classList.remove('open');
            const loginError = document.getElementById('loyaltyLoginError');
            if (loginError) loginError.textContent = '';
            const authStatus = document.getElementById('loyaltyAuthStatus');
            if (authStatus) authStatus.textContent = '';
            const action = document.getElementById('loyaltyAuthAction');
            if (action) { action.textContent = currentLang === 'en' ? 'Sign in to loyalty' : 'تسجيل الدخول للولاء'; action.onclick = window.openLoyalty; }
            const values = { cardDisplayId:'—', cardDisplayName:'—', cardDisplayMemberType:'—', cardDisplayHeartsText:'0 / 5 ❤️', cardDisplayTotalEarned:'0', cardDisplayTotalSpent:'0', cardDisplayPhone:'—', cardDisplayEmail:'—', cardDisplayPin:'••••' };
            Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
            const hearts = document.getElementById('cardDisplayHeartsVisual');
            if (hearts) hearts.innerHTML = Array.from({length:5}, () => '<span class="loyalty-stamp"></span>').join('');
            const summaryValues = { summaryDisplayId:'—', summaryDisplayName:'—', summaryDisplayMemberType:'—', summaryDisplayHearts:'0 / 5', summaryDisplayPin:'••••' };
            Object.entries(summaryValues).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.textContent = value; });
            const summaryStamps = document.getElementById('summaryDisplayStamps');
            if (summaryStamps) summaryStamps.innerHTML = Array.from({length:5}, () => '<span class="loyalty-stamp"></span>').join('');
            const summaryPinBtn = document.getElementById('summaryPinToggle');
            if (summaryPinBtn) summaryPinBtn.textContent = '👁';
        }

        async function handleMembershipLogin(event) {
            event.preventDefault();
            const membership = document.getElementById('membershipLoginId')?.value.trim();
            const pin = document.getElementById('membershipLoginPin')?.value.trim();
            const message = document.getElementById('loyaltyLoginError');
            if (message) message.textContent = '';
            if (!cloudFunctions || !auth) { if (message) message.textContent = 'خدمة الدخول الآمن غير متاحة حاليًا.'; return; }
            try {
                const result = await cloudFunctions.httpsCallable('loginWithMembership')({ membership, pin });
                if (!result.data?.token) throw new Error('Missing custom token');
                await auth.signInWithCustomToken(result.data.token);
                document.getElementById('loyaltyLoginModal')?.classList.remove('open');
                event.target.reset();
            } catch (error) {
                console.error('Membership login failed', error);
                if (message) message.textContent = error?.code === 'functions/unauthenticated' || error?.code === 'functions/invalid-argument' ? 'رقم العضوية أو رمز PIN غير صحيح.' : loyaltyErrorMessage(error);
            }
        }

        window.handleCardAuthAction = () => window.signInForLoyalty();

        window.logoutGoogle = async function() {
            try { if (auth?.currentUser) await auth.signOut(); } finally { resetLoyaltyGuestUI(); }
        };

        async function onAuthChanged(user) {
            currentFirebaseUser = user;
            if (user) {
                loyaltyAuthStatusKey = 'auth_success';
                try {
                    // Existing accounts can be loaded directly under the current Rules:
                    // the user may read only their own link and linked customer record.
                    const linkSnap = await db.ref(`loyalty_links/${user.uid}`).once('value');
                    const membership = linkSnap.exists() ? String(linkSnap.val()) : '';
                    const customerSnap = membership ? await db.ref(`loyalty_customers/${membership}`).once('value') : null;
                    if (customerSnap?.exists()) {
                        loadCustomerData(membership);
                        loyaltyAuthStatusKey = 'auth_success';
                    } else {
                        // Membership/PIN provisioning remains Admin-only. The customer may
                        // create/update only their own pending activation request.
                        const provisioned = await createNewCustomer(user);
                        loyaltyAuthStatusKey = 'auth_success';
                        loadCustomerData(provisioned.membership);
                    }
                    watchLoyaltyLink(user.uid);
                    document.getElementById('loyaltyLoginModal')?.classList.remove('open');
                } catch (error) {
                    loyaltyAuthStatusKey = 'auth_error';
                    console.error('[LOYALTY_PROVISION_FAILED]', { code:error?.code, message:error?.message, path:'loyalty_customers + loyalty_links + loyalty_counter', operation:'transaction/update' });
                    showPendingLoyaltyState(user, true);
                    document.getElementById('loyaltyLoginModal')?.classList.remove('open');
                }
            } else {
                resetLoyaltyGuestUI();
            }
        }

        function showPendingLoyaltyState(user, failed = false) {
            const guest = document.getElementById('loyaltyGuestContent');
            const member = document.getElementById('loyaltyMemberContent');
            if (guest) guest.style.display = 'block';
            if (member) member.style.display = 'none';
            const status = document.getElementById('loyaltyAuthStatus');
            if (status) status.textContent = currentLang === 'en'
                ? (failed ? 'Signed in successfully, but your rewards activation request could not be saved.' : 'Signed in successfully. Your rewards account is pending activation.')
                : (failed ? 'تم تسجيل الدخول بنجاح، لكن تعذر حفظ طلب تفعيل المكافآت.' : 'تم تسجيل الدخول بنجاح. حساب المكافآت بانتظار التفعيل.');
            const action = document.getElementById('loyaltyAuthAction');
            if (action) { action.textContent = currentLang === 'en' ? 'Sign out' : 'تسجيل الخروج'; action.onclick = window.logoutGoogle; }
            const copy = document.querySelector('#loyaltyGuestContent > p');
            if (copy) copy.textContent = currentLang === 'en' ? 'Your 101 rewards account is being activated.' : 'حساب مكافآت 101 الخاص بك قيد التفعيل.';
        }

        async function createPendingActivation(user) {
            if (!db || !user?.uid) throw new Error('Realtime Database is not available');
            const ref = db.ref(`loyalty_pending/${user.uid}`);
            const existing = await ref.once('value');
            if (existing.exists()) return existing.val();
            const record = {
                uid: user.uid,
                displayName: user.displayName || '',
                email: user.email || '',
                photoURL: user.photoURL || '',
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                updatedAt: firebase.database.ServerValue.TIMESTAMP,
                status: 'pending',
                source: 'google'
            };
            await ref.set(record);
            return record;
        }

        function watchLoyaltyLink(uid) {
            if (!db || !uid) return;
            if (window.loyaltyPendingRef) window.loyaltyPendingRef.off();
            window.loyaltyPendingRef = db.ref(`loyalty_links/${uid}`);
            window.loyaltyPendingRef.on('value', async snap => {
                const membership = snap.exists() ? String(snap.val()) : '';
                if (!membership || !currentFirebaseUser || currentFirebaseUser.uid !== uid) return;
                try {
                    const customer = await db.ref(`loyalty_customers/${membership}`).once('value');
                    if (!customer.exists()) return;
                    loyaltyAuthStatusKey = 'auth_success';
                    loadCustomerData(membership);
                    await db.ref(`loyalty_pending/${uid}`).remove().catch(() => {});
                    document.getElementById('loyaltyLoginModal')?.classList.remove('open');
                } catch (error) {
                    console.error('LOYALTY_ACTIVATION_LOAD_FAILED:', error?.code, error?.message, error);
                }
            });
        }

        function loadCustomerData(memId) {
            if (loyaltyCustomerRef) loyaltyCustomerRef.off();
            loyaltyCustomerRef = db.ref('loyalty_customers/' + memId);
            loyaltyCustomerRef.on('value', snap => {
                loyaltyCustomer = snap.val();
                if (loyaltyCustomer) {
                    const idDisplay = document.getElementById('cardDisplayId');
                    const nameDisplay = document.getElementById('cardDisplayName');
                    const heartsTextDisplay = document.getElementById('cardDisplayHeartsText');
                    const heartsVisual = document.getElementById('cardDisplayHeartsVisual');
                    const earnedDisplay = document.getElementById('cardDisplayTotalEarned');
                    const spentDisplay = document.getElementById('cardDisplayTotalSpent');

                    if (idDisplay) idDisplay.textContent = memId;
                    if (nameDisplay) nameDisplay.textContent = loyaltyCustomer.name || 'عضو';
                    const h = Math.min(5, Math.max(0, Number(loyaltyCustomer.currentHearts ?? loyaltyCustomer.hearts ?? 0)));
                    if (heartsTextDisplay) heartsTextDisplay.textContent = `${h} / 5 ❤️`;
                    if (heartsVisual) {
                        heartsVisual.innerHTML = Array.from({length: 5}, (_, i) => 
                            `<span class="loyalty-stamp ${i < h ? 'filled' : ''}"></span>`
                        ).join('');
                    }
                    if (earnedDisplay) earnedDisplay.textContent = loyaltyCustomer.totalHeartsEarned ?? loyaltyCustomer.totalEarned ?? h;
                    if (spentDisplay) spentDisplay.textContent = loyaltyCustomer.totalHeartsRedeemed ?? loyaltyCustomer.totalSpent ?? 0;
                    const phone = document.getElementById('cardDisplayPhone');
                    const email = document.getElementById('cardDisplayEmail');
                    if (phone) phone.textContent = loyaltyCustomer.phone || '—';
                    if (email) email.textContent = loyaltyCustomer.email || currentFirebaseUser?.email || '—';

                    const guest = document.getElementById('loyaltyGuestContent');
                    const member = document.getElementById('loyaltyMemberContent');
                    if (guest) guest.style.display = 'none';
                    if (member) member.style.display = 'block';
                    const action = document.getElementById('loyaltyAuthAction');
                    if (action) { action.textContent = currentLang === 'en' ? 'Sign out' : 'تسجيل الخروج'; action.onclick = window.logoutGoogle; }
                    const summaryId = document.getElementById('summaryDisplayId');
                    const summaryName = document.getElementById('summaryDisplayName');
                    const summaryMemberType = document.getElementById('summaryDisplayMemberType');
                    const summaryHearts = document.getElementById('summaryDisplayHearts');
                    const summaryStamps = document.getElementById('summaryDisplayStamps');
                    const summaryPin = document.getElementById('summaryDisplayPin');
                    if (summaryId) summaryId.textContent = memId;
                    if (summaryName) summaryName.textContent = loyaltyCustomer.name || 'عضو 101';
                    if (summaryMemberType) summaryMemberType.textContent = loyaltyCustomer.memberType || loyaltyCustomer.membershipStatus || 'عضو مميز';
                    if (summaryHearts) summaryHearts.textContent = `${h} / 5`;
                    if (summaryStamps) summaryStamps.innerHTML = Array.from({length:5}, (_, i) => `<span class="loyalty-stamp ${i < h ? 'filled' : ''}"></span>`).join('');

                    userPinRaw = loyaltyCustomer.pin || '••••';
                    const pinDisplay = document.getElementById('cardDisplayPin');
                    if (pinDisplay) pinDisplay.textContent = isPinRevealed ? userPinRaw : '••••';
                    if (summaryPin) summaryPin.textContent = isPinRevealed ? userPinRaw : '••••';
                    document.getElementById('loyaltyCardRefBox')?.style.setProperty('display', 'none');
                }
            });
        }

        function generateMembershipPin() { const values=new Uint32Array(1); if(window.crypto?.getRandomValues)window.crypto.getRandomValues(values);else values[0]=Math.floor(Math.random()*9000); return String(1000+(values[0]%9000)); }
        async function createNewCustomer(user) {
            if (!db || !user?.uid) throw new Error('Realtime Database is not available');
            const linkRef = db.ref(`loyalty_links/${user.uid}`);
            let linkSnap=await linkRef.once('value'), membership=linkSnap.exists()?String(linkSnap.val()):'';
            if(!membership){const counter=await db.ref('loyalty_counter').transaction(value=>(Number(value)||0)+1);if(!counter.committed)throw new Error('Membership counter transaction was not committed');const candidate=`101-${Number(counter.snapshot.val())}`;const reservation=await linkRef.transaction(existing=>existing||candidate);membership=String(reservation.snapshot.val()||'');if(!membership)throw new Error('Loyalty membership reservation was not committed');}
            const customerRef=db.ref(`loyalty_customers/${membership}`), existingCustomer=await customerRef.once('value');
            if(existingCustomer.exists())return {membership,pin:String(existingCustomer.val().pin||'')};
            const now = firebase.database.ServerValue.TIMESTAMP;
            const customer={uid:user.uid,name:user.displayName||'عضو 101',displayName:user.displayName||'',email:user.email||'',photoURL:user.photoURL||'',memberType:'زبون',membershipStatus:'عضو مميز',pin:generateMembershipPin(),hearts:0,currentHearts:0,totalEarned:0,totalHeartsEarned:0,totalSpent:0,totalHeartsSpent:0,totalHeartsRedeemed:0,createdAt:now,updatedAt:now};
            const created=await customerRef.transaction(existing=>existing||customer), saved=created.snapshot.val(); if(!saved||saved.uid!==user.uid)throw new Error('Membership record could not be created'); const pin=String(saved.pin||''); if(created.committed)showWelcomeModal(membership,pin); return {membership,pin};
        }

        window.openLoyalty = function() {
            if (currentFirebaseUser && loyaltyCustomer) {
                document.getElementById('loyaltySection')?.scrollIntoView({ behavior:'smooth', block:'center' });
                return;
            }
            document.getElementById('loyaltyLoginModal')?.classList.add('open');
        };

        window.openLoyaltyDetails = function() {
            if (!currentFirebaseUser || !loyaltyCustomer) return window.openLoyalty();
            document.getElementById('loyaltyCardRefBox')?.style.setProperty('display', 'block');
            document.getElementById('loyaltyDetailsBackdrop')?.classList.add('open');
        };

        window.closeLoyaltyDetails = function() {
            document.getElementById('loyaltyDetailsBackdrop')?.classList.remove('open');
            document.getElementById('loyaltyCardRefBox')?.style.setProperty('display', 'none');
        };

        // ── FEEDBACK & RATING ──────────────────────────────────
        async function openOrderRatingModal() {
            try { lastOrderId = window.sessionStorage?.getItem('coffee101_lastOrderId') || ''; } catch(e) { lastOrderId = ''; }
            if (!lastOrderId || !db) return alert(currentLang === 'en' ? 'Rating is available after your order is completed.' : 'يظهر التقييم بعد اكتمال طلبك.');
            const snap = await db.ref(`orders/${lastOrderId}`).once('value');
            if (!snap.exists() || snap.val().status !== 'completed') return alert(currentLang === 'en' ? 'Rating is available after your order is completed.' : 'يظهر التقييم بعد اكتمال طلبك.');
            const code = snap.val().orderCode || window.sessionStorage?.getItem('coffee101_lastOrderCode') || '';
            const codeInput=document.getElementById('ratingOrderCode'); if(codeInput) codeInput.value=code;
            setModalOpen(document.getElementById("orderRatingModal"), true);
        }
        function closeOrderRatingModal() {
            setModalOpen(document.getElementById("orderRatingModal"), false);
        }
        function setRatingStars(n) {
            selectedRatingStars = n;
            const spans = document.querySelectorAll("#starPicker span");
            spans.forEach((s, idx) => {
                s.style.color = (idx < n) ? '#D4AF37' : '#D8CBB6';
            });
        }
        async function submitOrderRating() {
            const comment = document.getElementById("ratingComment")?.value?.trim() || "";
            const enteredCode = document.getElementById('ratingOrderCode')?.value?.trim().toUpperCase() || '';
            if (db && lastOrderId) {
                const orderSnap = await db.ref(`orders/${lastOrderId}`).once('value');
                if (!orderSnap.exists() || orderSnap.val().status !== 'completed') return alert('يظهر التقييم بعد اكتمال الطلب.');
                const order = orderSnap.val(), orderCode=String(order.orderCode||'').toUpperCase();
                if (!orderCode || enteredCode !== orderCode) return showToast('رقم الطلب غير صحيح أو لا يطابق طلبك.', 'error');
                db.ref('order_ratings').push({
                    orderId: lastOrderId,
                    orderCode, rating: selectedRatingStars, stars: selectedRatingStars,
                    comment, notes: comment,
                    userEmail: currentFirebaseUser?.email || 'guest',
                    userName: currentFirebaseUser?.displayName || 'زبون',
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                }).then(() => {
                    alert("شكراً لتقييمك وملاحظاتك القيمة! ⭐");
                    closeOrderRatingModal();
                }).catch(e => alert("خطأ: " + e.message));
            } else {
                closeOrderRatingModal();
            }
        }

        // ── FLOATING AI BARISTA ────────────────────────────────
        window.openChatbot = function() {
            const panel = document.getElementById('aiChatDrawer');
            const button = document.getElementById('aiAssistantBtn');
            if (!panel) return console.error('Chatbot panel is missing from the DOM.');
            setModalOpen(panel, true); panel.setAttribute('aria-hidden', 'false');
            const assistantName = currentLang === 'en' ? (aiConfig.assistantNameEn || 'Zaina') : (aiConfig.assistantNameAr || 'زينة');
            const welcome = currentLang === 'en' ? (aiConfig.welcomeEn || `Hi! I’m ${assistantName} ☕ What are you craving today?`) : (aiConfig.welcomeAr || `هلا بيك، أني ${assistantName} ☕ شنو مشتهي اليوم؟`);
            const title = document.getElementById('aiChatTitle'); if (title) title.textContent = `${assistantName} ☕`;
            const msgs = document.getElementById('aiChatMessages');
            if (msgs && !msgs.dataset.started) { msgs.dataset.started = '1'; msgs.innerHTML = `<div class="ai-welcome">${esc(welcome)}</div><div class="ai-quick-choices"><button type="button" data-ai-choice="coffee">☕ ${currentLang === 'en' ? 'I want coffee' : 'أريد قهوة'}</button><button type="button" data-ai-choice="cold">🧊 ${currentLang === 'en' ? 'Something cold' : 'أريد شي بارد'}</button><button type="button" data-ai-choice="pick">✨ ${currentLang === 'en' ? 'Pick for me' : 'اختاريلي شي'}</button></div>`; }
            if (button) button.setAttribute('aria-expanded', 'true');
            document.getElementById('aiChatInput')?.focus();
        };
        window.closeChatbot = function() {
            const panel = document.getElementById('aiChatDrawer');
            const button = document.getElementById('aiAssistantBtn');
            setModalOpen(panel, false); panel?.setAttribute('aria-hidden', 'true');
            if (button) button.setAttribute('aria-expanded', 'false');
        };
        window.toggleAIChatDrawer = function() {
            const panel = document.getElementById('aiChatDrawer');
            if (panel?.classList.contains('open')) window.closeChatbot(); else window.openChatbot();
        };
        async function handleAIChatSubmit(e) {
            e.preventDefault();
            const inp = document.getElementById("aiChatInput");
            const text = inp.value.trim();
            if (!text) return;
            inp.value = "";

            const msgs = document.getElementById("aiChatMessages");
            if (!msgs) return;
            msgs.innerHTML += `<div style="align-self:flex-start;background:var(--primary);color:#fff;padding:8px 12px;border-radius:12px;max-width:80%;margin-bottom:8px;font-size:13px">${esc(text)}</div>`;
            const typingId = `aiTyping${Date.now()}`;
            msgs.insertAdjacentHTML('beforeend', `<div id="${typingId}" style="align-self:flex-end;color:var(--text-muted);font-size:12px;margin-bottom:8px">… يكتب المساعد</div>`);
            msgs.scrollTop = msgs.scrollHeight;
            
            const addReply = reply => {
                msgs.innerHTML += `<div style="align-self:flex-end;background:var(--surface2);color:var(--text);padding:8px 12px;border-radius:12px;max-width:80%;margin-bottom:8px;font-size:13px;border:1px solid var(--border)">${esc(reply)}</div>`;
                msgs.scrollTop = msgs.scrollHeight;
            };
            try {
                if (!cloudFunctions) throw new Error('AI service is unavailable');
                const result = await cloudFunctions.httpsCallable('aiChat')({ text, language: currentLang });
                addReply(result.data?.reply || (currentLang === 'en' ? 'I could not answer right now.' : 'لم أتمكن من الإجابة الآن.'));
            } catch (error) {
                console.error('AI chat request failed', error);
                const unavailable = error?.code === 'functions/not-found' || error?.code === 'functions/unavailable';
                const disabled = error?.code === 'functions/failed-precondition';
                addReply(currentLang === 'en' ? (disabled ? 'The assistant is currently disabled.' : unavailable ? 'The AI service is not deployed or configured yet.' : 'The assistant is temporarily unavailable.') : (disabled ? 'المساعد الذكي متوقف حاليًا.' : unavailable ? 'خدمة الذكاء الاصطناعي غير منشورة أو غير مُعدّة بعد.' : 'المساعد غير متاح مؤقتًا، حاول مرة أخرى.'));
            } finally {
                document.getElementById(typingId)?.remove();
            }
        }

        // ── SEARCH & THEME ─────────────────────────────────────
        function performSearch(q) {
            const grid = document.getElementById("productsGrid"); if (!grid) return;
            const lbl = document.getElementById("searchResultsLabel");
            if (!q) { renderCatalog(currentCat); if (lbl) lbl.textContent = ""; return; }
            const ql = q.toLowerCase();
            const list = products.filter(p => !p.hidden && !p.comingSoon && (
                [p.name, p.nameAr, p.nameEn, p.description, p.descriptionAr, p.descriptionEn, p.category].filter(Boolean)
                    .some(value => String(value).toLowerCase().includes(ql))
            ));
            if (lbl) lbl.textContent = list.length ? `${list.length} ${currentLang==='en'?'results':'نتائج'}` : `${currentLang==='en'?'No results for':'لا توجد نتائج لـ'} "${q}"`;
            grid.innerHTML = list.length ? list.map(p => card(p)).join('') : `<div class="empty-state" style="grid-column:1/-1">${currentLang==='en'?'No products found for':'لا توجد نتائج لـ'} "<strong>${esc(q)}</strong>"</div>`;
            attachGridEvents();
            document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
        }

        function clearSearch() {
            const inp = document.getElementById("headerSearch"); if (inp) inp.value = "";
            const cb = document.getElementById("searchClearBtn"); if (cb) cb.style.display = "none";
            renderCatalog(currentCat);
            const lbl = document.getElementById("searchResultsLabel"); if (lbl) lbl.textContent = "";
        }
        function toggleHeaderSearch(forceOpen) {
            const wrap = document.getElementById('searchWrap');
            const input = document.getElementById('headerSearch');
            const button = document.getElementById('searchToggleBtn');
            const open = typeof forceOpen === 'boolean' ? forceOpen : !wrap?.classList.contains('open');
            wrap?.classList.toggle('open', open);
            if (button) button.setAttribute('aria-expanded', String(open));
            if (open) input?.focus(); else clearSearch();
        }
        function clearHeaderSearch() { clearSearch(); }

        function initTheme() {
            let s = null;
            try { s = localStorage.getItem('coffee101_theme'); } catch(e){}
            const d = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(s || (d ? 'dark' : 'light'));
        }
        function applyTheme(t) {
            document.documentElement.setAttribute('data-theme', t);
            const b = document.getElementById('themeBtn');
            if (b) {
                b.textContent = t === 'dark' ? '☀️' : '🌙';
                b.setAttribute('aria-label', t === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي');
            }
            const mc = document.getElementById('themeColorMeta');
            if (mc) mc.content = t === 'dark' ? '#3D5035' : '#FDFBF7';
        }
        window.toggleTheme = function() {
            const c = document.documentElement.getAttribute('data-theme') || 'light';
            const n = c === 'dark' ? 'light' : 'dark';
            applyTheme(n);
            try { localStorage.setItem('coffee101_theme', n); } catch(e){}
        };

        window.toggleMobileMenu = function() {
            const nav = document.getElementById('mainNavigation');
            const btn = document.getElementById('mobileMenuToggle');
            nav?.classList.toggle('open');
            if (btn) btn.textContent = nav?.classList.contains('open') ? '×' : '☰';
        };
        document.addEventListener('click', event => {
            if (event.target.closest?.('#mainNavigation a')) {
                document.getElementById('mainNavigation')?.classList.remove('open');
                const btn = document.getElementById('mobileMenuToggle'); if (btn) btn.textContent = '☰';
            }
        });

        // ── INIT APP & FIREBASE LISTENERS ──────────────────────
        let appInitialized = false;
        function initApp() {
            if (appInitialized) return;
            appInitialized = true;
            const ogUrl = document.querySelector('meta[property="og:url"]'); if (ogUrl) ogUrl.content = window.location.href;
            initTheme();
            setLanguage(currentLang);
            requestAnimationFrame(() => document.querySelectorAll('.about-animate').forEach(el => el.classList.add('visible')));
            previewAddHeart(0);
            renderCart();
            initMeetingRoomForm();

            // Generic Modal Closing Event Listeners
            document.querySelectorAll("[data-close]").forEach(b => {
                b.addEventListener("click", () => {
                    setModalOpen(b.closest(".modal-backdrop"), false);
                });
            });
            document.getElementById("closeCart")?.addEventListener("click", closeCart);
            document.getElementById("drawerBackdrop")?.addEventListener("click", closeCart);
            document.getElementById("checkoutBtn")?.addEventListener("click", showCheckout);
            document.getElementById("clearCartBtn")?.addEventListener("click", clearCart);
            document.getElementById('searchToggleBtn')?.addEventListener('click', () => toggleHeaderSearch());
            document.getElementById('searchClearBtn')?.addEventListener('click', () => toggleHeaderSearch(false));
            document.getElementById('eventsListGrid')?.addEventListener('click', event => {
                const button = event.target.closest('[data-book-event]');
                if (button) openEventBooking(button.dataset.bookEvent);
            });

            // Checkout type radio change
            document.querySelectorAll('input[name="type"]').forEach(r => {
                r.addEventListener("change", () => {
                    const val = r.value;
                    document.getElementById("deliveryFields")?.classList.toggle("hidden", val !== "delivery");
                    document.getElementById("carFields")?.classList.toggle("hidden", val !== "car");
                    ['checkCarModel','checkCarColor','checkCarPlate'].forEach(id=>{const el=document.getElementById(id);if(el)el.required=val==='car';});
                    updateCheckoutSummary();
                });
            });
            document.getElementById("areaSelect")?.addEventListener("change", updateCheckoutSummary);
            document.getElementById("checkoutForm")?.addEventListener("submit", handleCheckoutSubmit);
            document.getElementById("eventBookingForm")?.addEventListener("submit", handleEventBookingSubmit);
            document.getElementById('membershipLoginForm')?.addEventListener('submit', handleMembershipLogin);
            document.getElementById('welcomeStartBtn')?.addEventListener('click', () => setModalOpen(document.getElementById('welcomeModal'), false));
            document.getElementById('aiAssistantBtn')?.addEventListener('click', window.toggleAIChatDrawer);
            document.getElementById('aiChatCloseBtn')?.addEventListener('click', window.closeChatbot);
            document.getElementById('aiChatForm')?.addEventListener('submit', handleAIChatSubmit);
            document.getElementById('aiChatMessages')?.addEventListener('click', event => {
                const choice = event.target.closest('[data-ai-choice]'); if (!choice) return;
                const prompts = { coffee: currentLang === 'en' ? 'I want coffee' : 'أريد قهوة', cold: currentLang === 'en' ? 'I want something cold' : 'أريد شي بارد', pick: currentLang === 'en' ? 'Pick something for me' : 'اختاريلي شي' };
                const input = document.getElementById('aiChatInput'); if (input) { input.value = prompts[choice.dataset.aiChoice] || ''; document.getElementById('aiChatForm')?.requestSubmit(); }
            });

            if (!db) {
                console.warn("Realtime DB not available, running on offline fallback.");
                return;
            }

            // 1. Settings listener
            db.ref('settings').on('value', s => {
                const sv = s.val();
                if (sv) {
                    settings = { ...settings, ...sv };
                    document.querySelectorAll('.shop-name-txt').forEach(e => e.textContent = settings.shopName || "101 COFFEE");
                    const phone = document.getElementById('footer-phone');
                    if (phone && settings.whatsapp) {
                        phone.href = `tel:${settings.whatsapp}`;
                        const phoneText = phone.querySelector('#footerPhoneText');
                        if (phoneText) phoneText.textContent = settings.whatsapp;
                        phone.style.display = 'block';
                    }
                    const mapLink = document.getElementById('footer-map');
                    if (mapLink && settings.mapUrl) {
                        mapLink.href = settings.mapUrl;
                        mapLink.style.display = 'block';
                    }
                    const headerLocation = document.getElementById('headerLocationLink');
                    if (headerLocation && (settings.locationUrl || settings.mapUrl)) headerLocation.href = settings.locationUrl || settings.mapUrl;
                    const insta = document.getElementById('footer-insta');
                    if (insta && (settings.instagramUrl || settings.instagram)) {
                        insta.href = settings.instagramUrl || `https://instagram.com/${settings.instagram.replace('@','')}`;
                        insta.style.display = 'block';
                    }
                    const about = document.getElementById('about');
                    if (about) about.style.display = settings.aboutEnabled === false ? 'none' : '';
                    const aboutTitle = document.getElementById('aboutTitleText');
                    const aboutDesc = document.getElementById('aboutDescText');
                    const aboutQuote = document.getElementById('aboutQuoteText');
                    if (aboutTitle) aboutTitle.textContent = currentLang === 'en' ? (settings.aboutEnTitle || 'About Us') : (settings.aboutArTitle || 'من نحن');
                    if (aboutDesc) aboutDesc.textContent = currentLang === 'en' ? (settings.aboutEnDesc || t('about_desc')) : (settings.aboutArDesc || t('about_desc'));
                    if (aboutQuote) aboutQuote.textContent = currentLang === 'en' ? (settings.aboutEnQuote || t('about_quote')) : (settings.aboutArQuote || t('about_quote'));
                    const aboutImage = document.querySelector('.about-logo-ring img');
                    if (aboutImage && settings.aboutImage) { aboutImage.src = settings.aboutImage; aboutImage.onerror = () => { aboutImage.src = 'logo.jpg'; }; }
                    renderCategoryNav();
                    renderDynamic();
                    renderCatalog(currentCat);
                }
            });

            db.ref('ai_public').on('value', snap => {
                aiConfig = { ...aiConfig, ...(snap.val() || {}) };
                const name = currentLang === 'en' ? (aiConfig.assistantNameEn || 'Zaina') : (aiConfig.assistantNameAr || 'زينة');
                const title = document.getElementById('aiChatTitle'); if (title) title.textContent = `${name} ☕`;
            });

            // 2. Background listener
            db.ref('background').on('value', s => {
                backgroundSettings = s.val() || { enabled: false, type: 'none' };
                renderBackground();
            });

            db.ref('settings/candle_day').on('value', s => {
                candleSettings = { ...candleSettings, ...(s.val() || {}) };
                updateCandleDayUI();
            });

            // 3. Products listener
            db.ref('products').on('value', snap => {
                products = [];
                if (snap.exists()) {
                    snap.forEach(c => {
                        products.push({ id: c.key, ...c.val() });
                    });
                    try { localStorage.setItem('coffee101_products_cache_v1', JSON.stringify(products)); } catch (e) {}
                } else {
                    try { const cached = JSON.parse(localStorage.getItem('coffee101_products_cache_v1') || localStorage.getItem('products_v4') || '[]'); if (Array.isArray(cached)) products = cached; } catch (e) {}
                }
                renderDynamic();
                renderCatalog(currentCat);
                renderCart();
            }, err => {
                console.error('Products read failed:', err);
                try { const cached = JSON.parse(localStorage.getItem('coffee101_products_cache_v1') || localStorage.getItem('products_v4') || '[]'); if (Array.isArray(cached) && cached.length) { products = cached; renderDynamic(); renderCatalog(currentCat); renderCart(); } } catch (e) {}
            });

            // 4. Categories listener
            db.ref('categories').on('value', snap => {
                categoriesDB = [];
                if (snap.exists()) {
                    snap.forEach(c => {
                        categoriesDB.push({ id: c.key, ...c.val() });
                    });
                }
                renderCategoryNav();
                renderDynamic();
            });

            // 5. Events listener
            db.ref('events').on('value', snap => {
                eventsDB = [];
                if (snap.exists()) {
                    snap.forEach(c => {
                        eventsDB.push({ id: c.key, ...c.val() });
                    });
                }
                const liveList = document.getElementById('eventsListGrid');
                if (liveList) {
                    const today = new Date().toISOString().slice(0, 10);
                    const activeEvents = eventsDB.filter(e => e && e.isActive !== false && e.id !== 'candle_day' && !e.isCandleDay && (!e.date || String(e.date) >= today));
                    liveList.innerHTML = activeEvents.map(eventCard).join('');
                }
                if (currentCat === 'events') renderEventsCatalog();
            });

            // 6. Tables listener
            db.ref('tables').on('value', snap => {
                tablesDB = [];
                if (snap.exists()) {
                    snap.forEach(c => tablesDB.push({ id: c.key, ...c.val() }));
                }
            });

            // 7. Event Bookings listener
            db.ref('eventBookings').on('value', snap => {
                eventBookingsDB = [];
                if (snap.exists()) {
                    snap.forEach(c => eventBookingsDB.push({ id: c.key, ...c.val() }));
                }
                if (currentCat === 'events') renderEventsCatalog();
            });

            // 8. Meeting Room Bookings listener
            db.ref('bookings').on('value', snap => {
                bookings = [];
                if (snap.exists()) {
                    snap.forEach(c => bookings.push({ id: c.key, ...c.val() }));
                }
                const dateSel = document.getElementById("bookingDate");
                if (dateSel) dateSel.dispatchEvent(new Event('change'));
            });

            // 9. Auth State
            if (auth) {
                auth.onAuthStateChanged(onAuthChanged);
            }

            updateCandleDayUI();
        }

        document.addEventListener("DOMContentLoaded", initApp);
        if (document.readyState === "complete" || document.readyState === "interactive") {
            initApp();
        }
    