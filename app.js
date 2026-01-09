"use strict";

/**
 * Bitunnel App (PRO)
 * - Mobile-first UI
 * - links.json -> safe render (innerHTML yok)
 * - Favorites, Recent, Usage-based “smart” sorting
 * - Search + category filters + toast
 * - Skeleton kesin kapanır (hidden + display none)
 * - PWA: iOS için yönergeli kurulum, Android için beforeinstallprompt
 */

const STORAGE = {
  theme: "bitunnel_theme_v3",
  fav: "bitunnel_fav_v3",
  recent: "bitunnel_recent_v3",
  usage: "bitunnel_usage_v3"
};

const SORTS = [
  { id: "smart", label: "Akıllı" },
  { id: "az", label: "A → Z" },
  { id: "new", label: "Yeni eklenen" }
];

const VALID_CATEGORIES = new Set(["popular", "betconstruct", "pronet"]);
const CATEGORY_LABELS = {
  all: "Hepsi",
  popular: "Popüler",
  betconstruct: "BetConstruct",
  pronet: "Pronet Gaming"
};

const els = {
  btnTheme: document.getElementById("btn-theme"),
  btnTheme2: document.getElementById("btn-theme-2"),
  btnRefresh: document.getElementById("btn-refresh"),
  btnInstall: document.getElementById("btn-install"),
  btnSort: document.getElementById("btn-sort"),
  btnReset: document.getElementById("btn-reset"),
  btnClearRecent: document.getElementById("btn-clear-recent"),
  btnClearData: document.getElementById("btn-clear-data"),

  search: document.getElementById("search"),
  clearSearch: document.getElementById("clear-search"),

  list: document.getElementById("list"),
  favList: document.getElementById("fav-list"),
  recentList: document.getElementById("recent-list"),

  empty: document.getElementById("empty"),
  favEmpty: document.getElementById("fav-empty"),
  recentEmpty: document.getElementById("recent-empty"),

  skeleton: document.getElementById("skeleton"),

  quickFilters: document.getElementById("quick-filters"),
  heroChips: document.getElementById("hero-chips"),
  statsRow: document.getElementById("stats-row"),
  resultsSub: document.getElementById("results-sub"),
  favSub: document.getElementById("fav-sub"),
  recentSub: document.getElementById("recent-sub"),

  toast: document.getElementById("toast"),

  navItems: Array.from(document.querySelectorAll(".navItem")),
  views: Array.from(document.querySelectorAll(".view"))
};

let deferredInstallPrompt = null;

let state = {
  links: [],
  filterCategory: "all",
  sort: "smart",
  query: "",
  favorites: new Set(),
  recent: [],
  usage: {}
};

/* ---------- Helpers ---------- */
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}
function keyOf(link) { return link.id || link.url; }

function isIOS() {
  // iOS Safari + iOS Chrome/Edge (hepsi WebKit)
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function normalizeLink(item, index) {
  const url = String(item?.url || "").trim();
  if (!url) return null;

  const id = String(item?.id || "").trim() || undefined;
  const label = String(item?.label || url).trim();
  const tag = String(item?.tag || "").trim();
  const category = VALID_CATEGORIES.has(item?.category) ? item.category : "popular";
  const logo = item?.logo ? String(item.logo).trim() : "";
  const final_url = item?.final_url ? String(item.final_url).trim() : "";
  const domain = item?.domain ? String(item.domain).trim() : "";
  const addedIndex = index;

  return { id, label, url, final_url, domain, tag, category, logo, addedIndex };
}

function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  localStorage.setItem(STORAGE.theme, isLight ? "light" : "dark");
  if (els.btnTheme) els.btnTheme.textContent = isLight ? "☀" : "☾";
}

