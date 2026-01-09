// gen.js — панель генерального директора
let genSupabaseClient = null;
let genCurrentUserPhone = null;
let genCurrentUserName = null;
let revenueChart = null;

function initGenPanel(supabaseClient, currentUserPhone, currentUserName) {
  genSupabaseClient = supabaseClient;
  genCurrentUserPhone = currentUserPhone;
  genCurrentUserName = currentUserName;

  // Установите период по умолчанию (последние 3 месяца)
  const today = new Date();
  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  document.getElementById('genDateFrom').valueAsDate = threeMonthsAgo;
  document.getElementById('genDateTo').valueAsDate = today;

  document.getElementById('loadGenData').addEventListener('click', loadGenData);
  loadGenData(); // загрузить при старте
}

async function loadGenData() {
  const dateFrom = document.getElementById('genDateFrom').value;
  const dateTo = document.getElementById('genDateTo').value;

  if (!dateFrom || !dateTo) {
    alert('Выберите период');
    return;
  }

  try {
    // Загружаем все сделки
    const {  deals, error: dealsError } = await genSupabaseClient
      .from('deals')
      .select('crm_id, contract_amount, created_at')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');

    if (dealsError) throw dealsError;

    // Загружаем все расходы
    const {  expenses, error: expError } = await genSupabaseClient
      .from('finance_expenses')
      .select('crm_id, fact_expenses');

    if (expError) throw expError;

    // Карта расходов
    const expMap = {};
    expenses.forEach(e => {
      expMap[e.crm_id] = e.fact_expenses || 0;
    });

    // Агрегация
    let totalRevenue = 0;
    let totalMargin = 0;
    let totalDeals = deals.length;

    const weeklyData = {}; // для графика

    deals.forEach(deal => {
      const amount = deal.contract_amount || 0;
      const expenses = expMap[deal.crm_id] || 0;
      const margin = amount - expenses;

      totalRevenue += amount;
      totalMargin += margin;

      // Группировка по неделям
      const week = getWeekNumber(new Date(deal.created_at));
      if (!weeklyData[week]) {
        weeklyData[week] = { revenue: 0, margin: 0, deals: 0 };
      }
      weeklyData[week].revenue += amount;
      weeklyData[week].margin += margin;
      weeklyData[week].deals += 1;
    });

    const marginPercent = totalRevenue > 0 ? ((totalMargin / totalRevenue) * 100).toFixed(1) : 0;

    // Обновляем KPI
    document.getElementById('totalRevenue').textContent = totalRevenue.toLocaleString('ru-RU') + ' ₽';
    document.getElementById('totalMargin').textContent = totalMargin.toLocaleString('ru-RU') + ' ₽';
    document.getElementById('marginPercent').textContent = marginPercent + '%';
    document.getElementById('totalDeals').textContent = totalDeals;

    // График
    renderChart(weeklyData);

    // Предупреждения
    showAlerts(deals, expMap);

  } catch (error) {
    console.error('Ошибка загрузки данных гендира:', error);
    alert('Ошибка: ' + error.message);
  }
}

// Вспомогательная функция: номер недели
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

// Рендер графика
function renderChart(weeklyData) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  
  if (revenueChart) revenueChart.destroy();

  const labels = Object.keys(weeklyData).sort();
  const revenueData = labels.map(w => weeklyData[w].revenue);
  const marginData = labels.map(w => weeklyData[w].margin);

  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Выручка',
           revenueData,
          backgroundColor: 'rgba(24, 144, 255, 0.6)',
          borderColor: 'rgba(24, 144, 255, 1)',
          borderWidth: 1
        },
        {
          label: 'Маржа',
           marginData,
          backgroundColor: 'rgba(82, 196, 26, 0.6)',
          borderColor: 'rgba(82, 196, 26, 1)',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return value.toLocaleString('ru-RU') + ' ₽';
            }
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
        }
      }
    }
  });
}

// Предупреждения
function showAlerts(deals, expMap) {
  const alertsDiv = document.getElementById('alerts');
  alertsDiv.innerHTML = '';

  const highExpenseDeals = [];
  const noExpenseDeals = [];

  deals.forEach(deal => {
    const amount = deal.contract_amount || 0;
    const expenses = expMap[deal.crm_id] || 0;

    if (amount > 0) {
      const expensePercent = (expenses / amount) * 100;
      if (expensePercent > 70) {
        highExpenseDeals.push({ crm_id: deal.crm_id, percent: expensePercent.toFixed(1) });
      }
      if (expenses === 0) {
        noExpenseDeals.push(deal.crm_id);
      }
    }
  });

  if (highExpenseDeals.length > 0) {
    const alertEl = document.createElement('div');
    alertEl.style.padding = '12px';
    alertEl.style.backgroundColor = '#fff2f0';
    alertEl.style.borderLeft = '4px solid #ff4d4f';
    alertEl.style.marginBottom = '10px';
    alertEl.innerHTML = `
      <strong>⚠️ Высокие расходы:</strong><br>
      ${highExpenseDeals.map(d => `${d.crm_id} (${d.percent}%)`).join(', ')}
    `;
    alertsDiv.appendChild(alertEl);
  }

  if (noExpenseDeals.length > 0 && noExpenseDeals.length < 10) {
    const alertEl = document.createElement('div');
    alertEl.style.padding = '12px';
    alertEl.style.backgroundColor = '#fffbe6';
    alertEl.style.borderLeft = '4px solid #faad14';
    alertEl.style.marginBottom = '10px';
    alertEl.innerHTML = `
      <strong>ℹ️ Нет расходов:</strong><br>
      ${noExpenseDeals.join(', ')}
    `;
    alertsDiv.appendChild(alertEl);
  }
}
