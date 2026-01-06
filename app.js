// 🔑 Supabase
const supabaseUrl = 'https://ebgqaswbnsxklbshtkzo.supabase.co';
const supabaseAnonKey = 'sb_publishable_xUFmnxRAnAPtHvQ9OJonwA_Tzt7TBui';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

let currentUserPhone = null;
let currentUserRole = null;
let currentUserName = null;

// 📊 Расчёт премии
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

// 👤 Авторизация с паролем
document.getElementById('loginBtn').addEventListener('click', async () => {
  const phone = document.getElementById('loginPhone').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  if (!phone || !password) {
    document.getElementById('loginError').textContent = 'Введите номер и пароль';
    document.getElementById('loginError').classList.remove('hidden');
    return;
  }
  const { data, error } = await supabaseClient
    .from('allowed_users')
    .select('phone, name, role')
    .eq('phone', phone)
    .eq('password', password)
    .single();
  if (error || !data) {
    document.getElementById('loginError').textContent = 'Неверный номер или пароль';
    document.getElementById('loginError').classList.remove('hidden');
    return;
  }
  currentUserPhone = phone;
  currentUserRole = data.role;
  currentUserName = data.name;
  document.getElementById('loginScreen').classList.add('hidden');
  if (data.role === 'rop') {
    document.getElementById('ropScreen').classList.remove('hidden');
  } else {
    document.getElementById('crmScreen').classList.remove('hidden');
  }
});

// 🔍 Проверка CRM ID
document.getElementById('checkCrmBtn').addEventListener('click', async () => {
  const crmId = document.getElementById('inputCrmId').value.trim();
  if (!crmId) {
    document.getElementById('crmError').textContent = 'Введите номер сделки';
    document.getElementById('crmError').classList.remove('hidden');
    return;
  }
  const { data, error } = await supabaseClient
    .from('deals')
    .select('*')
    .eq('crm_id', crmId)
    .maybeSingle();
  if (error) {
    document.getElementById('crmError').textContent = 'Ошибка поиска: ' + error.message;
    document.getElementById('crmError').classList.remove('hidden');
    return;
  }
  if (!data) {
    showCreateForm(crmId);
  } else {
    showUpdateForm(data);
  }
});

