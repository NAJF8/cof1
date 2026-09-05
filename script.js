// === 1. إضافة ستايل الانميشن من الجافاسكريبت مباشرة ===
const style = document.createElement('style');
style.textContent = `
.coming-soon-card {
    position: relative;
    overflow: hidden;
    border: 2px solid #d4af37 !important;
    box-shadow: 0 0 12px rgba(212, 175, 55, 0.4) !important;
    animation: pulse-border 2s infinite alternate;
}
.coming-soon-card::before {
    content: '';
    position: absolute;
    top: 0; left: -100%;
    width: 50%; height: 100%;
    background: linear-gradient(to right, transparent, rgba(255,255,255,0.6), transparent);
    transform: skewX(-25deg);
    animation: shine 3s infinite;
    z-index: 1;
}
@keyframes pulse-border {
    0% { box-shadow: 0 0 5px rgba(212, 175, 55, 0.2); }
    100% { box-shadow: 0 0 15px rgba(212, 175, 55, 0.8); border-color: #f3e5ab !important; }
}
@keyframes shine {
    0% { left: -100%; }
    20% { left: 200%; }
    100% { left: 200%; }
}
.coming-soon-badge {
    background: linear-gradient(45deg, #d4af37, #f3e5ab) !important;
    color: #000 !important;
    font-weight: bold;
    animation: bounce-badge 2s infinite;
}
@keyframes bounce-badge {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-4px); }
}
`;
document.head.appendChild(style);

// === 2. إخفاء شاشة البداية ===
setTimeout(() => {
    const splash = document.getElementById("splashScreen");
    if (splash) {
        splash.style.transition = "opacity 0.5s ease";
        splash.style.opacity = "0";
        setTimeout(() => { splash.style.display = "none"; }, 500);
    }
}, 2000); 

window.addEventListener("click", () => {
    const splash = document.getElementById("splashScreen");
    if (splash && splash.style.display !== "none") {
        splash.style.display = "none";
    }
});

// === 3. دوال الحفظ والاسترجاع ===
const load = (k, fallback) => { try { const v=localStorage.getItem("coffee101_"+k); return v?JSON.parse(v):fallback } catch(e){return fallback} };
const save = (k,v) => localStorage.setItem("coffee101_"+k,JSON.stringify(v));

// === 4. الأقسام والمنتجات ===
const defaultCategories = [
    {id:"c1", name: "قهوة مختصة", active: true},
    {id:"c2", name: "قهوة ساخنة", active: true},
    {id:"c3", name: "مشروبات باردة", active: true},
    {id:"c4", name: "مشروبات 101", active: true},
    {id:"c5", name: "حلويات", active: true},
    {id:"c6", name: "ساندويتشات", active: true},
    {id:"c7", name: "إضافات/أخرى", active: true}
];
let categoriesDB = load("categoriesDB_v4", defaultCategories);

