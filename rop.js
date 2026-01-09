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
    const totalMarginEl = document.getElementById('totalMarginRop');
    const ropBonusEl = document.getElementById('ropBonus');
    const totalDealsEl = document.getElementById('totalDealsRop');
    const planBar = document.getElementById('ropPlanBar');
    const planPercentEl = document.getElementById('ropPlanPercent');
    const summary = document.getElementById('ropSummary');
    const planProgress = document.getElementById('ropPlanProgress');

    if (totalMarginEl) totalMarginEl.textContent = totalMargin.toLocaleString('ru-RU');
    if (ropBonusEl) ropBonusEl.textContent = ropBonus.toLocaleString('ru-RU');
    if (totalDealsEl) totalDealsEl.textContent = filteredData.length;
    if (planBar) planBar.style.width = planPercent + '%';
    if (planPercentEl) planPercentEl.textContent = planPercent.toFixed(1) + '%';
    if (summary) summary.style.display = 'block';
    if (planProgress) planProgress.style.display = 'block';

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

      const table = document.getElementById('ropDealsTable');
      if (table) table.style.display = 'block';
    }
  } catch (error) {
    console.error('Ошибка в loadRopData:', error);
    alert('Ошибка: ' + error.message);
  }
  // ➕ Создание сделки от РОПа
function showRopCreateForm() {
  const crmId = prompt('Введите номер сделки из CRM:');
  if (!crmId) return;

  // Скрыть панель РОПа, показать форму
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  // Загрузить список менеджеров
  ropSupabaseClient
    .from('allowed_users')
    .select('name, role')
    .eq('role', 'manager')
    .order('name')
    .then(({ data, error }) => {
      if (error) {
        alert('Ошибка загрузки менеджеров: ' + error.message);
        return;
      }

      // Добавляем РОПа тоже (если нужно)
      data.push({ name: ropCurrentUserName, role: 'rop' });

      let managerOptions = '';
      data.forEach(user => {
        managerOptions += `<option value="${user.name}">${user.name}${user.role === 'rop' ? ' (РОП)' : ''}</option>`;
      });

      document.getElementById('formContainer').innerHTML = `
        <button id="backToRopBtn">← Назад к панели РОПа</button>
        <h3>Создать сделку: ${crmId}</h3>
        <label>Менеджер:</label>
        <select id="ropManagerName">${managerOptions}</select>
        <label>Сумма договора (₽):</label>
        <input type="number" id="ropContractAmount" placeholder="600000" required>
        <label>Сумма оплаты (₽):</label>
        <input type="number" id="ropPaymentAmount" placeholder="140000" required>
        <label>Тип сделки:</label>
        <select id="ropDealType">
          <option value="to">ТО</option>
          <option value="pto">ПТО</option>
          <option value="comp">Комплектующие</option>
          <option value="rep">Ремонты</option>
          <option value="eq">Оборудование</option>
          <option value="rent">Аренда</option>
        </select>
        <div id="ropArpuSection" style="display:none;">
          <label>ARPU (₽/мес):</label>
          <input type="number" id="ropArpu" placeholder="46666">
        </div>
        <div style="margin-top:15px;">
          <input type="checkbox" id="ropIsFirst"> 
          <label for="ropIsFirst">Первый платёж (ТО)?</label>
        </div>
        <div style="margin-top:10px;">
          <input type="checkbox" id="ropPaid"> 
          <label for="ropPaid">Оплачен?</label>
        </div>
        <div style="margin-top:10px;">
          <input type="checkbox" id="ropUpdSigned"> 
          <label for="ropUpdSigned">УПД подписан?</label>
        </div>
        <button id="ropCreateDealBtnFinal" class="btn-success" style="margin-top:15px;">Создать сделку</button>
        <div id="ropCreateFormResult" class="result" style="margin-top:10px;"></div>
      `;

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
          alert('Заполните все поля');
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
            bonus_paid: bonusPaid
          }]);

        if (error) {
          alert('Ошибка: ' + error.message);
          return;
        }

        document.getElementById('ropCreateFormResult').innerHTML = '✅ Сделка создана!';
        setTimeout(() => {
          document.getElementById('mainApp').style.display = 'none';
          document.getElementById('ropScreen').style.display = 'block';
          loadRopData(); // обновить данные
        }, 2000);
      });
    });
}
  // Кнопка перехода к финансисту
const goToFinBtn = document.getElementById('goToFin');
if (goToFinBtn) {
  goToFinBtn.addEventListener('click', () => {
    document.getElementById('ropScreen').style.display = 'none';
    document.getElementById('finScreen').style.display = 'block';
    
    if (!window.finModuleLoaded) {
      const script = document.createElement('script');
      script.src = 'fin.js';
      script.onload = () => {
        if (typeof initFinPanel === 'function') {
          initFinPanel(ropSupabaseClient, ropCurrentUserPhone, ropCurrentUserName);
        }
        window.finModuleLoaded = true;
      };
      document.head.appendChild(script);
    } else {
      initFinPanel(ropSupabaseClient, ropCurrentUserPhone, ropCurrentUserName);
    }
  });
}

// 🖊️ Редактирование сделки
async function showRopUpdateForm(crmId) {
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
  document.getElementById('mainApp').style.display = 'block';

  const deal = data;
  const typeLabels = {
    'to': 'ТО', 'pto': 'ПТО', 'eq': 'Оборудование',
    'comp': 'Комплектующие', 'rep': 'Ремонты', 'rent': 'Аренда'
  };

  document.getElementById('formContainer').innerHTML = `
    <button id="backToRopBtn">← Назад к панели РОПа</button>
    <h3>Редактировать сделку: ${crmId}</h3>
    <p><strong>Менеджер:</strong> ${deal.manager_name}</p>
    <p><strong>Тип:</strong> ${typeLabels[deal.deal_type] || deal.deal_type}</p>
    <p><strong>Договор:</strong> ${deal.contract_amount.toLocaleString('ru-RU')} ₽</p>
    <label>Новая сумма оплаты (₽):</label>
    <input type="number" id="ropPaymentAmount" value="${deal.total_paid}" placeholder="Например: 100000">
    <div style="margin-top:15px;">
      <input type="checkbox" id="ropPaid" ${deal.paid ? 'checked' : ''}> 
      <label for="ropPaid">Оплачен полностью</label>
    </div>
    <div style="margin-top:10px;">
      <input type="checkbox" id="ropUpdSigned" ${deal.up_signed ? 'checked' : ''}> 
      <label for="ropUpdSigned">УПД подписан</label>
    </div>
    <button id="saveRopDealBtn" class="btn-success" style="margin-top:15px;">Сохранить изменения</button>
    <div id="ropUpdateResult" class="result" style="margin-top:10px;"></div>
  `;

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
        bonus_paid: bonusPaid
      })
      .eq('crm_id', crmId);

    if (error) {
      alert('Ошибка: ' + error.message);
      return;
    }

    document.getElementById('ropUpdateResult').innerHTML = '✅ Изменения сохранены!';
    setTimeout(() => {
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
      loadRopData(); // обновить данные
    }, 2000);
  });
}

// 🔙 Универсальный "назад"
document.addEventListener('click', (e) => {
  if (e.target.id === 'backToRopBtn') {
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('ropScreen').style.display = 'block';
  }
  // Обработка редактирования из таблицы
  if (e.target.classList.contains('editDealBtn')) {
    const crmId = e.target.getAttribute('data-crm-id');
    showRopUpdateForm(crmId);
  }
});
}