// 📅 Премия за месяц
document.getElementById('checkMonthBtn').addEventListener('click', async () => {
  const { data, error: userError } = await supabaseClient
    .from('allowed_users')
    .select('name')
    .eq('phone', currentUserPhone)
    .single();
  if (userError) {
    alert('Ошибка авторизации. Обратитесь к администратору.');
    return;
  }
  if (!data || !data.name) {
    alert('Ваше имя не указано в системе. Обратитесь к руководителю.');
    return;
  }
  const managerName = data.name.trim();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const { data: deals, error: dealsError } = await supabaseClient
    .from('deals')
    .select('crm_id, deal_type, contract_amount, total_paid, paid, up_signed, bonus_paid, created_at')
    .eq('manager_name', managerName)
    .gte('created_at', startOfMonth.toISOString())
    .lte('created_at', endOfMonth.toISOString());
  if (dealsError) {
    alert('Ошибка: ' + dealsError.message);
    return;
  }

  // Если сделок нет — показываем сообщение
  if (!deals || deals.length === 0) {
    const resultDiv = document.getElementById('monthResult');
    resultDiv.innerHTML = `
      <h3>Премия за ${now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
      <div style="background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:15px;">
        <strong>Нет сделок за текущий месяц.</strong>
      </div>
    `;
    resultDiv.classList.remove('hidden');
    return;
  }

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
        <td>${
      deal.deal_type === 'to' ? 'ТО' :
      deal.deal_type === 'pto' ? 'ПТО' :
      deal.deал_type === 'eq' ? 'Оборудование' :
      deal.deал_type === 'comp' ? 'Комплектующие' :
      deal.deал_type === 'rep' ? 'Ремонты' :
      deal.deал_type === 'rent' ? 'Аренда' : deal.deал_type
    }</td>
        <td>${deal.contract_amount.toLocaleString('ru-RU')} ₽</td>
        <td>${status}</td>
        <td>${(deal.bonus_paid || 0).toLocaleString('ru-RU')} ₽</td>
        <td>${new Date(deal.created_at).toLocaleDateString('ru-RU')}</td>
      </tr>
    `;
  }).join('');

  const basePlan = 800000;
  const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
  const plan = basePlan * coefficients[now.getMonth()];
  const planPercent = (totalMargin / plan) * 100;
  let finalPayout = 0;
  if (planPercent >= 100) {
    finalPayout = totalBonus;
  } else if (planPercent >= 50) {
    finalPayout = Math.round(totalBonus * 0.5);
  }
  const resultDiv = document.getElementById('monthResult');
  resultDiv.innerHTML = `
    <h3>Премия за ${now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
    <div style="background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:15px;">
      <strong>План по марже:</strong> ${plan.toLocaleString('ru-RU')} ₽<br>
      <strong>Набрано маржи:</strong> ${totalMargin.toLocaleString('ru-RU')} ₽ (${planPercent.toFixed(1)}%)<br>
      <strong>Начислено премий:</strong> ${totalBonus.toLocaleString('ru-RU')} ₽<br>
      <strong>К выплате:</strong> ${finalPayout.toLocaleString('ru-RU')} ₽
    </div>
    <h4>Сделки (${deals.length} шт):</h4>
    <div style="max-height:300px; overflow:auto;">
      <table>
        <thead>
          <tr>
            <th>CRM ID</th>
            <th>Тип</th>
            <th>Договор</th>
            <th>Оплата</th>
            <th>Премия</th>
            <th>Дата</th>
          </tr>
        </thead>
        <tbody>
          ${dealRows}
        </tbody>
      </table>
    </div>
  `;
  resultDiv.classList.remove('hidden');
});

// ✉️ Обратная связь
document.getElementById('feedbackBtn').addEventListener('click', () => {
  document.getElementById('feedbackForm').classList.toggle('hidden');
});
document.getElementById('sendFeedbackBtn').addEventListener('click', async () => {
  const message = document.getElementById('feedbackText').value.trim();
  if (!message || !currentUserPhone) {
    alert('Пожалуйста, введите сообщение');
    return;
  }
  const { error } = await supabaseClient
    .from('feedback')
    .insert([{
      phone: currentUserPhone,
      message,
      created_at: new Date().toISOString()
    }]);
  if (error) {
    alert('Не удалось отправить сообщение. Попробуйте позже.');
  } else {
    document.getElementById('feedbackResult').textContent = '✅ Спасибо! Ваше сообщение отправлено.';
    document.getElementById('feedbackResult').classList.remove('hidden');
    document.getElementById('feedbackText').value = '';
    setTimeout(() => {
      document.getElementById('feedbackForm').classList.add('hidden');
      document.getElementById('feedbackResult').classList.add('hidden');
    }, 2000);
  }
});

// ➕ Форма создания (менеджер)
function showCreateForm(crmId) {
  document.getElementById('crmScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('formContainer').innerHTML = `
    <button id="backBtn" style="margin-bottom:15px; background:#f5f5f5; border:1px solid #ddd; padding:6px 12px; border-radius:6px; cursor:pointer;">
      <i class="fas fa-arrow-left"></i> Назад к CRM ID
    </button>
    <h3><i class="fas fa-plus-circle"></i> Создать сделку: ${crmId}</h3>
    <p><strong>Менеджер:</strong> ${currentUserName}</p>
    <label>Сумма договора (₽):</label>
    <input type="number" id="contract_amount" placeholder="600000" required>
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
    <div id="annualSection" style="display:none; margin-top:10px;">
      <input type="checkbox" id="annual_contract">
      <label for="annual_contract" style="display:inline;">Годовой контракт</label>
    </div>
    <div style="margin-top:15px;">
      <input type="checkbox" id="is_first">
      <label for="is_first" style="display:inline;">Первый платёж (ТО)?</label>
    </div>
    <div style="margin-top:10px;">
      <input type="checkbox" id="paid">
      <label for="paid" style="display:inline;">Оплачен?</label>
    </div>
    <div style="margin-top:10px;">
      <input type="checkbox" id="up_signed">
      <label for="up_signed" style="display:inline;">УПД подписан?</label>
    </div>
    <button id="createDealBtn" class="success">Создать сделку</button>
    <div id="createFormResult" class="result hidden"></div>
  `;
  document.getElementById('deal_type').addEventListener('change', () => {
    const isTO = document.getElementById('deal_type').value === 'to';
    document.getElementById('arpuSection').style.display = isTO ? 'block' : 'none';
    document.getElementById('annualSection').style.display = isTO ? 'block' : 'none';
  });
  document.getElementById('deal_type').dispatchEvent(new Event('change'));
  document.getElementById('createDealBtn').addEventListener('click', async () => {
    const managerName = currentUserName;
    const contractAmount = parseFloat(document.getElementById('contract_amount').value);
    const paymentAmount = parseFloat(document.getElementById('payment_amount').value);
    const dealType = document.getElementById('deal_type').value;
    const arpuInput = document.getElementById('arpu').value;
    const annualContract = document.getElementById('annual_contract').checked;
    const isFirst = document.getElementById('is_first').checked;
    const paid = document.getElementById('paid').checked;
    const upSigned = document.getElementById('up_signed').checked;
    if (!managerName || isNaN(contractAmount) || isNaN(paymentAmount)) {
      alert('Заполните сумму договора и предоплаты');
      return;
    }
    const totalPaid = paymentAmount;
    const isFullyPaid = totalPaid >= contractAmount;
    let bonusPaid = 0;
    if (isFullyPaid) {
      let revenueForBonus = contractAmount;
      if (dealType === 'to') {
        const arpuValue = arpuInput ? parseFloat(arpuInput) : contractAmount / 12;
        revenueForBonus = arpuValue;
      }
      bonusPaid = calculateBonus(dealType, revenueForBonus, isFirst, true, upSigned, annualContract);
    }
    const margin =
      dealType === 'to' || dealType === 'pto' || dealType === 'rent' ? contractAmount * 0.7 :
      dealType === 'eq' ? contractAmount * 0.2 :
      dealType === 'comp' ? contractAmount * 0.3 :
      dealType === 'rep' ? contractAmount * 0.4 : 0;
    const { error } = await supabaseClient
      .from('deals')
      .insert([{
        crm_id: crmId,
        manager_name: managerName,
        deal_type: dealType,
        contract_amount: contractAmount,
        total_paid: totalPaid,
        paid: isFullyPaid,
        up_signed: upSigned,
        is_first: isFirst,
        arpu_input: dealType === 'to' ? (arpuInput ? parseFloat(arpuInput) : null) : null,
        annual_contract: annualContract,
        margin: margin,
        bonus_paid: bonusPaid
      }]);
    if (error) {
      if (error.code === '23505') {
        alert(`Сделка с CRM ID ${crmId} уже существует.`);
      } else {
        alert('Ошибка сохранения: ' + error.message);
      }
      return;
    }
    document.getElementById('createFormResult').innerHTML = `
      Сделка создана!<br>
      Премия: ${bonusPaid > 0 ? bonusPaid.toLocaleString('ru-RU') + ' ₽' : 'не начислена'}
    `;
    document.getElementById('createFormResult').classList.remove('hidden');
  });
}

// 🔄 Форма обновления (менеджер)
function showUpdateForm(deal) {
  const { crm_id, contract_amount, total_paid, up_signed, paid, manager_name, deal_type, is_first, arpu_input, annual_contract } = deal;
  const remaining = contract_amount - total_paid;
  document.getElementById('crmScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  document.getElementById('formContainer').innerHTML = `
    <button id="backBtn" style="margin-bottom:15px; background:#f5f5f5; border:1px solid #ddd; padding:6px 12px; border-radius:6px; cursor:pointer;">
      <i class="fas fa-arrow-left"></i> Назад к CRM ID
    </button>
    <h3><i class="fas fa-edit"></i> Обновить сделку: ${crm_id}</h3>
    <p><strong>Менеджер:</strong> ${manager_name}</p>
    <p><strong>Тип:</strong> ${
    deal_type === 'to' ? 'ТО' :
    deal_type === 'pto' ? 'ПТО' :
    deal_type === 'eq' ? 'Оборудование' :
    deal_type === 'comp' ? 'Комплектующие' :
    deal_type === 'rep' ? 'Ремонты' :
    deal_type === 'rent' ? 'Аренда' : deal_type
  }</p>
    <p><strong>Сумма договора:</strong> ${contract_amount.toLocaleString('ru-RU')} ₽</p>
    <p><strong>Уже оплачено:</strong> ${total_paid.toLocaleString('ru-RU')} ₽</p>
    <p style="color:${remaining <= 0 ? 'green' : 'orange'};">
      <strong>Осталось оплатить:</strong> ${Math.max(0, remaining).toLocaleString('ru-RU')} ₽
    </p>
    <p><strong>УПД:</strong> ${up_signed ? '✅ Подписан' : '❌ Не подписан'}</p>
    <p><strong>Статус оплаты:</strong> ${paid ? '✅ 100%' : '⏳ Частичная'}</p>
    <label>Сумма нового платежа (₽):</label>
    <input type="number" id="additional_payment" placeholder="Например: 100000" ${paid ? 'disabled' : ''}>
    <div style="margin-top:15px;">
      <input type="checkbox" id="update_up_signed" ${up_signed ? 'checked disabled' : ''}>
      <label for="update_up_signed" style="display:inline;">Отметить УПД как подписанный</label>
    </div>
    <button id="updateDealBtn" class="success">Обновить УПД</button>
    <div id="updateFormResult" class="result hidden"></div>
  `;
  document.getElementById('updateDealBtn').addEventListener('click', async () => {
    const additionalPayment = parseFloat(document.getElementById('additional_payment')?.value || 0);
    const newUpSigned = document.getElementById('update_up_signed').checked;
    if (paid && up_signed === newUpSigned) {
      alert('Нечего обновлять');
      return;
    }
    if (!paid && (isNaN(additionalPayment) || additionalPayment <= 0)) {
      alert('Введите корректную сумму платежа');
      return;
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
    const { error } = await supabaseClient
      .from('deals')
      .update({
        total_paid: newTotalPaid,
        paid: newPaid,
        up_signed: newUpSigned,
        bonus_paid: bonusPaid,
        updated_at: new Date().toISOString()
      })
      .eq('crm_id', crm_id);
    if (error) {
      alert('Ошибка: ' + error.message);
      return;
    }
    document.getElementById('updateFormResult').innerHTML = `
      Сделка обновлена!<br>
      ${newPaid && bonusPaid > 0 ? `Начислена премия: ${bonusPaid.toLocaleString('ru-RU')} ₽` : 'Премия не начислена'}
    `;
    document.getElementById('updateFormResult').classList.remove('hidden');
  });
}

// 🔙 Обработчики кнопок
document.addEventListener('click', (e) => {
  if (e.target.id === 'backBtn') {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('crmScreen').classList.remove('hidden');
    document.getElementById('monthResult').classList.add('hidden');
  } else if (e.target.id === 'backToRopBtn') {
    document.getElementById('mainApp').classList.add('hidden');
    document.getElementById('ropScreen').classList.remove('hidden');
  } else if (e.target.classList.contains('editDealBtn')) {
    const crmId = e.target.getAttribute('data-crm-id');
    supabaseClient
      .from('deals')
      .select('*')
      .eq('crm_id', crmId)
      .single()
      .then(({ data, error }) => {
        if (!error && data) showRopUpdateForm(data);
      });
  }
});
