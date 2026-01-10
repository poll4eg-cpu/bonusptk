// rop.js — полная панель РОПа
let ropSupabaseClient = null;
let ropCurrentUserPhone = null;
let ropCurrentUserName = null;

function initRopPanel(supabaseClient, currentUserPhone, currentUserName) {
  console.log('РОП-панель инициализирована для:', currentUserName);
  
  ropSupabaseClient = supabaseClient;
  ropCurrentUserPhone = currentUserPhone;
  ropCurrentUserName = currentUserName;

  // Обработчики кнопок - с проверкой существования элементов
  const loadRopDataBtn = document.getElementById('loadRopData');
  const ropCreateDealBtn = document.getElementById('ropCreateDealBtn');
  const goToFinBtn = document.getElementById('goToFin');
  
  if (loadRopDataBtn) {
    loadRopDataBtn.addEventListener('click', loadRopData);
  }
  
  if (ropCreateDealBtn) {
    ropCreateDealBtn.addEventListener('click', showRopCreateForm);
  }
  
  if (goToFinBtn) {
    goToFinBtn.addEventListener('click', goToFinPanel);
    console.log('Обработчик кнопки финансиста установлен');
  } else {
    console.error('Кнопка goToFin не найдена в DOM');
  }

  // Загружаем начальные данные
  loadManagerList();
  loadRopData();
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
    if (managerSelect) {
      managerSelect.innerHTML = '<option value="">Все менеджеры</option>';
      managerNames.sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name.trim();
        opt.textContent = name.trim();
        managerSelect.appendChild(opt);
      });
    }
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
  console.log('Загрузка данных РОПа...');
  
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
    const managerFilter = document.getElementById('ropManagerFilter');
    const segmentFilter = document.getElementById('ropSegmentFilter');
    
    const managerValue = managerFilter ? managerFilter.value : '';
    const segmentValue = segmentFilter ? segmentFilter.value : '';

    const labelToType = {
      'ТО': 'to', 'ПТО': 'pto', 'Оборудование': 'eq',
      'Комплектующие': 'comp', 'Ремонты': 'rep', 'Аренда': 'rent'
    };

    let filteredData = data.filter(deal => deal.manager_name && deal.manager_name.trim() !== '');
    
    if (managerValue || segmentValue) {
      filteredData = filteredData.filter(deal => {
        const matchesManager = !managerValue || deal.manager_name.trim() === managerValue;
        const matchesSegment = !segmentValue || (labelToType[segmentValue] && deal.deal_type === labelToType[segmentValue]);
        return matchesManager && matchesSegment;
      });
    }

    // 💥 Загружаем ПОЛНЫЕ данные для расчёта маржи и премий
    let fullDeals = [];
    try {
      const { data: fullData, error: fullError } = await ropSupabaseClient
        .from('deals')
        .select('crm_id, deal_type, contract_amount, margin, paid, up_signed, is_first, arpu_input, annual_contract')
        .in('crm_id', filteredData.map(d => d.crm_id));

      if (fullError) throw fullError;
      if (fullData && Array.isArray(fullData)) {
        fullDeals = fullData;
      }
    } catch (err) {
      console.error('Ошибка загрузки полных данных:', err);
    }

    const dealMap = {};
    if (Array.isArray(fullDeals)) {
      fullDeals.forEach(d => dealMap[d.crm_id] = d);
    }

    // 🔥 Расчёт маржи отдела и премии РОПа
    let totalMargin = 0;
    filteredData.forEach(deal => {
      const fullDeal = dealMap[deal.crm_id];
      totalMargin += fullDeal?.margin || 0;
    });

    const cleanMargin = totalMargin * 0.78; // −22% НДС
    const ropBonus = Math.round(cleanMargin * 0.10); // 10%

    // 💡 План отдела
    const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
    const seasonalCoefficient = coefficients[now.getMonth()];
    const managersInData = [...new Set(filteredData.map(d => d.manager_name).filter(name => name))];
    const departmentPlan = managersInData.length * 800000 * seasonalCoefficient;
    const planPercent = Math.min(100, (totalMargin / departmentPlan) * 100);

    // 📊 Отображение итогов
    updateRopSummary(totalMargin, ropBonus, filteredData.length, planPercent);

    // 📋 Заполнение таблицы с премиями
    const tbody = document.getElementById('ropDealsBody');
    if (tbody) {
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
        <td><button class="editDealBtn" data-crm-id="${deal.crm_id}">✏️ Ред.</button></td>
      `;
        tbody.appendChild(row);
      });

      // Добавляем обработчики для кнопок редактирования
      addEditDealHandlers();
      
      const table = document.getElementById('ropDealsTable');
      if (table) table.style.display = 'block';
    }
  } catch (error) {
    console.error('Ошибка в loadRopData:', error);
    alert('Ошибка: ' + error.message);
  }
}

// Функция для обновления сводки РОПа
function updateRopSummary(totalMargin, ropBonus, totalDeals, planPercent) {
  const totalMarginEl = document.getElementById('totalMarginRop');
  const ropBonusEl = document.getElementById('ropBonus');
  const totalDealsEl = document.getElementById('totalDealsRop');
  const planBar = document.getElementById('ropPlanBar');
  const planPercentEl = document.getElementById('ropPlanPercent');
  const summary = document.getElementById('ropSummary');
  const planProgress = document.getElementById('ropPlanProgress');

  if (totalMarginEl) totalMarginEl.textContent = totalMargin.toLocaleString('ru-RU');
  if (ropBonusEl) ropBonusEl.textContent = ropBonus.toLocaleString('ru-RU');
  if (totalDealsEl) totalDealsEl.textContent = totalDeals;
  if (planBar) planBar.style.width = planPercent + '%';
  if (planPercentEl) planPercentEl.textContent = planPercent.toFixed(1) + '%';
  if (summary) summary.style.display = 'block';
  if (planProgress) planProgress.style.display = 'block';
}

// Добавление обработчиков для кнопок редактирования
function addEditDealHandlers() {
  const editButtons = document.querySelectorAll('.editDealBtn');
  editButtons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const crmId = this.getAttribute('data-crm-id');
      if (crmId) {
        showRopUpdateForm(crmId);
      }
    });
  });
}

// ➕ Создание сделки от РОПа
async function showRopCreateForm() {
  console.log('Показать форму создания сделки');
  
  const crmId = prompt('Введите номер сделки из CRM:');
  if (!crmId) return;

  // 🔍 Проверка на дубликат ДО показа формы
  try {
    const {  existingDeal } = await ropSupabaseClient
      .from('deals')
      .select('crm_id')
      .eq('crm_id', crmId)
      .maybeSingle();

    if (existingDeal) {
      alert('Сделка с таким CRM ID уже существует!');
      return;
    }
  } catch (error) {
    console.error('Ошибка проверки дубликата:', error);
    alert('Не удалось проверить CRM ID. Попробуйте позже.');
    return;
  }

  // Скрыть панель РОПа, показать форму
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('createDealForm').style.display = 'block';

  // Загрузить список менеджеров
  try {
    const { data, error } = await ropSupabaseClient
      .from('allowed_users')
      .select('name, role')
      .eq('role', 'manager')
      .order('name');

    if (error) {
      alert('Ошибка загрузки менеджеров: ' + error.message);
      document.getElementById('createDealForm').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
      return;
    }

    // Добавляем РОПа тоже (если нужно)
    const managers = [...data];
    managers.push({ name: ropCurrentUserName, role: 'rop' });

    let managerOptions = '';
    managers.forEach(user => {
      managerOptions += `<option value="${user.name}">${user.name}${user.role === 'rop' ? ' (РОП)' : ''}</option>`;
    });

    document.getElementById('createDealForm').innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; margin: 20px auto;">
        <button id="backToRopFromCreate" style="margin-bottom: 20px;">← Назад к панели РОПа</button>
        <h3>Создать сделку: ${crmId}</h3>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">Менеджер:</label>
          <select id="ropManagerName" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            ${managerOptions}
          </select>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">Сумма договора (₽):</label>
          <input type="number" id="ropContractAmount" placeholder="600000" required 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">Сумма оплаты (₽):</label>
          <input type="number" id="ropPaymentAmount" placeholder="140000" required 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">Тип сделки:</label>
          <select id="ropDealType" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="to">ТО</option>
            <option value="pto">ПТО</option>
            <option value="comp">Комплектующие</option>
            <option value="rep">Ремонты</option>
            <option value="eq">Оборудование</option>
            <option value="rent">Аренда</option>
          </select>
        </div>
        
        <div id="ropArpuSection" style="margin-bottom: 15px; display:none;">
          <label style="display: block; margin-bottom: 5px;">ARPU (₽/мес):</label>
          <input type="number" id="ropArpu" placeholder="46666" 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <input type="checkbox" id="ropIsFirst" style="margin-right: 8px;"> 
          <label for="ropIsFirst">Первый платёж (ТО)?</label>
        </div>
        
        <div style="margin-bottom: 15px;">
          <input type="checkbox" id="ropPaid" style="margin-right: 8px;"> 
          <label for="ropPaid">Оплачен?</label>
        </div>
        
        <div style="margin-bottom: 20px;">
          <input type="checkbox" id="ropUpdSigned" style="margin-right: 8px;"> 
          <label for="ropUpdSigned">УПД подписан?</label>
        </div>
        
        <div style="display: flex; gap: 10px;">
          <button id="ropCreateDealBtnFinal" class="btn-success" style="flex: 1; padding: 10px;">Создать сделку</button>
          <button id="cancelCreateDeal" class="btn-secondary" style="flex: 1; padding: 10px;">Отмена</button>
        </div>
        
        <div id="ropCreateFormResult" class="result" style="margin-top: 15px; padding: 10px; border-radius: 4px;"></div>
      </div>
    `;

    // Обработчики
    document.getElementById('backToRopFromCreate').addEventListener('click', () => {
      document.getElementById('createDealForm').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
    });

    document.getElementById('cancelCreateDeal').addEventListener('click', () => {
      document.getElementById('createDealForm').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
    });

    // ARPU для ТО
    document.getElementById('ropDealType').addEventListener('change', () => {
      const isTO = document.getElementById('ropDealType').value === 'to';
      document.getElementById('ropArpuSection').style.display = isTO ? 'block' : 'none';
    });

    // Создание сделки
    document.getElementById('ropCreateDealBtnFinal').addEventListener('click', async () => {
      const managerName = document.getElementById('ropManagerName').value;
      const contractAmount = parseFloat(document.getElementById('ropContractAmount').value);
      const paymentAmount = parseFloat(document.getElementById('ropPaymentAmount').value);
      const dealType = document.getElementById('ropDealType').value;
      const arpuInput = document.getElementById('ropArpu').value;
      const isFirst = document.getElementById('ropIsFirst').checked;
      const paid = document.getElementById('ropPaid').checked;
      const upSigned = document.getElementById('ropUpdSigned').checked;

      if (!managerName || isNaN(contractAmount) || isNaN(paymentAmount)) {
        alert('Заполните все обязательные поля');
        return;
      }

      const isFullyPaid = paymentAmount >= contractAmount;
      let margin = 0;
      if (dealType === 'to' || dealType === 'pto' || dealType === 'rent') {
        margin = contractAmount * 0.7;
      } else if (dealType === 'eq') {
        margin = contractAmount * 0.2;
      } else if (dealType === 'comp' || dealType === 'rep') {
        margin = contractAmount * 0.3;
      }

      let bonusPaid = 0;
      if (isFullyPaid && paid && upSigned) {
        let revenueForBonus = contractAmount;
        if (dealType === 'to') {
          const arpuValue = arpuInput ? parseFloat(arpuInput) : contractAmount / 12;
          revenueForBonus = arpuValue;
        }
        bonusPaid = calculateBonus(dealType, revenueForBonus, isFirst, true, upSigned, false);
      }

      try {
        const { error } = await ropSupabaseClient
          .from('deals')
          .insert([{
            crm_id: crmId,
            manager_name: managerName,
            deal_type: dealType,
            contract_amount: contractAmount,
            total_paid: paymentAmount,
            paid: isFullyPaid,
            up_signed: upSigned,
            is_first: isFirst,
            arpu_input: dealType === 'to' ? (arpuInput ? parseFloat(arpuInput) : null) : null,
            margin: margin,
            bonus_paid: bonusPaid,
            created_by: ropCurrentUserName,
            created_at: new Date().toISOString()
          }]);

        if (error) throw error;

        document.getElementById('ropCreateFormResult').innerHTML = 
          `<div style="background: #efe; color: #090; padding: 10px; border-radius: 4px;">
            ✅ Сделка создана успешно!
          </div>`;
        
        setTimeout(() => {
          document.getElementById('createDealForm').style.display = 'none';
          document.getElementById('ropScreen').style.display = 'block';
          loadRopData(); // обновить данные
        }, 2000);
      } catch (err) {
        console.error('Ошибка при создании сделки:', err);
        document.getElementById('ropCreateFormResult').innerHTML = 
          `<div style="background: #fee; color: #c00; padding: 10px; border-radius: 4px;">
            ❌ Ошибка: ${err.message || 'Неизвестная ошибка'}
          </div>`;
      }
    });
  } catch (error) {
    console.error('Ошибка при создании формы:', error);
    alert('Ошибка: ' + error.message);
    document.getElementById('createDealForm').style.display = 'none';
    document.getElementById('ropScreen').style.display = 'block';
  }
}

