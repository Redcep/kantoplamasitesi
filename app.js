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
["#referrerSelect", "#schoolSelect", "#classSelect", "#tableSelect", "#filterSchool", "#inSchoolSelect", "#inClassRankingSchoolSelect", "#inClassRankingClassSelect", "#betweenClassRankingSchoolSelect", "#masaSelect"].forEach(function (s) { makeSearchable($(s)[0]); });
// ===== SS-END =====

// ================= Durum =================
let visitors = [], searchValue = "", filterSchoolValue = "";
let role = null, currentTable = null;
let lastVisitorsSig = "", lastControlSig = "";
let controlChecks = {};
let referrers = [];   // aracı öğrenciler: sunucudan (şifreli veritabanı)
let schoolData = [];   // [{name, classes:[]}] — sunucudan (Discord okul kanalları)

const ROLE_LABEL = { kayit: "Kayıt Ekibi", kontrol: "Kontrol Ekibi", yonetim: "Yönetim" };
const ROLE_HOME = { kayit: "register", kontrol: "control", yonetim: "stats" };
const ROLE_PAGES = {
  kayit: ["dashboard", "register", "records"],
  kontrol: ["dashboard", "control", "records"],
  yonetim: ["dashboard", "stats", "yonetim", "records", "ranking", "schoolRanking", "inSchoolRanking", "inClassRanking", "betweenClassRanking"]
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
  else if (page === "register") loadOpenTables();
  else if (page === "dashboard") { updateDashboardStats(); getVisitors(true); }
  else if (page === "ranking") updateStudentsRankings();
  else if (page === "schoolRanking") updateSchoolsRankings();
  else if (page === "inSchoolRanking" || page === "inClassRanking" || page === "betweenClassRanking") updateFilterSchool();
}
$(".nav button").off("click").on("click", function () { showPage($(this).data("page")); });

