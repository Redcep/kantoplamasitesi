// ===== SS-START =====
// ================= Aranabilir açılır liste =================
// <select> yerinde kalır (gizlenir); yanına arama kutusu eklenir. "ayse" yazınca "Ayşe" de bulunur.
function nrm(s) { return String(s || "").toLocaleLowerCase("tr-TR").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u"); }
(function () {   // programatik .val(x) çağrılarında arama kutusunun yazısını da güncelle
  var origVal = $.fn.val;
  $.fn.val = function () {
    var r = origVal.apply(this, arguments);
    if (arguments.length) this.each(function () { if (this._ss) this._ss.sync(); });
    return r;
  };
})();
function makeSearchable(selEl) {
  if (!selEl || selEl._ss) return;
  var $sel = $(selEl), open = false, typed = false, hi = -1, shown = [], timer = null;
  var $wrap = $('<div class="ss"></div>'), $inp = $('<input type="text" class="ss-input" autocomplete="off">'), $panel = $('<div class="ss-panel" style="display:none"></div>');
  $sel.after($wrap); $wrap.append($inp, $panel); $sel.hide();
  function opts() { return $sel.children("option").map(function () { return { v: this.value, t: this.text }; }).get(); }
  function label() { var v = $sel.val(), o = opts().filter(function (x) { return x.v === v; })[0]; return v && o ? o.t : ""; }
  function sync() {
    var ph = opts().filter(function (x) { return x.v === ""; })[0];
    $inp.attr("placeholder", (ph ? ph.text || ph.t : "Seçiniz") + " · yazarak ara");
    if (!open) $inp.val(label());
  }
  function render() {
    var q = nrm(typed ? $inp.val() : "").trim(), cur = $sel.val();
    shown = opts().filter(function (o) { return o.v === "" ? !q : nrm(o.t).indexOf(q) !== -1; });
    $panel.empty();
    if (!shown.length) { $panel.append($('<div class="ss-empty"></div>').text("Sonuç yok")); hi = -1; return; }
    hi = -1;
    shown.forEach(function (o, i) {
      var $o = $('<div class="ss-opt"></div>').text(o.v === "" ? "— " + o.t + " —" : o.t);
      if (o.v === cur && o.v !== "") $o.addClass("sel");
      if (o.v === "") $o.addClass("ss-clear");
      $o.on("click", function () { choose(o.v); });
      $panel.append($o);
      if (hi === -1 && ((q && o.v !== "") || (!q && o.v === cur && o.v !== ""))) hi = i;
    });
    mark();
  }
  function mark() { $panel.children(".ss-opt").removeClass("hl").eq(hi).addClass("hl"); var el = $panel.children(".ss-opt").get(hi); if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" }); }
  function openPanel() { if (open) return; open = true; typed = false; $panel.show(); render(); $inp.select(); }
  function close() { if (!open) return; open = false; $panel.hide(); $inp.val(label()); }
  function choose(v) { $sel.val(v); $sel.trigger("change"); close(); $inp.blur(); }
  $inp.on("focus click", openPanel);
  $inp.on("input", function () { typed = true; render(); });
  $inp.on("blur", function () { setTimeout(function () { if (document.activeElement !== $inp[0]) close(); }, 150); });
  $inp.on("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); openPanel(); if (shown.length) { hi = Math.min(hi + 1, shown.length - 1); mark(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (shown.length) { hi = Math.max(hi - 1, 0); mark(); } }
    else if (e.key === "Enter") { e.preventDefault(); if (open && shown.length) choose(shown[hi >= 0 ? hi : 0].v === "" && shown.length > 1 && typed ? shown[1].v : shown[hi >= 0 ? hi : 0].v); }
    else if (e.key === "Escape") { close(); $inp.blur(); }
  });
  new MutationObserver(function () {      // seçenekler yeniden doldurulunca (liste yenilenince) güncelle
    clearTimeout(timer); timer = setTimeout(function () { if (open) render(); sync(); }, 0);
  }).observe(selEl, { childList: true, subtree: true });
  selEl._ss = { sync: sync }; sync();
}
["#referrerSelect", "#schoolSelect", "#classSelect", "#filterSchool", "#inSchoolSelect", "#inClassRankingSchoolSelect", "#inClassRankingClassSelect", "#betweenClassRankingSchoolSelect"].forEach(function (s) { makeSearchable($(s)[0]); });
// ===== SS-END =====

// ================= Durum =================
let visitors = [], searchValue = "", filterSchoolValue = "";
let role = null, controlSearch = "";
let lastVisitorsSig = "", lastControlSig = "";
let referrers = [];   // aracı öğrenciler: sunucudan (şifreli veritabanı)
let schoolData = [];   // [{name, classes:[]}] — sunucudan (Discord okul kanalları)

const ROLE_LABEL = { kayit: "Kayıt Ekibi", kontrol: "Kontrol Ekibi", yonetim: "Yönetim" };
const ROLE_HOME = { kayit: "register", kontrol: "control", yonetim: "stats" };
const ROLE_PAGES = {
  kayit: ["dashboard", "register", "records"],
  kontrol: ["dashboard", "control", "records"],
  yonetim: ["dashboard", "stats", "yonetim", "records", "ranking", "donorRanking", "schoolRanking", "inSchoolRanking", "inClassRanking", "betweenClassRanking"]
};

function post(url, data) {
  return $.ajax({ url: url, type: "POST", contentType: "application/json", data: JSON.stringify(data || {}) });
}
$(document).ajaxError(function (e, xhr) { if (xhr.status === 401) window.location.href = "login.html"; });

// ================= Kutu (modal) =================
function openDialog(opts) {
  $("#modalTitle").text(opts.title);
  $("#modalInput").val("").attr("placeholder", opts.placeholder || "");
  $("#modalErr").hide(); $("#modalOk").text(opts.okText || "Ekle").prop("disabled", false);
  $("#modal").css("display", "flex"); setTimeout(function () { $("#modalInput").focus(); }, 30);
  function close() { $("#modal").hide(); $("#modalOk,#modalCancel,#modalInput").off(".dlg"); $(document).off("keydown.dlg"); }
  function submit() {
    var v = String($("#modalInput").val()).trim().replace(/\s+/g, " ");
    if (!v) { $("#modalErr").text("Boş bırakılamaz").show(); return; }
    $("#modalOk").prop("disabled", true);
    $.when(opts.submit(v)).done(close).fail(function (x) {
      $("#modalOk").prop("disabled", false);
      $("#modalErr").text((x && x.responseJSON && x.responseJSON.error) || "İşlem başarısız").show();
    });
  }
  $("#modalOk").on("click.dlg", submit);
  $("#modalCancel").on("click.dlg", close);
  $("#modalInput").on("keydown.dlg", function (e) { if (e.key === "Enter") submit(); });
  $(document).on("keydown.dlg", function (e) { if (e.key === "Escape") close(); });
}

// Eski sürümde bu cihazda düz metin duran aracı öğrenci listesini şifreli veritabanına taşır (tek seferlik)
function migrateReferrers() {
  var old = []; try { old = JSON.parse(localStorage.getItem("kb_referrers") || "[]"); } catch (e) {}
  if (!old.length) { localStorage.removeItem("kb_referrers"); return; }
  var have = referrers.map(function (x) { return x.toLowerCase(); });
  var chain = $.Deferred().resolve();
  old.filter(function (n) { return have.indexOf(String(n).toLowerCase()) === -1; }).forEach(function (n) {
    chain = chain.then(function () { return post("/site/referrers", { name: n }); });
  });
  chain.then(function () { localStorage.removeItem("kb_referrers"); loadLists(); });
}

// ================= Listeler (okul/sınıf: sunucu · aracı öğrenci: bu cihaz) =================
function fillSelect(sel, items, placeholder) {
  var cur = $(sel).val();
  $(sel).empty().append($("<option>", { value: "", text: placeholder }));
  items.forEach(function (x) { $(sel).append($("<option>", { value: x, text: x })); });
  if (cur && items.indexOf(cur) !== -1) $(sel).val(cur);
}
function refreshClasses(pick) {
  var sc = $("#schoolSelect").val();
  var s = schoolData.filter(function (x) { return x.name === sc; })[0];
  fillSelect("#classSelect", s ? s.classes : [], sc ? "Seçiniz" : "Önce okul seçin");
  if (pick) $("#classSelect").val(pick);
}
function refreshSelects() {
  fillSelect("#referrerSelect", referrers, "Seçiniz");
  fillSelect("#schoolSelect", schoolData.map(function (s) { return s.name; }), "Seçiniz");
  refreshClasses();
}
function loadLists(selSchool, selClass, selRef) {
  return $.getJSON("/site/lists").done(function (r) {
    schoolData = r.schools || [];
    referrers = r.referrers || [];
    fillSelect("#referrerSelect", referrers, "Seçiniz"); if (selRef) $("#referrerSelect").val(selRef);
    var cur = selSchool || $("#schoolSelect").val();
    fillSelect("#schoolSelect", schoolData.map(function (s) { return s.name; }), "Seçiniz");
    if (cur) $("#schoolSelect").val(cur);
    refreshClasses(selClass);
  });
}
$("#schoolSelect").on("change", function () { refreshClasses(); });
$("#addSchoolBtn").on("click", function () {
  openDialog({ title: "Yeni okul / kurum", placeholder: "Okul adı", submit: function (v) {
    return post("/site/lists/school", { name: v }).done(function (r) { loadLists(r.name); });
  } });
});
$("#addClassBtn").on("click", function () {
  var sch = $("#schoolSelect").val(); if (!sch) { alert("Önce okulu seçin"); return; }
  openDialog({ title: "Yeni sınıf (" + sch + ")", placeholder: "Örn. 11-A", submit: function (v) {
    return post("/site/lists/class", { school: sch, class: v }).done(function () { loadLists(sch, v); });
  } });
});
$("#addReferrerBtn").on("click", function () {
  openDialog({ title: "Yeni aracı öğrenci", placeholder: "Ad Soyad", submit: function (v) {
    return post("/site/referrers", { name: v }).done(function (r) { loadLists(undefined, undefined, r.name); });
  } });
});

// ================= Sayfa geçişleri =================
function showPage(page) {
  $(".nav button").removeClass("active");
  $(".nav button[data-page='" + page + "']").addClass("active");
  $(".page").removeClass("active");
  $("#" + page).addClass("active");
  onPageShown(page);
}
function onPageShown(page) {
  if (page === "control") loadControl(true);
  else if (page === "stats") loadStats();
  else if (page === "records") getVisitors(true);
  else if (page === "dashboard") { updateDashboardStats(); getVisitors(true); }
  else if (page === "ranking") updateStudentsRankings();
  else if (page === "donorRanking") updateDonorRankings();
  else if (page === "schoolRanking") updateSchoolsRankings();
  else if (page === "inSchoolRanking" || page === "inClassRanking" || page === "betweenClassRanking") updateFilterSchool();
}
$(".nav button").off("click").on("click", function () { showPage($(this).data("page")); });

// ================= Yeni kayıt =================
function entryFormSubmit() {
  var ref = $("#referrerSelect").val(), cls = $("#classSelect").val(), sch = $("#schoolSelect").val();
  if (!$("#name").val()) { alert("Ad Soyad gerekli"); return; }
  if (!sch) { alert("Okul seçiniz"); return; }
  if (!ref) { alert("Aracı öğrenci seçiniz"); return; }
  var data = { name: $("#name").val().toLocaleLowerCase("tr-TR"), school: String(sch).toLocaleLowerCase("tr-TR"), referrer: String(ref).toLocaleLowerCase("tr-TR"), class: cls || "", note: $("#note").val() };
  post("/site/visitor", data).done(function (r) {
    $("#name").val(""); $("#note").val("");
    $("#givenNo").text(r.id);
    $("#routeNotice").show();
    updateAll();
  }).fail(function (x) { alert((x.responseJSON && x.responseJSON.error) || "Kayıt eklenemedi"); });
}
$("#entryFormSubmit").off("click").on("click", entryFormSubmit);

// ================= Kayıtlar =================
function getVisitors(force) {
  $.getJSON("/site/visitors").done(function (data) {
    data = data || [];
    var sig = JSON.stringify(data);
    $("#recordCount").text(data.length + " kayıt");
    if (!force && sig === lastVisitorsSig) return;   // değişmediyse yeniden çizme (seçimler bozulmasın)
    lastVisitorsSig = sig; visitors = data; renderVisitors(visitors);
  });
}
function statusText(s) { return s === "waiting" ? "Beklemede" : s === "success" ? "Kan verdi" : s === "unable" ? "Kan veremedi" : "Kan vermedi"; }
function renderVisitors(data) {
  $("#recordList").empty(); $("#recent").empty();
  var sv = searchValue.toLocaleLowerCase("tr-TR"), shown = 0;
  data.forEach(function (v) {
    if (sv && (v.name || "").indexOf(sv) === -1 && (v.school || "").indexOf(sv) === -1 && (v.referrer || "").indexOf(sv) === -1) return;
    if (filterSchoolValue && (v.school || "").toLowerCase() !== filterSchoolValue.toLowerCase()) return;
    var t = $("#templates").find(".recordEntry").clone();
    t.find(".entryName").text(v.name);
    t.find(".entryMisc").text("Kayıt No: " + v.id + " | Okul: " + v.school + " | Aracı: " + v.referrer + " | Sınıf: " + (v.class || "-"));
    t.find(".badge").removeClass("waiting success unable failure").addClass(v.status).text(statusText(v.status));
    t.find(".entryStatus").val(v.status).data("id", v.id).toggle(role !== "kayit").off("change").on("change", entryOnStatusChange);
    t.find(".entryNote").text(v.note || "");
    t.find(".entryApprovedBy").text(v.approvedBy || "-");
    t.find(".entryDelete").data("id", v.id).off("click").on("click", entryOnDelete);
    $("#recordList").append(t);
    if (shown < 5) { $("#recent").append(t.clone(true)); }
    shown++;
  });
}
$("#search").off("input").on("input", function () { searchValue = $(this).val(); renderVisitors(visitors); });
$("#filterSchool").off("change").on("change", function () { filterSchoolValue = $(this).val(); renderVisitors(visitors); });
function entryOnDelete() {
  var id = $(this).data("id");
  if (!confirm("Silinsin mi?")) return;
  if (role === "yonetim") { post("/site/visitor/delete", { id: id }).done(function () { updateAll(); loadControl(true); }); return; }
  askDeletePassword(function (pw) {
    post("/site/visitor/delete", { id: id, password: pw }).done(function () { updateAll(); loadControl(true); })
      .fail(function (x) { alert((x.responseJSON && x.responseJSON.error) || "Silinemedi"); });
  });
}
// Kayıt/Kontrol ekibi silerken şifre sor
function askDeletePassword(cb) {
  $("#modalTitle").text("Silme onayı · Şifre");
  $("#modalInput").val("").attr({ type: "password", placeholder: "Şifrenizi girin", autocomplete: "current-password" });
  $("#modalErr").hide(); $("#modalOk").text("Sil").prop("disabled", false);
  $("#modal").css("display", "flex"); setTimeout(function () { $("#modalInput").focus(); }, 30);
  function close() { $("#modal").hide(); $("#modalOk,#modalCancel,#modalInput").off(".dlg"); $(document).off("keydown.dlg"); }
  function submit() {
    var v = String($("#modalInput").val());
    if (!v) { $("#modalErr").text("Şifre boş bırakılamaz").show(); return; }
    $("#modalOk").prop("disabled", true);
    post("/site/verify-password", { password: v }).done(function () { close(); cb(v); }).fail(function (x) {
      $("#modalOk").prop("disabled", false);
      $("#modalErr").text((x && x.responseJSON && x.responseJSON.error) || "Geçersiz şifre").show();
    });
  }
  $("#modalOk").on("click.dlg", submit);
  $("#modalCancel").on("click.dlg", close);
  $("#modalInput").on("keydown.dlg", function (e) { if (e.key === "Enter") submit(); });
  $(document).on("keydown.dlg", function (e) { if (e.key === "Escape") close(); });
}
function entryOnStatusChange() { post("/site/visitor/status", { id: $(this).data("id"), status: $(this).val() }).done(function () { updateAll(); loadControl(true); }); }

function updateFilterSchool() {
  $.getJSON("/site/schools/unique").done(function (data) {
    [["#filterSchool", "Tüm okullar"], ["#inSchoolSelect", "Okul Seçiniz"], ["#inClassRankingSchoolSelect", "Okul Seçiniz"], ["#betweenClassRankingSchoolSelect", "Okul Seçiniz"]].forEach(function (p) {
      fillSelect(p[0], data || [], p[1]);
    });
  });
}
function updateDashboardStats() {
  $.getJSON("/site/stats/dashboard").done(function (d) {
    $("#total").text(d.visitor_count || 0); $("#done").text(d.success_count || 0); $("#wait").text(d.waiting_count || 0);
    $("#unable").text(d.unable_count || 0); $("#notdonated").text(d.failure_count || 0);
    $("#schools").text(d.school_count || 0);
  });
}
function updateAll() {
  updateDashboardStats(); getVisitors(true); refreshSelects();
  if (role === "yonetim") { updateFilterSchool(); updateStudentsRankings(); updateDonorRankings(); updateSchoolsRankings(); if ($("#stats").hasClass("active")) loadStats(); }
}

// ================= Kontrol ekranı (herkes tek ortak liste) =================
function controlAction(id, status) {
  post("/site/visitor/status", { id: id, status: status }).done(function () { updateAll(); loadControl(true); })
    .fail(function (x) { alert((x.responseJSON && x.responseJSON.error) || "İşlem başarısız"); });
}
function loadControl(force) {
  if (role !== "kontrol" && role !== "yonetim") return;
  $.getJSON("/site/visitors").done(function (data) {
    var q = (controlSearch || "").toLocaleLowerCase("tr-TR");
    var waiting = (data || []).filter(function (v) { return v.status === "waiting"; });
    var list = waiting.filter(function (v) {
      if (!q) return true;
      return String(v.id).indexOf(q) !== -1 ||
        (v.name || "").toLocaleLowerCase("tr-TR").indexOf(q) !== -1 ||
        (v.school || "").toLocaleLowerCase("tr-TR").indexOf(q) !== -1 ||
        (v.referrer || "").toLocaleLowerCase("tr-TR").indexOf(q) !== -1 ||
        (v.class || "").toLocaleLowerCase("tr-TR").indexOf(q) !== -1;
    }).sort(function (a, b) { return (a.id || 0) - (b.id || 0); }); // en eski bekleyen en üstte
    var sig = q + "|" + waiting.length + "|" + list.map(function (v) { return v.id; }).join(",");
    if (!force && sig === lastControlSig) return;
    lastControlSig = sig;
    $("#controlList").empty();
    if (!list.length) { $("#controlList").append("<div class='muted'>" + (q ? "Aramanızla eşleşen bekleyen kayıt yok" : "Bekleyen kayıt yok") + "</div>"); return; }
    list.forEach(function (item) {
      var t = $("#templates").find(".controlEntry").clone();
      t.find(".entryId").text(item.id);
      t.find(".entryName").text(item.name);
      t.find(".entryMisc").text("Okul: " + item.school + " | Aracı: " + item.referrer + " | Sınıf: " + (item.class || "-"));
      t.find(".entryNote").text(item.note || "");
      t.find(".controlDone").on("click", function () { controlAction(item.id, "success"); });
      t.find(".controlUnable").on("click", function () { controlAction(item.id, "unable"); });
      t.find(".controlReject").on("click", function () { controlAction(item.id, "failure"); });
      $("#controlList").append(t);
    });
  });
}
var controlSearchTimer = null;
$("#controlSearch").off("input").on("input", function () {
  controlSearch = $(this).val();
  clearTimeout(controlSearchTimer);
  controlSearchTimer = setTimeout(function () { loadControl(true); }, 200);
});

// ================= Sıralamalar =================
function renderRank(container, data, nameKey, opts) {
  opts = opts || {};
  var box = $(container);
  if (!data || !data.length) { box.html("<div class='muted'>Kayıt yok</div>"); return; }
  var metric = opts.bar || "success_count";
  var top = Math.max.apply(null, data.map(function (d) { return d[metric] || 0; })) || 1;
  box.empty();
  data.forEach(function (d, i) {
    var t = $("#templates").find(".rankEntry").clone();
    var pct = opts.ratio ? (d.count ? (d.success_count / d.count * 100) : 0) : ((d[metric] || 0) / top * 100);
    t.find(".medal").text(i + 1);
    t.find(".entryName").text(d[nameKey]);
    var misc = "Getirdiği: " + (d.count || 0) + " · Kan verdi: " + (d.success_count || 0);
    if (d.unable_count) misc += " · Kan veremedi: " + d.unable_count;
    t.find(".entryMisc").text(misc);
    t.find(".entryBar").css("width", pct + "%");
    t.find(".entryCount").text(opts.ratio ? ("%" + Math.round(pct)) : (d[metric] || 0));
    box.append(t);
  });
}
function updateStudentsRankings() { $.getJSON("/site/rankings/students").done(function (d) { renderRank("#rankingList", d, "referrer", { bar: "count" }); }); }
function updateDonorRankings() { $.getJSON("/site/rankings/donors").done(function (d) { renderRank("#donorRankingList", d, "referrer", { ratio: true }); }); }
function updateSchoolsRankings() { $.getJSON("/site/rankings/schools").done(function (d) { renderRank("#schoolRankingList", d, "school"); }); }
function updateInSchoolRanking() { var s = $("#inSchoolSelect").val(); if (!s) return; $.getJSON("/site/rankings/in-school", { school: s }).done(function (d) { renderRank("#inSchoolRankingList", d, "referrer"); }); }
function updateClassesOfSchool() {
  var s = $("#inClassRankingSchoolSelect").val(); if (!s) return;
  $.getJSON("/site/classes", { school: s }).done(function (d) { fillSelect("#inClassRankingClassSelect", d || [], "Sınıf Seçiniz"); });
}
function updateInClassRanking() { var s = $("#inClassRankingSchoolSelect").val(), c = $("#inClassRankingClassSelect").val(); if (!s || !c) return; $.getJSON("/site/rankings/in-class", { school: s, class: c }).done(function (d) { renderRank("#inClassRankingList", d, "referrer"); }); }
function updateBetweenClassRanking() { var s = $("#betweenClassRankingSchoolSelect").val(); if (!s) return; $.getJSON("/site/rankings/between-classes", { school: s }).done(function (d) { renderRank("#betweenClassRankingList", d, "class"); }); }

// ================= Yönetim istatistikleri =================
function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "-"; }
function fmtMin(m) { return m === null || m === undefined ? "-" : (m >= 60 ? Math.floor(m / 60) + " sa " + Math.round(m % 60) + " dk" : m + " dk"); }
function loadStats() {
  if (role !== "yonetim") return;
  $.getJSON("/site/stats/overview").done(function (s) {
    $("#stTotal").text(s.total); $("#stAll").text(s.allTotal || s.total);
    $("#stSuccess").text(s.success); $("#stUnable").text(s.unable || 0); $("#stWaiting").text(s.waiting);
    $("#stExcluded").text(s.excluded || 0);
    $("#stRate").text("%" + s.approvalRate); $("#stAvg").text(fmtMin(s.avgMinutes)); $("#stLongest").text(s.waiting ? fmtMin(s.longestWaitMin) : "-");
    $("#statsUpdated").text("Son güncelleme: " + fmtTime(s.generatedAt) + " · otomatik yenilenir");

    // durum dağılımı ("kan vermedi" istatistiğe dahil edilmez)
    var bar = $("#stStatusBar").empty(), legend = $("#stLegend").empty();
    [["success", "Kan verdi", s.success], ["unable", "Kan veremedi", s.unable || 0], ["waiting", "Bekleyen", s.waiting]].forEach(function (x) {
      if (s.total) bar.append($("<span>", { class: "seg-" + x[0] }).css("width", (x[2] / s.total * 100) + "%"));
      legend.append($("<span>").append($("<i>", { class: "seg-" + x[0] })).append(document.createTextNode(x[1] + ": " + x[2])));
    });

    // saatlik
    var hb = $("#stHourly").empty();
    if (!s.hourly.length) hb.html("<div class='muted'>Veri yok</div>");
    else {
      var mx = Math.max.apply(null, s.hourly.map(function (h) { return Math.max(h.registered, h.approved); })) || 1;
      s.hourly.forEach(function (h) {
        var row = $("<div class='hrow'><div class='hl'></div><div class='hb'><div class='hbar'><span style='background:#c9ced6'></span></div><div class='hbar'><span style='background:#a7192d'></span></div></div><div class='hn'></div></div>");
        row.find(".hl").text(h.hour);
        row.find(".hbar:eq(0) span").css("width", (h.registered / mx * 100) + "%");
        row.find(".hbar:eq(1) span").css("width", (h.approved / mx * 100) + "%");
        row.find(".hn").text("Kayıt " + h.registered + " · Kan verdi " + h.approved);
        hb.append(row);
      });
      hb.append("<div class='muted' style='margin-top:6px'>Gri: kayıt · Kırmızı: kan verdi · “Kan vermedi” hariç</div>");
    }
    renderRank("#stSchools", s.topSchools, "name");
    renderRank("#stRefs", s.topReferrers, "name");
  });
}

