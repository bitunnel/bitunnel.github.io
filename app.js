"use strict";

/**
 * Bitunnel App
 * - Mobile-first UI
 * - Safe rendering (no innerHTML from JSON)
 * - Favorites (id/url key)
 * - Recent opened
 * - Search + filters + sort
 * - PWA ready
 */

const STORAGE = {
  theme: "bitunnel_theme_v2",
  fav: "bitunnel_fav_v2",
  recent: "bitunnel_recent_v2",
  usage: "bitunnel_usage_v2" // click counts by key
};

const SORTS = [
  { id: "smart", label: "Akıllı" },
  { id: "az", label: "A → Z" },
  { id: "new", label: "Yeni eklenen" } // links.json order
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
  recent: [], // array of keys
  usage: {}   // key -> count
};

function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function keyOf(link) {
  return link.id || link.url;
}

function normalizeLink(item, index) {
  const url = String(item?.url || "").trim();
  if (!url) return null;

  const id = String(item?.id || "").trim() || undefined;
  const label = String(item?.label || url).trim();
  const tag = String(item?.tag || "").trim();
  const category = VALID_CATEGORIES.has(item?.category) ? item.category : "popular";
  const logo = item?.logo ? String(item.logo).trim() : "";
  const addedIndex = index;

  return { id, label, url, tag, category, logo, addedIndex };
}

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

function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("light", isLight);
  localStorage.setItem(STORAGE.theme, isLight ? "light" : "dark");
  if (els.btnTheme) els.btnTheme.textContent = isLight ? "☀" : "☾";
}

function toast(msg) {
  els.toast.hidden = false;
  els.toast.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, 1400);
}

function debounce(fn, delay = 130) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Logo strategy:
 * 1) If links.json provides "logo": use it (relative or absolute)
 * 2) else try favicon from Google S2
 */
function faviconUrl(link) {
  if (link.logo) return link.logo;

  try {
    const u = new URL(link.url);
    const domain = u.hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  } catch {
    return "";
  }
}

function buildChip(label) {
  const s = document.createElement("span");
  s.className = "chip";
  s.textContent = label;
  return s;
}

