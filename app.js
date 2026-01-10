document.addEventListener('DOMContentLoaded', () => {
  console.log('app.js: DOM загружен, инициализация менеджера...');
  
  const supabaseUrl = 'https://ebgqaswbnsxklbshtkzo.supabase.co';
  const supabaseAnonKey = 'sb_publishable_xUFmnxRAnAPtHvQ9OJonwA_Tzt7TBui';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

  let currentUserPhone = null;
  let currentUserName = null;
  let currentUserRole = null;

  // 💡 Управление историей браузера
  function updateUrl(screenName) {
    const newUrl = `${window.location.origin}/#${screenName}`;
    window.history.pushState({ screen: screenName }, '', newUrl);
  }

  // 🔧 Функция показа экрана
  function showScreen(screenName) {
    console.log('showScreen вызывается для:', screenName);
    
    // Скрываем все экраны
    const screens = ['loginScreen', 'crmScreen', 'mainApp', 'ropScreen', 'finScreen', 'genScreen'];
    screens.forEach(screenId => {
      const element = document.getElementById(screenId);
      if (element) {
        element.style.display = 'none';
      }
    });
    
    // Показываем нужный экран
    const screenElement = document.getElementById(screenName === 'form' ? 'mainApp' : screenName + 'Screen');
    if (screenElement) {
      screenElement.style.display = 'block';
      console.log('Показан экран:', screenName);
    }
  }

  // 🏆 Турнирная таблица (только менеджеры)
  async function loadDepartmentRanking(currentMonth) {
    try {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0, 23, 59, 59, 999);

      const { data: deals, error: dealsError } = await supabaseClient
        .from('deals')
        .select('manager_name, margin')
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString());

      if (dealsError || !deals) return [];

      const managerNames = [...new Set(deals.map(d => d.manager_name))];
      const { data: users, error: usersError } = await supabaseClient
        .from('allowed_users')
        .select('name, role')
        .in('name', managerNames);

      if (usersError) return [];

      const managerNamesOnly = new Set(
        users.filter(u => u.role === 'manager').map(u => u.name)
      );

      const managerStats = {};
      deals.forEach(deal => {
        if (managerNamesOnly.has(deal.manager_name)) {
          if (!managerStats[deal.manager_name]) {
            managerStats[deal.manager_name] = { margin: 0, name: deal.manager_name };
          }
          managerStats[deal.manager_name].margin += deal.margin || 0;
        }
      });

      return Object.values(managerStats)
        .sort((a, b) => b.margin - a.margin)
        .map((m, i) => ({ ...m, rank: i + 1 }));
    } catch (error) {
      console.error('Ошибка загрузки рейтинга:', error);
      return [];
    }
  }

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

  // 👤 Авторизация пользователя
  document.getElementById('loginBtn').addEventListener('click', async () => {
    console.log('Кнопка входа нажата');
    
    const phone = document.getElementById('loginPhone').value.trim();
    if (!phone) { 
      alert('Введите номер телефона'); 
      return; 
    }

    const passwordField = document.getElementById('passwordField');
    if (passwordField.style.display !== 'block') {
      passwordField.style.display = 'block';
      document.getElementById('loginPassword').focus();
      document.getElementById('loginBtn').textContent = 'Войти';
      return;
    }

    const password = document.getElementById('loginPassword').value.trim();
    if (!password) { 
      alert('Введите пароль'); 
      return; 
    }

    try {
      const { data, error } = await supabaseClient
        .from('allowed_users')
        .select('phone, name, role, password')
        .eq('phone', phone)
        .single();

      if (error || !data) {
        document.getElementById('loginError').textContent = 'Номер не найден.';
        document.getElementById('loginError').style.display = 'block';
        return;
      }

      if (password !== data.password) {
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginError').textContent = 'Неверный пароль.';
        document.getElementById('loginError').style.display = 'block';
        return;
      }

      currentUserPhone = phone;
      currentUserName = data.name;
      currentUserRole = data.role;

      // Скрываем экран входа
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('loginError').style.display = 'none';
      
      console.log('Пользователь авторизован:', {
        name: data.name,
        role: data.role,
        phone: phone
      });

      // 🔑 Роутинг по ролям
      if (data.role === 'rop') {
        console.log('Переход на экран РОПа');
        showScreen('rop');
        updateUrl('rop');
        
        // Вызываем функцию из rop.js если она существует
        if (typeof initRopPanel === 'function') {
          try {
            initRopPanel(supabaseClient, currentUserPhone, currentUserName);
            console.log('Модуль РОПа инициализирован');
          } catch (error) {
            console.error('Ошибка инициализации РОПа:', error);
          }
        } else {
          console.warn('Модуль РОПа не найден, проверьте rop.js');
        }
      } 
      else if (data.role === 'fin') {
        console.log('Переход на экран финансиста');
        showScreen('fin');
        updateUrl('fin');
        
        if (typeof initFinPanel === 'function') {
          try {
            initFinPanel(supabaseClient, currentUserPhone, currentUserName);
            console.log('Модуль финансиста инициализирован');
          } catch (error) {
            console.error('Ошибка инициализации финансиста:', error);
          }
        }
      }
      else if (data.role === 'gen') {
        console.log('Переход на экран гендиректора');
        showScreen('gen');
        updateUrl('gen');
        
        if (typeof initGenPanel === 'function') {
          try {
            initGenPanel(supabaseClient, currentUserPhone, currentUserName);
            console.log('Модуль гендиректора инициализирован');
          } catch (error) {
            console.error('Ошибка инициализации гендиректора:', error);
          }
        }
      }
      else {
        // Обычный менеджер
        console.log('Переход на экран CRM для менеджера');
        showScreen('crm');
        updateUrl('crm');
      }

    } catch (error) {
      console.error('Ошибка авторизации:', error);
      alert('Ошибка подключения к серверу. Попробуйте позже.');
    }
  });

  // 🔍 Проверка CRM ID для создания/обновления сделки
  document.getElementById('checkCrmBtn').addEventListener('click', async () => {
    const crmId = document.getElementById('inputCrmId').value.trim();
    if (!crmId) {
      document.getElementById('crmError').textContent = 'Введите номер сделки';
      document.getElementById('crmError').style.display = 'block';
      return;
    }

    try {
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
    } catch (error) {
      console.error('Ошибка проверки CRM ID:', error);
      alert('Ошибка при проверке сделки');
    }
  });

  // 📅 Расчёт премии за месяц
  document.getElementById('checkMonthBtn').addEventListener('click', async () => {
    if (!currentUserPhone) {
      alert('Сначала войдите в систему');
      return;
    }

    try {
      const { data: userData, error: userError } = await supabaseClient
        .from('allowed_users')
        .select('name')
        .eq('phone', currentUserPhone)
        .single();

      if (userError || !userData || !userData.name) {
        alert('Ошибка авторизации.');
        return;
      }

      const managerName = userData.name;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      const dealsResponse = await supabaseClient
        .from('deals')
        .select('crm_id, deal_type, contract_amount, total_paid, paid, up_signed, bonus_paid, created_at')
        .eq('manager_name', managerName)
        .gte('created_at', startOfMonth.toISOString())
        .lte('created_at', endOfMonth.toISOString());

      if (dealsResponse.error) {
        alert('Ошибка загрузки сделок: ' + dealsResponse.error.message);
        return;
      }

      const deals = Array.isArray(dealsResponse.data) ? dealsResponse.data : [];
      const resultDiv = document.getElementById('monthResult');

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

      if (deals.length === 0) {
        resultDiv.innerHTML = `
          <h3>Премия за ${now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
          <div style="background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:15px;">
            <strong>Нет данных.</strong><br>
            Сделок не найдено.
          </div>
        `;
      } else {
        resultDiv.innerHTML = `
          <h3>Премия за ${now.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
          <div style="background:#f0f9ff; padding:12px; border-radius:6px; margin-bottom:15px;">
            <strong>План по марже:</strong> ${plan.toLocaleString('ru-RU')} ₽<br>
            <strong>Набрано маржи:</strong> ${totalMargin.toLocaleString('ru-RU')} ₽ (${planPercent.toFixed(1)}%)<br>
            <strong>Начислено премий:</strong> ${totalBonus.toLocaleString('ru-RU')} ₽<br>
            <strong>К выплате:</strong> ${finalPayout.toLocaleString('ru-RU')} ₽
          </div>
          <div style="margin-top:12px;">
            <strong>Выполнение плана:</strong>
            <div style="background:#e6f7ff; height:10px; border-radius:5px; margin-top:4px; overflow:hidden;">
              <div style="height:100%; background:#52c41a; width:${Math.min(100, planPercent)}%; border-radius:5px;"></div>
            </div>
            <small>${planPercent.toFixed(1)}%</small>
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

        // Турнирная таблица
        const ranking = await loadDepartmentRanking(now);
        if (ranking.length > 1) {
          let rankingHtml = `
            <h4 style="margin-top:25px;">🏆 Рейтинг отдела (${ranking.length} менеджеров)</h4>
            <table style="width:100%; font-size:14px; margin-top:10px;">
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Менеджер</th>
                  <th>Маржа</th>
                  <th>% от плана</th>
                </tr>
              </thead>
              <tbody>
          `;

          const monthPlan = basePlan * coefficients[now.getMonth()];
          ranking.forEach(manager => {
            const planPct = Math.round((manager.margin / monthPlan) * 100);
            const isCurrentUser = manager.name === currentUserName;
            rankingHtml += `
              <tr style="${isCurrentUser ? 'background:#fffbe6;' : ''}">
                <td><strong>${manager.rank}</strong></td>
                <td>${manager.name}</td>
                <td>${manager.margin.toLocaleString('ru-RU')} ₽</td>
                <td>${planPct}%</td>
              </tr>
            `;
          });

          rankingHtml += `</tbody></table>`;
          resultDiv.innerHTML += rankingHtml;
        }
      }

      resultDiv.style.display = 'block';
    } catch (error) {
      console.error('Ошибка расчёта премии:', error);
      alert('Ошибка при расчёте премии');
    }
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
    
    try {
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
        document.getElementById('feedbackText').value = '';
        setTimeout(() => {
          document.getElementById('feedbackForm').style.display = 'none';
          document.getElementById('feedbackResult').textContent = '';
        }, 2000);
      }
    } catch (error) {
      console.error('Ошибка отправки обратной связи:', error);
    }
  });

  // ➕ Форма создания сделки
  function showCreateForm(crmId) {
    showScreen('form');
    updateUrl('form');
    
    document.getElementById('formContainer').innerHTML = `
      <button id="backBtn">← Назад к CRM ID</button>
      <h3><i class="fas fa-plus-circle"></i> Создать сделку: ${crmId}</h3>
      <label>Ваше имя (автоматически):</label>
      <input type="text" id="manager_name" value="${currentUserName || ''}" readonly>
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

    // Обработчик изменения типа сделки
    document.getElementById('deal_type').addEventListener('change', () => {
      const isTO = document.getElementById('deal_type').value === 'to';
      document.getElementById('arpuSection').style.display = isTO ? 'block' : 'none';
      document.getElementById('annualSection').style.display = isTO ? 'block' : 'none';
    });
    
    // Инициируем событие для правильного отображения
    document.getElementById('deal_type').dispatchEvent(new Event('change'));

    // Обработчик создания сделки
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
        alert('Заполните все обязательные поля');
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

      try {
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
            bonus_paid: bonusPaid,
            created_at: new Date().toISOString()
          }]);

        if (error) {
          alert('Ошибка создания сделки: ' + error.message);
          return;
        }

        document.getElementById('createFormResult').innerHTML = `
          ✅ Сделка создана успешно!<br>
          • Премия: ${bonusPaid > 0 ? bonusPaid.toLocaleString('ru-RU') + ' ₽' : 'не начислена'}<br>
          • Маржа: ${margin.toLocaleString('ru-RU')} ₽
        `;
        document.getElementById('createFormResult').style.display = 'block';
        
      } catch (error) {
        console.error('Ошибка при создании сделки:', error);
        alert('Ошибка при создании сделки. Попробуйте позже.');
      }
    });
  }

  // 🔄 Форма обновления сделки
  function showUpdateForm(deal) {
    const { crm_id, contract_amount, total_paid, up_signed, paid, manager_name, deal_type, is_first, arpu_input, annual_contract } = deal;
    const remaining = contract_amount - total_paid;

    showScreen('form');
    updateUrl('form');
    
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

      <button id="updateDealBtn" class="btn-success">Обновить сделку</button>
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

      try {
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
          alert('Ошибка обновления: ' + error.message);
          return;
        }

        document.getElementById('updateFormResult').innerHTML = `
          ✅ Сделка обновлена!<br>
          ${newPaid && bonusPaid > 0 ? `Начислена премия: ${bonusPaid.toLocaleString('ru-RU')} ₽` : 'Премия не начислена'}
        `;
        document.getElementById('updateFormResult').style.display = 'block';
        
      } catch (error) {
        console.error('Ошибка обновления сделки:', error);
        alert('Ошибка при обновлении сделки');
      }
    });
  }

  // 🔙 Кнопка "Назад"
  document.addEventListener('click', (e) => {
    if (e.target.id === 'backBtn') {
      document.getElementById('monthResult').style.display = 'none';
      
      // Возвращаемся на экран в зависимости от роли
      if (currentUserRole === 'rop') {
        showScreen('rop');
        updateUrl('rop');
      } else if (currentUserRole === 'fin') {
        showScreen('fin');
        updateUrl('fin');
      } else if (currentUserRole === 'gen') {
        showScreen('gen');
        updateUrl('gen');
      } else {
        showScreen('crm');
        updateUrl('crm');
      }
    }
  });

  // 🌐 Инициализация из URL
  const screenFromUrl = window.location.hash.replace('#', '') || 'login';
  showScreen(screenFromUrl);

  // 🔙 Поддержка кнопки "Назад" в браузере
  window.addEventListener('popstate', (event) => {
    const screen = event.state?.screen || 'login';
    showScreen(screen);
  });
  
  console.log('app.js: Инициализация менеджера завершена');
});
