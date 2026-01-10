// gen.js — минималистичная панель гендира (рабочая)
let revenueChart = null;
let genSupabaseClient = null;
let genCurrentUserPhone = null;
let genCurrentUserName = null;

function initGenPanel(supabaseClient, currentUserPhone, currentUserName) {
  console.log('Гендиректор панель инициализирована для:', currentUserName);
  
  genSupabaseClient = supabaseClient;
  genCurrentUserPhone = currentUserPhone;
  genCurrentUserName = currentUserName;

  // Установите период по умолчанию
  const today = new Date();
  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  document.getElementById('genDateFrom').valueAsDate = threeMonthsAgo;
  document.getElementById('genDateTo').valueAsDate = today;

  // Обработчики событий
  document.getElementById('loadGenData').addEventListener('click', loadGenData);
  
  // Кнопка перехода к финансисту
  const finControlBtn = document.createElement('button');
  finControlBtn.innerHTML = '📊 Финансовый контроль';
  finControlBtn.className = 'btn-info';
  finControlBtn.style.marginLeft = '10px';
  finControlBtn.onclick = goToFinPanel;
  document.getElementById('loadGenData').parentNode.appendChild(finControlBtn);
  
  // Кнопка экспорта
  const exportBtn = document.createElement('button');
  exportBtn.innerHTML = '📥 Экспорт Excel';
  exportBtn.className = 'btn-success';
  exportBtn.style.marginLeft = '10px';
  exportBtn.onclick = exportToExcel;
  document.getElementById('loadGenData').parentNode.appendChild(exportBtn);

  // Добавляем фильтры
  addFilters();
  
  loadGenData(); // загрузить при старте
}

// Добавление фильтров — читаемая кнопка
function addFilters() {
  const filterContainer = document.createElement('div');
  filterContainer.style.cssText = `
    margin: 15px 0;
    padding: 15px;
    background: #f8f9fa;
    border-radius: 8px;
    display: flex;
    gap: 15px;
    flex-wrap: wrap;
    align-items: end;
  `;
  
  filterContainer.innerHTML = `
    <div>
      <label style="display:block; margin-bottom:5px; font-weight:bold;">Сегмент:</label>
      <select id="genSegmentFilter" style="padding:8px; border-radius:4px; border:1px solid #ddd; min-width:150px;">
        <option value="">Все сегменты</option>
        <option value="to">ТО</option>
        <option value="pto">ПТО</option>
        <option value="eq">Оборудование</option>
        <option value="comp">Комплектующие</option>
        <option value="rep">Ремонты</option>
        <option value="rent">Аренда</option>
      </select>
    </div>
    <div>
      <label style="display:block; margin-bottom:5px; font-weight:bold;">Менеджер:</label>
      <select id="genManagerFilter" style="padding:8px; border-radius:4px; border:1px solid #ddd; min-width:150px;">
        <option value="">Все менеджеры</option>
      </select>
    </div>
    <div>
      <button id="resetFilters" class="btn-secondary" style="padding:8px 16px; height:38px;">
        Сбросить фильтры
      </button>
    </div>
  `;
  
  const loadButton = document.getElementById('loadGenData');
  loadButton.parentNode.insertBefore(filterContainer, loadButton);
  
  // Обработчик сброса фильтров
  document.getElementById('resetFilters').addEventListener('click', () => {
    document.getElementById('genSegmentFilter').value = '';
    document.getElementById('genManagerFilter').value = '';
    loadGenData();
  });
}

