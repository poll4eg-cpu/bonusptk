// manager.js — полный изолированный модуль менеджера
let managerSupabaseClient = null;
let managerCurrentUserPhone = null;
let managerCurrentUserName = null;
let currentCrmId = null;

function initManagerPanel(supabaseClient, currentUserPhone, currentUserName) {
  console.log('Менеджер инициализирован:', currentUserName);
  managerSupabaseClient = supabaseClient;
  managerCurrentUserPhone = currentUserPhone;
  managerCurrentUserName = currentUserName;

  // Обработчики
  document.getElementById('checkCrmBtn')?.addEventListener('click', checkCrmId);
  document.getElementById('checkMonthBtn')?.addEventListener('click', loadMonthBonus);
  document.getElementById('feedbackBtn')?.addEventListener('click', toggleFeedback);
  document.getElementById('sendFeedbackBtn')?.addEventListener('click', sendFeedback);

  function toggleFeedback() {
    const form = document.getElementById('feedbackForm');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }

  async function checkCrmId() {
    const crmId = document.getElementById('inputCrmId')?.value.trim();
    if (!crmId) return showError('crmError', 'Введите номер сделки');
    
    currentCrmId = crmId; // Сохраняем для создания сделки

    try {
      const { data, error } = await managerSupabaseClient
        .from('deals')
        .select('*')
        .eq('crm_id', crmId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        showUpdateForm(data);
      } else {
        showCreateForm(crmId);
      }
    } catch (err) {
      showError('crmError', 'Ошибка: ' + (err.message || err));
    }
  }

  async function loadMonthBonus() {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const { data, error } = await managerSupabaseClient
        .from('deals')
        .select('crm_id, deal_type, contract_amount, total_paid, paid, up_signed, bonus_paid, created_at')
        .eq('manager_name', managerCurrentUserName)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (error) throw error;
      renderBonusReport(data || [], now);
    } catch (err) {
      console.error('Ошибка расчёта премии:', err);
      alert('Не удалось загрузить премию');
    }
  }

  async function sendFeedback() {
    const msg = document.getElementById('feedbackText')?.value.trim();
    if (!msg) return alert('Введите сообщение');

    try {
      const { error } = await managerSupabaseClient
        .from('feedback')
        .insert([{ 
          phone: managerCurrentUserPhone, 
          message: msg, 
          created_at: new Date().toISOString() 
        }]);
      if (error) throw error;
      alert('✅ Сообщение отправлено!');
      document.getElementById('feedbackText').value = '';
      document.getElementById('feedbackForm').style.display = 'none';
    } catch (err) {
      alert('Ошибка отправки: ' + (err.message || err));
    }
  }

  // === ФОРМА СОЗДАНИЯ ===
  function showCreateForm(crmId) {
    document.getElementById('crmScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    const container = document.getElementById('formContainer');
    if (!container) return showError('crmError', 'Форма не найдена');

    container.innerHTML = `
      <button id="backBtn">← Назад к CRM ID</button>
      <h3><i class="fas fa-plus-circle"></i> Создать сделку: ${crmId}</h3>
      <label>Ваше имя (автоматически):</label>
      <input type="text" id="manager_name" value="${managerCurrentUserName || ''}" readonly>
      <label>Сумма договора (₽):</label>
      <input type="number" id="contract_amount" placeholder="700000" required>
      <label>Сумма предоплаты (₽):</label>
      <input type="number" id="payment_amount" placeholder="140000" required>
      <label>Тип сделки:</label>
      <select id="deal_type">
        <option value="to">ТО</option>
        <option value="pto">ПТО</option>
        <option value="comp">Комплектующие</option>
        <option value="rep">Ремонты</option>
        <option value="eq">Оборудование</option>
        <option value="rent">Аренда</option>
      </select>
      <div id="arpuSection" style="display:none;">
        <label>ARPU (₽/мес):</label>
        <input type="number" id="arpu" placeholder="46666">
      </div>
      <div style="margin-top:15px;">
        <input type="checkbox" id="is_first"> 
        <label for="is_first">Первый платёж (ТО)?</label>
      </div>
      <div style="margin-top:10px;">
        <input type="checkbox" id="paid"> 
        <label for="paid">Оплачен?</label>
      </div>
      <div style="margin-top:10px;">
        <input type="checkbox" id="up_signed"> 
        <label for="up_signed">УПД подписан?</label>
      </div>
      <button id="createDealBtn" class="btn-success">Создать сделку</button>
      <div id="createFormResult" class="result"></div>
    `;

    // ARPU для ТО
    document.getElementById('deal_type').addEventListener('change', () => {
      const isTO = document.getElementById('deal_type').value === 'to';
      document.getElementById('arpuSection').style.display = isTO ? 'block' : 'none';
    });
    document.getElementById('deal_type').dispatchEvent(new Event('change'));

    // Создание
    document.getElementById('createDealBtn').addEventListener('click', createDeal);
    document.getElementById('backBtn').addEventListener('click', () => {
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('crmScreen').style.display = 'block';
    });
  }

  async function createDeal() {
    const managerName = document.getElementById('manager_name').value.trim();
    const contractAmount = parseFloat(document.getElementById('contract_amount').value);
    const paymentAmount = parseFloat(document.getElementById('payment_amount').value);
    const dealType = document.getElementById('deal_type').value;
    const arpuInput = document.getElementById('arpu')?.value;
    const isFirst = document.getElementById('is_first').checked;
    const paid = document.getElementById('paid').checked;
    const upSigned = document.getElementById('up_signed').checked;

    if (!managerName || isNaN(contractAmount) || isNaN(paymentAmount)) {
      return alert('Заполните все обязательные поля');
    }

    const totalPaid = paymentAmount;
    const isFullyPaid = paid && totalPaid >= contractAmount;
    let bonusPaid = 0;

    if (isFullyPaid && upSigned) {
      let revenueForBonus = contractAmount;
      if (dealType === 'to') {
        const arpuValue = arpuInput ? parseFloat(arpuInput) : contractAmount / 12;
        revenueForBonus = arpuValue;
      }
      bonusPaid = calculateBonus(dealType, revenueForBonus, isFirst, true, upSigned, false);
    }

    const margin = 
      dealType === 'to' || dealType === 'pto' || dealType === 'rent' ? contractAmount * 0.7 :
      dealType === 'eq' ? contractAmount * 0.2 :
      dealType === 'comp' ? contractAmount * 0.3 :
      dealType === 'rep' ? contractAmount * 0.4 : 0;

    try {
      const { error } = await managerSupabaseClient
        .from('deals')
        .insert([{
          crm_id: currentCrmId,
          manager_name: managerName,
          deal_type: dealType,
          contract_amount: contractAmount,
          total_paid: totalPaid,
          paid: isFullyPaid,
          up_signed: upSigned,
          is_first: isFirst,
          arpu_input: dealType === 'to' ? (arpuInput ? parseFloat(arpuInput) : null) : null,
          margin: margin,
          bonus_paid: bonusPaid,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }]);

      if (error) throw error;

      document.getElementById('createFormResult').innerHTML = `
        <div style="color:green; background:#f0fff4; padding:12px; border-radius:6px;">
          ✅ Сделка создана успешно!<br>
          ${bonusPaid > 0 ? `Премия: <strong>${bonusPaid.toLocaleString('ru-RU')} ₽</strong>` : 'Премия будет начислена после полной оплаты и подписания УПД'}
        </div>
      `;
      document.getElementById('createFormResult').style.display = 'block';
      
      // Очистка поля CRM ID
      document.getElementById('inputCrmId').value = '';
      
    } catch (err) {
      alert('Ошибка: ' + (err.message || err));
    }
  }

  // === ФОРМА ОБНОВЛЕНИЯ ===
  function showUpdateForm(deal) {
    const { crm_id, contract_amount, total_paid, up_signed, paid, manager_name, deal_type, is_first, arpu_input, annual_contract } = deal;
    const remaining = contract_amount - total_paid;

    document.getElementById('crmScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    const container = document.getElementById('formContainer');
    if (!container) return showError('crmError', 'Форма не найдена');

    container.innerHTML = `
      <button id="backBtn">← Назад к CRM ID</button>
      <h3><i class="fas fa-edit"></i> Обновить сделку: ${crm_id}</h3>
      <p><strong>Менеджер:</strong> ${manager_name}</p>
      <p><strong>Тип:</strong> ${dealTypeLabel(deal_type)}</p>
      <p><strong>Сумма договора:</strong> ${contract_amount.toLocaleString('ru-RU')} ₽</p>
      <p><strong>Уже оплачено:</strong> ${total_paid.toLocaleString('ru-RU')} ₽</p>
      <p style="color:${remaining <= 0 ? 'green' : 'orange'};">
        <strong>Осталось оплатить:</strong> ${Math.max(0, remaining).toLocaleString('ru-RU')} ₽
      </p>
      <p><strong>УПД:</strong> ${up_signed ? '✅ Подписан' : '❌ Не подписан'}</p>
      <p><strong>Статус оплаты:</strong> ${paid ? '✅ 100%' : '⏳ Частичная'}</p>

      ${!paid ? `
        <label>Сумма нового платежа (₽):</label>
        <input type="number" id="additional_payment" placeholder="Например: 100000" min="1">
      ` : ''}

      ${!up_signed ? `
        <div style="margin-top:15px;">
          <input type="checkbox" id="update_up_signed">
          <label for="update_up_signed">Отметить УПД как подписанный</label>
        </div>
      ` : '<p>✅ УПД уже подписан</p>'}

      <button id="updateDealBtn" class="btn-success">Обновить сделку</button>
      <div id="updateFormResult" class="result"></div>
    `;

    document.getElementById('updateDealBtn').addEventListener('click', () => updateDeal(deal));
    document.getElementById('backBtn').addEventListener('click', () => {
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('crmScreen').style.display = 'block';
    });
  }

  async function updateDeal(deal) {
    const additionalPayment = parseFloat(document.getElementById('additional_payment')?.value || 0);
    const newUpSigned = document.getElementById('update_up_signed')?.checked || deal.up_signed;
    const { crm_id, contract_amount, total_paid, paid, deal_type, is_first, arpu_input, annual_contract } = deal;

    if (paid && deal.up_signed === newUpSigned && additionalPayment <= 0) {
      return alert('Нечего обновлять');
    }
    
    if (!paid && (isNaN(additionalPayment) || additionalPayment <= 0)) {
      return alert('Введите корректную сумму платежа');
    }

    let newTotalPaid = total_paid;
    let newPaid = paid;
    let bonusPaid = deal.bonus_paid || 0;

    if (!paid) {
      newTotalPaid += additionalPayment;
      newPaid = newTotalPaid >= contract_amount;
      if (newPaid && bonusPaid === 0) {
        let revenueForBonus = contract_amount;
        if (deal_type === 'to') {
          const arpuValue = arpu_input || contract_amount / 12;
          revenueForBonus = arpuValue;
        }
        bonusPaid = calculateBonus(deal_type, revenueForBonus, is_first, true, newUpSigned, annual_contract);
      }
    }

    try {
      const { error } = await managerSupabaseClient
        .from('deals')
        .update({
          total_paid: newTotalPaid,
          paid: newPaid,
          up_signed: newUpSigned,
          bonus_paid: bonusPaid,
          updated_at: new Date().toISOString()
        })
        .eq('crm_id', crm_id);

      if (error) throw error;

      document.getElementById('updateFormResult').innerHTML = `
        <div style="color:green; background:#f0fff4; padding:12px; border-radius:6px;">
          ✅ Сделка обновлена!<br>
          ${newPaid && bonusPaid > 0 ? `Начислена премия: <strong>${bonusPaid.toLocaleString('ru-RU')} ₽</strong>` : 'Премия будет начислена после полной оплаты и подписания УПД'}
        </div>
      `;
      document.getElementById('updateFormResult').style.display = 'block';
      
    } catch (err) {
      alert('Ошибка: ' + (err.message || err));
    }
  }

  // === РЕНДЕР ПРЕМИИ ===
  function renderBonusReport(deals, now) {
    const resultDiv = document.getElementById('monthResult');
    if (!resultDiv) return;

    let totalMargin = 0;
    let totalBonus = 0;

    const dealRows = deals.map(deal => {
      const margin = 
        deal.deal_type === 'to' || deal.deal_type === 'pto' || deal.deal_type === 'rent' ? deal.contract_amount * 0.7 :
        deal.deal_type === 'eq' ? deal.contract_amount * 0.2 :
        deal.deal_type === 'comp' ? deal.contract_amount * 0.3 :
        deal.deal_type === 'rep' ? deal.contract_amount * 0.4 : 0;

      totalMargin += margin;
      totalBonus += deal.bonus_paid || 0;

      const status = deal.paid ? '✅ 100%' : `⏳ ${Math.round((deal.total_paid / deal.contract_amount) * 100)}%`;

      return `
        <tr>
          <td>${deal.crm_id}</td>
          <td>${dealTypeLabel(deal.deal_type)}</td>
          <td>${deal.contract_amount.toLocaleString('ru-RU')} ₽</td>
          <td>${status}</td>
          <td>${(deal.bonus_paid || 0).toLocaleString('ru-RU')} ₽</td>
        </tr>
      `;
    }).join('');

    const basePlan = 800000;
    const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
    const plan = basePlan * coefficients[now.getMonth()];
    const planPercent = (totalMargin / plan) * 100;
    let finalPayout = planPercent >= 100 ? totalBonus : (planPercent >= 50 ? Math.round(totalBonus * 0.5) : 0);

    resultDiv.innerHTML = `
      <h3>Премия за ${now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
      <div style="background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:15px;">
        <strong>План по марже:</strong> ${plan.toLocaleString('ru-RU')} ₽<br>
        <strong>Набрано маржи:</strong> ${totalMargin.toLocaleString('ru-RU')} ₽ (${planPercent.toFixed(1)}%)<br>
        <strong>Начислено премий:</strong> ${totalBonus.toLocaleString('ru-RU')} ₽<br>
        <strong>К выплате:</strong> <span style="font-size:18px; font-weight:bold; color:#1890ff;">${finalPayout.toLocaleString('ru-RU')} ₽</span>
      </div>
      <h4>Сделки (${deals.length} шт):</h4>
      <table style="width:100%; font-size:14px; border-collapse: collapse;">
        <thead><tr style="background:#f1f1f1;"><th style="padding:8px; border:1px solid #ddd;">CRM ID</th><th style="padding:8px; border:1px solid #ddd;">Тип</th><th style="padding:8px; border:1px solid #ddd;">Договор</th><th style="padding:8px; border:1px solid #ddd;">Оплата</th><th style="padding:8px; border:1px solid #ddd;">Премия</th></tr></thead>
        <tbody>${dealRows}</tbody>
      </table>
    `;
    resultDiv.style.display = 'block';
  }

  // Вспомогательные функции
  function dealTypeLabel(type) {
    const labels = {
      'to': 'ТО', 
      'pto': 'ПТО', 
      'eq': 'Оборудование',
      'comp': 'Комплектующие', 
      'rep': 'Ремонты', 
      'rent': 'Аренда'
    };
    return labels[type] || type;
  }

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

  function showError(id, text) {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      el.style.display = 'block';
    }
  }

  console.log('Модуль менеджера готов');
}

// Экспорт
if (typeof window !== 'undefined') {
  window.initManagerPanel = initManagerPanel;
}
