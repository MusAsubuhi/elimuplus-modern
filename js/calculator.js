/* =============================================================
   ELIMU+ — HESABU YA BIASHARA (BUSINESS CALCULATOR)
   calculator.js — loaded only on calculator.html
   Do not edit shared site behaviour here — use main.js for that
   ============================================================= */

// --- LOCALSTORAGE: Restore last session on page load ---
window.addEventListener('DOMContentLoaded', function() {
  try {
    var saved = localStorage.getItem('elimu_calc_last');
    if (saved) {
      var data = JSON.parse(saved);
      document.getElementById('price').value = data.price || '';
      document.getElementById('varCost').value = data.varCost || '';
      document.getElementById('fixedCost').value = data.fixedCost || '';
      document.getElementById('units').value = data.units || '';
      if (data.price) {
        calculate();
        document.getElementById('restore-notice').style.display = 'flex';
      }
    }
  } catch(e) {}
});

// --- DISMISS restore notice and clear saved data ---
function dismissRestore() {
  document.getElementById('restore-notice').style.display = 'none';
  try { localStorage.removeItem('elimu_calc_last'); } catch(e) {}
  document.getElementById('price').value = '';
  document.getElementById('varCost').value = '';
  document.getElementById('fixedCost').value = '';
  document.getElementById('units').value = '';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('cta-block').style.display = 'none';
}

// --- HELP PANEL TOGGLE ---
function toggleHelp(panelId, btn) {
  var panel = document.getElementById(panelId);
  var isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
  btn.setAttribute('aria-expanded', (!isOpen).toString());
}

// --- LOAD MWANAHAMISI EXAMPLE ---
function loadExample() {
  document.getElementById('price').value = 70;
  document.getElementById('varCost').value = 45;
  document.getElementById('fixedCost').value = 2000;
  document.getElementById('units').value = 120;
  calculate();
}

// --- FORMAT NUMBER AS KES ---
function fmt(n) {
  return 'KES ' + Math.round(Math.abs(n)).toLocaleString();
}

