// fin.js — панель финансиста
let finSupabaseClient = null;
let finCurrentUserPhone = null;
let finCurrentUserName = null;
let finPreviousScreen = null; // Для отслеживания предыдущего экрана

function initFinPanel(supabaseClient, currentUserPhone, currentUserName, previousScreen = 'ropScreen') {
  finSupabaseClient = supabaseClient;
  finCurrentUserPhone = currentUserPhone;
  finCurrentUserName = currentUserName;
  finPreviousScreen = previousScreen;

  // Установите период по умолчанию (последний месяц)
  const today = new Date();
  const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
  document.getElementById('finDateFrom').valueAsDate = monthAgo;
  document.getElementById('finDateTo').valueAsDate = today;

  // Обработчики
  document.getElementById('loadFinData').addEventListener('click', loadFinData);
  
  // Обработчик кнопки "Назад"
  document.getElementById('backToRopFromFin').addEventListener('click', () => {
    goBackToPreviousScreen();
  });

  // Инициализация фильтров
  initFilters();
  
  loadFinData(); // загрузить при старте
  
  // Настройка обработчика нажатия кнопки "Назад" в браузере
  setupBrowserBackButton();
}

// Функция для настройки обработчика кнопки "Назад" браузера
function setupBrowserBackButton() {
  // Сохраняем текущее состояние
  if (window.history && window.history.pushState) {
    // Добавляем новое состояние в историю
    window.history.pushState({ screen: 'finScreen' }, 'Панель финансиста');
    
    // Обработчик события popstate (нажатие кнопки "Назад" в браузере)
    window.addEventListener('popstate', function(event) {
      if (document.getElementById('finScreen').style.display !== 'none') {
        // Если мы на экране финансиста - возвращаемся на предыдущий экран
        goBackToPreviousScreen();
        
        // Предотвращаем стандартное поведение браузера
        if (event.state && event.state.screen === 'finScreen') {
          window.history.back(); // Убираем добавленное состояние
        }
      }
    });
  }
}

// Функция возврата на предыдущий экран
function goBackToPreviousScreen() {
  document.getElementById('finScreen').style.display = 'none';
  
  // Показываем предыдущий экран в зависимости от того, откуда пришли
  if (finPreviousScreen === 'ropScreen') {
    document.getElementById('ropScreen').style.display = 'block';
    
    // Если на экране ROP есть функция для обновления данных - вызываем ее
    if (typeof loadRopData === 'function') {
      loadRopData();
    }
  } else if (finPreviousScreen === 'adminScreen') {
    document.getElementById('adminScreen').style.display = 'block';
  } else if (finPreviousScreen === 'mainScreen') {
    document.getElementById('mainScreen').style.display = 'block';
  } else {
    // По умолчанию показываем главный экран
    document.getElementById('mainScreen').style.display = 'block';
  }
  
  // Обновляем историю браузера
  if (window.history && window.history.pushState) {
    window.history.pushState({ screen: finPreviousScreen }, 'Предыдущий экран');
  }
}

