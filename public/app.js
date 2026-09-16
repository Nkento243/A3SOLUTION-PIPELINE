(function(){
  "use strict";

  var STAGES = [
    {id:"new", label:"Nouveau contact"},
    {id:"qualified", label:"Qualifié"},
    {id:"proposal", label:"Proposition envoyée"},
    {id:"client", label:"Client signé"}
  ];
  var LOST_STAGE = {id:"lost", label:"Client perdu"};
  var ALL_STAGE_LABELS = {};
  STAGES.concat([LOST_STAGE]).forEach(function(s){ ALL_STAGE_LABELS[s.id] = s.label; });
  var STAGE_INDEX = {}; STAGES.forEach(function(s,i){ STAGE_INDEX[s.id]=i; });

  var CHART_ORDER = ["lost", "new", "client", "qualified", "proposal"];
  var STAGE_ICON = {new:"●", qualified:"◐", proposal:"→", client:"✓", lost:"✕"};

  var state = {
    contacts: [],
    currency: "€",
    ready: false,
    editingId: null,
    synthesis: null,
    strategyLoading: false,
    strategyError: null,
    hasApiKey: false
  };

  var mainArea = document.getElementById("mainArea");
  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.hidden = true; }, 2600);
  }

  function fmtAmount(n){
    var v = Number(n)||0;
    return new Intl.NumberFormat("fr-FR").format(v) + " " + state.currency;
  }

  function diffDaysFromToday(iso){
    if(!iso) return null;
    var today = new Date(); today.setHours(0,0,0,0);
    var d = new Date(iso+"T00:00:00");
    return Math.round((d - today) / 86400000);
  }

  function relativeLabel(iso){
    var diff = diffDaysFromToday(iso);
    if(diff === null) return "";
    if(diff < 0) return "En retard · " + Math.abs(diff) + "j";
    if(diff === 0) return "Aujourd'hui";
    if(diff === 1) return "Demain";
    var d = new Date(iso+"T00:00:00");
    return new Intl.DateTimeFormat("fr-FR", {day:"2-digit", month:"short"}).format(d);
  }

  function urgencyClass(iso){
    var diff = diffDaysFromToday(iso);
    if(diff === null) return "";
    if(diff < 0) return "overdue";
    if(diff <= 3) return "soon";
    return "";
  }

  function escapeHtml(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  /* ---------------- API layer ---------------- */

  function api(path, options){
    options = options || {};
    var opts = {
      method: options.method || "GET",
      headers: {"content-type":"application/json"}
    };
    if(options.body !== undefined){ opts.body = JSON.stringify(options.body); }
    return fetch("/api" + path, opts).then(function(res){
      if(res.status === 204) return null;
      return res.json().then(function(data){
        if(!res.ok){ var err = new Error(data && data.error || "Erreur"); err.code = data && data.code; err.status = res.status; throw err; }
        return data;
      });
    });
  }

  function loadAll(){
    return Promise.all([
      api("/contacts"),
      api("/settings"),
      api("/synthesis"),
      api("/config")
    ]).then(function(results){
      state.contacts = results[0].sort(function(a,b){ return (a.createdAt||"").localeCompare(b.createdAt||""); });
      state.currency = (results[1] && results[1].currency) || "€";
      state.synthesis = results[2] || null;
      state.hasApiKey = !!(results[3] && results[3].hasApiKey);
      state.ready = true;
      currencySelect.value = state.currency;
      render();
    });
  }

  /* ---------------- synthèse graphique ---------------- */

  function buildSynthesisSection(contacts){
    var byStage = {};
    CHART_ORDER.forEach(function(id){ byStage[id] = {count:0, sum:0}; });
    contacts.forEach(function(c){
      if(!byStage[c.stage]) return;
      byStage[c.stage].count += 1;
      byStage[c.stage].sum += (Number(c.amount)||0);
    });
    var total = contacts.length;

    var html = '<section>';
    html += '<div class="section-head"><h2>Synthèse graphique</h2><span class="sub">Répartition et valeur par étape</span></div>';
    html += '<div class="synthesis-card">';

    if(total === 0){
      html += '<div class="synthesis-empty">Ajoutez des contacts pour voir apparaître la synthèse graphique.</div>';
    } else {
      html += '<div class="synthesis-grid">';

      html += '<div class="synthesis-col"><h3>Contacts par étape</h3><div class="donut-wrap">';
      var cursor = 0, stops = [];
      CHART_ORDER.forEach(function(id){
        var pct = total ? (byStage[id].count / total) * 100 : 0;
        if(pct > 0){
          stops.push('var(--stage-' + id + ') ' + cursor.toFixed(2) + '% ' + (cursor+pct).toFixed(2) + '%');
        }
        cursor += pct;
      });
      var gradient = stops.length ? stops.join(', ') : 'var(--border) 0% 100%';
      html += '<div class="donut" style="background:conic-gradient(' + gradient + ')" role="img" aria-label="Répartition des contacts par étape">' +
        '<div class="donut-hole"><span class="dh-value num">' + total + '</span><span class="dh-label">contact' + (total>1?'s':'') + '</span></div></div>';
      html += '<div class="legend">';
      CHART_ORDER.forEach(function(id){
        var d = byStage[id];
        var pct = total ? Math.round((d.count / total) * 100) : 0;
        html += '<div class="legend-row" title="' + ALL_STAGE_LABELS[id] + ' — ' + d.count + ' (' + pct + '%)">' +
          '<span class="lg-swatch" style="background:var(--stage-' + id + ')"></span>' +
          '<span class="lg-label">' + STAGE_ICON[id] + ' ' + ALL_STAGE_LABELS[id] + '</span>' +
          '<span class="lg-value num">' + d.count + '</span>' +
          '<span class="lg-pct num">' + pct + '%</span></div>';
      });
      html += '</div></div></div>';

      html += '<div class="synthesis-col"><h3>Valeur par étape</h3><div class="barchart">';
      var maxSum = Math.max.apply(null, CHART_ORDER.map(function(id){ return byStage[id].sum; }).concat([1]));
      CHART_ORDER.forEach(function(id){
        var d = byStage[id];
        var widthPct = maxSum ? Math.max((d.sum / maxSum) * 100, d.sum > 0 ? 2 : 0) : 0;
        html += '<div class="bar-row" title="' + ALL_STAGE_LABELS[id] + ' — ' + fmtAmount(d.sum) + '">' +
          '<div class="br-top"><span class="br-label"><span class="lg-swatch" style="background:var(--stage-' + id + ')"></span>' +
          '<span>' + STAGE_ICON[id] + ' ' + ALL_STAGE_LABELS[id] + '</span></span>' +
          '<span class="br-value num">' + fmtAmount(d.sum) + '</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + widthPct.toFixed(1) + '%; background:var(--stage-' + id + ')"></div></div>' +
          '</div>';
      });
      html += '</div></div>';

      html += '</div>'; // synthesis-grid

      html += '<details class="data-table-toggle"><summary>Voir le tableau de données</summary>';
      html += '<table class="data-table"><thead><tr><th>Étape</th><th>Contacts</th><th>Part</th><th>Valeur</th></tr></thead><tbody>';
      CHART_ORDER.forEach(function(id){
        var d = byStage[id];
        var pct = total ? Math.round((d.count / total) * 100) : 0;
        html += '<tr><td>' + STAGE_ICON[id] + ' ' + ALL_STAGE_LABELS[id] + '</td><td class="num">' + d.count + '</td><td class="num">' + pct + '%</td><td class="num">' + fmtAmount(d.sum) + '</td></tr>';
      });
      var totalSum = CHART_ORDER.reduce(function(s,id){ return s + byStage[id].sum; }, 0);
      html += '<tr><td>Total</td><td class="num">' + total + '</td><td class="num">100%</td><td class="num">' + fmtAmount(totalSum) + '</td></tr>';
      html += '</tbody></table></details>';
    }

    html += '</div></section>';
    return html;
  }

  /* ---------------- synthèse stratégique ---------------- */

  function fmtGeneratedAt(iso){
    if(!iso) return "";
    try{
      var d = new Date(iso);
      return "Générée le " + new Intl.DateTimeFormat("fr-FR", {day:"2-digit", month:"long", year:"numeric"}).format(d) +
        " à " + new Intl.DateTimeFormat("fr-FR", {hour:"2-digit", minute:"2-digit"}).format(d);
    } catch(e){ return ""; }
  }

  function buildStrategySection(){
    var html = '<section>';
    html += '<div class="section-head"><h2>Synthèse stratégique</h2><span class="sub">Analyse générée par Claude à la demande</span></div>';
    html += '<div class="strategy-card">';

    html += '<div class="strategy-head"><div class="sh-left">';
    if(state.synthesis && state.synthesis.generatedAt){
      html += '<span class="strategy-date">' + fmtGeneratedAt(state.synthesis.generatedAt) + '</span>';
    } else if(!state.strategyLoading){
      html += '<span class="strategy-date">Aucune synthèse générée pour le moment</span>';
    }
    html += '</div><div>';
    if(state.hasApiKey){
      html += '<button type="button" class="btn btn-ghost" id="strategyBtn" ' + (state.strategyLoading?'disabled':'') + '>' +
        (state.synthesis ? '↺ Régénérer' : 'Générer la synthèse') + '</button>';
    }
    html += '</div></div>';

    if(state.strategyLoading){
      html += '<div class="strategy-loading"><span class="spinner"></span><span>Claude analyse le pipeline&hellip;</span></div>';
    } else if(state.strategyError){
      html += '<div class="strategy-error">' + escapeHtml(state.strategyError) + '</div>';
    } else if(!state.hasApiKey && !state.synthesis){
      html += '<div class="strategy-config-hint">Configurez une clé API Anthropic dans les <button type="button" class="link-btn" id="openSettingsFromStrategy">paramètres</button> pour activer la synthèse stratégique.</div>';
    } else if(!state.synthesis){
      html += '<div class="strategy-empty">Cliquez sur « Générer la synthèse » pour obtenir un état des lieux stratégique du pipeline, daté du jour de la demande : synthèse globale, points de vigilance et recommandations.</div>';
    } else {
      var s = state.synthesis;
      html += '<div class="strategy-body">';
      html += '<div class="strategy-section"><h3>Synthèse globale</h3><p>' + escapeHtml(s.summary || "") + '</p></div>';
      if(s.vigilance && s.vigilance.length){
        html += '<div class="strategy-section"><h3>Points de vigilance</h3><ul class="strategy-list vigilance">';
        s.vigilance.forEach(function(v){ html += '<li>' + escapeHtml(v) + '</li>'; });
        html += '</ul></div>';
      }
      if(s.recommendations && s.recommendations.length){
        html += '<div class="strategy-section"><h3>Recommandations</h3><ul class="strategy-list reco">';
        s.recommendations.forEach(function(v){ html += '<li>' + escapeHtml(v) + '</li>'; });
        html += '</ul></div>';
      }
      html += '</div>';
    }

    html += '</div></section>';
    return html;
  }

  /* ---------------- render ---------------- */

  function render(){
    if(!state.ready){ return; }
    var contacts = state.contacts;

    var prospects = contacts.filter(function(c){ return c.stage === "new" || c.stage === "qualified" || c.stage === "proposal"; });
    var clients = contacts.filter(function(c){ return c.stage === "client"; });
    var lost = contacts.filter(function(c){ return c.stage === "lost"; });
    var decided = clients.length + lost.length;
    var conversion = decided ? Math.round((clients.length / decided) * 100) : null;
    var pipelineValue = prospects.reduce(function(sum,c){ return sum + (Number(c.amount)||0); }, 0);

    var withDates = contacts.filter(function(c){ return c.nextDate && c.stage !== "lost"; })
      .slice()
      .sort(function(a,b){ return a.nextDate < b.nextDate ? -1 : a.nextDate > b.nextDate ? 1 : 0; });
    var dueSoon = withDates.filter(function(c){ var d = diffDaysFromToday(c.nextDate); return d !== null && d <= 7; });
    var overdueCount = withDates.filter(function(c){ var d = diffDaysFromToday(c.nextDate); return d !== null && d < 0; }).length;

    var html = "";

    html += '<section class="kpis">';
    html += '<div class="kpi"><div class="label">Contacts</div><div class="split">' +
      '<div><span class="value num">' + prospects.length + '</span><span class="mini-label">prospects</span></div>' +
      '<div><span class="value num">' + clients.length + '</span><span class="mini-label">clients</span></div>' +
      '</div></div>';
    html += '<div class="kpi"><div class="label">Taux de conversion</div><div class="value num">' + (conversion === null ? '—' : conversion + '%') + '</div>' +
      '<div class="sub">' + (decided ? clients.length + ' gagné' + (clients.length>1?'s':'') + ' · ' + lost.length + ' perdu' + (lost.length>1?'s':'') : 'aucun dossier clos') + '</div></div>';
    html += '<div class="kpi"><div class="label">Valeur du pipeline</div><div class="value num">' + fmtAmount(pipelineValue) + '</div>' +
      '<div class="sub">missions non encore signées</div></div>';
    html += '<div class="kpi ' + (overdueCount>0?'urgent':'') + '"><div class="label">Relances (7 jours)</div><div class="value num">' + dueSoon.length + '</div>' +
      '<div class="sub">' + (overdueCount>0 ? overdueCount + ' en retard' : (withDates[0] ? 'prochaine ' + relativeLabel(withDates[0].nextDate) : 'aucune programmée')) + '</div></div>';
    html += '</section>';

    html += '<section class="reminders-wrap">';
    html += '<h2>Prochaines relances <span class="count-pill">' + withDates.length + '</span></h2>';
    if(withDates.length === 0){
      html += '<div class="reminders-empty">Aucune relance programmée pour le moment.</div>';
    } else {
      html += '<div class="reminders">';
      withDates.slice(0,10).forEach(function(c){
        html += '<button type="button" class="reminder-chip" data-open="' + c.id + '">' +
          '<div class="rc-top"><span class="rc-name">' + escapeHtml(c.org) + '</span>' +
          '<span class="rc-date ' + urgencyClass(c.nextDate) + '">' + relativeLabel(c.nextDate) + '</span></div>' +
          '<div class="rc-note">' + escapeHtml(c.nextNote || ALL_STAGE_LABELS[c.stage] || '') + '</div>' +
          '</button>';
      });
      html += '</div>';
    }
    html += '</section>';

    html += '<section>';
    html += '<div class="board-header"><h2>Pipeline</h2></div>';
    html += '<div class="board">';
    var displayColumns = STAGES.concat([LOST_STAGE]);
    displayColumns.forEach(function(stage){
      var idx = STAGE_INDEX.hasOwnProperty(stage.id) ? STAGE_INDEX[stage.id] : null;
      var colContacts = contacts.filter(function(c){ return c.stage === stage.id; });
      var colSum = colContacts.reduce(function(s,c){ return s + (Number(c.amount)||0); }, 0);
      html += '<div class="column">';
      html += '<div class="column-head" style="--stage-color:var(--stage-' + stage.id + ')">' +
        '<div class="ch-top"><span class="ch-title"><span class="dot"></span>' + stage.label + '</span><span class="ch-count num">' + colContacts.length + '</span></div>' +
        (colSum > 0 ? '<span class="ch-sum num">' + fmtAmount(colSum) + '</span>' : '') +
        '</div>';
      html += '<div class="cards">';
      if(colContacts.length === 0){
        html += '<div class="column-empty">Aucun contact</div>';
      } else {
        colContacts.forEach(function(c){
          html += '<div class="card" tabindex="0" role="button" data-open="' + c.id + '" style="--stage-color:var(--stage-' + stage.id + ')">';
          html += '<div class="c-top"><div><div class="c-name">' + escapeHtml(c.org) + '</div>' +
            (c.contact ? '<div class="c-contact">' + escapeHtml(c.contact) + '</div>' : '') + '</div></div>';
          html += '<div class="c-offer">' + escapeHtml(c.offer) + '</div>';
          html += '<div class="c-bottom"><span class="c-amount">' + fmtAmount(c.amount) + '</span>' +
            (c.nextDate ? '<span class="c-date ' + urgencyClass(c.nextDate) + '">' + relativeLabel(c.nextDate) + '</span>' : '') +
            '</div>';
          html += '<div class="card-actions">';
          if(idx !== null){
            var canLeft = idx > 0, canRight = idx < STAGES.length - 1;
            html += '<div class="move-row">' +
              '<button type="button" class="move-btn" data-move="' + c.id + '" data-dir="-1" ' + (canLeft?'':'disabled') + ' aria-label="Étape précédente">‹</button>' +
              '<button type="button" class="move-btn" data-move="' + c.id + '" data-dir="1" ' + (canRight?'':'disabled') + ' aria-label="Étape suivante">›</button>' +
              '</div>';
            html += '<button type="button" class="btn-text" data-lost="' + c.id + '">✕ Marquer perdu</button>';
          } else {
            html += '<span></span>';
            html += '<button type="button" class="reactivate-btn" data-reactivate="' + c.id + '">↺ Réactiver</button>';
          }
          html += '</div>';
          html += '</div>';
        });
      }
      html += '</div></div>';
    });
    html += '</div></section>';

    html += buildSynthesisSection(contacts);
    html += buildStrategySection();

    mainArea.innerHTML = html;
    wireMainEvents();
  }

  function wireMainEvents(){
    mainArea.querySelectorAll("[data-open]").forEach(function(el){
      el.addEventListener("click", function(){ openEdit(el.getAttribute("data-open")); });
      el.addEventListener("keydown", function(ev){
        if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); openEdit(el.getAttribute("data-open")); }
      });
    });
    mainArea.querySelectorAll("[data-move]").forEach(function(el){
      el.addEventListener("click", function(ev){
        ev.stopPropagation();
        var id = el.getAttribute("data-move");
        var dir = parseInt(el.getAttribute("data-dir"), 10);
        moveStage(id, dir);
      });
    });
    mainArea.querySelectorAll("[data-lost]").forEach(function(el){
      el.addEventListener("click", function(ev){
        ev.stopPropagation();
        setStage(el.getAttribute("data-lost"), "lost", "Marqué comme perdu.");
      });
    });
    mainArea.querySelectorAll("[data-reactivate]").forEach(function(el){
      el.addEventListener("click", function(ev){
        ev.stopPropagation();
        setStage(el.getAttribute("data-reactivate"), "new", "Contact réactivé.");
      });
    });
    var strategyBtn = document.getElementById("strategyBtn");
    if(strategyBtn){ strategyBtn.addEventListener("click", function(){ generateStrategy(!!state.synthesis); }); }
    var openSettingsFromStrategy = document.getElementById("openSettingsFromStrategy");
    if(openSettingsFromStrategy){ openSettingsFromStrategy.addEventListener("click", openSettings); }
  }

  /* ---------------- synthèse stratégique : génération ---------------- */

  function generateStrategy(forceRefresh){
    if(state.strategyLoading) return;
    if(!state.contacts.length){ showToast("Ajoutez des contacts avant de générer une synthèse."); return; }

    state.strategyLoading = true;
    state.strategyError = null;
    render();

    api("/synthesis/generate", {method:"POST", body:{forceRefresh: !!forceRefresh}}).then(function(payload){
      state.strategyLoading = false;
      state.synthesis = payload;
      showToast("Synthèse stratégique générée.");
      render();
    }).catch(function(err){
      state.strategyLoading = false;
      var code = err && err.code;
      if(code === "not_configured"){
        state.hasApiKey = false;
        state.strategyError = null;
      } else if(code === "invalid_key"){
        state.strategyError = "Clé API invalide ou refusée. Vérifiez-la dans les paramètres.";
      } else if(code === "rate_limited"){
        state.strategyError = "Trop de demandes pour le moment. Réessayez dans un instant.";
      } else if(code === "invalid_json"){
        state.strategyError = "La réponse reçue n'était pas exploitable. Réessayez.";
      } else {
        state.strategyError = "La synthèse n'a pas pu être générée. Réessayez.";
      }
      render();
    });
  }

  /* ---------------- data ops ---------------- */

  function setStage(id, stageId, successMsg){
    api("/contacts/" + id, {method:"PUT", body:{stage: stageId}})
      .then(function(){ showToast(successMsg); return loadAll(); })
      .catch(function(){ showToast("Impossible de mettre à jour ce contact."); });
  }

  function moveStage(id, dir){
    var c = state.contacts.find(function(x){ return x.id === id; });
    if(!c || !STAGE_INDEX.hasOwnProperty(c.stage)) return;
    var newIdx = STAGE_INDEX[c.stage] + dir;
    if(newIdx < 0 || newIdx >= STAGES.length) return;
    setStage(id, STAGES[newIdx].id, "Déplacé vers « " + STAGES[newIdx].label + " »");
  }

  /* ---------------- modal (contact) ---------------- */

  var backdrop = document.getElementById("modalBackdrop");
  var form = document.getElementById("contactForm");
  var modalTitle = document.getElementById("modalTitle");
  var deleteWrap = document.getElementById("deleteWrap");

  function openAdd(){
    state.editingId = null;
    form.reset();
    form.stage.value = "new";
    modalTitle.textContent = "Nouveau contact";
    deleteWrap.hidden = true;
    clearFieldErrors();
    backdrop.hidden = false;
    setTimeout(function(){ document.getElementById("f-org").focus(); }, 10);
  }

  function openEdit(id){
    var c = state.contacts.find(function(x){ return x.id === id; });
    if(!c) return;
    state.editingId = id;
    form.org.value = c.org || "";
    form.contact.value = c.contact || "";
    form.email.value = c.email || "";
    form.phone.value = c.phone || "";
    form.offer.value = c.offer || "";
    form.amount.value = c.amount || "";
    form.stage.value = c.stage || "new";
    form.nextDate.value = c.nextDate || "";
    form.nextNote.value = c.nextNote || "";
    form.notes.value = c.notes || "";
    modalTitle.textContent = "Modifier le contact";
    deleteWrap.hidden = false;
    clearFieldErrors();
    backdrop.hidden = false;
    setTimeout(function(){ document.getElementById("f-org").focus(); }, 10);
  }

  function closeModal(){
    backdrop.hidden = true;
  }

  function clearFieldErrors(){
    document.getElementById("field-org").classList.remove("error");
    document.getElementById("field-offer").classList.remove("error");
  }

  document.getElementById("addBtn").addEventListener("click", openAdd);
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("cancelBtn").addEventListener("click", closeModal);
  backdrop.addEventListener("click", function(ev){ if(ev.target === backdrop) closeModal(); });
  document.addEventListener("keydown", function(ev){
    if(ev.key === "Escape"){
      if(!backdrop.hidden) closeModal();
      if(!settingsBackdrop.hidden) closeSettings();
    }
  });

  form.addEventListener("submit", function(ev){
    ev.preventDefault();
    clearFieldErrors();
    var org = form.org.value.trim();
    var offer = form.offer.value.trim();
    var valid = true;
    if(!org){ document.getElementById("field-org").classList.add("error"); valid = false; }
    if(!offer){ document.getElementById("field-offer").classList.add("error"); valid = false; }
    if(!valid) return;

    var payload = {
      org: org,
      contact: form.contact.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      offer: offer,
      amount: form.amount.value ? Number(form.amount.value) : 0,
      stage: form.stage.value,
      nextDate: form.nextDate.value,
      nextNote: form.nextNote.value.trim(),
      notes: form.notes.value.trim()
    };

    var saveBtn = document.getElementById("saveBtn");
    saveBtn.disabled = true;

    var op;
    if(state.editingId){
      op = api("/contacts/" + state.editingId, {method:"PUT", body:payload});
    } else {
      op = api("/contacts", {method:"POST", body:payload});
    }

    op.then(function(){
      closeModal();
      showToast(state.editingId ? "Contact mis à jour." : "Contact ajouté.");
      return loadAll();
    }).catch(function(){
      showToast("Enregistrement impossible. Réessayez.");
    }).finally(function(){
      saveBtn.disabled = false;
    });
  });

  document.getElementById("deleteBtn").addEventListener("click", function(){
    if(!state.editingId) return;
    var btn = this;
    if(btn.dataset.armed !== "1"){
      btn.dataset.armed = "1";
      btn.textContent = "Confirmer ?";
      setTimeout(function(){ btn.dataset.armed = "0"; btn.textContent = "Supprimer"; }, 3000);
      return;
    }
    btn.dataset.armed = "0";
    api("/contacts/" + state.editingId, {method:"DELETE"}).then(function(){
      closeModal();
      showToast("Contact supprimé.");
      return loadAll();
    }).catch(function(){
      showToast("Suppression impossible.");
    });
  });

  /* ---------------- currency ---------------- */

  var currencySelect = document.getElementById("currencySelect");
  currencySelect.addEventListener("change", function(){
    api("/settings", {method:"PUT", body:{currency: currencySelect.value}}).then(function(){
      return loadAll();
    }).catch(function(){
      showToast("Impossible d'enregistrer la devise.");
    });
  });

  /* ---------------- settings modal (API key) ---------------- */

  var settingsBackdrop = document.getElementById("settingsBackdrop");
  var settingsForm = document.getElementById("settingsForm");
  var apiKeyStatus = document.getElementById("apiKeyStatus");
  var clearKeyWrap = document.getElementById("clearKeyWrap");

  function openSettings(){
    settingsForm.apiKey.value = "";
    apiKeyStatus.textContent = state.hasApiKey
      ? "Une clé API est actuellement configurée."
      : "Aucune clé API configurée — la synthèse stratégique est désactivée.";
    clearKeyWrap.hidden = !state.hasApiKey;
    settingsBackdrop.hidden = false;
    setTimeout(function(){ document.getElementById("f-apikey").focus(); }, 10);
  }

  function closeSettings(){
    settingsBackdrop.hidden = true;
  }

  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("closeSettings").addEventListener("click", closeSettings);
  document.getElementById("cancelSettingsBtn").addEventListener("click", closeSettings);
  settingsBackdrop.addEventListener("click", function(ev){ if(ev.target === settingsBackdrop) closeSettings(); });

  settingsForm.addEventListener("submit", function(ev){
    ev.preventDefault();
    var key = settingsForm.apiKey.value.trim();
    if(!key){ showToast("Saisissez une clé API."); return; }
    api("/config", {method:"PUT", body:{apiKey:key}}).then(function(){
      showToast("Clé API enregistrée.");
      closeSettings();
      return loadAll();
    }).catch(function(){
      showToast("Impossible d'enregistrer la clé API.");
    });
  });

  document.getElementById("clearKeyBtn").addEventListener("click", function(){
    api("/config", {method:"DELETE"}).then(function(){
      showToast("Clé API supprimée.");
      closeSettings();
      return loadAll();
    }).catch(function(){
      showToast("Suppression impossible.");
    });
  });

  /* ---------------- boot ---------------- */

  function showUnavailable(err){
    mainArea.innerHTML = '<div class="unavailable"><strong>Erreur de chargement</strong><span>' +
      escapeHtml((err && err.message) || "Impossible de contacter le serveur local.") + '</span></div>';
  }

  loadAll().catch(showUnavailable);
})();
