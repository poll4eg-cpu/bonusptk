// gen.js — чистая, рабочая панель гендира
let weeklyChart = null;
let segmentChart = null;
let genSupabaseClient = null;

function initGenPanel(supabaseClient) {
  genSupabaseClient = supabaseClient;

  // Установите период по умолчанию (последние 3 месяца)
  const today = new Date();
  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  document.getElementById('genDateFrom').valueAsDate = threeMonthsAgo;
  document.getElementById('genDateTo').valueAsDate = today;

  // Обработчики
  document.getElementById('loadGenData').addEventListener('click', loadGenData);
  document.getElementById('resetGenFilters').addEventListener('click', resetFilters);
  document.getElementById('goToFinFromGen').addEventListener('click', goToFinPanel);

  loadGenData(); // загрузить при старте
}

async function loadGenData() {
  const dateFrom = document.getElementById('genDateFrom').value;
  const dateTo = document.getElementById('genDateTo').value;
  const managerFilter = document.getElementById('genManagerFilter').value;
  const segmentFilter = document.getElementById('genSegmentFilter').value;

  if (!dateFrom || !dateTo) return alert('Выберите период');

  try {
    showLoading();

    // Загружаем сделки
    let query = genSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount, total_paid, created_at')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');

    if (managerFilter) query = query.eq('manager_name', managerFilter);
    if (segmentFilter) query = query.eq('deal_type', segmentFilter);

    const { data: deals } = await query;

    // Загружаем расходы
    const { data: expenses } = await genSupabaseClient
      .from('finance_expenses')
      .select('crm_id, fact_expenses');

    const expMap = {};
    expenses.forEach(e => expMap[e.crm_id] = e.fact_expenses || 0);

    // Агрегация
    let totalRevenue = 0, totalTheoretical = 0, totalActual = 0, totalDeals = deals.length;
    const weeklyData = {}, segmentData = {}, managerData = [], problemDeals = [];

    deals.forEach(deal => {
      const amount = deal.contract_amount || 0;
      const expenses = expMap[deal.crm_id] || 0;
      const theoretical = calculateTheoretical(deal.deal_type, amount);
      const actual = amount - expenses;

      totalRevenue += amount;
      totalTheoretical += theoretical;
      totalActual += actual;

      // Недели
      const week = getWeekNumber(new Date(deal.created_at));
      if (!weeklyData[week]) weeklyData[week] = { revenue: 0, theoretical: 0, actual: 0 };
      weeklyData[week].revenue += amount;
      weeklyData[week].theoretical += theoretical;
      weeklyData[week].actual += actual;

      // Сегменты
      if (!segmentData[deal.deal_type]) segmentData[deal.deal_type] = { theoretical: 0, actual: 0 };
      segmentData[deal.deal_type].theoretical += theoretical;
      segmentData[deal.deal_type].actual += actual;

      // Менеджеры
      const existing = managerData.find(m => m.name === deal.manager_name);
      if (existing) {
        existing.revenue += amount;
        existing.actual += actual;
        existing.deals++;
      } else {
        managerData.push({ name: deal.manager_name, revenue: amount, actual: actual, deals: 1 });
      }

      // Проблемы
      if (amount > 0 && expenses / amount > 0.5) {
        problemDeals.push({ ...deal, expenses, actual });
      }
    });

    // Обновляем KPI
    updateKPI(totalRevenue, totalTheoretical, totalActual, totalDeals);

    // Графики
    renderWeeklyChart(weeklyData);
    renderSegmentChart(segmentData);

    // Топы
    const topDeals = [...deals]
      .map(d => ({ ...d, actual: d.contract_amount - (expMap[d.crm_id] || 0) }))
      .sort((a, b) => b.actual - a.actual)
      .slice(0, 10);

    const topManagers = managerData
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    renderTopDeals(topDeals);
    renderTopManagers(topManagers);

    // Предупреждения
    renderAlerts(problemDeals, deals, expMap);

    // Заполняем фильтры
    populateFilters(deals);

  } catch (error) {
    console.error('Ошибка:', error);
    alert('Ошибка загрузки данных');
  }
}