async function loadGenData() {
  console.log('Загрузка данных гендира...');
  
  const dateFrom = document.getElementById('genDateFrom').value;
  const dateTo = document.getElementById('genDateTo').value;

  if (!dateFrom || !dateTo) {
    alert('Выберите период');
    return;
  }

  try {
    // Показываем загрузку
    showLoadingState();
    
    // Получаем фильтры
    const segmentFilter = document.getElementById('genSegmentFilter')?.value || '';
    const managerFilter = document.getElementById('genManagerFilter')?.value || '';
    
    // Загружаем сделки с фильтрами
    let query = genSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount, total_paid, created_at, paid, up_signed, is_first, arpu_input')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');
    
    if (segmentFilter) {
      query = query.eq('deal_type', segmentFilter);
    }
    
    if (managerFilter) {
      query = query.eq('manager_name', managerFilter);
    }
    
    const { data: deals, error: dealsError } = await query;
    
    if (dealsError) throw dealsError;

    // Загружаем все расходы
    const { data: expenses, error: expError } = await genSupabaseClient
      .from('finance_expenses')
      .select('crm_id, fact_expenses');

    if (expError) throw expError;

    // Карта расходов
    const expMap = {};
    expenses.forEach(e => {
      expMap[e.crm_id] = e.fact_expenses || 0;
    });

    // Агрегация данных
    let totalRevenue = 0;
    let totalTheoreticalMargin = 0;
    let totalActualMargin = 0;
    let totalDeals = deals.length;
    let totalExpenses = 0;
    
    // Данные для анализа
    const segmentData = {};
    const managerData = {};
    const weeklyData = {};
    const topDeals = [];
    const problemDeals = [];

    deals.forEach(deal => {
      const amount = deal.contract_amount || 0;
      const expenses = expMap[deal.crm_id] || 0;
      
      // Рассчитываем теоретическую маржу
      const theoreticalMargin = calculateTheoreticalMargin(deal.deal_type, amount);
      const actualMargin = amount - expenses;
      
      totalRevenue += amount;
      totalTheoreticalMargin += theoreticalMargin;
      totalActualMargin += actualMargin;
      totalExpenses += expenses;
      
      // Сегменты
      const segment = deal.deal_type || 'other';
      if (!segmentData[segment]) {
        segmentData[segment] = { revenue: 0, theoreticalMargin: 0, actualMargin: 0, deals: 0 };
      }
      segmentData[segment].revenue += amount;
      segmentData[segment].theoreticalMargin += theoreticalMargin;
      segmentData[segment].actualMargin += actualMargin;
      segmentData[segment].deals += 1;
      
      // Менеджеры
      const manager = deal.manager_name || 'Неизвестно';
      if (!managerData[manager]) {
        managerData[manager] = { revenue: 0, theoreticalMargin: 0, actualMargin: 0, deals: 0 };
      }
      managerData[manager].revenue += amount;
      managerData[manager].theoreticalMargin += theoreticalMargin;
      managerData[manager].actualMargin += actualMargin;
      managerData[manager].deals += 1;
      
      // Топ сделок
      topDeals.push({
        crm_id: deal.crm_id,
        manager: manager,
        amount: amount,
        expenses: expenses,
        theoreticalMargin: theoreticalMargin,
        actualMargin: actualMargin,
        marginPercent: amount > 0 ? (actualMargin / amount * 100) : 0,
        segment: segment
      });
      
      // Проблемные сделки
      if (amount > 0) {
        const expensePercent = (expenses / amount) * 100;
        if (expensePercent > 50) {
          problemDeals.push({
            crm_id: deal.crm_id,
            manager: manager,
            amount: amount,
            expenses: expenses,
            theoreticalMargin: theoreticalMargin,
            actualMargin: actualMargin,
            expensePercent: expensePercent.toFixed(1)
          });
        }
      }
      
      // Группировка по неделям
      const week = getWeekNumber(new Date(deal.created_at));
      if (!weeklyData[week]) {
        weeklyData[week] = { revenue: 0, theoreticalMargin: 0, actualMargin: 0, deals: 0 };
      }
      weeklyData[week].revenue += amount;
      weeklyData[week].theoreticalMargin += theoreticalMargin;
      weeklyData[week].actualMargin += actualMargin;
      weeklyData[week].deals += 1;
    });
    
    // Сортируем топ сделок
    topDeals.sort((a, b) => b.actualMargin - a.actualMargin);
    const top10Deals = topDeals.slice(0, 10);
    
    // Сортируем менеджеров
    const topManagers = Object.entries(managerData)
      .map(([name, data]) => ({ 
        name, 
        revenue: data.revenue,
        theoreticalMargin: data.theoreticalMargin,
        actualMargin: data.actualMargin,
        deals: data.deals,
        profitability: data.revenue > 0 ? (data.actualMargin / data.revenue * 100) : 0
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Рассчитываем проценты
    const actualMarginPercent = totalRevenue > 0 ? ((totalActualMargin / totalRevenue) * 100) : 0;
    const theoreticalMarginPercent = totalRevenue > 0 ? ((totalTheoreticalMargin / totalRevenue) * 100) : 0;
    const avgDealSize = totalDeals > 0 ? totalRevenue / totalDeals : 0;
    
    // Обновляем KPI блоки
    updateKPIBlocks(totalRevenue, totalActualMargin, actualMarginPercent, totalDeals, avgDealSize, totalTheoreticalMargin, theoreticalMarginPercent, totalExpenses);
    
    // Рендерим график
    renderChart(weeklyData);
    
    // Показываем аналитику
    showAnalytics(top10Deals, topManagers, segmentData);
    
    // Показываем предупреждения
    showAlerts(problemDeals, deals, expMap);
    
    // Заполняем список менеджеров
    populateManagerFilter();

  } catch (error) {
    console.error('Ошибка загрузки данных гендира:', error);
    alert('Ошибка: ' + error.message);
  }
}

// ✅ Функция расчета теоретической маржи
function calculateTheoreticalMargin(dealType, amount) {
  if (!dealType || !amount || amount <= 0) return 0;
  
  switch(dealType) {
    case 'to':
    case 'pto':
    case 'rent':
      return Math.round(amount * 0.7 * 100) / 100; // 70%
    case 'eq':
      return Math.round(amount * 0.2 * 100) / 100; // 20%
    case 'comp':
    case 'rep':
      return Math.round(amount * 0.3 * 100) / 100; // 30%
    default:
      return Math.round(amount * 0.5 * 100) / 100; // 50% по умолчанию
  }
}

function showLoadingState() {
  document.getElementById('totalRevenue').textContent = 'Загрузка...';
  document.getElementById('totalMargin').textContent = 'Загрузка...';
  document.getElementById('marginPercent').textContent = '...';
  document.getElementById('totalDeals').textContent = '...';
}

// Обновление KPI блоков — только 4 основных
function updateKPIBlocks(revenue, actualMargin, actualMarginPercent, deals, avgDeal, theoreticalMargin, theoreticalMarginPercent, expenses) {
  // Основные KPI
  document.getElementById('totalRevenue').textContent = formatCurrency(revenue);
  document.getElementById('totalMargin').textContent = formatCurrency(actualMargin);
  document.getElementById('marginPercent').textContent = actualMarginPercent.toFixed(1) + '%';
  document.getElementById('totalDeals').textContent = deals;
  
  // Дополнительные KPI — в одном блоке
  const kpiContainer = document.querySelector('.kpi-container');
  if (kpiContainer) {
    kpiContainer.innerHTML = `
      <div style="background:#e6f7ff; padding:15px; border-radius:8px; min-width:200px; box-shadow:0 2px 4px rgba(0,0,0,0.1); border:1px solid #91d5ff;">
        <h3 style="margin:0 0 10px 0; color:#1890ff; font-size:16px;">📊 Теор. маржа</h3>
        <p style="font-size:22px; margin:0; font-weight:bold; color:#1890ff;">
          ${formatCurrency(theoreticalMargin)}
        </p>
        <small style="color:#1890ff; font-weight:bold;">${theoreticalMarginPercent.toFixed(1)}%</small>
      </div>
      <div style="background:#f6ffed; padding:15px; border-radius:8px; min-width:200px; box-shadow:0 2px 4px rgba(0,0,0,0.1); border:1px solid #b7eb8f;">
        <h3 style="margin:0 0 10px 0; color:#52c41a; font-size:16px;">💰 Средний чек</h3>
        <p style="font-size:22px; margin:0; font-weight:bold; color:#52c41a;">
          ${formatCurrency(avgDeal)}
        </p>
        <small style="color:#52c41a;">на сделку</small>
      </div>
      <div style="background:#fff1f0; padding:15px; border-radius:8px; min-width:200px; box-shadow:0 2px 4px rgba(0,0,0,0.1); border:1px solid #ffa39e;">
        <h3 style="margin:0 0 10px 0; color:#ff4d4f; font-size:16px;">💸 Расходы</h3>
        <p style="font-size:22px; margin:0; font-weight:bold; color:#ff4d4f;">
          ${formatCurrency(expenses)}
        </p>
        <small style="color:#ff4d4f;">всего</small>
      </div>
    `;
  }
}

// Рендер графика — только один график
function renderChart(weeklyData) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  
  if (revenueChart) revenueChart.destroy();

  const labels = Object.keys(weeklyData).sort();
  const revenueData = labels.map(w => weeklyData[w].revenue);
  const theoreticalMarginData = labels.map(w => weeklyData[w].theoreticalMargin);
  const actualMarginData = labels.map(w => weeklyData[w].actualMargin);

  revenueChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.map(w => w.replace('-W', ' нед. ')),
      datasets: [
        {
          label: 'Выручка',
          data: revenueData,
          backgroundColor: 'rgba(24, 144, 255, 0.1)',
          borderColor: 'rgba(24, 144, 255, 1)',
          borderWidth: 2,
          tension: 0.3,
          fill: false
        },
        {
          label: 'Теор. маржа',
          data: theoreticalMarginData,
          backgroundColor: 'rgba(250, 173, 20, 0.1)',
          borderColor: 'rgba(250, 173, 20, 1)',
          borderWidth: 2,
          tension: 0.3,
          fill: false,
          borderDash: [5, 5]
        },
        {
          label: 'Факт. маржа',
          data: actualMarginData,
          backgroundColor: 'rgba(82, 196, 26, 0.1)',
          borderColor: 'rgba(82, 196, 26, 1)',
          borderWidth: 2,
          tension: 0.3,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: {
              size: 11
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return formatCurrency(value, true);
            },
            font: {
              size: 10
            }
          }
        },
        x: {
          ticks: {
            font: {
              size: 10
            }
          }
        }
      }
    }
  });
}

