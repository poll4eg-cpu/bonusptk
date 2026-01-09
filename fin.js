// fin.js — панель финансиста
let finSupabaseClient = null;
let finCurrentUserPhone = null;
let finCurrentUserName = null;

function initFinPanel(supabaseClient, currentUserPhone, currentUserName) {
  finSupabaseClient = supabaseClient;
  finCurrentUserPhone = currentUserPhone;
  finCurrentUserName = currentUserName;

  // Установите период по умолчанию (последний месяц)
  const today = new Date();
  const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  document.getElementById('finDateFrom').valueAsDate = monthAgo;
  document.getElementById('finDateTo').valueAsDate = today;

  // Обработчики
  document.getElementById('loadFinData').addEventListener('click', loadFinData);
  document.getElementById('backToRopFromFin').addEventListener('click', () => {
    document.getElementById('finScreen').style.display = 'none';
    document.getElementById('ropScreen').style.display = 'block';
  });

  loadFinData(); // загрузить при старте
}

async function loadFinData() {
  const dateFrom = document.getElementById('finDateFrom').value;
  const dateTo = document.getElementById('finDateTo').value;

  if (!dateFrom || !dateTo) {
    alert('Выберите период');
    return;
  }

  try {
    // Загружаем сделки
    const { data: deals, error: dealsError } = await finSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount, margin')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');

    if (dealsError) throw dealsError;

    // Загружаем фактические расходы
    const { data: expenses, error: expError } = await finSupabaseClient
      .from('finance_expenses')
      .select('crm_id, fact_expenses');

    if (expError) throw expError;

    // Карта расходов
    const expMap = {};
    expenses.forEach(e => {
      expMap[e.crm_id] = e.fact_expenses || 0;
    });

    // Заполняем фильтр менеджеров
    const managerFilter = document.getElementById('finManagerFilter');
    const managerNames = [...new Set(deals.map(d => d.manager_name))];
    managerFilter.innerHTML = '<option value="">Все менеджеры</option>';
    managerNames.sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      managerFilter.appendChild(opt);
    });

    // Применяем фильтр по менеджеру
    const selectedManager = managerFilter.value;
    let filteredDeals = selectedManager 
      ? deals.filter(d => d.manager_name === selectedManager)
      : deals;

    // Заполняем таблицу
    const tbody = document.getElementById('finDealsBody');
    tbody.innerHTML = '';

    filteredDeals.forEach(deal => {
  const contractAmount = deal.contract_amount || 0;
  const factExpenses = expMap[deal.crm_id] || 0;
  const factMargin = contractAmount - factExpenses;
  const deviation = contractAmount > 0 
    ? ((factExpenses / contractAmount) * 100).toFixed(1) // % расходов от суммы
    : 0;
      // Расчёт теоретической маржи по типу сделки
let theorMargin = 0;
const dealType = deal.deal_type;
if (dealType === 'to' || dealType === 'pto' || dealType === 'rent') {
  theorMargin = contractAmount * 0.7;
} else if (dealType === 'eq') {
  theorMargin = contractAmount * 0.2;
} else if (dealType === 'comp') {
  theorMargin = contractAmount * 0.3;
} else if (dealType === 'rep') {
  theorMargin = contractAmount * 0.4;
}
// Если тип неизвестен — theorMargin остаётся 0

// Фактическая маржа = полная сумма договора − расходы
const factMargin = contractAmount - factExpenses;

// Отклонение: на сколько % фактическая маржа ниже теоретической
// (положительное значение = хуже)
const deviation = theorMargin > 0 
  ? ((theorMargin - factMargin) / theorMargin * 100).toFixed(1)
  : 0;

  const row = document.createElement('tr');
  row.innerHTML = `
  <td style="padding:8px; border:1px solid #ddd;">${deal.crm_id}</td>
  <td style="padding:8px; border:1px solid #ddd;">${deal.manager_name}</td>
  <td style="padding:8px; border:1px solid #ddd;">${theorMargin.toLocaleString('ru-RU')} ₽</td>
  <td style="padding:8px; border:1px solid #ddd;">
    <input type="number" class="factExpensesInput" 
           data-crm-id="${deal.crm_id}" 
           value="${factExpenses}" 
           placeholder="0"
           style="width:100px; padding:4px;">
    <button class="saveExpenseBtn" data-crm-id="${deal.crm_id}" 
            style="margin-left:5px; background:#52c41a; color:white; border:none; padding:4px 8px; border-radius:4px;">
      ✔️
    </button>
  </td>
  <td style="padding:8px; border:1px solid #ddd;">${factMargin.toLocaleString('ru-RU')} ₽</td>
  <td style="padding:8px; border:1px solid #ddd; color:${deviation > 0 ? '#ff4d4f' : '#52c41a'};">
    ${deviation > 0 ? '+' : ''}${deviation}%
  </td>
  <td style="padding:8px; border:1px solid #ddd;"></td>
`;
  tbody.appendChild(row);
});

    document.getElementById('finDealsTable').style.display = 'block';

    // Обработчики сохранения
    document.querySelectorAll('.saveExpenseBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const crmId = btn.getAttribute('data-crm-id');
        const input = document.querySelector(`.factExpensesInput[data-crm-id="${crmId}"]`);
        const value = parseFloat(input.value) || 0;

        const { error } = await finSupabaseClient
          .from('finance_expenses')
          .upsert(
            {
              crm_id: crmId,
              fact_expenses: value,
              updated_by: finCurrentUserName,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'crm_id' }
          );

        if (error) {
          alert('Ошибка сохранения: ' + error.message);
        } else {
          loadFinData(); // перезагрузить данные
        }
      });
    });
  } catch (error) {
    console.error('Ошибка загрузки финансовых данных:', error);
    alert('Ошибка: ' + error.message);
  }
}