// ================= Yeni kayıt =================
function loadOpenTables() {
  if (role !== "kayit" && role !== "yonetim") return;
  $.getJSON("/site/tables").done(function (list) {
    var open = (list || []).filter(function (t) { return t.open; });
    var sel = $("#tableSelect"), cur = sel.val();
    sel.empty().append($("<option>", { value: "", text: "Otomatik (açık masalara eşit dağıt)" }));
    open.forEach(function (t) { sel.append($("<option>", { value: t.name, text: t.name + " (" + t.waiting + " bekliyor)" })); });
    if (cur && open.some(function (t) { return t.name === cur; })) sel.val(cur);
    $("#openInfo").text(open.length ? "Açık masa: " + open.length + " · " + open.map(function (t) { return t.name + " (" + t.waiting + ")"; }).join(", ") : "Şu an açık masa yok");
  });
}
function entryFormSubmit() {
  var ref = $("#referrerSelect").val(), cls = $("#classSelect").val(), sch = $("#schoolSelect").val();
  if (!$("#name").val()) { alert("Ad Soyad gerekli"); return; }
  if (!sch) { alert("Okul seçiniz"); return; }
  if (!ref) { alert("Aracı öğrenci seçiniz"); return; }
  var data = { name: $("#name").val().toLocaleLowerCase("tr-TR"), school: String(sch).toLocaleLowerCase("tr-TR"), referrer: String(ref).toLocaleLowerCase("tr-TR"), class: cls || "", table: $("#tableSelect").val(), note: $("#note").val() };
  post("/site/visitor", data).done(function (r) {
    $("#name").val(""); $("#note").val("");
    var msg = r.table ? "Kayıt No: " + r.id + " → " + r.table + "'e yönlendirin" : "Kayıt No: " + r.id + " · Şu an açık masa yok, masa açılınca otomatik yönlendirilecek";
    $("#routeNotice").text(msg).show(); loadOpenTables(); updateAll();
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
function statusText(s) { return s === "waiting" ? "Beklemede" : s === "success" ? "Onaylandı" : "Reddedildi"; }
function renderVisitors(data) {
  $("#recordList").empty(); $("#recent").empty();
  var sv = searchValue.toLocaleLowerCase("tr-TR"), shown = 0;
  data.forEach(function (v) {
    if (sv && (v.name || "").indexOf(sv) === -1 && (v.school || "").indexOf(sv) === -1 && (v.referrer || "").indexOf(sv) === -1) return;
    if (filterSchoolValue && (v.school || "").toLowerCase() !== filterSchoolValue.toLowerCase()) return;
    var t = $("#templates").find(".recordEntry").clone();
    t.find(".entryName").text(v.name);
    t.find(".entryMisc").text("Okul: " + v.school + " | Aracı: " + v.referrer + " | Sınıf: " + (v.class || "-") + " | Yönlendirilen: " + (v.assignedTable || "-"));
    t.find(".badge").removeClass("waiting success failure").addClass(v.status).text(statusText(v.status));
    t.find(".entryStatus").val(v.status).data("id", v.id).off("change").on("change", entryOnStatusChange);
    t.find(".entryNote").text(v.note || "");
    t.find(".entryTable").text(v.tableNo || "-");
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
    $("#total").text(d.visitor_count || 0); $("#done").text(d.success_count || 0); $("#wait").text(d.waiting_count || 0); $("#schools").text(d.school_count || 0);
  });
}
function updateAll() {
  updateDashboardStats(); getVisitors(true); refreshSelects();
  if (role === "yonetim") { updateFilterSchool(); updateStudentsRankings(); updateSchoolsRankings(); if ($("#stats").hasClass("active")) loadStats(); }
}

// ================= Masa seçimi (Kontrol Ekibi) =================
function loadTables(selectName) {
  $.getJSON("/site/tables").done(function (list) {
    var sel = $("#masaSelect"); sel.empty().append($("<option>", { value: "", text: "Masa seçiniz" }));
    (list || []).forEach(function (t) { sel.append($("<option>", { value: t.name, text: t.name })); });
    var pick = selectName || currentTable; if (pick) sel.val(pick);
  });
}
function showTableGate() {
  $("#anaEkran").hide(); $("#kontrolGiris").show(); $("#masaErr").hide();
  $("#masaChip,#masaDegistir").hide();
  loadTables();
}
function gateError(msg) { $("#masaErr").text(msg).show(); }
$("#masaEkleBtn").on("click", function () {
  $("#masaErr").hide();
  openDialog({ title: "Yeni masa", placeholder: "Örn. Masa 1", okText: "Ekle ve Seç", submit: function (v) {
    return post("/site/tables", { name: v }).done(function (r) { loadTables(r.name); });
  } });
});
$("#masaKaydet").on("click", function () {
  var name = $("#masaSelect").val(); if (!name) { gateError("Önce bir masa seçin veya ekleyin"); return; }
  post("/site/control/table", { name: name }).done(function (r) { currentTable = r.table; enterMain(); })
    .fail(function (x) { gateError((x.responseJSON && x.responseJSON.error) || "Masa seçilemedi"); });
});
$("#controlAll").on("change", function () { loadControl(true); });
$("#masaDegistir").on("click", function () { post("/site/control/table", { name: "" }).done(function () { currentTable = null; lastControlSig = ""; showTableGate(); }); });

// ================= Kontrol ekranı =================
function loadControl(force) {
  if (role !== "kontrol" && role !== "yonetim") return;
  $.getJSON("/site/visitors").done(function (data) {
    var all = $("#controlAll").is(":checked");
    var list = (data || []).filter(function (v) {
      if (v.status !== "waiting") return false;
      return all || (v.assignedTable && currentTable && v.assignedTable.toLowerCase() === currentTable.toLowerCase());
    }).reverse(); // en eski bekleyen en üstte
    var sig = currentTable + "|" + all + "|" + list.map(function (v) { return v.id + ":" + v.assignedTable; }).join(",");
    if (!force && sig === lastControlSig) return;
    lastControlSig = sig;
    $("#masaBilgi").text(currentTable || "-");
    $("#controlList").empty();
    if (!list.length) { $("#controlList").append("<div class='muted'>" + (all ? "Bekleyen kayıt yok" : "Size yönlendirilmiş bekleyen yok") + "</div>"); return; }
    list.forEach(function (item) {
      var t = $("#templates").find(".controlEntry").clone();
      t.find(".entryName").text(item.name);
      t.find(".entryMisc").text("Kayıt No: " + item.id + " | Okul: " + item.school + " | Aracı: " + item.referrer + " | Yönlendirilen: " + (item.assignedTable || "-"));
      t.find(".entryNote").text(item.note || "");
      t.find(".entryClass").text(item.class || "-");
      t.find(".entryMasa").text(currentTable || "-");
      var st = controlChecks[item.id] || {};
      t.find(".chkUygun").prop("checked", !!st.uygun).on("change", function () {
        var on = this.checked;
        t.find(".verdiWrap").toggle(on);
        if (!on) t.find(".chkVerdi").prop("checked", false);
        controlChecks[item.id] = Object.assign({}, controlChecks[item.id], { uygun: on, verdi: on ? (controlChecks[item.id] || {}).verdi : false });
      });
      t.find(".verdiWrap").toggle(!!st.uygun);
      t.find(".chkVerdi").prop("checked", !!st.verdi).on("change", function () { controlChecks[item.id] = Object.assign({}, controlChecks[item.id], { verdi: this.checked }); });
      t.find(".controlAssign").on("click", function () {
        if (!currentTable) { alert("Önce masa seçin"); return; }
        if (!t.find(".chkUygun").is(":checked")) { alert("Kan vermeye uygun seçiniz"); return; }
        if (!t.find(".chkVerdi").is(":checked")) { alert("Kan verdi seçiniz"); return; }
        post("/site/control/assign", { id: item.id }).done(function () { delete controlChecks[item.id]; updateAll(); loadControl(true); })
          .fail(function (x) { alert((x.responseJSON && x.responseJSON.error) || "İşlem başarısız"); });
      });
      t.find(".controlReject").on("click", function () {
        post("/site/visitor/status", { id: item.id, status: "failure" }).done(function () { delete controlChecks[item.id]; updateAll(); loadControl(true); });
      });
      $("#controlList").append(t);
    });
  });
}

// ================= Sıralamalar =================
function renderRank(container, data, nameKey) {
  var box = $(container);
  if (!data || !data.length) { box.html("<div class='muted'>Kayıt yok</div>"); return; }
  var top = data[0].success_count || 1; box.empty();
  data.forEach(function (d, i) {
    var t = $("#templates").find(".rankEntry").clone();
    t.find(".medal").text(i + 1); t.find(".entryName").text(d[nameKey]); t.find(".entryMisc").text("Toplam: " + d.count);
    t.find(".entryBar").css("width", (d.success_count / top * 100) + "%"); t.find(".entryCount").text(d.success_count);
    box.append(t);
  });
}
function updateStudentsRankings() { $.getJSON("/site/rankings/students").done(function (d) { renderRank("#rankingList", d, "referrer"); }); }
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
    $("#stTotal").text(s.total); $("#stSuccess").text(s.success); $("#stWaiting").text(s.waiting); $("#stFailure").text(s.failure);
    $("#stRate").text("%" + s.approvalRate); $("#stAvg").text(fmtMin(s.avgMinutes)); $("#stLongest").text(s.waiting ? fmtMin(s.longestWaitMin) : "-");
    $("#stTableCount").text(s.tables.length);
    $("#statsUpdated").text("Son güncelleme: " + fmtTime(s.generatedAt) + " · otomatik yenilenir");

    // durum dağılımı
    var bar = $("#stStatusBar").empty(), legend = $("#stLegend").empty();
    [["success", "Onaylanan", s.success], ["waiting", "Bekleyen", s.waiting], ["failure", "Reddedilen", s.failure]].forEach(function (x) {
      if (s.total) bar.append($("<span>", { class: "seg-" + x[0] }).css("width", (x[2] / s.total * 100) + "%"));
      legend.append($("<span>").append($("<i>", { class: "seg-" + x[0] })).append(document.createTextNode(x[1] + ": " + x[2])));
    });

    // masa bazlı
    var tb = $("#stTables").empty();
    if (!s.tables.length) tb.html("<div class='muted'>Henüz masa eklenmedi</div>");
    else {
      var tbl = $("<table class='tbl'><thead><tr><th>Masa</th><th>Durum</th><th>Yönlendirilen</th><th>Onaylanan</th><th>Reddedilen</th><th>Son işlem</th></tr></thead><tbody></tbody></table>");
      s.tables.forEach(function (t) {
        tbl.find("tbody").append($("<tr>").append($("<td>").append($("<b>").text(t.table))).append($("<td>").text(t.open ? "● Açık" : "Kapalı").css("color", t.open ? "#21683a" : "#69717d")).append($("<td>").text(t.assigned || 0)).append($("<td>").text(t.success)).append($("<td>").text(t.failure)).append($("<td>").text(fmtTime(t.lastAt))));
      });
      tb.append(tbl);
    }

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
        row.find(".hn").text("Kayıt " + h.registered + " · Onay " + h.approved);
        hb.append(row);
      });
      hb.append("<div class='muted' style='margin-top:6px'>Gri: kayıt · Kırmızı: onay</div>");
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
  $("#kontrolGiris").hide(); $("#anaEkran").show();
  var allowed = ROLE_PAGES[role] || [];
  $(".nav button").each(function () { $(this).toggle(allowed.indexOf($(this).data("page")) !== -1); });
  if (role === "kontrol") { $("#masaChip").show(); $("#masaChipName").text(currentTable || "-"); $("#masaDegistir").show(); }
  refreshSelects(); if (role !== "kontrol") loadLists().done(migrateReferrers); updateAll();
  showPage(ROLE_HOME[role] || "dashboard");
}

setInterval(function () {
  if (!role || $("#anaEkran").is(":hidden")) return;
  if ($("#control").hasClass("active")) loadControl(false);
  if ($("#stats").hasClass("active")) loadStats();
  if ($("#register").hasClass("active")) loadOpenTables();
  getVisitors(false); updateDashboardStats();
}, 3000);

$(document).ready(function () {
  $.getJSON("/site/auth/check").done(function (r) {
    if (!r.authenticated) { window.location.href = "login.html"; return; }
    role = r.role || "kayit"; currentTable = r.table || null;
    $("body").addClass("role-" + role);
    $("#roleInfo").text(ROLE_LABEL[role] || role);
    if (role === "kontrol" && !currentTable) showTableGate(); else enterMain();
  }).fail(function () { window.location.href = "login.html"; });
});
