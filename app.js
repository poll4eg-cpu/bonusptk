document.addEventListener('DOMContentLoaded', () => {
  const supabaseUrl = 'https://ebgqaswbnsxklbshtkzo.supabase.co';
  const supabaseAnonKey = 'sb_publishable_xUFmnxRAnAPtHvQ9OJonwA_Tzt7TBui';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

  let currentUserPhone = null;

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
    if (dealType === 'eq') {
      return Math.round(revenue * 0.01);
    }
    if (dealType === 'rent') {
      return 1500;
    }
    return 0;
  }

  // 👤 Авторизация
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const phone = document.getElementById('loginPhone').value.trim();
    if (!phone) { alert('Введите номер телефона'); return; }
    const { data, error } = await supabaseClient
      .from('allowed_users')
      .select('phone, name')
      .eq('phone', phone)
      .single();
    if (error || !data) {
      document.getElementById('loginError').textContent = 'Номер не найден.';
      document.getElementById('loginError').style.display = 'block';
      return;
    }
    currentUserPhone = phone;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('crmScreen').style.display = 'block';
  });

  // 🔍 Проверка CRM ID
  document.getElementById('checkCrmBtn').addEventListener('click', async () => {
    const crmId = document.getElementById('inputCrmId').value.trim();
    if (!crmId) {
      document.getElementById('crmError').textContent = 'Введите номер сделки';
      document.getElementById('crmError').style.display = 'block';
      return;
    }

    const { data, error } = await supabaseClient
      .from('deals')
      .select('*')
      .eq('crm_id', crmId)
      .maybeSingle();

    if (error) {
      document.getElementById('crmError').textContent = 'Ошибка: ' + error.message;
      document.getElementById('crmError').style.display = 'block';
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
    const {  data, error: userError } = await supabaseClient
      .from('allowed_users')
      .select('name')
      .eq('phone', currentUserPhone)
      .single();

    if (userError || !data || !data.name) {
      alert('Ошибка авторизации.');
      return;
    }

    const managerName = data.name;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const {    deals, error: dealsError } = await supabaseClient
      .from('deals')
      .select('crm_id, deal_type, contract_amount, total_paid, paid, up_signed, bonus_paid, created_at')
      .eq('manager_name', managerName)
      .gte('created_at', startOfMonth.toISOString())
      .lte('created_at', endOfMonth.toISOString());

    if (dealsError) {
      alert('Ошибка загрузки сделок: ' + dealsError.message);
      return;
    }
    // 🔍 Отладочный код:
  console.log('🔍 Запрос к deals:', { managerName, deals, dealsError });

  if (dealsError) {
    alert('Ошибка загрузки сделок: ' + dealsError.message);
    return;
  }

    // ❗ Проверяем, что deals — массив
    if (!deals || !Array.isArray(deals)) {
      const resultDiv = document.getElementById('monthResult');
      resultDiv.innerHTML = `
        <h3>Премия за ${now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
        <div style="background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:15px;">
          <strong>Нет данных.</strong><br>
          Сделок не найдено.
        </div>
      `;
      resultDiv.style.display = 'block';
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
            deal.deal_type === 'eq' ? 'Оборудование' :
            deal.deal_type === 'comp' ? 'Комплектующие' :
            deal.deal_type === 'rep' ? 'Ремонты' :
            deal.deal_type === 'rent' ? 'Аренда' : deal.deal_type
          }</td>
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
      <table style="width:100%; font-size:14px;">
        <thead>
          <tr>
            <th>CRM ID</th>
            <th>Тип</th>
            <th>Договор</th>
            <th>Оплата</th>
            <th>Премия</th>
          </tr>
        </thead>
        <tbody>
          ${dealRows}
        </tbody>
      </table>
    `;
    resultDiv.style.display = 'block';
  });

  // ✉️ Обратная связь
  document.getElementById('feedbackBtn').addEventListener('click', () => {
    const form = document.getElementById('feedbackForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('sendFeedbackBtn').addEventListener('click', async () => {
    const message = document.getElementById('feedbackText').value.trim();
    if (!message || !currentUserPhone) {
      alert('Пожалуйста, введите сообщение');
      return;
    }
    const { error } = await supabaseClient
      .from('feedback')
      .insert([{ phone: currentUserPhone, message, created_at: new Date().toISOString() }]);
    if (error) {
      alert('Не удалось отправить сообщение. Попробуйте позже.');
    } else {
      document.getElementById('feedbackResult').textContent = '✅ Спасибо! Ваше сообщение отправлено.';
      document.getElementById('feedbackText').value = '';
      setTimeout(() => {
        document.getElementById('feedbackForm').style.display = 'none';
        document.getElementById('feedbackResult').textContent = '';
      }, 2000);
    }
  });

  // ➕ Форма создания
  function showCreateForm(crmId) {
    document.getElementById('crmScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('formContainer').innerHTML = `
      <button id="backBtn">← Назад к CRM ID</button>
      <h3><i class="fas fa-plus-circle"></i> Создать сделку: ${crmId}</h3>
      <label>Ваше имя:</label>
      <input type="text" id="manager_name" placeholder="Иван Петров" required>
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
        <label for="annual_contract">Годовой контракт</label>
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

    document.getElementById('deal_type').addEventListener('change', () => {
      const isTO = document.getElementById('deal_type').value === 'to';
      document.getElementById('arpuSection').style.display = isTO ? 'block' : 'none';
      document.getElementById('annualSection').style.display = isTO ? 'block' : 'none';
    });
    document.getElementById('deal_type').dispatchEvent(new Event('change'));

    document.getElementById('createDealBtn').addEventListener('click', async () => {
      const managerName = document.getElementById('manager_name').value.trim();
      const contractAmount = parseFloat(document.getElementById('contract_amount').value);
      const paymentAmount = parseFloat(document.getElementById('payment_amount').value);
      const dealType = document.getElementById('deal_type').value;
      const arpuInput = document.getElementById('arpu').value;
      const annualContract = document.getElementById('annual_contract').checked;
      const isFirst = document.getElementById('is_first').checked;
      const paid = document.getElementById('paid').checked;
      const upSigned = document.getElementById('up_signed').checked;

      if (!managerName || isNaN(contractAmount) || isNaN(paymentAmount)) {
        alert('Заполните все поля');
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
        alert('Ошибка: ' + error.message);
        return;
      }

      document.getElementById('createFormResult').innerHTML = `
        Сделка создана!<br>
        Премия: ${bonusPaid > 0 ? bonusPaid.toLocaleString('ru-RU') + ' ₽' : 'не начислена'}
      `;
      document.getElementById('createFormResult').style.display = 'block';
    });
  }

  // 🔄 Форма обновления
  function showUpdateForm(deal) {
    const { crm_id, contract_amount, total_paid, up_signed, paid, manager_name, deal_type, is_first, arpu_input, annual_contract } = deal;
    const remaining = contract_amount - total_paid;

    document.getElementById('crmScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('formContainer').innerHTML = `
      <button id="backBtn">← Назад к CRM ID</button>
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
        <label for="update_up_signed">Отметить УПД как подписанный</label>
      </div>

      <button id="updateDealBtn" class="btn-success">Обновить УПД</button>
      <div id="updateFormResult" class="result"></div>
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
      document.getElementById('updateFormResult').style.display = 'block';
    });
  }

  // 🔙 Назад
  document.addEventListener('click', (e) => {
    if (e.target.id === 'backBtn') {
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('crmScreen').style.display = 'block';
      document.getElementById('monthResult').style.display = 'none';
    }
  });
});