function toast(msg, withShareIcon = false) {
  els.toast.hidden = false;

  // İçeriği sıfırla
  els.toast.textContent = "";

  if (withShareIcon) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "toastIcon";
    iconWrap.innerHTML = `
      <svg class="iconSvg iosShareIcon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v10" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>
        <path d="M8.6 6.4 12 3l3.4 3.4"
              fill="none" stroke="currentColor" stroke-width="2.8"
              stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M7.5 10.5h-1A2.5 2.5 0 0 0 4 13v6.2A2.8 2.8 0 0 0 6.8 22h10.4A2.8 2.8 0 0 0 20 19.2V13a2.5 2.5 0 0 0-2.5-2.5h-1"
              fill="none" stroke="currentColor" stroke-width="2.6"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    const text = document.createElement("span");
    text.className = "toastText";
    text.textContent = msg;

    els.toast.append(iconWrap, text);
  } else {
    els.toast.textContent = msg;
  }

  clearTimeout(toast._t);
  toast._t = setTimeout(() => { els.toast.hidden = true; }, 3000);
}



function debounce(fn, delay = 130) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

/* Logo strategy:
   - links.json "logo" varsa kullan
   - yoksa Google S2 favicon (domain bazlı) */
function faviconUrl(link) {
  if (link.logo) return link.logo;

  const source = link.final_url || link.domain || link.url; // öncelik: final_url
  try {
    const u = new URL(source);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
  } catch {
    return "";
  }
}


function simplifyUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname && u.pathname !== "/" ? u.pathname : "");
  } catch { return url; }
}

/* ---------- Skeleton (null-safe + hard hide) ---------- */
function hideSkeletonHard() {
  if (!els.skeleton) return;
  els.skeleton.hidden = true;
  els.skeleton.style.display = "none";
}
function showSkeletonHard() {
  if (!els.skeleton) return;
  els.skeleton.hidden = false;
  els.skeleton.style.display = "";
}

/* ---------- Storage ---------- */
function loadLocalState() {
  const theme = localStorage.getItem(STORAGE.theme) || "dark";
  applyTheme(theme);

  const favArr = safeJsonParse(localStorage.getItem(STORAGE.fav) || "[]", []);
  if (Array.isArray(favArr)) state.favorites = new Set(favArr);

  const recentArr = safeJsonParse(localStorage.getItem(STORAGE.recent) || "[]", []);
  if (Array.isArray(recentArr)) state.recent = recentArr.slice(0, 30);

  const usageObj = safeJsonParse(localStorage.getItem(STORAGE.usage) || "{}", {});
  if (usageObj && typeof usageObj === "object") state.usage = usageObj;
}

function saveFavorites() {
  localStorage.setItem(STORAGE.fav, JSON.stringify(Array.from(state.favorites)));
}
function saveRecent() {
  localStorage.setItem(STORAGE.recent, JSON.stringify(state.recent.slice(0, 30)));
}
function saveUsage() {
  localStorage.setItem(STORAGE.usage, JSON.stringify(state.usage));
}

/* ---------- UI ---------- */
function buildChip(label) {
  const s = document.createElement("span");
  s.className = "chip";
  s.textContent = label;
  return s;
}

function renderHeroChips() {
  if (!els.heroChips) return;
  els.heroChips.innerHTML = "";
  els.heroChips.append(
    buildChip("Bitunnel app"),
    buildChip("Favoriler ⭐"),
    buildChip("Son açılanlar ⏱"),
    buildChip("Hızlı arama 🔎")
  );
}

function statBox(val, key) {
  const d = document.createElement("div");
  d.className = "stat";
  const v = document.createElement("div");
  v.className = "statVal";
  v.textContent = val;
  const k = document.createElement("div");
  k.className = "statKey";
  k.textContent = key;
  d.append(v, k);
  return d;
}

function renderStats(visibleCount, totalCount) {
  if (!els.statsRow || !els.resultsSub) return;
  const favCount = state.favorites.size;
  const catCount = new Set(state.links.map(l => l.category)).size;

  els.statsRow.innerHTML = "";
  els.statsRow.append(
    statBox(String(totalCount), "Toplam link"),
    statBox(String(favCount), "Favori"),
    statBox(String(catCount), "Kategori")
  );

  els.resultsSub.textContent = `${visibleCount} / ${totalCount} sonuç`;
}

function renderQuickFilters() {
  if (!els.quickFilters) return;
  els.quickFilters.innerHTML = "";

  const filters = [
    { id: "all", label: "Hepsi" },
    { id: "popular", label: "Popüler" },
    { id: "betconstruct", label: "BetConstruct" },
    { id: "pronet", label: "Pronet" },
    { id: "favorites", label: "Favoriler" }
  ];

  filters.forEach(f => {
    const b = document.createElement("button");
    b.className = "pillBtn";
    b.type = "button";
    b.dataset.filter = f.id;
    b.textContent = f.label;
    if (state.filterCategory === f.id) b.style.borderColor = "rgba(79,70,229,.65)";
    els.quickFilters.appendChild(b);
  });
}

function matchesQuery(link, q) {
  if (!q) return true;
  const t = q.toLowerCase();

  let domain = "";
  try { domain = new URL(link.url).hostname; } catch {}

  return (
    link.label.toLowerCase().includes(t) ||
    link.url.toLowerCase().includes(t) ||
    (link.tag || "").toLowerCase().includes(t) ||
    (link.category || "").toLowerCase().includes(t) ||
    domain.toLowerCase().includes(t)
  );
}

function matchesCategory(link, cat) {
  if (cat === "all") return true;
  if (cat === "favorites") return state.favorites.has(keyOf(link));
  return link.category === cat;
}

function sortLinks(list) {
  if (state.sort === "az") {
    return list.slice().sort((a, b) => a.label.localeCompare(b.label, "tr"));
  }
  if (state.sort === "new") {
    return list.slice().sort((a, b) => a.addedIndex - b.addedIndex);
  }

  // smart: favorites -> most-used -> A-Z
  return list.slice().sort((a, b) => {
    const ka = keyOf(a), kb = keyOf(b);
    const fa = state.favorites.has(ka) ? 1 : 0;
    const fb = state.favorites.has(kb) ? 1 : 0;
    if (fa !== fb) return fb - fa;

    const ua = state.usage[ka] || 0;
    const ub = state.usage[kb] || 0;
    if (ua !== ub) return ub - ua;

    return a.label.localeCompare(b.label, "tr");
  });
}

function createCard(link) {
  const k = keyOf(link);
  const isFav = state.favorites.has(k);

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.key = k;

  const left = document.createElement("div");
  left.className = "left";

  const ico = document.createElement("div");
  ico.className = "favicon";

  const src = faviconUrl(link);
  if (src) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = `${link.label} logo`;
    img.src = src;
    img.onerror = () => {
      ico.innerHTML = "";
      const f = document.createElement("div");
      f.className = "fallbackIcon";
      f.textContent = (link.label || "•").slice(0, 1).toUpperCase();
      ico.appendChild(f);
    };
    ico.appendChild(img);
  } else {
    const f = document.createElement("div");
    f.className = "fallbackIcon";
    f.textContent = (link.label || "•").slice(0, 1).toUpperCase();
    ico.appendChild(f);
  }

  const meta = document.createElement("div");
  meta.className = "meta";

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = link.label;

  const sub = document.createElement("div");
  sub.className = "sub";
  sub.textContent = simplifyUrl(link.url);

  const tags = document.createElement("div");
  tags.className = "tags";
  const tag1 = document.createElement("span");
  tag1.className = "tag";
  tag1.textContent = link.tag || CATEGORY_LABELS[link.category] || link.category;
  tags.appendChild(tag1);

  meta.append(title, tags); //sub
  left.append(ico, meta);

  const actions = document.createElement("div");
  actions.className = "actions";

  const open = document.createElement("button");
open.className = "actionIconBtn";
open.type = "button";
open.dataset.action = "open";
open.dataset.url = link.url;
open.setAttribute("aria-label", `${link.label} aç`);
open.title = "Aç";
open.innerHTML = `
  <svg class="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 5h5v5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M10 14 19 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M19 14v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

const copy = document.createElement("button");
copy.className = "actionIconBtn";
copy.type = "button";
copy.dataset.action = "copy";
copy.dataset.url = link.url;
copy.setAttribute("aria-label", `${link.label} linkini kopyala`);
copy.title = "Kopyala";
copy.innerHTML = `
  <svg class="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2.4"/>
    <path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
  </svg>
`;

const fav = document.createElement("button");
fav.className = "actionIconBtn favBtn" + (isFav ? " active" : "");
fav.type = "button";
fav.dataset.action = "fav";
fav.dataset.key = k;
fav.setAttribute("aria-pressed", isFav ? "true" : "false");
fav.setAttribute("aria-label", isFav ? "Favoriden çıkar" : "Favoriye ekle");
fav.title = isFav ? "Favoriden çıkar" : "Favoriye ekle";
fav.innerHTML = `
  <svg class="iconSvg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 17.3 6.9 20l1-5.7L4 9.8l5.7-.8L12 4l2.3 5 5.7.8-3.9 4.5 1 5.7z"
          fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
  </svg>
`;


  actions.append(open, copy, fav);
  card.append(left, actions);
  return card;
}