// --- MAIN CALCULATION ---
function calculate() {
  var price = parseFloat(document.getElementById('price').value) || 0;
  var varCost = parseFloat(document.getElementById('varCost').value) || 0;
  var fixedCost = parseFloat(document.getElementById('fixedCost').value) || 0;
  var units = parseFloat(document.getElementById('units').value) || 0;

  var errorEl = document.getElementById('calc-error');
  if (price <= 0) {
    if (errorEl) errorEl.style.display = 'block';
    document.getElementById('results-section').style.display = 'none';
    document.getElementById('cta-block').style.display = 'none';
    return;
  }
  if (errorEl) errorEl.style.display = 'none';

  // Save to localStorage
  try {
    localStorage.setItem('elimu_calc_last', JSON.stringify({
      price: price, varCost: varCost, fixedCost: fixedCost, units: units
    }));
  } catch(e) {}

  var cm = price - varCost;
  document.getElementById('results-section').style.display = 'block';

  // Edge case: variable cost exceeds selling price
  if (cm <= 0) {
    document.getElementById('res-cm').textContent = fmt(cm) + ' / bidhaa';
    document.getElementById('res-be').textContent = '—';
    document.getElementById('res-profit').textContent = '—';
    document.getElementById('res-daily').textContent = '—';
    document.getElementById('bar-section').style.display = 'none';
    var vbox = document.getElementById('verdict-box');
    vbox.className = 'verdict loss';
    vbox.textContent = 'Gharama yako ni kubwa kuliko bei yako. (Your variable cost is higher than your selling price.) Unapoteza pesa kwa kila bidhaa unayouza. (You are losing money on every unit sold.) Ongeza bei au punguza gharama kwanza. (Increase your price or reduce your costs first.)';
    document.getElementById('swahili-verdict').textContent = 'Ongeza bei au punguza gharama kwanza. — Raise your price or cut your costs first.';
    document.getElementById('cta-block').style.display = 'block';
    return;
  }

  // Core calculations
  var breakEven = fixedCost > 0 ? Math.ceil(fixedCost / cm) : 0;
  var dailyNeeded = breakEven > 0 ? Math.ceil(breakEven / 26) : 0;
  var profit = (cm * units) - fixedCost;

  // Update result cards
  document.getElementById('res-cm').textContent = fmt(cm) + ' / bidhaa';
  document.getElementById('res-be').textContent = breakEven.toLocaleString() + ' bidhaa';
  document.getElementById('res-profit').textContent = fmt(profit);
  document.getElementById('res-profit-sub').textContent =
    profit >= 0 ? 'faida (profit) this month' : 'hasara (loss) this month';
  document.getElementById('res-daily').textContent = dailyNeeded + ' bidhaa / siku';

  // Progress bar
  if (units > 0 && breakEven > 0) {
    document.getElementById('bar-section').style.display = 'block';
    var ceiling = Math.max(units, breakEven) * 1.3;
    var pct = Math.min((units / ceiling) * 100, 100);
    var bar = document.getElementById('progress-bar');
    bar.style.width = pct + '%';
    bar.style.background = units >= breakEven ? '#1D9E75' : '#E24B4A';
    document.getElementById('bar-target-label').textContent =
      Math.round(ceiling).toLocaleString() + ' bidhaa';
    document.getElementById('bar-be-label').textContent =
      breakEven.toLocaleString() + ' bidhaa';
    document.getElementById('bar-sales-label').textContent =
      units.toLocaleString() + ' bidhaa';
  } else {
    document.getElementById('bar-section').style.display = 'none';
  }

  // Verdict
  var vbox = document.getElementById('verdict-box');
  var svbox = document.getElementById('swahili-verdict');

  if (profit > 0) {
    vbox.className = 'verdict profit';
    vbox.textContent = 'Uko juu ya kivunja gharama. (You are above break-even.) Kwa mauzo ya bidhaa ' + units.toLocaleString() + ', unapata faida (profit) ya ' + fmt(profit) + ' mwezi huu. Ulihitaji kuuza bidhaa ' + breakEven.toLocaleString() + ' kulipa gharama zako zote. Kumbuka: faida hii ni ya biashara, si mshahara wako — mshahara wako tayari upo kwenye gharama zako. Itumie faida kukuza biashara. (You needed to sell ' + breakEven.toLocaleString() + ' units to cover all costs. Remember: this profit belongs to the business, not to you personally — your own pay is already in your costs. Use this profit to grow the business.)';
    svbox.textContent = 'Hongera! Biashara yako inalipa — faida hii ni ya kukuza biashara. — Congratulations! Your business is paying — this profit is for growing the business.';
  } else if (profit < 0) {
    var shortfall = breakEven - units;
    vbox.className = 'verdict loss';
    vbox.textContent = 'Bado hujafika kivunja gharama. (You are below break-even.) Kwa mauzo ya bidhaa ' + units.toLocaleString() + ', una hasara (loss) ya ' + fmt(profit) + ' mwezi huu. Unahitaji kuuza bidhaa ' + shortfall.toLocaleString() + ' zaidi kwa mwezi ili usipoteze pesa. (Sell ' + shortfall.toLocaleString() + ' more units per month to stop losing money.)';
    svbox.textContent = 'Bado hujafika hatua ya faida. — You have not yet reached the profit point.';
  } else {
    vbox.className = 'verdict break';
    vbox.textContent = 'Umefika usawa hasa. (You are exactly at break-even.) Unalipa gharama zako zote lakini bado hupati faida. (You are covering all your costs but making no profit yet.) Uza bidhaa moja zaidi tu — uanze kupata faida. (Sell just one more unit and you start earning.)';
    svbox.textContent = 'Umefika hatua ya usawa. — You have reached the balance point.';
  }

  document.getElementById('cta-block').style.display = 'block';
}