function renderHeroChips() {
  els.heroChips.innerHTML = "";
  els.heroChips.append(
    buildChip("Mobil app hissi"),
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
  const favCount = state.favorites.size;
  const catSet = new Set(state.links.map(l => l.category));
  const catCount = catSet.size;

  els.statsRow.innerHTML = "";
  els.statsRow.append(
    statBox(String(totalCount), "Toplam link"),
    statBox(String(favCount), "Favori"),
    statBox(String(catCount), "Kategori")
  );

  els.resultsSub.textContent = `${visibleCount} / ${totalCount} sonuç`;
}

function renderQuickFilters() {
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
  const domain = (() => { try { return new URL(link.url).hostname; } catch { return ""; } })();

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
  const sort = state.sort;

  if (sort === "az") {
    return list.slice().sort((a,b) => a.label.localeCompare(b.label, "tr"));
  }

  if (sort === "new") {
    return list.slice().sort((a,b) => a.addedIndex - b.addedIndex);
  }

  // smart: favorites first, then most-used, then A-Z
  return list.slice().sort((a,b) => {
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

function simplifyUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname && u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
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

  const favUrl = faviconUrl(link);
  if (favUrl) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = `${link.label} logo`;
    img.src = favUrl;
    img.onerror = () => {
      ico.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = "fallbackIcon";
      fallback.textContent = (link.label || "•").slice(0,1).toUpperCase();
      ico.appendChild(fallback);
    };
    ico.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "fallbackIcon";
    fallback.textContent = (link.label || "•").slice(0,1).toUpperCase();
    ico.appendChild(fallback);
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

  meta.append(title, sub, tags);
  left.append(ico, meta);

  const actions = document.createElement("div");
  actions.className = "actions";

  const open = document.createElement("button");
  open.className = "actionBtn";
  open.type = "button";
  open.dataset.action = "open";
  open.dataset.url = link.url;
  open.textContent = "Aç ↗";

  const copy = document.createElement("button");
  copy.className = "actionBtn";
  copy.type = "button";
  copy.dataset.action = "copy";
  copy.dataset.url = link.url;
  copy.textContent = "Kopyala ⧉";

  const fav = document.createElement("button");
  fav.className = "actionIconBtn" + (isFav ? " active" : "");
  fav.type = "button";
  fav.dataset.action = "fav";
  fav.dataset.key = k;
  fav.setAttribute("aria-pressed", isFav ? "true" : "false");
  fav.textContent = "★";

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

  els.list.innerHTML = "";
  const frag = document.createDocumentFragment();
  visible.forEach(l => frag.appendChild(createCard(l)));
  els.list.appendChild(frag);

  els.skeleton.hidden = true;
  els.empty.hidden = visible.length !== 0;

  renderStats(visible.length, state.links.length);
}

function renderFavList() {
  const favLinks = state.links.filter(l => state.favorites.has(keyOf(l)));
  const sorted = sortLinks(favLinks);

  els.favList.innerHTML = "";
  const frag = document.createDocumentFragment();
  sorted.forEach(l => frag.appendChild(createCard(l)));
  els.favList.appendChild(frag);

  els.favEmpty.hidden = sorted.length !== 0;
  els.favSub.textContent = `${sorted.length} favori`;
}

function renderRecentList() {
  const map = new Map(state.links.map(l => [keyOf(l), l]));
  const items = state.recent.map(k => map.get(k)).filter(Boolean);

  els.recentList.innerHTML = "";
  const frag = document.createDocumentFragment();
  items.forEach(l => frag.appendChild(createCard(l)));
  els.recentList.appendChild(frag);

  els.recentEmpty.hidden = items.length !== 0;
  els.recentSub.textContent = `${items.length} kayıt`;
}

function navigate(viewId) {
  els.views.forEach(v => v.hidden = v.dataset.view !== viewId);
  els.navItems.forEach(b => b.classList.toggle("active", b.dataset.go === viewId));

  if (viewId === "home") renderMainList();
  if (viewId === "fav") renderFavList();
  if (viewId === "recent") renderRecentList();
}

async function loadLinks() {
  els.skeleton.hidden = false;
  els.empty.hidden = true;

  const resp = await fetch("/links.json", { cache: "no-store" });
  if (!resp.ok) throw new Error("links.json alınamadı");

  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error("links.json formatı array olmalı");

  state.links = data.map(normalizeLink).filter(Boolean);

  renderQuickFilters();
  renderHeroChips();
  renderMainList();
}

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
  localStorage.setItem(STORAGE.recent, JSON.stringify(state.recent));
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
    if (key) {
      bumpUsage(key);
      addRecent(key);
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "copy") {
    const url = btn.dataset.url;
    copyToClipboard(url);
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

function bindEvents() {
  els.navItems.forEach(b => b.addEventListener("click", () => navigate(b.dataset.go)));

  const toggleTheme = () => {
    const current = localStorage.getItem(STORAGE.theme) || "dark";
    applyTheme(current === "light" ? "dark" : "light");
  };
  els.btnTheme.addEventListener("click", toggleTheme);
  els.btnTheme2.addEventListener("click", toggleTheme);

  els.btnRefresh.addEventListener("click", async () => {
    toast("Yenileniyor…");
    await loadLinks().catch(() => toast("Yükleme hatası"));
  });

  els.clearSearch.addEventListener("click", () => {
    els.search.value = "";
    state.query = "";
    renderMainList();
  });

  els.search.addEventListener("input", debounce(() => {
    state.query = els.search.value || "";
    renderMainList();
  }, 130));

  els.quickFilters.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.filterCategory = b.dataset.filter || "all";
    renderQuickFilters();
    renderMainList();
  });

  els.btnSort.addEventListener("click", () => {
    const idx = SORTS.findIndex(s => s.id === state.sort);
    const next = SORTS[(idx + 1) % SORTS.length];
    state.sort = next.id;
    els.btnSort.textContent = `Sırala: ${next.label}`;
    renderMainList();
  });

  els.btnReset.addEventListener("click", () => {
    state.filterCategory = "all";
    state.sort = "smart";
    state.query = "";
    els.search.value = "";
    els.btnSort.textContent = "Sırala: Akıllı";
    renderQuickFilters();
    renderMainList();
  });

  els.list.addEventListener("click", onListClick);
  els.favList.addEventListener("click", onListClick);
  els.recentList.addEventListener("click", onListClick);

  els.btnClearRecent.addEventListener("click", () => {
    state.recent = [];
    saveRecent();
    renderRecentList();
    toast("Son açılanlar temizlendi");
  });

  els.btnClearData.addEventListener("click", () => {
    state.favorites = new Set();
    state.recent = [];
    state.usage = {};
    saveFavorites(); saveRecent(); saveUsage();
    renderMainList(); renderFavList(); renderRecentList();
    toast("Veriler temizlendi");
  });
}

/** PWA install */
function setupPwaInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    els.btnInstall.disabled = false;
  });

  els.btnInstall.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.btnInstall.disabled = true;
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

async function init() {
  loadLocalState();
  bindEvents();
  setupPwaInstall();

  els.btnSort.textContent = "Sırala: Akıllı";

  try {
    await loadLinks();
  } catch {
    els.skeleton.hidden = true;
    els.empty.hidden = false;
    els.resultsSub.textContent = "Yüklenemedi";
    toast("links.json yüklenemedi");
  }

  navigate("home");
}

init();