function getVisibleLinks() {
  const q = state.query.trim().toLowerCase();
  const filtered = state.links.filter(l => matchesQuery(l, q) && matchesCategory(l, state.filterCategory));
  return sortLinks(filtered);
}

function renderMainList() {
  const visible = getVisibleLinks();

  if (!els.list) return;
  els.list.innerHTML = "";
  const frag = document.createDocumentFragment();
  visible.forEach(l => frag.appendChild(createCard(l)));
  els.list.appendChild(frag);

  hideSkeletonHard();

  if (els.empty) els.empty.hidden = visible.length !== 0;
  renderStats(visible.length, state.links.length);
}

function renderFavList() {
  if (!els.favList) return;
  const favLinks = state.links.filter(l => state.favorites.has(keyOf(l)));
  const sorted = sortLinks(favLinks);

  els.favList.innerHTML = "";
  const frag = document.createDocumentFragment();
  sorted.forEach(l => frag.appendChild(createCard(l)));
  els.favList.appendChild(frag);

  if (els.favEmpty) els.favEmpty.hidden = sorted.length !== 0;
  if (els.favSub) els.favSub.textContent = `${sorted.length} favori`;
}

function renderRecentList() {
  if (!els.recentList) return;
  const map = new Map(state.links.map(l => [keyOf(l), l]));
  const items = state.recent.map(k => map.get(k)).filter(Boolean);

  els.recentList.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(l => frag.appendChild(createCard(l)));
  els.recentList.appendChild(frag);

  if (els.recentEmpty) els.recentEmpty.hidden = items.length !== 0;
  if (els.recentSub) els.recentSub.textContent = `${items.length} kayıt`;
}