const defaultProducts = [
    { id: 1, name: "V60", price: 7000, category: "قهوة مختصة", description: "قهوة مختصة محضّرة يدوياً بالتقطير" },
    { id: 2, name: "Aeropress", price: 6000, category: "قهوة مختصة", description: "قهوة نقية غنية ومتوازنة" },
    { id: 3, name: "Cold Brew", price: 6000, category: "قهوة مختصة", description: "قهوة مفلترة متوازنة النكهة" },
    { id: 4, name: "اسبرسو سنكل", price: 3000, category: "قهوة ساخنة", description: "شوت إسبريسو نقي ومركّز" },
    { id: 5, name: "اسبرسو دبل", price: 4000, category: "قهوة ساخنة", description: "شوتان من الإسبريسو الغني" },
    { id: 6, name: "أمريكانو", price: 4500, category: "قهوة ساخنة", description: "إسبريسو مع ماء ساخن" },
    { id: 7, name: "لاتيه كلاسيك", price: 5000, category: "قهوة ساخنة", description: "إسبريسو مع حليب مبخّر ناعم", popular: true },
    { id: 8, name: "سبانيش لاتيه", price: 5500, category: "قهوة ساخنة", description: "لاتيه كريمي محلّى ومميّز", popular: true },
    { id: 9, name: "كراميل ماكياتو", price: 5500, category: "قهوة ساخنة", description: "إسبريسو مع حليب وكراميل" },
    { id: 10, name: "لاتيه جوز الهند", price: 5500, category: "قهوة ساخنة", description: "لاتيه بنكهة جوز الهند" },
    { id: 11, name: "لاتيه فانيلا", price: 5500, category: "قهوة ساخنة", description: "لاتيه بنكهة الفانيلا" },
    { id: 12, name: "لاتيه بندق", price: 5500, category: "قهوة ساخنة", description: "لاتيه بنكهة البندق" },
    { id: 13, name: "كابتشينو", price: 5000, category: "قهوة ساخنة", description: "إسبريسو مع رغوة حليب غنية" },
    { id: 14, name: "فلات وايت", price: 5000, category: "قهوة ساخنة", description: "إسبريسو مع حليب مخملي ناعم" },
    { id: 15, name: "كورتادو", price: 4000, category: "قهوة ساخنة", description: "إسبريسو وحليب بكميات متساوية" },
    { id: 16, name: "موكا", price: 5500, category: "قهوة ساخنة", description: "شوكولاتة داكنة أو بيضاء مع إسبريسو" },
    { id: 17, name: "شاي", price: 2000, category: "قهوة ساخنة", description: "شاي طازج" },
    { id: 18, name: "قهوة تركية", price: 3000, category: "قهوة ساخنة", description: "قهوة تركية تقليدية" },
    { id: 19, name: "قهوة بالبندق", price: 3000, category: "قهوة ساخنة", description: "قهوة بنكهة البندق" },
    { id: 20, name: "قهوة فرنسية", price: 3000, category: "قهوة ساخنة", description: "قهوة بأسلوب كلاسيكي" },
    { id: 21, name: "هوت شوكليت", price: 5000, category: "قهوة ساخنة", description: "كاكاو فاخر مع حليب مبخّر" },
    { id: 22, name: "آيس لاتيه كلاسيك", price: 5000, category: "مشروبات باردة", description: "لاتيه بارد منعش" },
    { id: 23, name: "آيس سبانيش لاتيه", price: 5500, category: "مشروبات باردة", description: "لاتيه بارد محلّى وكريمي" },
    { id: 24, name: "لاتيه بنكهات", price: 5500, category: "مشروبات باردة", description: "فانيلا، بندق، فراولة، كراميل، أو سولتد كراميل" },
    { id: 25, name: "لاتيه فستق", price: 5500, category: "مشروبات باردة", description: "لاتيه كريمي بنكهة الفستق" },
    { id: 26, name: "آيس موكا", price: 5500, category: "مشروبات باردة", description: "شوكولاتة داكنة أو بيضاء" },
    { id: 27, name: "ماتشا", price: 6500, category: "مشروبات باردة", description: "ماتشا مع فراولة، مانجو، بلوبيري أو باشن فروت" },
    { id: 28, name: "سموذي", price: 5500, category: "مشروبات باردة", description: "خوخ، فراولة، بلوبيري، باشن فروت أو مانجو" },
    { id: 29, name: "ميلك شيك", price: 6000, category: "مشروبات باردة", description: "لوتس، نوتيلا، أوريو أو فستق" },
    { id: 30, name: "آيس تي", price: 5000, category: "مشروبات باردة", description: "خوخ، توت أحمر أو باشن فروت" },
    { id: 31, name: "آيس أمريكانو", price: 4500, category: "مشروبات باردة", description: "أمريكانو بارد جريء ومنعش" },
    { id: 32, name: "عصير برتقال", price: 4500, category: "مشروبات باردة", description: "عصير برتقال طازج" },
    { id: 33, name: "ليمون بالنعناع", price: 4500, category: "مشروبات باردة", description: "ليمون طازج مع نعناع منعش" },
    { id: 34, name: "حليب بالموز", price: 4500, category: "مشروبات باردة", description: "حليب كريمي بنكهة الموز" },
    { id: 35, name: "كركديه", price: 5000, category: "مشروبات باردة", description: "مشروب كركديه منعش" },
    { id: 36, name: "موهيتو", price: 5000, category: "مشروبات باردة", description: "موهيتو كلاسيك بالنعناع والليمون" },
    { id: 37, name: "مشروب مكسيكي", price: 4000, category: "مشروبات باردة", description: "مشروب 101 المنعش" },
    { id: 38, name: "سكنجر 101", price: 5000, category: "مشروبات 101", description: "مشروب 101 الحصري والمميّز", popular: true },
    { id: 39, name: "فرابيه", price: 5500, category: "مشروبات 101", description: "سولتد كراميل أو فستق" },
    { id: 40, name: "كولدن شيل", price: 5500, category: "مشروبات 101", description: "شيك كريمي مميّز من 101" },
    { id: 41, name: "صيف", price: 4500, category: "مشروبات 101", description: "مشروب موسمي منعش" },
    { id: 42, name: "براوني", price: 4000, category: "حلويات", description: "براوني غني بالشوكولاتة الداكنة" },
    { id: 43, name: "براوني مع آيس كريم", price: 5000, category: "حلويات", description: "براوني دافئ مع كرة آيس كريم", popular: true },
    { id: 44, name: "افوكاتو", price: 5500, category: "حلويات", description: "إسبريسو ساخن فوق آيس كريم فانيلا" },
    { id: 45, name: "تشيز كيك", price: 5500, category: "حلويات", description: "تشيز كيك كريمي فاخر" },
    { id: 46, name: "موس كيك", price: 5000, category: "حلويات", description: "كيك موس ناعم وخفيف" },
    { id: 47, name: "سان أوريجينال", price: 6000, category: "حلويات", description: "حلوى سان الأصلية" },
    { id: 48, name: "سان بلوبيري", price: 5500, category: "حلويات", description: "حلوى سان بنكهة البلوبيري" },
    { id: 49, name: "مافن", price: 3000, category: "حلويات", description: "كيك مافن طري" },
    { id: 50, name: "كوكيز", price: 3000, category: "حلويات", description: "كوكيز طازجة" },
    { id: 51, name: "مشروب الشتاء المميز", price: 0, category: "مشروبات 101", description: "نكهة شتوية دافئة وحصرية... قريباً!", comingSoon: true }
];
let products = load("products_v4", defaultProducts);