// ================= Diğer =================
$("#exportCsv").off("click").on("click", function () { window.location.href = "/site/export/csv"; });
$("#inSchoolSelect").off("change").on("change", updateInSchoolRanking);
$("#inClassRankingSchoolSelect").off("change").on("change", updateClassesOfSchool);
$("#inClassRankingClassSelect").off("change").on("change", updateInClassRanking);
$("#betweenClassRankingSchoolSelect").off("change").on("change", updateBetweenClassRanking);
$("#logoutBtn").off("click").on("click", function () { post("/site/logout").always(function () { window.location.href = "login.html"; }); });

// ================= Rol bazlı giriş =================
function enterMain() {
  $("#anaEkran").show();
  var allowed = ROLE_PAGES[role] || [];
  $(".nav button").each(function () { $(this).toggle(allowed.indexOf($(this).data("page")) !== -1); });
  refreshSelects(); if (role !== "kontrol") loadLists().done(migrateReferrers); updateAll();
  showPage(ROLE_HOME[role] || "dashboard");
}

setInterval(function () {
  if (!role || $("#anaEkran").is(":hidden")) return;
  if ($("#control").hasClass("active")) loadControl(false);
  if ($("#stats").hasClass("active")) loadStats();
  getVisitors(false); updateDashboardStats();
}, 3000);

$(document).ready(function () {
  $.getJSON("/site/auth/check").done(function (r) {
    if (!r.authenticated) { window.location.href = "login.html"; return; }
    role = r.role || "kayit";
    $("body").addClass("role-" + role);
    $("#roleInfo").text(ROLE_LABEL[role] || role);
    enterMain();
  }).fail(function () { window.location.href = "login.html"; });
});