function navigate(viewId) {
  els.views.forEach(v => v.hidden = v.dataset.view !== viewId);
  els.navItems.forEach(b => b.classList.toggle("active", b.dataset.go === viewId));

  if (viewId === "home") renderMainList();
  if (viewId === "fav") renderFavList();
  if (viewId === "recent") renderRecentList();
}

/* ---------- Data load ---------- */
async function loadLinks() {
  showSkeletonHard();
  if (els.empty) els.empty.hidden = true;

  try {
    const resp = await fetch("/links.json", { cache: "no-store" });
    if (!resp.ok) throw new Error("links.json alınamadı");

    const data = await resp.json();
    if (!Array.isArray(data)) throw new Error("links.json array olmalı");

    state.links = data.map(normalizeLink).filter(Boolean);

    renderQuickFilters();
    renderHeroChips();
    renderMainList();
  } catch (err) {
    console.error(err);
    if (els.list) els.list.innerHTML = "";
    if (els.resultsSub) els.resultsSub.textContent = "Yüklenemedi";
    if (els.empty) els.empty.hidden = false;
    toast("links.json yüklenemedi");
  } finally {
    hideSkeletonHard();
  }
}

/* ---------- Actions ---------- */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Kopyalandı");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("Kopyalandı"); }
    catch { toast("Kopyalama başarısız"); }
    document.body.removeChild(ta);
  }
}

function bumpUsage(key) {
  state.usage[key] = (state.usage[key] || 0) + 1;
  saveUsage();
}

function addRecent(key) {
  state.recent = [key, ...state.recent.filter(k => k !== key)].slice(0, 30);
  saveRecent();
}

function onListClick(e) {
  const btn = e.target.closest("button");
  const card = e.target.closest(".card");
  if (!btn || !card) return;

  const action = btn.dataset.action;
  if (!action) return;

  if (action === "open") {
    const url = btn.dataset.url;
    const key = card.dataset.key;
    if (key) { bumpUsage(key); addRecent(key); }
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "copy") {
    copyToClipboard(btn.dataset.url);
    return;
  }

  if (action === "fav") {
    const key = btn.dataset.key;
    const now = !state.favorites.has(key);
    if (now) state.favorites.add(key);
    else state.favorites.delete(key);
    saveFavorites();

    btn.classList.toggle("active", now);
    btn.setAttribute("aria-pressed", now ? "true" : "false");

    renderMainList();
    renderFavList();
    toast(now ? "Favoriye eklendi" : "Favoriden çıkarıldı");
  }
}