let ordersOpen = load("ordersOpen", true);
let bookings = load("bookings", []); 

const defaultRewards = [
    { id: "r1", name: "قهوة مجانية ☕", hearts: 10 },
    { id: "r2", name: "حلوى مجانية 🍰", hearts: 15 }
];
let rewardsDB = load("rewardsDB", defaultRewards);

let defaultSettings = { 
    shopName: "101 COFFEE", whatsapp: "9647800000000", roomWhatsapp: "", instagram: "101coffee", mapUrl: "", address: "النجف الأشرف", 
    roomPrice: 10000, enablePopular: true, enableOffers: true, enableLoyalty: true 
};
let settings = load("settings", defaultSettings);

let cart = load("cart", []);
let currentHearts = load("userHearts", 0); 
const deliveryAreas = [{name:"النجف المركز",price:2000}, {name:"الكوفة",price:3000}];

// === 5. دوال مساعدة ===
const money = n => new Intl.NumberFormat("ar-IQ").format(n) + " د.ع";
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const imgHTML = (p,cls="") => p.image ? `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" onerror="this.style.display='none';this.parentElement.classList.add('placeholder')">` : `<span class="placeholder">☕</span>`;

function renderHome(){
  document.querySelectorAll('.shop-name-txt').forEach(e => e.textContent = settings.shopName);
  
  const insta = document.getElementById('footer-insta');
  if(insta && settings.instagram) { 
      let cleanInsta = settings.instagram.replace('@','').trim();
      insta.href = `https://instagram.com/${cleanInsta}`; 
      insta.textContent = `Instagram: @${cleanInsta}`; 
      insta.style.display = 'block';
  } else if(insta) { insta.style.display = 'none'; }
  
  const phone = document.getElementById('footer-phone');
  if(phone && settings.whatsapp) {
      phone.href = `tel:${settings.whatsapp}`;
      phone.textContent = `الرقم: ${settings.whatsapp}`;
      phone.style.display = 'block';
  } else if(phone) { phone.style.display = 'none'; }

  const mapLink = document.getElementById('footer-map');
  if(mapLink && settings.mapUrl) {
      mapLink.href = settings.mapUrl;
      mapLink.textContent = "الموقع على الخريطة 📍";
      mapLink.style.display = 'block';
  } else if(mapLink) { mapLink.style.display = 'none'; }

  const nav=document.getElementById("categoryNav"); 
  if(nav) {
      const activeCats = categoriesDB.filter(c => c.active);
      nav.innerHTML = `<button class="category-btn active" data-cat="all">الكل</button>` + activeCats.map(c=>`<button class="category-btn" data-cat="${esc(c.name)}">${esc(c.name)}</button>`).join("");
      nav.onclick = e => {
        const b=e.target.closest("[data-cat]"); if(!b)return;
        document.querySelectorAll(".category-btn").forEach(x=>x.classList.remove("active"));
        b.classList.add("active"); renderCatalog(b.dataset.cat);
        document.getElementById("catalog").scrollIntoView({behavior:"smooth"});
      };
  }
  
  renderDynamicSections();
  renderCatalog("all"); 
  renderCart(); 
  renderLoyaltyCard();
}