// Вспомогательные функции
function calculateTheoretical(type, amount) {
  if (!type || !amount) return 0;
  const rates = { to: 0.7, pto: 0.7, rent: 0.7, eq: 0.2, comp: 0.3, rep: 0.3 };
  return (amount * (rates[type] || 0.5));
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function formatCurrency(amount) {
  return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
}

// Обновление KPI
function updateKPI(revenue, theoretical, actual, deals) {
  document.getElementById('totalRevenue').textContent = formatCurrency(revenue);
  document.getElementById('theoreticalMargin').textContent = formatCurrency(theoretical);
  document.getElementById('actualMargin').textContent = formatCurrency(actual);
  document.getElementById('avgDealSize').textContent = deals ? formatCurrency(revenue / deals) : '0 ₽';
}

// График по неделям
function renderWeeklyChart(data) {
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  if (weeklyChart) weeklyChart.destroy();

  const labels = Object.keys(data).sort();
  weeklyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(w => w.replace('-W', ' нед.')),
      datasets: [
        { label: 'Выручка', data: labels.map(w => data[w].revenue), borderColor: '#1890ff', tension: 0.3 },
        { label: 'Теор. маржа', data: labels.map(w => data[w].theoretical), borderColor: '#faad14', borderDash: [5,5], tension: 0.3 },
        { label: 'Факт. маржа', data: labels.map(w => data[w].actual), borderColor: '#52c41a', tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// График по сегментам
function renderSegmentChart(data) {
  const ctx = document.getElementById('segmentChart').getContext('2d');
  if (segmentChart) segmentChart.destroy();

  const labels = Object.keys(data);
  segmentChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => ({ to:'ТО', pto:'ПТО', eq:'Оборудование', comp:'Комплектующие', rep:'Ремонты', rent:'Аренда' }[l] || l)),
      datasets: [
        { label: 'Теор. маржа', data: labels.map(l => data[l].theoretical), backgroundColor: 'rgba(250, 173, 20, 0.6)' },
        { label: 'Факт. маржа', data: labels.map(l => data[l].actual), backgroundColor: 'rgba(82, 196, 26, 0.6)' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } }
    }
  });
}

// Топ-10 сделок
function renderTopDeals(deals) {
  document.getElementById('topDealsList').innerHTML = deals.map(d => `
    <div style="padding:8px; border-bottom:1px solid #eee;">
      <strong>${d.crm_id}</strong> (${d.manager_name}) — ${formatCurrency(d.actual)}
    </div>
  `).join('');
}

// Топ менеджеров
function renderTopManagers(managers) {
  document.getElementById('topManagersList').innerHTML = managers.map(m => `
    <div style="padding:8px; border-bottom:1px solid #eee;">
      <strong>${m.name}</strong> — ${formatCurrency(m.revenue)} (${m.deals} сделок)
    </div>
  `).join('');
}

// Предупреждения
function renderAlerts(problemDeals, allDeals, expMap) {
  const alertsDiv = document.getElementById('alerts');
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const noExpenses = allDeals.filter(d => 
    new Date(d.created_at) < weekAgo && (!expMap[d.crm_id] || expMap[d.crm_id] === 0)
  );

  if (problemDeals.length > 0 || noExpenses.length > 0) {
    alertsDiv.innerHTML = `
      ${problemDeals.length ? `<div style="background:#fff2f0; padding:10px; border-left:4px solid #ff4d4f; margin-bottom:10px;">
        ⚠️ ${problemDeals.length} сделок с расходами >50%
      </div>` : ''}
      ${noExpenses.length ? `<div style="background:#fffbe6; padding:10px; border-left:4px solid #faad14; margin-bottom:10px;">
        ℹ️ ${noExpenses.length} сделок без расходов (>7 дней)
      </div>` : ''}
    `;
  } else {
    alertsDiv.innerHTML = '<div style="text-align:center; color:#666; padding:10px;">✅ Нет предупреждений</div>';
  }
}

// Заполнение фильтров
async function populateFilters(deals) {
  // Менеджеры
  const managers = [...new Set(deals.map(d => d.manager_name))].sort();
  const managerSelect = document.getElementById('genManagerFilter');
  managerSelect.innerHTML = '<option value="">Все менеджеры</option>' +
    managers.map(m => `<option value="${m}">${m}</option>`).join('');

  // Восстанавливаем выбранный фильтр
  const currentManager = managerSelect.dataset.currentValue;
  if (currentManager) managerSelect.value = currentManager;
}

// Сброс фильтров
function resetFilters() {
  document.getElementById('genManagerFilter').value = '';
  document.getElementById('genSegmentFilter').value = '';
  loadGenData();
}

// Загрузка
function showLoading() {
  ['totalRevenue', 'theoreticalMargin', 'actualMargin', 'avgDealSize']
    .forEach(id => document.getElementById(id).textContent = '...');
}

// Переход к фину
function goToFinPanel() {
  document.getElementById('genScreen').style.display = 'none';
  document.getElementById('finScreen').style.display = 'block';
  
  if (typeof initFinPanel === 'function') {
    initFinPanel(genSupabaseClient);
  } else {
    const script = document.createElement('script');
    script.src = 'fin.js';
    script.onload = () => initFinPanel(genSupabaseClient);
    document.head.appendChild(script);
  }
}
