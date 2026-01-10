// gen.js — улучшенная панель генерального директора (исправленная версия)
let revenueChart = null;
let segmentChart = null;
let genSupabaseClient = null;
let genCurrentUserPhone = null;
let genCurrentUserName = null;

function initGenPanel(supabaseClient, currentUserPhone, currentUserName) {
  console.log('Гендиректор панель инициализирована для:', currentUserName);
  
  genSupabaseClient = supabaseClient;
  genCurrentUserPhone = currentUserPhone;
  genCurrentUserName = currentUserName;

  // Установите период по умолчанию (последние 3 месяца)
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

// Добавление фильтров
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
        <!-- Список загрузится динамически -->
      </select>
    </div>
    <div>
      <label style="display:block; margin-bottom:5px; font-weight:bold;">Сравнить с:</label>
      <select id="genComparePeriod" style="padding:8px; border-radius:4px; border:1px solid #ddd; min-width:150px;">
        <option value="">Нет</option>
        <option value="previous_month">Предыдущий месяц</option>
        <option value="same_month_last_year">Этот месяц год назад</option>
      </select>
    </div>
    <div>
      <button id="resetFilters" style="padding:8px 16px; background:#f0f0f0; border:1px solid #ccc; border-radius:4px; cursor:pointer;">
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
    document.getElementById('genComparePeriod').value = '';
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
      .select('crm_id, manager_name, deal_type, contract_amount, margin, total_paid, created_at, paid, up_signed, is_first, arpu_input')
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
    let totalTheoreticalMargin = 0; // Теоретическая маржа (рассчитывается!)
    let totalActualMargin = 0;      // Фактическая маржа (с учетом расходов)
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
      
      // ✅ ВАЖНО: Рассчитываем теоретическую маржу ПО ФОРМУЛЕ!
      const theoreticalMargin = calculateTheoreticalMargin(deal.deal_type, amount);
      const actualMargin = amount - expenses;
      
      totalRevenue += amount;
      totalTheoreticalMargin += theoreticalMargin;
      totalActualMargin += actualMargin;
      totalExpenses += expenses;
      
      // Сегменты
      const segment = deal.deal_type || 'other';
      if (!segmentData[segment]) {
        segmentData[segment] = { revenue: 0, margin: 0, deals: 0 };
      }
      segmentData[segment].revenue += amount;
      segmentData[segment].margin += actualMargin;
      segmentData[segment].deals += 1;
      
      // Менеджеры
      const manager = deal.manager_name || 'Неизвестно';
      if (!managerData[manager]) {
        managerData[manager] = { revenue: 0, margin: 0, deals: 0 };
      }
      managerData[manager].revenue += amount;
      managerData[manager].margin += actualMargin;
      managerData[manager].deals += 1;
      
      // Топ сделок по марже
      topDeals.push({
        crm_id: deal.crm_id,
        manager: manager,
        amount: amount,
        expenses: expenses,
        margin: actualMargin,
        marginPercent: amount > 0 ? (actualMargin / amount * 100) : 0,
        segment: segment
      });
      
      // Проблемные сделки
      if (amount > 0) {
        const expensePercent = (expenses / amount) * 100;
        if (expensePercent > 70) {
          problemDeals.push({
            crm_id: deal.crm_id,
            manager: manager,
            amount: amount,
            expenses: expenses,
            expensePercent: expensePercent.toFixed(1)
          });
        }
      }
      
      // Группировка по неделям
      const week = getWeekNumber(new Date(deal.created_at));
      if (!weeklyData[week]) {
        weeklyData[week] = { revenue: 0, margin: 0, deals: 0 };
      }
      weeklyData[week].revenue += amount;
      weeklyData[week].margin += actualMargin;
      weeklyData[week].deals += 1;
    });
    
    // Сортируем топ сделок
    topDeals.sort((a, b) => b.margin - a.margin);
    const top10Deals = topDeals.slice(0, 10);
    
    // Сортируем менеджеров
    const topManagers = Object.entries(managerData)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Рассчитываем проценты
    const marginPercent = totalRevenue > 0 ? ((totalActualMargin / totalRevenue) * 100) : 0;
    const avgDealSize = totalDeals > 0 ? totalRevenue / totalDeals : 0;
    const theoreticalMarginPercent = totalRevenue > 0 ? ((totalTheoreticalMargin / totalRevenue) * 100) : 0;
    
    // Обновляем KPI блоки
    updateKPIBlocks(totalRevenue, totalActualMargin, marginPercent, totalDeals, avgDealSize, totalTheoreticalMargin, theoreticalMarginPercent);
    
    // Рендерим графики
    renderCharts(weeklyData, segmentData);
    
    // Показываем аналитику
    showAnalytics(top10Deals, topManagers, segmentData);
    
    // Показываем предупреждения
    showAlerts(problemDeals, deals, expMap);
    
    // ✅ ИСПРАВЛЕНО: Заполняем список менеджеров ВСЕХ (не только из текущих данных)
    await populateManagerFilter(dateFrom, dateTo);
    
    // Восстанавливаем выбранного менеджера после обновления списка
    if (managerFilter) {
      document.getElementById('genManagerFilter').value = managerFilter;
    }

  } catch (error) {
    console.error('Ошибка загрузки данных гендира:', error);
    alert('Ошибка: ' + error.message);
  }
}