function card(p){
  const old = p.discount&&p.oldPrice ? `<span class="old-price">${money(p.oldPrice)}</span>` : "";
  const isSoon = p.comingSoon;
  const cardClass = isSoon ? "product-card coming-soon-card" : "product-card";
  
  let badgeLabel = "";
  if (isSoon) badgeLabel = "قريباً ✨";
  else if(p.discount||p.offer) badgeLabel = "خصم 🏷️";
  else if(p.newItem) badgeLabel = "جديد 🆕";
  else if(p.popular) badgeLabel = "الأكثر طلباً 🔥";
  
  const badgeHtml = badgeLabel ? `<span class="badge ${isSoon ? 'coming-soon-badge' : ''}">${badgeLabel}</span>` : "";

  return `<article class="${cardClass}" data-id="${p.id}">
    <div class="product-img">${imgHTML(p)}${badgeHtml}</div>
    <div class="product-info"><h3>${esc(p.name)}</h3><p>${esc(p.description||"")}</p>
      <div class="price-row">
        <div class="price">${old}<strong>${isSoon ? "قريباً جداً" : money(p.price)}</strong></div>
        ${isSoon ? `<span style="font-size:1.3rem;">⏳</span>` : `<button class="add-btn" data-add="${p.id}">+</button>`}
      </div>
    </div>
  </article>`;
}

