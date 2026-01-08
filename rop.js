// rop.js — минимальная панель РОПа (без ошибок)
let ropSupabaseClient = null;
let ropCurrentUserPhone = null;
let ropCurrentUserName = null;

function initRopPanel(supabaseClient, currentUserPhone, currentUserName) {
  console.log('РОП-панель инициализирована');
  
  ropSupabaseClient = supabaseClient;
  ropCurrentUserPhone = currentUserPhone;
  ropCurrentUserName = currentUserName;

  // Подключаем кнопки
  document.getElementById('loadRopData').addEventListener('click', loadRopData);
  document.getElementById('ropCreateDealBtn').addEventListener('click', () => {
    alert('Создание сделки — будет реализовано позже');
  });
}

async function loadRopData() {
  console.log('Загрузка сделок с фильтрами...');
  
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  try {
    // Загружаем ВСЕ сделки за месяц
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

    // 🔥 Заполняем список менеджеров (все, у кого есть сделки)
    const managerNames = [...new Set(data.map(d => d.manager_name))];
    const managerSelect = document.getElementById('ropManagerFilter');
    managerSelect.innerHTML = '<option value="">Все менеджеры</option>';
    managerNames.sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      managerSelect.appendChild(opt);
    });

    // Получаем текущие фильтры
    const managerFilter = document.getElementById('ropManagerFilter').value;
    const segmentFilter = document.getElementById('ropSegmentFilter').value;

    // Сопоставление сегментов
    const labelToType = {
      'ТО': 'to',
      'ПТО': 'pto',
      'Оборудование': 'eq',
      'Комплектующие': 'comp',
      'Ремонты': 'rep',
      'Аренда': 'rent'
    };

    // Применяем фильтры
    let filteredData = data;
    
    if (managerFilter) {
      filteredData = filteredData.filter(deal => deal.manager_name === managerFilter);
    }
    
    if (segmentFilter) {
      const dealType = labelToType[segmentFilter];
      filteredData = filteredData.filter(deal => deal.deal_type === dealType);
    }

    // Заполняем таблицу
    const tbody = document.getElementById('ropDealsBody');
    tbody.innerHTML = '';

    const typeLabels = {
      'to': 'ТО',
      'pto': 'ПТО',
      'eq': 'Оборудование',
      'comp': 'Комплектующие',
      'rep': 'Ремонты',
      'rent': 'Аренда'
    };

    filteredData.forEach(deal => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${deal.crm_id}</td>
        <td>${deal.manager_name}</td>
        <td>${typeLabels[deal.deal_type] || deal.deal_type}</td>
        <td>${deal.contract_amount.toLocaleString('ru-RU')} ₽</td>
      `;
      tbody.appendChild(row);
    });

    document.getElementById('ropDealsTable').style.display = 'block';
  } catch (error) {
    console.error('Ошибка:', error);
    alert('Ошибка загрузки: ' + error.message);
  }
}