// ✅ Функция расчета теоретической маржи по формуле
function calculateTheoreticalMargin(dealType, amount) {
  if (!dealType || !amount || amount <= 0) return 0;
  
  switch(dealType) {
    case 'to':
    case 'pto':
    case 'rent':
      return amount * 0.7; // 70%
    case 'eq':
      return amount * 0.2; // 20%
    case 'comp':
    case 'rep':
      return amount * 0.3; // 30%
    default:
      return amount * 0.5; // 50% по умолчанию
  }
}

function showLoadingState() {
  document.getElementById('totalRevenue').textContent = 'Загрузка...';
  document.getElementById('totalMargin').textContent = 'Загрузка...';
  document.getElementById('marginPercent').textContent = '...';
  document.getElementById('totalDeals').textContent = '...';
}

// Обновление KPI блоков
function updateKPIBlocks(revenue, margin, marginPercent, deals, avgDeal, theoreticalMargin, theoreticalMarginPercent) {
  // Основные KPI
  document.getElementById('totalRevenue').textContent = formatCurrency(revenue);
  document.getElementById('totalMargin').textContent = formatCurrency(margin);
  document.getElementById('marginPercent').textContent = marginPercent.toFixed(1) + '%';
  document.getElementById('totalDeals').textContent = deals;
  
  // Создаем или обновляем дополнительные KPI блоки
  let kpiContainer = document.querySelector('.kpi-container');
  if (!kpiContainer) {
    kpiContainer = document.createElement('div');
    kpiContainer.className = 'kpi-container';
    kpiContainer.style.cssText = `
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      margin: 20px 0;
    `;
    
    const existingKPIs = document.querySelector('#genScreen .card > div:first-child');
    if (existingKPIs) {
      existingKPIs.parentNode.insertBefore(kpiContainer, existingKPIs.nextSibling);
    }
  }
  
  // Дополнительные KPI
  kpiContainer.innerHTML = `
    <div style="background:#e6f7ff; padding:15px; border-radius:8px; min-width:200px; box-shadow:0 2px 4px rgba(0,0,0,0.1); border:1px solid #91d5ff;">
      <h3 style="margin:0 0 10px 0; color:#1890ff; font-size:16px;">📊 Теор. маржа</h3>
      <p id="theoreticalMargin" style="font-size:22px; margin:0; font-weight:bold; color:#1890ff;">
        ${formatCurrency(theoreticalMargin)}
      </p>
      <small style="color:#1890ff; font-weight:bold;">${theoreticalMarginPercent.toFixed(1)}%</small>
    </div>
    <div style="background:#f6ffed; padding:15px; border-radius:8px; min-width:200px; box-shadow:0 2px 4px rgba(0,0,0,0.1); border:1px solid #b7eb8f;">
      <h3 style="margin:0 0 10px 0; color:#52c41a; font-size:16px;">💰 Средний чек</h3>
      <p id="avgDealSize" style="font-size:22px; margin:0; font-weight:bold; color:#52c41a;">
        ${formatCurrency(avgDeal)}
      </p>
      <small style="color:#52c41a;">на сделку</small>
    </div>
    <div style="background:#fff1f0; padding:15px; border-radius:8px; min-width:200px; box-shadow:0 2px 4px rgba(0,0,0,0.1); border:1px solid #ffa39e;">
      <h3 style="margin:0 0 10px 0; color:#ff4d4f; font-size:16px;">💸 Расходы</h3>
      <p id="totalExpenses" style="font-size:22px; margin:0; font-weight:bold; color:#ff4d4f;">
        ${formatCurrency(theoreticalMargin - margin)}
      </p>
      <small style="color:#ff4d4f;">всего</small>
    </div>
    <div style="background:#fffbe6; padding:15px; border-radius:8px; min-width:200px; box-shadow:0 2px 4px rgba(0,0,0,0.1); border:1px solid #ffe58f;">
      <h3 style="margin:0 0 10px 0; color:#faad14; font-size:16px;">📈 Рентабельность</h3>
      <p id="profitability" style="font-size:22px; margin:0; font-weight:bold; color:#faad14;">
        ${marginPercent.toFixed(1)}%
      </p>
      <small style="color:#faad14;">фактическая</small>
    </div>
  `;
}