function renderDynamicSections() {
    const soonArea = document.getElementById("comingSoonArea");
    const popArea = document.getElementById("popularArea");
    const offersArea = document.getElementById("offersArea");

    if(popArea && soonArea && popArea.parentNode === soonArea.parentNode) {
        popArea.parentNode.insertBefore(soonArea, popArea);
    }

    if(soonArea) {
        const soonList = products.filter(p => p.comingSoon);
        soonArea.innerHTML = soonList.length ? `<div class="feature-section"><span class="eyebrow">COMING SOON</span><h2>قريباً ✨</h2><div class="feature-products">${soonList.map(card).join("")}</div></div>` : "";
    }
    
    if(popArea && settings.enablePopular) {
        const popList = products.filter(p => p.popular && !p.comingSoon).slice(0,4);
        popArea.innerHTML = popList.length ? `<div class="feature-section"><span class="eyebrow">TOP RATED</span><h2>الأكثر طلباً 🔥</h2><div class="feature-products">${popList.map(card).join("")}</div></div>` : "";
    } else if(popArea) popArea.innerHTML = "";
    
    if(offersArea && settings.enableOffers) {
        const offersList = products.filter(p => (p.offer || p.discount) && !p.comingSoon).slice(0,4);
        offersArea.innerHTML = offersList.length ? `<div class="feature-section"><span class="eyebrow">SPECIAL OFFERS</span><h2>العروض والخصومات 🎁</h2><div class="feature-products">${offersList.map(card).join("")}</div></div>` : "";
    } else if(offersArea) offersArea.innerHTML = "";
}

function renderCatalog(cat="all"){
  const grid = document.getElementById("productsGrid"); if(!grid)return;
  const list = products.filter(p=> !p.hidden && !p.comingSoon && (cat==="all"||p.category===cat));
  grid.innerHTML = list.length ? list.map(card).join("") : `<div class="empty-state" style="grid-column:1/-1">لا توجد منتجات حالياً.</div>`;
  grid.onclick = e => {
    const add=e.target.closest("[data-add]"), item=e.target.closest(".product-card");
    if(add){ addToCart(+add.dataset.add) } else if(item){ openProduct(+item.dataset.id) }
  };
}

function renderLoyaltyCard() {
    const container = document.getElementById('loyaltySection');
    if(!container || !settings.enableLoyalty) { if(container) container.style.display = 'none'; return; }
    container.style.display = 'block';
    
    const maxHearts = 10;
    document.getElementById('heartsVisual').innerHTML = Array.from({length: maxHearts}, (_, i) => `<span class="heart ${i < currentHearts ? 'filled' : ''}">❤</span>`).join('');
    document.getElementById('heartsCount').textContent = currentHearts;

    const msg = document.getElementById('loyaltyMessage'), rewardsDiv = document.getElementById('availableRewards');
    rewardsDiv.innerHTML = '';

    if(currentHearts === 0) msg.textContent = "اجمع 10 قلوب لتحصل على مكافأتك!";
    else if(currentHearts < maxHearts) msg.textContent = `باقي لك ${maxHearts - currentHearts} قلوب وتستلم مكافأة!`;
    else msg.textContent = "مبروك! 🎉 اختر مكافأتك من القائمة:";

    let available = rewardsDB.filter(r => currentHearts >= r.hearts);
    if(available.length > 0) {
        rewardsDiv.innerHTML = available.map(r => `
            <div class="reward-item" onclick="redeemReward(${r.hearts}, '${esc(r.name)}')" style="cursor:pointer; padding: 12px; background: #f8f9fa; border: 2px solid var(--teal); border-radius: 8px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold;">🎁 ${esc(r.name)}</span>
                <span style="color:var(--teal); font-size: 0.9em;">(يخصم ${r.hearts} قلوب)</span>
            </div>
        `).join('');
    }
}

window.redeemReward = function(cost, name) {
    if(confirm(`استبدال ${cost} قلوب للحصول على: ${name}؟`)) { changeHearts(-cost); alert(`تم! أخبر الموظف لتضاف لطلبك.`); }
}
window.changeHearts = function(val) {
    currentHearts = Math.max(0, Math.min(20, currentHearts + val));
    save("userHearts", currentHearts); renderLoyaltyCard();
}