// Показать аналитику — только топ-10 сделок и топ-5 менеджеров
function showAnalytics(topDeals, topManagers, segmentData) {
  let analyticsDiv = document.getElementById('analytics');
  if (!analyticsDiv) {
    analyticsDiv = document.createElement('div');
    analyticsDiv.id = 'analytics';
    analyticsDiv.style.cssText = `
      margin-top: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
    `;
    document.querySelector('#genScreen .card').appendChild(analyticsDiv);
  }
  
  // Топ сделок
  analyticsDiv.innerHTML = `
    <div style="background:white; padding:12px; border-radius:6px; border:1px solid #eee; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
      <h3 style="margin-top:0; margin-bottom:10px; font-size:14px; color:#1890ff;">🏆 Топ-10 сделок по марже</h3>
      <div style="max-height:250px; overflow-y:auto; font-size:12px;">
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">CRM ID</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Сумма</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Факт. маржа</th>
            </tr>
          </thead>
          <tbody>
            ${topDeals.map(deal => `
              <tr>
                <td style="padding:6px; border-bottom:1px solid #eee;">
                  <div><strong>${deal.crm_id}</strong></div>
                  <div style="font-size:10px; color:#666;">${deal.manager}</div>
                </td>
                <td style="padding:6px; border-bottom:1px solid #eee;">${formatCurrency(deal.amount, true)}</td>
                <td style="padding:6px; border-bottom:1px solid #eee; color:${deal.marginPercent > 20 ? '#52c41a' : deal.marginPercent > 0 ? '#faad14' : '#ff4d4f'}">
                  ${formatCurrency(deal.actualMargin, true)}<br>
                  <small style="font-size:10px;">${deal.marginPercent.toFixed(1)}%</small>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <div style="background:white; padding:12px; border-radius:6px; border:1px solid #eee; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
      <h3 style="margin-top:0; margin-bottom:10px; font-size:14px; color:#1890ff;">👥 Топ-5 менеджеров</h3>
      <div style="max-height:250px; overflow-y:auto; font-size:12px;">
        <table style="width:100%; font-size:12px; border-collapse:collapse;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Менеджер</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Выручка</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Рентаб.</th>
            </tr>
          </thead>
          <tbody>
            ${topManagers.map(manager => `
              <tr>
                <td style="padding:6px; border-bottom:1px solid #eee;">
                  <strong>${manager.name}</strong><br>
                  <small style="font-size:10px; color:#666;">${manager.deals} сделок</small>
                </td>
                <td style="padding:6px; border-bottom:1px solid #eee;">${formatCurrency(manager.revenue, true)}</td>
                <td style="padding:6px; border-bottom:1px solid #eee; color:${manager.profitability > 20 ? '#52c41a' : manager.profitability > 0 ? '#faad14' : '#ff4d4f'}">
                  ${manager.profitability.toFixed(1)}%<br>
                  <small style="font-size:10px;">${formatCurrency(manager.actualMargin, true)}</small>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Заполняем список ВСЕХ менеджеров
async function populateManagerFilter() {
  try {
    // Загружаем ВСЕХ менеджеров
    const { data: allManagers, error } = await genSupabaseClient
      .from('deals')
      .select('manager_name')
      .not('manager_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (error) throw error;
    
    const uniqueManagers = [...new Set(allManagers.map(m => m.manager_name).filter(Boolean))].sort();
    
    const filter = document.getElementById('genManagerFilter');
    if (filter) {
      filter.innerHTML = '<option value="">Все менеджеры</option>' +
        uniqueManagers.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    
  } catch (error) {
    console.error('Ошибка загрузки списка менеджеров:', error);
  }
}

// Показать предупреждения
function showAlerts(problemDeals, allDeals, expMap) {
  const alertsDiv = document.getElementById('alerts');
  alertsDiv.innerHTML = '<h3 style="font-size:16px; margin-bottom:15px;">🚨 Предупреждения</h3>';
  
  // 1. Сделки с высокими расходами (>50%)
  if (problemDeals.length > 0) {
    const alertEl = document.createElement('div');
    alertEl.style.cssText = `
      padding: 10px;
      background: #fff2f0;
      border-left: 4px solid #ff4d4f;
      margin-bottom: 10px;
      border-radius: 4px;
      font-size: 13px;
    `;
    alertEl.innerHTML = `
      <strong style="color:#ff4d4f;">⚠️ Высокие расходы (>50%):</strong><br>
      <div style="margin-top:5px; max-height:150px; overflow-y:auto;">
        ${problemDeals.slice(0, 5).map(d => 
          `<div style="margin-bottom:3px; padding:3px 0; border-bottom:1px dashed #ffccc7;">
            <strong>${d.crm_id}</strong> (${d.manager}): 
            ${formatCurrency(d.amount, true)} → расходы ${formatCurrency(d.expenses, true)} (${d.expensePercent}%)<br>
            <small style="color:#666;">Теор. маржа: ${formatCurrency(d.theoreticalMargin, true)} | Факт.: ${formatCurrency(d.actualMargin, true)}</small>
          </div>`
        ).join('')}
        ${problemDeals.length > 5 ? `<div style="color:#666; font-size:11px;">... и ещё ${problemDeals.length - 5} сделок</div>` : ''}
      </div>
    `;
    alertsDiv.appendChild(alertEl);
  }
  
  // Если нет предупреждений
  if (alertsDiv.children.length === 1) {
    const noAlerts = document.createElement('div');
    noAlerts.style.cssText = `
      padding: 15px;
      text-align: center;
      color: #666;
      background: #fafafa;
      border-radius: 8px;
      font-size: 13px;
    `;
    noAlerts.innerHTML = '✅ Все показатели в норме. Критических проблем не обнаружено.';
    alertsDiv.appendChild(noAlerts);
  }
}

// Вспомогательные функции
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function formatCurrency(amount, short = false) {
  if (amount >= 1000000) {
    return short ? (amount / 1000000).toFixed(1) + 'M' : Math.round(amount / 1000000) + ' млн ₽';
  } else if (amount >= 1000) {
    return short ? (amount / 1000).toFixed(0) + 'K' : Math.round(amount / 1000) + ' тыс. ₽';
  }
  return Math.round(amount).toLocaleString('ru-RU') + ' ₽';
}

// Переход к панели финансиста
function goToFinPanel() {
  console.log('Переход к финансовому контролю...');
  
  document.getElementById('genScreen').style.display = 'none';
  const finScreen = document.getElementById('finScreen');
  if (finScreen) {
    finScreen.style.display = 'block';
    
    if (typeof window.initFinPanel !== 'function') {
      const script = document.createElement('script');
      script.src = 'fin.js';
      script.onload = () => {
        if (typeof initFinPanel === 'function') {
          initFinPanel(genSupabaseClient, genCurrentUserPhone, genCurrentUserName, () => {
            document.getElementById('finScreen').style.display = 'none';
            document.getElementById('genScreen').style.display = 'block';
          });
        }
      };
      document.head.appendChild(script);
    } else {
      initFinPanel(genSupabaseClient, genCurrentUserPhone, genCurrentUserName, () => {
        document.getElementById('finScreen').style.display = 'none';
        document.getElementById('genScreen').style.display = 'block';
      });
    }
  }
}

// Экспорт в Excel
async function exportToExcel() {
  try {
    const dateFrom = document.getElementById('genDateFrom').value;
    const dateTo = document.getElementById('genDateTo').value;
    
    if (!dateFrom || !dateTo) {
      alert('Выберите период для экспорта');
      return;
    }
    
    // Загружаем данные для экспорта
    const { data: deals, error } = await genSupabaseClient
      .from('deals')
      .select('*')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');
    
    if (error) throw error;
    
    // Формируем CSV
    const headers = ['CRM ID', 'Менеджер', 'Тип', 'Договор', 'Оплачено', 'Теор. маржа', 'Дата создания'];
    const rows = deals.map(deal => [
      deal.crm_id,
      deal.manager_name,
      getSegmentLabel(deal.deal_type),
      deal.contract_amount,
      deal.total_paid,
      calculateTheoreticalMargin(deal.deal_type, deal.contract_amount),
      new Date(deal.created_at).toLocaleDateString('ru-RU')
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Создаем и скачиваем файл
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `отчет_гендир_${dateFrom}_${dateTo}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert('✅ Экспорт завершен. Файл скачивается...');
    
  } catch (error) {
    console.error('Ошибка экспорта:', error);
    alert('Ошибка экспорта: ' + error.message);
  }
}

// Вспомогательная функция для сегментов
function getSegmentLabel(segment) {
  const labels = {
    'to': 'ТО', 'pto': 'ПТО', 'eq': 'Оборудование',
    'comp': 'Комплектующие', 'rep': 'Ремонты', 'rent': 'Аренда'
  };
  return labels[segment] || segment;
}

// Экспорт функции
if (typeof window !== 'undefined') {
  window.initGenPanel = initGenPanel;
}