/* ---------- PWA ---------- */
function setupPwaInstall() {
  // iOS: prompt yok, ama buton tıklanabilir olsun (yönlendirme yapacağız)
  if (isIOS() && els.btnInstall) {
    els.btnInstall.disabled = false;
  }

  // Android/desktop: install prompt event
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (els.btnInstall) els.btnInstall.disabled = false; // Android'de butonu aç
  });

  // Zaten standalone ise (ana ekrana eklenmişse) butonu "Yüklü" yap
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  if (isStandalone && els.btnInstall) {
    els.btnInstall.disabled = true;
    els.btnInstall.textContent = "Yüklü";
  }

  // Buton tıklama
  if (els.btnInstall) {
    els.btnInstall.addEventListener("click", async () => {
      // iOS: kullanıcıyı yönlendir
      if (isIOS()) {
  toast("Paylaş → ⋯ Üç Nokta → ➕ Ana Ekrana Ekle", true);
  return;
}



      // Android/desktop: prompt yoksa desteklenmiyor/şartlar oluşmadı
      if (!deferredInstallPrompt) {
        toast("Kurulum hazır değil. Chrome'da tekrar deneyin.");
        return;
      }

      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;

      deferredInstallPrompt = null;
      els.btnInstall.disabled = true;
      els.btnInstall.textContent = "Yüklü";
    });
  }

  // Service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}



/* ---------- Events ---------- */
function bindEvents() {
  // nav
  els.navItems.forEach(b => b.addEventListener("click", () => navigate(b.dataset.go)));

  // theme
  const toggleTheme = () => {
    const current = localStorage.getItem(STORAGE.theme) || "dark";
    applyTheme(current === "light" ? "dark" : "light");
  };
  if (els.btnTheme) els.btnTheme.addEventListener("click", toggleTheme);
  if (els.btnTheme2) els.btnTheme2.addEventListener("click", toggleTheme);

  // refresh
  if (els.btnRefresh) {
    els.btnRefresh.addEventListener("click", async () => {
      toast("Yenileniyor…");
      await loadLinks();
    });
  }

  // search
  if (els.clearSearch && els.search) {
    els.clearSearch.addEventListener("click", () => {
      els.search.value = "";
      state.query = "";
      renderMainList();
    });

    els.search.addEventListener("input", debounce(() => {
      state.query = els.search.value || "";
      renderMainList();
    }, 130));
  }

  // filters
  if (els.quickFilters) {
    els.quickFilters.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.filterCategory = b.dataset.filter || "all";
      renderQuickFilters();
      renderMainList();
    });
  }

  // sort cycle
  if (els.btnSort) {
    els.btnSort.addEventListener("click", () => {
      const idx = SORTS.findIndex(s => s.id === state.sort);
      const next = SORTS[(idx + 1) % SORTS.length];
      state.sort = next.id;
      els.btnSort.textContent = `Sırala: ${next.label}`;
      renderMainList();
    });
  }

  // reset filters
  if (els.btnReset && els.search && els.btnSort) {
    els.btnReset.addEventListener("click", () => {
      state.filterCategory = "all";
      state.sort = "smart";
      state.query = "";
      els.search.value = "";
      els.btnSort.textContent = "Sırala: Akıllı";
      renderQuickFilters();
      renderMainList();
    });
  }

  // lists click
  if (els.list) els.list.addEventListener("click", onListClick);
  if (els.favList) els.favList.addEventListener("click", onListClick);
  if (els.recentList) els.recentList.addEventListener("click", onListClick);

  // recent clear
  if (els.btnClearRecent) {
    els.btnClearRecent.addEventListener("click", () => {
      state.recent = [];
      saveRecent();
      renderRecentList();
      toast("Son açılanlar temizlendi");
    });
  }

  // clear all local data
  if (els.btnClearData) {
    els.btnClearData.addEventListener("click", () => {
      state.favorites = new Set();
      state.recent = [];
      state.usage = {};
      saveFavorites(); saveRecent(); saveUsage();
      renderMainList(); renderFavList(); renderRecentList();
      toast("Veriler temizlendi");
    });
  }
}

/* ---------- Init ---------- */
async function init() {
  loadLocalState();
  bindEvents();
  setupPwaInstall();

  if (els.btnSort) els.btnSort.textContent = "Sırala: Akıllı";

  await loadLinks();
  navigate("home");

  // failsafe: bazı edge-case’lerde skeleton kalmasın
  setTimeout(() => hideSkeletonHard(), 1500);
}

init();