function openProduct(id){
  const p = products.find(x=>x.id===id); if(!p || p.comingSoon) return;
  const modal=document.getElementById("productModal"), detail=document.getElementById("productDetail");
  detail.innerHTML=`<div class="product-detail"><div class="detail-img">${imgHTML(p)}</div><div><span class="eyebrow">${esc(p.category)}</span><h2>${esc(p.name)}</h2><p>${esc(p.description||"")}</p><div class="price"><strong>${money(p.price)}</strong></div><div class="qty"><button id="detailMinus">−</button><strong id="detailQty">1</strong><button id="detailPlus">+</button></div><button class="primary-btn full" id="detailAdd">أضف للسلة 🛒</button></div></div>`;
  let qty=1; document.getElementById("detailMinus").onclick=()=>{qty=Math.max(1,qty-1);document.getElementById("detailQty").textContent=qty}; document.getElementById("detailPlus").onclick=()=>{qty++;document.getElementById("detailQty").textContent=qty}; document.getElementById("detailAdd").onclick=()=>{addToCart(id,qty);modal.classList.remove("open")}; modal.classList.add("open");
}

function addToCart(id,qty=1){ const row=cart.find(x=>x.id===id); row?row.qty+=qty:cart.push({id,qty}); save("cart",cart); renderCart(); }
function renderCart(){
  const el=document.getElementById("cartItems"), count=document.getElementById("cartCount"), total=document.getElementById("cartTotal");if(!el)return;
  let totalVal=0,countVal=0;
  el.innerHTML=cart.length?cart.map(r=>{const p=products.find(x=>x.id===r.id);if(!p)return"";const line=p.price*r.qty;totalVal+=line;countVal+=r.qty;return `<div class="cart-row"><div class="cart-thumb">${imgHTML(p)}</div><div><h4>${esc(p.name)}</h4><small>${money(line)}</small><div class="mini-qty"><button data-minus="${p.id}">−</button><b>${r.qty}</b><button data-plus="${p.id}">+</button></div></div><button class="delete-btn" data-del="${p.id}">×</button></div>`}).join(""):`<div class="empty-state">السلة فارغة ☕</div>`;
  if(count) count.textContent=countVal; if(total) total.textContent=money(totalVal);
  el.onclick=e=>{const m=e.target.closest("[data-minus]"),pl=e.target.closest("[data-plus]"),d=e.target.closest("[data-del]");if(m)changeCart(+m.dataset.minus,-1);if(pl)changeCart(+pl.dataset.plus,1);if(d)removeCart(+d.dataset.del)};
}
function changeCart(id,n){const r=cart.find(x=>x.id===id);if(!r)return;r.qty+=n;if(r.qty<1)cart=cart.filter(x=>x.id!==id);save("cart",cart);renderCart()}
function removeCart(id){cart=cart.filter(x=>x.id!==id);save("cart",cart);renderCart()}
function openCart(){document.getElementById("cartDrawer")?.classList.add("open");document.getElementById("drawerBackdrop")?.classList.add("open")}
function closeCart(){document.getElementById("cartDrawer")?.classList.remove("open");document.getElementById("drawerBackdrop")?.classList.remove("open")}

function showCheckout(){
  if(!cart.length) return alert("السلة فارغة.");
  if(!ordersOpen) return alert("الطلبات متوقفة حاليًا.");
  document.getElementById("checkoutModal").classList.add("open"); 
  document.getElementById("areaSelect").innerHTML = deliveryAreas.map(a=>`<option value="${a.name}">${a.name} — ${money(a.price)}</option>`).join("");
  updateCheckoutSummary();
}
function updateCheckoutSummary(){
  const el=document.getElementById("checkoutSummary");if(!el)return;
  let subtotal=cart.reduce((s,r)=>{const p=products.find(x=>x.id===r.id);return s+(p?p.price*r.qty:0)},0);
  let delivery = (document.querySelector('input[name="type"]:checked')?.value==="delivery") ? Number(deliveryAreas.find(a=>a.name===document.getElementById("areaSelect")?.value)?.price||0) : 0;
  el.innerHTML=`<div class="summary-line"><span>مجموع المنتجات</span><strong>${money(subtotal)}</strong></div><div class="summary-line"><span>التوصيل</span><strong>${money(delivery)}</strong></div><hr><div class="summary-line"><span>المجموع النهائي</span><strong>${money(subtotal+delivery)}</strong></div>`;
}