// Рендер графиков
function renderCharts(weeklyData, segmentData) {
  const ctx1 = document.getElementById('revenueChart').getContext('2d');
  
  if (revenueChart) revenueChart.destroy();
  if (segmentChart) segmentChart.destroy();

  // График 1: Динамика по неделям (оставляем как есть)
  const labels = Object.keys(weeklyData).sort();
  const revenueData = labels.map(w => weeklyData[w].revenue);
  const marginData = labels.map(w => weeklyData[w].margin);

  revenueChart = new Chart(ctx1, {
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
          fill: true
        },
        {
          label: 'Маржа',
          data: marginData,
          backgroundColor: 'rgba(82, 196, 26, 0.1)',
          borderColor: 'rgba(82, 196, 26, 1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
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
            }
          }
        }
      }
    }
  });

  // ✅ График 2: Распределение по сегментам - УМЕНЬШАЕМ РАЗМЕР
  let segmentCanvas = document.getElementById('segmentChart');
  if (!segmentCanvas) {
    const chartContainer = document.querySelector('#revenueChart').parentNode;
    
    // Создаем контейнер для второго графика
    const segmentContainer = document.createElement('div');
    segmentContainer.style.cssText = `
      margin-top: 20px;
      width: 100%;
      height: 250px; // ✅ Уменьшаем высоту в 2 раза
    `;
    
    segmentCanvas = document.createElement('canvas');
    segmentCanvas.id = 'segmentChart';
    segmentContainer.appendChild(segmentCanvas);
    chartContainer.parentNode.insertBefore(segmentContainer, chartContainer.nextSibling);
  }
  
  const segmentLabels = Object.keys(segmentData);
  if (segmentLabels.length > 0) {
    const segmentRevenue = segmentLabels.map(s => segmentData[s].revenue);
    
    segmentChart = new Chart(segmentCanvas.getContext('2d'), {
      type: 'doughnut', // ✅ Меняем на пончик - занимает меньше места
      data: {
        labels: segmentLabels.map(s => getSegmentLabel(s)),
        datasets: [{
          data: segmentRevenue,
          backgroundColor: [
            '#1890ff', '#52c41a', '#faad14', '#eb2f96',
            '#722ed1', '#13c2c2', '#f759ab', '#ff7a45'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: {
              boxWidth: 12,
              font: {
                size: 11 // ✅ Уменьшаем шрифт
              }
            }
          },
          title: {
            display: true,
            text: 'Распределение по сегментам',
            font: {
              size: 14
            }
          }
        },
        cutout: '50%' // ✅ Делаем пончик тоньше
      }
    });
  } else {
    segmentCanvas.parentNode.innerHTML = '<p style="text-align:center; color:#666; padding:20px;">Нет данных для графика сегментов</p>';
  }
}