function initFilters() {
  // Сохраняем выбранные значения перед обновлением
  const managerFilter = document.getElementById('finManagerFilter');
  const segmentFilter = document.getElementById('finSegmentFilter');
  
  const savedManager = managerFilter.value;
  const savedSegment = segmentFilter.value;
  
  // Заполняем фильтры начальными значениями
  managerFilter.innerHTML = '<option value="">Все менеджеры</option>';
  segmentFilter.innerHTML = '<option value="">Все сегменты</option>';
  
  // Восстанавливаем значения
  if (savedManager) {
    setTimeout(() => {
      managerFilter.value = savedManager;
    }, 0);
  }
  
  if (savedSegment) {
    setTimeout(() => {
      segmentFilter.value = savedSegment;
    }, 0);
  }
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
    let deals = [];
    const { data: dealsData, error: dealsError } = await finSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount')
      .gte('created_at', dateFrom)
      .lte('created_at', dateTo + 'T23:59:59');

    if (dealsError) {
      console.error('Ошибка загрузки сделок:', dealsError);
      alert('Ошибка: ' + dealsError.message);
      return;
    }
    if (dealsData && Array.isArray(dealsData)) {
      deals = dealsData;
    }

    // Загружаем фактические расходы
    let expenses = [];
    const { data: expensesData, error: expError } = await finSupabaseClient
      .from('finance_expenses')
      .select('crm_id, fact_expenses');

    if (expError) {
      console.error('Ошибка загрузки расходов:', expError);
      alert('Ошибка: ' + expError.message);
      return;
    }
    if (expensesData && Array.isArray(expensesData)) {
      expenses = expensesData;
    }

    // Карта расходов
    const expMap = {};
    expenses.forEach(e => {
      if (e && e.crm_id) {
        expMap[e.crm_id] = e.fact_expenses || 0;
      }
    });

    // Словарь для отображения сегментов
    const segmentLabels = {
      'to': 'ТО',
      'pto': 'ПТО', 
      'eq': 'Оборудование',
      'comp': 'Комплектующие',
      'rep': 'Ремонты',
      'rent': 'Аренда'
    };

    // Получаем текущие значения фильтров
    const managerFilter = document.getElementById('finManagerFilter');
    const segmentFilter = document.getElementById('finSegmentFilter');
    
    const currentManager = managerFilter.value;
    const currentSegment = segmentFilter.value;
    
    // Собираем уникальных менеджеров из всех сделок за период
    let allManagerNames = [];
    if (deals.length > 0) {
      allManagerNames = [...new Set(deals.map(d => d.manager_name).filter(Boolean))];
    }
    
    // Собираем уникальные сегменты из всех сделок за период
    let allSegmentTypes = [];
    if (deals.length > 0) {
      allSegmentTypes = [...new Set(deals.map(d => d.deal_type).filter(Boolean))];
    }

    // Обновляем фильтр менеджеров, сохраняя текущее значение
    managerFilter.innerHTML = '<option value="">Все менеджеры</option>';
    allManagerNames.sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === currentManager) {
        opt.selected = true;
      }
      managerFilter.appendChild(opt);
    });

    // Обновляем фильтр сегментов, сохраняя текущее значение
    segmentFilter.innerHTML = '<option value="">Все сегменты</option>';
    allSegmentTypes.sort().forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      opt.textContent = segmentLabels[type] || type;
      if (type === currentSegment) {
        opt.selected = true;
      }
      segmentFilter.appendChild(opt);
    });

    // Применяем фильтры к данным
    let filteredDeals = deals.slice();
    
    // Фильтр по менеджеру
    if (currentManager) {
      filteredDeals = filteredDeals.filter(d => d.manager_name === currentManager);
    }
    
    // Фильтр по сегменту
    if (currentSegment) {
      filteredDeals = filteredDeals.filter(d => d.deal_type === currentSegment);
    }

    // Заполняем таблицу
    const tbody = document.getElementById('finDealsBody');
    tbody.innerHTML = '';

    if (filteredDeals.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="8" style="padding:20px; text-align:center; border:1px solid #ddd;">
          Нет данных для выбранных фильтров.
        </td>
      `;
      tbody.appendChild(row);
    } else {
      // Считаем итоги
      let totalContract = 0;
      let totalTheorMargin = 0;
      let totalFactExpenses = 0;
      let totalFactMargin = 0;

      filteredDeals.forEach(deal => {
        const contractAmount = deal.contract_amount || 0;
        const dealType = deal.deal_type || '';
        const factExpenses = expMap[deal.crm_id] || 0;

        // Расчёт теоретической маржи
        let theorMargin = 0;
        if (dealType === 'to' || dealType === 'pto' || dealType === 'rent') {
          theorMargin = contractAmount * 0.7;
        } else if (dealType === 'eq') {
          theorMargin = contractAmount * 0.2;
        } else if (dealType === 'comp') {
          theorMargin = contractAmount * 0.3;
        } else if (dealType === 'rep') {
          theorMargin = contractAmount * 0.4;
        }

        const factMargin = contractAmount - factExpenses;
        const deviation = theorMargin > 0 
          ? ((theorMargin - factMargin) / theorMargin * 100).toFixed(1)
          : 0;

        // Обновляем итоги
        totalContract += contractAmount;
        totalTheorMargin += theorMargin;
        totalFactExpenses += factExpenses;
        totalFactMargin += factMargin;

        // Человекочитаемый сегмент
        const segmentLabel = segmentLabels[dealType] || 'Неизвестный';

        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="padding:8px; border:1px solid #ddd;">${deal.crm_id || '-'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${deal.manager_name || '-'}</td>
          <td style="padding:8px; border:1px solid #ddd;">${segmentLabel}</td>
          <td style="padding:8px; border:1px solid #ddd;">${theorMargin.toLocaleString('ru-RU')} ₽</td>
          <td style="padding:8px; border:1px solid #ddd;">
            <input type="number" class="factExpensesInput" 
                   data-crm-id="${deal.crm_id || ''}" 
                   value="${factExpenses}" 
                   placeholder="0"
                   style="width:100px; padding:4px;">
          </td>
          <td style="padding:8px; border:1px solid #ddd;">${factMargin.toLocaleString('ru-RU')} ₽</td>
          <td style="padding:8px; border:1px solid #ddd; color:${deviation > 0 ? '#ff4d4f' : '#52c41a'};">
            ${deviation > 0 ? '+' : ''}${deviation}%
          </td>
          <td style="padding:8px; border:1px solid #ddd;">
            <button class="applyExpenseBtn" data-crm-id="${deal.crm_id || ''}" 
                    style="background:#52c41a; color:white; border:none; padding:4px 8px; border-radius:4px;">
              Применить
            </button>
          </td>
        `;
        tbody.appendChild(row);
      });

      // Добавляем строку с итогами
      const totalDeviation = totalTheorMargin > 0 
        ? ((totalTheorMargin - totalFactMargin) / totalTheorMargin * 100).toFixed(1)
        : 0;
      
      const totalRow = document.createElement('tr');
      totalRow.style.fontWeight = 'bold';
      totalRow.style.backgroundColor = '#f9f9f9';
      totalRow.innerHTML = `
        <td colspan="2" style="padding:8px; border:1px solid #ddd;">ИТОГО:</td>
        <td style="padding:8px; border:1px solid #ddd;">${filteredDeals.length} сделок</td>
        <td style="padding:8px; border:1px solid #ddd;">${totalTheorMargin.toLocaleString('ru-RU')} ₽</td>
        <td style="padding:8px; border:1px solid #ddd;">${totalFactExpenses.toLocaleString('ru-RU')} ₽</td>
        <td style="padding:8px; border:1px solid #ddd;">${totalFactMargin.toLocaleString('ru-RU')} ₽</td>
        <td style="padding:8px; border:1px solid #ddd; color:${totalDeviation > 0 ? '#ff4d4f' : '#52c41a'};">
          ${totalDeviation > 0 ? '+' : ''}${totalDeviation}%
        </td>
        <td style="padding:8px; border:1px solid #ddd;"></td>
      `;
      tbody.appendChild(totalRow);
    }

    document.getElementById('finDealsTable').style.display = 'block';

    // Обработчик кнопок "Применить"
    document.querySelectorAll('.applyExpenseBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const crmId = btn.getAttribute('data-crm-id');
        if (!crmId) {
          alert('CRM ID не найден');
          return;
        }
        const input = document.querySelector(`.factExpensesInput[data-crm-id="${crmId}"]`);
        if (!input) {
          alert('Поле расходов не найдено');
          return;
        }
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
    console.error('Неожиданная ошибка:', error);
    alert('Произошла непредвиденная ошибка. Проверьте консоль.');
  }
}

// Добавляем обработчики для фильтров после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
  const managerFilter = document.getElementById('finManagerFilter');
  const segmentFilter = document.getElementById('finSegmentFilter');
  
  if (managerFilter) {
    managerFilter.addEventListener('change', loadFinData);
  }
  
  if (segmentFilter) {
    segmentFilter.addEventListener('change', loadFinData);
  }
});