// === 6. إعداد الأحداث عند تحميل الصفحة ===
document.addEventListener("DOMContentLoaded", () => {
  renderHome(); 
  
  // --- إعدادات حجز الغرفة (شاملة وقوية للبحث عن الحقول) ---
  const bookingForm = document.getElementById("bookingForm");
  if(bookingForm) {
      // 1. تنبيه السعر 
      const priceAlert = document.createElement("div");
      priceAlert.innerHTML = `⚠️ <strong>تنبيه:</strong> سعر حجز الغرفة <strong>10,000 د.ع</strong> للساعة الواحدة.`;
      priceAlert.style.cssText = "background: #fff3cd; color: #856404; padding: 12px; border-radius: 8px; margin-bottom: 20px; text-align: center; border: 1px solid #ffeeba; font-size: 0.95rem;";
      bookingForm.insertBefore(priceAlert, bookingForm.firstChild);

      // 2. البحث عن حقول التاريخ والوقت مهما كان اسمها أو نوعها
      const dateInput = bookingForm.querySelector('input[type="date"], input[name="bookingDate"], #bookingDate');
      const timeInput = bookingForm.querySelector('input[type="time"], input[name="bookingTime"], #bookingTime');

      if(dateInput && timeInput) {
          // تحويل التاريخ إلى قائمة منسدلة لـ 7 أيام بأسماء وأرقام إنجليزية
          const dateSelect = document.createElement("select");
          dateSelect.id = "bookingDate"; 
          dateSelect.name = "bookingDate"; 
          dateSelect.required = true;
          dateSelect.style.width = "100%"; dateSelect.style.padding = "12px"; dateSelect.style.borderRadius = "8px"; dateSelect.style.marginBottom = "15px"; dateSelect.style.border = "1px solid #ddd";
          
          const daysAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
          const today = new Date();

          for (let i = 0; i < 7; i++) {
              let d = new Date(today);
              d.setDate(today.getDate() + i);
              let dayName = daysAr[d.getDay()];
              let dd = String(d.getDate()).padStart(2, '0');
              let mm = String(d.getMonth() + 1).padStart(2, '0');
              let yyyy = d.getFullYear();
              
              let valDate = `${yyyy}-${mm}-${dd}`;
              let displayDate = `${dayName} ${dd}/${mm}/${yyyy}`; 
              
              let opt = document.createElement("option");
              opt.value = valDate;
              opt.textContent = displayDate;
              dateSelect.appendChild(opt);
          }
          dateInput.parentNode.replaceChild(dateSelect, dateInput);

          // تحويل الوقت لقائمة منسدلة بنظام الساعات فقط وتتبع الحجوزات
          const timeSelect = document.createElement("select");
          timeSelect.id = "bookingTime"; 
          timeSelect.name = "bookingTime"; 
          timeSelect.required = true;
          timeSelect.style.width = "100%"; timeSelect.style.padding = "12px"; timeSelect.style.borderRadius = "8px"; timeSelect.style.marginBottom = "15px"; timeSelect.style.border = "1px solid #ddd";
          timeInput.parentNode.replaceChild(timeSelect, timeInput);

          const hours = [
              "08:00", "09:00", "10:00", "11:00", "12:00", "13:00",
              "14:00", "15:00", "16:00", "17:00", "18:00", "19:00",
              "20:00", "21:00", "22:00", "23:00", "00:00"
          ];

          const updateTimes = () => {
              timeSelect.innerHTML = "";
              const selectedDate = dateSelect.value;
              
              for (let i = 0; i < hours.length - 1; i++) { 
                  let startHour = hours[i];
                  let endHour = hours[i+1];
                  let timeText = `${startHour} - ${endHour}`;
                  
                  let isBooked = bookings.some(b => b.date === selectedDate && b.time === startHour);
                  
                  let opt = document.createElement("option");
                  opt.value = startHour;
                  if (isBooked) {
                      opt.textContent = `${timeText} — محجوز / غير متاح`;
                      opt.disabled = true;
                      opt.style.color = "red";
                  } else {
                      opt.textContent = timeText;
                  }
                  timeSelect.appendChild(opt);
              }
          };

          dateSelect.addEventListener("change", updateTimes);
          updateTimes(); 
      }
      
      // إرسال الحجز وحفظ الموعد
      bookingForm.addEventListener("submit", (e) => {
          e.preventDefault(); 
          const f = new FormData(e.target);
          const name = f.get("bookingName") || "زبون", phone = f.get("bookingPhone") || "-";
          const date = f.get("bookingDate") || f.get("date");
          const time = f.get("bookingTime") || f.get("time");
          
          if(date && time) {
              bookings.push({ date: date, time: time });
              save("bookings", bookings);
              const dSelect = document.getElementById("bookingDate");
              if(dSelect) dSelect.dispatchEvent(new Event('change'));
          }

          let roomNum = settings.roomWhatsapp || settings.whatsapp; 
          let msg = `حجز غرفة اجتماعات 📅\n\n👤 الاسم: ${name}\n📱 الهاتف: ${phone}\nالتاريخ: ${date}\n⏰ الوقت: ${time}\n💰 السعر: ${money(settings.roomPrice)} (للساعة الواحدة)\n\nملاحظات: ${f.get("bookingNotes") || "-"}`;
          window.open(`https://wa.me/${roomNum.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
      });
  }
  // ---------------------------------------------

  document.getElementById("cartBtn")?.addEventListener("click",openCart);
  document.getElementById("closeCart")?.addEventListener("click",closeCart);
  document.getElementById("drawerBackdrop")?.addEventListener("click",closeCart);
  document.getElementById("checkoutBtn")?.addEventListener("click",showCheckout);
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>b.closest(".modal-backdrop").classList.remove("open")));
  
  document.querySelectorAll('input[name="type"]').forEach(r=>r.addEventListener("change",()=>{
    const val = r.value;
    document.getElementById("deliveryFields")?.classList.toggle("hidden", val !== "delivery");
    document.getElementById("carFields")?.classList.toggle("hidden", val !== "car");
    updateCheckoutSummary();
  }));
  document.getElementById("areaSelect")?.addEventListener("change",updateCheckoutSummary);
  
  document.getElementById("checkoutForm")?.addEventListener("submit",e=>{
    e.preventDefault(); if(!ordersOpen) return alert("الطلبات متوقفة.");
    const f=new FormData(e.target), type=f.get("type");
    let subtotal=cart.reduce((s,r)=>{const p=products.find(x=>x.id===r.id);return s+(p?p.price*r.qty:0)},0);
    let delivery=type==="delivery"?Number(deliveryAreas.find(a=>a.name===f.get("area"))?.price||0):0;
    
    let msg=`السلام عليكم 🌹\nطلب جديد:\n`;
    cart.forEach(r=>{const p=products.find(x=>x.id===r.id);if(p)msg+=`☕ ${p.name} × ${r.qty} = ${money(p.price*r.qty)}\n`});
    msg+=`\n💵 المجموع الكلي: ${money(subtotal+delivery)}\n👤 الاسم: ${f.get("name")}\n📱 الهاتف: ${f.get("phone")}\n`;
    if (type === "delivery") msg += `🛵 توصيل - ${f.get("area")}\n🏠 العنوان: ${f.get("address")}\n`;
    else if (type === "car") msg += `🚗 استلام بالسيارة: ${f.get("carDetails")}\n`;
    else msg += `🚶‍♂️ استلام من المحل\n`;
    msg+=`📝 ملاحظات: ${f.get("notes")||"-"}\n`;
    window.open(`https://wa.me/${settings.whatsapp.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank");
  });
});