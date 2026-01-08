// rop.js — исправленная версия с отладкой
let ropSupabaseClient = null;
let ropCurrentUserPhone = null;
let ropCurrentUserName = null;

function initRopPanel(supabaseClient, currentUserPhone, currentUserName) {
  console.log('Инициализация панели РОПа');
  ropSupabaseClient = supabaseClient;
  ropCurrentUserPhone = currentUserPhone;
  ropCurrentUserName = currentUserName;

  // Подключаем обработчики
  document.getElementById('loadRopData').addEventListener('click', loadRopData);
  document.getElementById('applyRopFilters').addEventListener('click', loadRopData);
  document.getElementById('ropCreateDealBtn').addEventListener('click', () => {
    const crmId = prompt('Введите номер сделки из CRM:');
    if (crmId) showRopCreateForm(crmId.trim());
  });

  // Загружаем данные при старте
  loadRopData();
}

async function loadRopData() {
  console.log('Загрузка данных РОПа');
  const period = document.getElementById('ropPeriod').value;
  const now = new Date();
  let startDate, endDate;

  if (period === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff));
    endDate = new Date(now.setDate(startDate.getDate() + 6));
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    startDate = new Date(now.getFullYear(), q * 3, 1);
    endDate = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  }
  endDate.setHours(23, 59, 59, 999);

  try {
    // Загружаем ВСЕ сделки без фильтра по менеджеру
    const { data: deals, error: dealsError } = await ropSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount, margin, total_paid, paid, up_signed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (dealsError) {
      console.error('Ошибка загрузки сделок:', dealsError);
      alert('Ошибка загрузки данных: ' + dealsError.message);
      return;
    }

    if (!deals || deals.length === 0) {
      console.log('Нет сделок за период');
      alert('Нет данных за выбранный период.');
      hideRopAnalytics();
      return;
    }

    console.log('Загружено сделок:', deals.length);
    console.log('Сделки:', deals);

    // Получаем список ВСЕХ имён из сделок
    const allNames = [...new Set(deals.map(d => d.manager_name).filter(name => name))];
    console.log('Уникальные имена:', allNames);

    if (allNames.length === 0) {
      alert('Нет имён менеджеров в сделках. Проверьте поле manager_name.');
      return;
    }

    // Отображаем все сделки (включая РОПа)
    const dealsToShow = deals;

    // Расчёт
    const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
    const seasonalCoefficient = coefficients[now.getMonth()];
    const participantCount = allNames.length;
    const departmentPlan = participantCount * 800000 * seasonalCoefficient;

    let totalMargin = 0;
    dealsToShow.forEach(deal => totalMargin += deal.margin || 0);
    const cleanMargin = totalMargin * 0.78;
    const ropBonus = Math.round(cleanMargin * 0.10);
    const planPercent = Math.min(100, (totalMargin / departmentPlan) * 100);

    // Отображение итогов
    document.getElementById('totalMarginRop').textContent = totalMargin.toLocaleString('ru-RU');
    document.getElementById('ropBonus').textContent = ropBonus.toLocaleString('ru-RU');
    document.getElementById('totalDealsRop').textContent = dealsToShow.length;
    document.getElementById('ropPlanBar').style.width = planPercent + '%';
    document.getElementById('ropPlanPercent').textContent = planPercent.toFixed(1) + '%';
    document.getElementById('ropSummary').style.display = 'block';
    document.getElementById('ropPlanProgress').style.display = 'block';

    // Заполняем фильтр по менеджерам
    const managerSelect = document.getElementById('ropManagerFilter');
    managerSelect.innerHTML = '<option value="">Все менеджеры</option>';
    allNames.sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      managerSelect.appendChild(opt);
    });

    renderAnalytics(dealsToShow, totalMargin);
    renderDealsTable(dealsToShow);
  } catch (error) {
    console.error('Критическая ошибка:', error);
    alert('Критическая ошибка: ' + (error.message || 'проверьте консоль'));
  }
}

function hideRopAnalytics() {
  document.getElementById('ropSummary').style.display = 'none';
  document.getElementById('managersAnalytics').style.display = 'none';
  document.getElementById('segmentsAnalytics').style.display = 'none';
  document.getElementById('ropDealsTable').style.display = 'none';
}

function renderAnalytics(deals, totalMargin) {
  const managers = {};
  deals.forEach(d => {
    if (d.manager_name && !managers[d.manager_name]) managers[d.manager_name] = 0;
    if (d.manager_name) managers[d.manager_name] += d.margin || 0;
  });
  renderChart('managersChart', managers, totalMargin);

  const segments = {};
  const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};
  deals.forEach(d => {
    const label = typeLabels[d.deal_type] || d.deal_type;
    if (!segments[label]) segments[label] = 0;
    segments[label] += d.margin || 0;
  });
  renderChart('segmentsChart', segments, totalMargin);
}

function renderChart(containerId, dataObj, total) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  Object.entries(dataObj)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, value]) => {
      const percent = Math.round((value / total) * 100);
      container.innerHTML += `
        <div style="margin-bottom:10px; padding:8px; background:#f9f9f9; border-radius:4px; min-width:120px;">
          <div><strong>${name}</strong></div>
          <div>${value.toLocaleString('ru-RU')} ₽</div>
          <div style="color:#1890ff;">${percent}%</div>
        </div>
      `;
    });
  document.getElementById(containerId.replace('Chart', 'Analytics')).style.display = 'block';
}

function renderDealsTable(deals) {
  const tbody = document.getElementById('ropDealsBody');
  tbody.innerHTML = '';
  const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};

  deals.forEach(deal => {
    if (!deal.manager_name) return; // пропускаем без имени
    const status = deal.paid ? '✅ 100%' : `⏳ ${Math.round((deal.total_paid / deal.contract_amount) * 100)}%`;
    const updStatus = deal.up_signed ? '✔️' : '✖️';
    const typeLabel = typeLabels[deal.deal_type] || deal.deal_type;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${deal.crm_id || ''}</td>
      <td>${deal.manager_name}</td>
      <td>${typeLabel}</td>
      <td>${deal.contract_amount?.toLocaleString('ru-RU') || '0'} ₽</td>
      <td>${(deal.margin || 0).toLocaleString('ru-RU')} ₽</td>
      <td>${status}</td>
      <td>${updStatus}</td>
      <td><button class="editDealBtn" data-crm-id="${deal.crm_id}">✏️</button></td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('ropDealsTable').style.display = 'block';

  // Обработчик редактирования
  document.querySelectorAll('.editDealBtn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const crmId = btn.getAttribute('data-crm-id');
      console.log('Редактирование сделки:', crmId);
      ropSupabaseClient
        .from('deals')
        .select('*')
        .eq('crm_id', crmId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Ошибка загрузки сделки:', error);
            alert('Ошибка: ' + error.message);
            return;
          }
          if (data) showRopUpdateForm(data);
        });
    });
  });
}

// ... остальные функции (showRopCreateForm, showRopUpdateForm и т.д.) без изменений ...

// Остальной код (создание, редактирование, кнопка "назад") — как в предыдущей версии
// (они не изменились, поэтому не привожу для краткости)
