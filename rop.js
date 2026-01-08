// rop.js — полная панель РОПа
let ropSupabaseClient = null;
let ropCurrentUserPhone = null;
let ropCurrentUserName = null;

function initRopPanel(supabaseClient, currentUserPhone, currentUserName) {
  console.log('РОП-панель инициализирована');
  ropSupabaseClient = supabaseClient;
  ropCurrentUserPhone = currentUserPhone;
  ropCurrentUserName = currentUserName;

  document.getElementById('loadRopData').addEventListener('click', loadRopData);
  document.getElementById('ropCreateDealBtn').addEventListener('click', () => {
    alert('Создание сделки — будет реализовано позже');
  });

  loadManagerList();
}

// Загрузка списка менеджеров
async function loadManagerList() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  try {
    const { data, error } = await ropSupabaseClient
      .from('deals')
      .select('manager_name')
      .gte('created_at', startOfMonth.toISOString())
      .lte('created_at', endOfMonth.toISOString());

    if (error) throw error;

    const managerNames = [...new Set(
      data.map(d => d.manager_name).filter(name => name && name.trim() !== '')
    )];

    const managerSelect = document.getElementById('ropManagerFilter');
    managerSelect.innerHTML = '<option value="">Все менеджеры</option>';
    managerNames.sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name.trim();
      opt.textContent = name.trim();
      managerSelect.appendChild(opt);
    });
  } catch (error) {
    console.error('Ошибка загрузки списка менеджеров:', error);
  }
}

// 📊 Расчёт премии менеджера
function calculateBonus(dealType, revenue, isFirst, paid, upSigned, annualContract = false) {
  if (!paid || !upSigned) return 0;
  if (dealType === 'to') {
    if (annualContract && revenue >= 35000) return Math.round(revenue * 12 * 0.03);
    if (isFirst) {
      if (revenue >= 70000) return 6000;
      if (revenue >= 35000) return 3000;
      return 500;
    } else {
      if (revenue >= 70000) return 2000;
      if (revenue >= 35000) return 1000;
      return 200;
    }
  }
  if (dealType === 'pto') {
    if (revenue >= 360000) return 6000;
    if (revenue >= 90000) return 3000;
    return 1000;
  }
  if (dealType === 'comp' || dealType === 'rep') {
    if (revenue >= 300000) return Math.round(revenue * 0.01);
    return Math.round(revenue * 0.03);
  }
  if (dealType === 'eq') return Math.round(revenue * 0.01);
  if (dealType === 'rent') return 1500;
  return 0;
}

// 🔥 Основная загрузка данных
async function loadRopData() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  try {
    // Загружаем базовые данные для фильтрации
    const { data, error } = await ropSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount')
      .gte('created_at', startOfMonth.toISOString())
      .lte('created_at', endOfMonth.toISOString());

    if (error) throw error;
    if (!data || data.length === 0) {
      alert('Нет сделок за месяц');
      return;
    }

    // Применяем фильтры
    const managerFilter = document.getElementById('ropManagerFilter').value;
    const segmentFilter = document.getElementById('ropSegmentFilter').value;

    const labelToType = {
      'ТО': 'to', 'ПТО': 'pto', 'Оборудование': 'eq',
      'Комплектующие': 'comp', 'Ремонты': 'rep', 'Аренда': 'rent'
    };

    let filteredData = data.filter(deal => deal.manager_name && deal.manager_name.trim() !== '');
    if (managerFilter || segmentFilter) {
      filteredData = filteredData.filter(deal => {
        const matchesManager = !managerFilter || deal.manager_name.trim() === managerFilter;
        const matchesSegment = !segmentFilter || (labelToType[segmentFilter] && deal.deal_type === labelToType[segmentFilter]);
        return matchesManager && matchesSegment;
      });
    }

    // 💥 Загружаем ПОЛНЫЕ данные для расчёта маржи и премий
    const {  fullDeals, error: fullError } = await ropSupabaseClient
      .from('deals')
      .select('crm_id, deal_type, contract_amount, margin, paid, up_signed, is_first, arpu_input, annual_contract')
      .in('crm_id', filteredData.map(d => d.crm_id));

    if (fullError) throw fullError;

    const dealMap = {};
    fullDeals.forEach(d => dealMap[d.crm_id] = d);

    // 🔥 Расчёт маржи отдела и премии РОПа
    let totalMargin = 0;
    filteredData.forEach(deal => {
      const fullDeal = dealMap[deal.crm_id];
      totalMargin += fullDeal.margin || 0;
    });

    const cleanMargin = totalMargin * 0.78; // −22% НДС
    const ropBonus = Math.round(cleanMargin * 0.10); // 10%

    // 💡 План отдела = кол-во менеджеров × 800k × сезон
    const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
    const seasonalCoefficient = coefficients[now.getMonth()];
    
    // Получаем список менеджеров из filteredData
    const managersInData = [...new Set(filteredData.map(d => d.manager_name).filter(name => name))];
    const departmentPlan = managersInData.length * 800000 * seasonalCoefficient;
    const planPercent = Math.min(100, (totalMargin / departmentPlan) * 100);

    // 📊 Отображение итогов
    document.getElementById('totalMarginRop').textContent = totalMargin.toLocaleString('ru-RU');
    document.getElementById('ropBonus').textContent = ropBonus.toLocaleString('ru-RU');
    document.getElementById('totalDealsRop').textContent = filteredData.length;
    document.getElementById('ropPlanBar').style.width = planPercent + '%';
    document.getElementById('ropPlanPercent').textContent = planPercent.toFixed(1) + '%';
    document.getElementById('ropSummary').style.display = 'block';
    document.getElementById('ropPlanProgress').style.display = 'block';

    // 📋 Заполнение таблицы с премиями
    const tbody = document.getElementById('ropDealsBody');
    tbody.innerHTML = '';

    const typeLabels = {
      'to': 'ТО', 'pto': 'ПТО', 'eq': 'Оборудование',
      'comp': 'Комплектующие', 'rep': 'Ремонты', 'rent': 'Аренда'
    };

    filteredData.forEach(deal => {
      const fullDeal = dealMap[deal.crm_id];
      let bonusPaid = 0;

      if (fullDeal && fullDeal.paid && fullDeal.up_signed) {
        let revenueForBonus = fullDeal.contract_amount;
        if (fullDeal.deal_type === 'to') {
          const arpuValue = fullDeal.arpu_input || fullDeal.contract_amount / 12;
          revenueForBonus = arpuValue;
        }
        bonusPaid = calculateBonus(
          fullDeal.deal_type,
          revenueForBonus,
          fullDeal.is_first,
          fullDeal.paid,
          fullDeal.up_signed,
          fullDeal.annual_contract
        );
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${deal.crm_id}</td>
        <td>${deal.manager_name}</td>
        <td>${typeLabels[deal.deal_type] || deal.deal_type}</td>
        <td>${deal.contract_amount.toLocaleString('ru-RU')} ₽</td>
        <td>${bonusPaid.toLocaleString('ru-RU')} ₽</td>
      `;
      tbody.appendChild(row);
    });

    document.getElementById('ropDealsTable').style.display = 'block';
  } catch (error) {
    console.error('Ошибка:', error);
    alert('Ошибка загрузки: ' + error.message);
  }
}