// 🖊️ Редактирование сделки
async function showRopUpdateForm(crmId) {
  console.log('Редактирование сделки:', crmId);
  
  try {
    const { data, error } = await ropSupabaseClient
      .from('deals')
      .select('*')
      .eq('crm_id', crmId)
      .single();

    if (error || !data) {
      alert('Ошибка загрузки сделки');
      return;
    }

    document.getElementById('ropScreen').style.display = 'none';
    document.getElementById('editDealForm').style.display = 'block';

    const deal = data;
    const typeLabels = {
      'to': 'ТО', 'pto': 'ПТО', 'eq': 'Оборудование',
      'comp': 'Комплектующие', 'rep': 'Ремонты', 'rent': 'Аренда'
    };

    document.getElementById('editDealForm').innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; margin: 20px auto;">
        <button id="backToRopFromEdit" style="margin-bottom: 20px;">← Назад к панели РОПа</button>
        <h3>Редактировать сделку: ${crmId}</h3>
        
        <div style="margin-bottom: 15px;">
          <p><strong>Менеджер:</strong> ${deal.manager_name}</p>
          <p><strong>Тип:</strong> ${typeLabels[deal.deal_type] || deal.deal_type}</p>
          <p><strong>Договор:</strong> ${deal.contract_amount.toLocaleString('ru-RU')} ₽</p>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">Новая сумма оплаты (₽):</label>
          <input type="number" id="ropPaymentAmount" value="${deal.total_paid}" 
                 placeholder="Например: 100000" 
                 style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div style="margin-bottom: 15px;">
          <input type="checkbox" id="ropPaid" ${deal.paid ? 'checked' : ''} style="margin-right: 8px;"> 
          <label for="ropPaid">Оплачен полностью</label>
        </div>
        
        <div style="margin-bottom: 20px;">
          <input type="checkbox" id="ropUpdSigned" ${deal.up_signed ? 'checked' : ''} style="margin-right: 8px;"> 
          <label for="ropUpdSigned">УПД подписан</label>
        </div>
        
        <div style="display: flex; gap: 10px;">
          <button id="saveRopDealBtn" class="btn-success" style="flex: 1; padding: 10px;">Сохранить изменения</button>
          <button id="cancelEditDeal" class="btn-secondary" style="flex: 1; padding: 10px;">Отмена</button>
        </div>
        
        <div id="ropUpdateResult" class="result" style="margin-top: 15px; padding: 10px; border-radius: 4px;"></div>
      </div>
    `;

    // Обработчики
    document.getElementById('backToRopFromEdit').addEventListener('click', () => {
      document.getElementById('editDealForm').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
    });

    document.getElementById('cancelEditDeal').addEventListener('click', () => {
      document.getElementById('editDealForm').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
    });

    document.getElementById('saveRopDealBtn').addEventListener('click', async () => {
      const newPayment = parseFloat(document.getElementById('ropPaymentAmount').value) || deal.total_paid;
      const newPaid = document.getElementById('ropPaid').checked;
      const newUpd = document.getElementById('ropUpdSigned').checked;

      const isFullyPaid = newPayment >= deal.contract_amount;

      // Пересчёт премии
      let bonusPaid = deal.bonus_paid;
      if (isFullyPaid && newPaid && newUpd && !deal.bonus_paid) {
        let revenueForBonus = deal.contract_amount;
        if (deal.deal_type === 'to') {
          const arpuValue = deal.arpu_input || deal.contract_amount / 12;
          revenueForBonus = arpuValue;
        }
        bonusPaid = calculateBonus(deal.deal_type, revenueForBonus, deal.is_first, true, newUpd, deal.annual_contract);
      } else if (!newPaid || !newUpd) {
        bonusPaid = 0; // если сняли галочку — премия аннулируется
      }

      const { error } = await ropSupabaseClient
        .from('deals')
        .update({
          total_paid: newPayment,
          paid: isFullyPaid,
          up_signed: newUpd,
          bonus_paid: bonusPaid,
          updated_by: ropCurrentUserName,
          updated_at: new Date().toISOString()
        })
        .eq('crm_id', crmId);

      if (error) {
        document.getElementById('ropUpdateResult').innerHTML = 
          `<div style="background: #fee; color: #c00; padding: 10px; border-radius: 4px;">
            ❌ Ошибка: ${error.message}
          </div>`;
        return;
      }

      document.getElementById('ropUpdateResult').innerHTML = 
        `<div style="background: #efe; color: #090; padding: 10px; border-radius: 4px;">
          ✅ Изменения сохранены!
        </div>`;
      
      setTimeout(() => {
        document.getElementById('editDealForm').style.display = 'none';
        document.getElementById('ropScreen').style.display = 'block';
        loadRopData(); // обновить данные
      }, 2000);
    });
  } catch (error) {
    console.error('Ошибка при редактировании:', error);
    alert('Ошибка: ' + error.message);
    document.getElementById('editDealForm').style.display = 'none';
    document.getElementById('ropScreen').style.display = 'block';
  }
}

// Переход к панели финансиста
async function goToFinPanel() {
  console.log('Переход к панели финансиста');
  
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('finScreen').style.display = 'block';
  
  // Проверяем, загружен ли модуль финансиста
  if (typeof initFinPanel === 'function') {
    console.log('Модуль финансиста уже загружен, вызываем initFinPanel');
    initFinPanel(ropSupabaseClient, ropCurrentUserPhone, ropCurrentUserName);
  } else {
    console.log('Модуль финансиста не загружен, загружаем fin.js...');
    
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'fin.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Не удалось загрузить fin.js'));
        document.head.appendChild(script);
      });
      
      if (typeof initFinPanel === 'function') {
        console.log('fin.js загружен, вызываем initFinPanel');
        initFinPanel(ropSupabaseClient, ropCurrentUserPhone, ropCurrentUserName);
      } else {
        throw new Error('Функция initFinPanel не найдена после загрузки fin.js');
      }
    } catch (error) {
      console.error('Ошибка загрузки панели финансиста:', error);
      alert('Не удалось загрузить панель финансиста: ' + error.message);
      
      // Возвращаемся к РОПу
      document.getElementById('finScreen').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
    }
  }
}

// Экспорт функции для глобального использования
if (typeof window !== 'undefined') {
  window.initRopPanel = initRopPanel;
  console.log('initRopPanel экспортирована в window');
}