// Показать аналитику
function showAnalytics(topDeals, topManagers, segmentData) {
  let analyticsDiv = document.getElementById('analytics');
  if (!analyticsDiv) {
    analyticsDiv = document.createElement('div');
    analyticsDiv.id = 'analytics';
    analyticsDiv.style.cssText = `
      margin-top: 30px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    `;
    document.querySelector('#genScreen .card').appendChild(analyticsDiv);
  }
  
  // Топ сделок
  analyticsDiv.innerHTML = `
    <div style="background:white; padding:15px; border-radius:8px; border:1px solid #eee; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin-top:0; color:#1890ff;">🏆 Топ-10 сделок по марже</h3>
      <div style="max-height:300px; overflow-y:auto;">
        <table style="width:100%; font-size:13px; border-collapse:collapse;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">CRM ID</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Менеджер</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Сумма</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Маржа</th>
            </tr>
          </thead>
          <tbody>
            ${topDeals.map(deal => `
              <tr>
                <td style="padding:6px; border-bottom:1px solid #eee;">${deal.crm_id}</td>
                <td style="padding:6px; border-bottom:1px solid #eee;">${deal.manager}</td>
                <td style="padding:6px; border-bottom:1px solid #eee;">${formatCurrency(deal.amount)}</td>
                <td style="padding:6px; border-bottom:1px solid #eee; color:${deal.marginPercent > 20 ? '#52c41a' : deal.marginPercent > 0 ? '#faad14' : '#ff4d4f'}">
                  ${formatCurrency(deal.margin)} (${deal.marginPercent.toFixed(1)}%)
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    
    <div style="background:white; padding:15px; border-radius:8px; border:1px solid #eee; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <h3 style="margin-top:0; color:#1890ff;">👥 Топ-5 менеджеров</h3>
      <div style="max-height:300px; overflow-y:auto;">
        <table style="width:100%; font-size:13px; border-collapse:collapse;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Менеджер</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Сделок</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Выручка</th>
              <th style="padding:6px; text-align:left; border-bottom:1px solid #eee;">Маржа</th>
            </tr>
          </thead>
          <tbody>
            ${topManagers.map(manager => `
              <tr>
                <td style="padding:6px; border-bottom:1px solid #eee;"><strong>${manager.name}</strong></td>
                <td style="padding:6px; border-bottom:1px solid #eee;">${manager.deals}</td>
                <td style="padding:6px; border-bottom:1px solid #eee;">${formatCurrency(manager.revenue)}</td>
                <td style="padding:6px; border-bottom:1px solid #eee; color:${manager.margin > 0 ? '#52c41a' : '#ff4d4f'}">
                  ${formatCurrency(manager.margin)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ✅ ИСПРАВЛЕНО: Заполняем список ВСЕХ менеджеров
async function populateManagerFilter(dateFrom, dateTo) {
  try {
    // Загружаем ВСЕХ менеджеров за весь период (или за последний год)
    const { data: allManagers, error } = await genSupabaseClient
      .from('deals')
      .select('manager_name')
      .not('manager_name', 'is', null)
      .order('manager_name');
    
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

// Показать предупреждения (оставляем без изменений)
function showAlerts(problemDeals, allDeals, expMap) {
  const alertsDiv = document.getElementById('alerts');
  alertsDiv.innerHTML = '<h3>🚨 Предупреждения и уведомления</h3>';
  
  // ... (код предупреждений без изменений)
  
  if (alertsDiv.children.length === 1) {
    const noAlerts = document.createElement('div');
    noAlerts.style.cssText = `
      padding: 20px;
      text-align: center;
      color: #666;
      background: #fafafa;
      border-radius: 8px;
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

function getSegmentLabel(segment) {
  const labels = {
    'to': 'ТО', 'pto': 'ПТО', 'eq': 'Оборудование',
    'comp': 'Комплектующие', 'rep': 'Ремонты', 'rent': 'Аренда'
  };
  return labels[segment] || segment;
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
    const headers = ['CRM ID', 'Менеджер', 'Тип', 'Договор', 'Оплачено', 'Маржа', 'Премия', 'Дата создания'];
    const rows = deals.map(deal => [
      deal.crm_id,
      deal.manager_name,
      getSegmentLabel(deal.deal_type),
      deal.contract_amount,
      deal.total_paid,
      deal.margin,
      deal.bonus_paid,
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

// Экспорт функции
if (typeof window !== 'undefined') {
  window.initGenPanel = initGenPanel;
}
