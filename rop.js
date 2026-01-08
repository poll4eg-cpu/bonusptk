// rop.js — панель РОПа (с поддержкой собственных сделок)
let ropSupabaseClient = null;
let ropCurrentUserPhone = null;
let ropCurrentUserName = null;

function initRopPanel(supabaseClient, currentUserPhone, currentUserName) {
  ropSupabaseClient = supabaseClient;
  ropCurrentUserPhone = currentUserPhone;
  ropCurrentUserName = currentUserName;

  document.getElementById('loadRopData').addEventListener('click', loadRopData);
  document.getElementById('applyRopFilters').addEventListener('click', loadRopData);
  document.getElementById('ropCreateDealBtn').addEventListener('click', () => {
    const crmId = prompt('Введите номер сделки из CRM:');
    if (crmId) showRopCreateForm(crmId.trim());
  });

  loadRopData();
}

async function loadRopData() {
  const period = document.getElementById('ropPeriod').value;
  const now = new Date();
  let startDate, endDate;

  if (period === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff));
    endDate = new Date(now.setDate(startDate.getDate() + 6));
  } else if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    startDate = new Date(now.getFullYear(), q * 3, 1);
    endDate = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  }
  endDate.setHours(23, 59, 59, 999);

  try {
    // 🔥 Загружаем ВСЕ сделки (включая РОПа)
    const {  deals, error: dealsError } = await ropSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount, margin, total_paid, paid, up_signed')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (dealsError || !deals || deals.length === 0) {
      alert('Нет данных за выбранный период.');
      hideRopAnalytics();
      return;
    }

    // 🔥 Получаем список ВСЕХ, у кого есть сделки (включая РОПа)
    const allNames = [...new Set(deals.map(d => d.manager_name))];

    // 🔥 Загружаем их роли (чтобы знать, кто менеджер, а кто РОП — для справки)
    const {  users, error: usersError } = await ropSupabaseClient
      .from('allowed_users')
      .select('name, role')
      .in('name', allNames);

    // 🔥 Но НЕ фильтруем — показываем ВСЕ сделки
    const dealsToShow = deals; // ← ВСЕ сделки, включая РОПа

    // Расчёт: маржа отдела = ВСЕ сделки
    const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
    const seasonalCoefficient = coefficients[now.getMonth()];
    
    // 🔥 Количество "активных участников" = все, у кого есть сделки
    const participantCount = allNames.length || 1;
    const departmentPlan = participantCount * 800000 * seasonalCoefficient;

    let totalMargin = 0;
    dealsToShow.forEach(deal => totalMargin += deal.margin || 0);
    const cleanMargin = totalMargin * 0.78;
    const ropBonus = Math.round(cleanMargin * 0.10);
    const planPercent = Math.min(100, (totalMargin / departmentPlan) * 100);

    // Отображение
    document.getElementById('totalMarginRop').textContent = totalMargin.toLocaleString('ru-RU');
    document.getElementById('ropBonus').textContent = ropBonus.toLocaleString('ru-RU');
    document.getElementById('totalDealsRop').textContent = dealsToShow.length;
    document.getElementById('ropPlanBar').style.width = planPercent + '%';
    document.getElementById('ropPlanPercent').textContent = planPercent.toFixed(1) + '%';
    document.getElementById('ropSummary').style.display = 'block';
    document.getElementById('ropPlanProgress').style.display = 'block';

    // 🔥 Фильтр по менеджерам: ВСЕ, у кого есть сделки (включая РОПа)
    const managerSelect = document.getElementById('ropManagerFilter');
    managerSelect.innerHTML = '<option value="">Все менеджеры</option>';
    allNames.sort().forEach(name => {
      // Опционально: пометить РОПа
      let displayName = name;
      const user = users?.find(u => u.name === name);
      if (user && user.role === 'rop') {
        displayName += ' (РОП)';
      }
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = displayName;
      managerSelect.appendChild(opt);
    });

    renderAnalytics(dealsToShow, totalMargin);
    renderDealsTable(dealsToShow);
  } catch (error) {
    console.error('Ошибка загрузки данных РОПа:', error);
    alert('Ошибка: ' + (error.message || 'неизвестная'));
    hideRopAnalytics();
  }
}

function hideRopAnalytics() {
  document.getElementById('ropSummary').style.display = 'none';
  document.getElementById('managersAnalytics').style.display = 'none';
  document.getElementById('segmentsAnalytics').style.display = 'none';
  document.getElementById('ropDealsTable').style.display = 'none';
}

function renderAnalytics(deals, totalMargin) {
  const managers = {};
  deals.forEach(d => {
    if (!managers[d.manager_name]) managers[d.manager_name] = 0;
    managers[d.manager_name] += d.margin || 0;
  });
  renderChart('managersChart', managers, totalMargin);

  const segments = {};
  const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};
  deals.forEach(d => {
    const label = typeLabels[d.deal_type] || d.deal_type;
    if (!segments[label]) segments[label] = 0;
    segments[label] += d.margin || 0;
  });
  renderChart('segmentsChart', segments, totalMargin);
}

function renderChart(containerId, dataObj, total) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  Object.entries(dataObj)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, value]) => {
      const percent = Math.round((value / total) * 100);
      container.innerHTML += `
        <div style="margin-bottom:10px; padding:8px; background:#f9f9f9; border-radius:4px; min-width:120px;">
          <div><strong>${name}</strong></div>
          <div>${value.toLocaleString('ru-RU')} ₽</div>
          <div style="color:#1890ff;">${percent}%</div>
        </div>
      `;
    });
  document.getElementById(containerId.replace('Chart', 'Analytics')).style.display = 'block';
}

function renderDealsTable(deals) {
  const tbody = document.getElementById('ropDealsBody');
  tbody.innerHTML = '';
  const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};

  deals.forEach(deal => {
    const status = deal.paid ? '✅ 100%' : `⏳ ${Math.round((deal.total_paid / deal.contract_amount) * 100)}%`;
    const updStatus = deal.up_signed ? '✔️' : '✖️';
    const typeLabel = typeLabels[deal.deal_type] || deal.deal_type;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${deal.crm_id}</td>
      <td>${deal.manager_name}</td>
      <td>${typeLabel}</td>
      <td>${deal.contract_amount.toLocaleString('ru-RU')} ₽</td>
      <td>${(deal.margin || 0).toLocaleString('ru-RU')} ₽</td>
      <td>${status}</td>
      <td>${updStatus}</td>
      <td><button class="editDealBtn" data-crm-id="${deal.crm_id}">✏️</button></td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('ropDealsTable').style.display = 'block';

  document.querySelectorAll('.editDealBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const crmId = btn.getAttribute('data-crm-id');
      ropSupabaseClient
        .from('deals')
        .select('*')
        .eq('crm_id', crmId)
        .single()
        .then(({ data }) => {
          if (data) showRopUpdateForm(data);
        });
    });
  });
}

// ➕ Создание сделки — можно выбрать ЛЮБОГО, у кого есть роль (включая РОПа)
function showRopCreateForm(crmId) {
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  // 🔥 Загружаем ВСЕХ пользователей с ролью (manager или rop)
  ropSupabaseClient
    .from('allowed_users')
    .select('name, role')
    .order('name')
    .then(({ data, error }) => {
      if (error) {
        alert('Ошибка загрузки пользователей: ' + error.message);
        return;
      }

      let managerOptions = '';
      data.forEach(user => {
        let displayName = user.name;
        if (user.role === 'rop') displayName += ' (РОП)';
        managerOptions += `<option value="${user.name}">${displayName}</option>`;
      });

      document.getElementById('formContainer').innerHTML = `
        <button id="backToRopBtn">← Назад к панели РОПа</button>
        <h3>Создать сделку (РОП): ${crmId}</h3>
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
        <div style="margin-top:15px;">
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

      document.getElementById('ropCreateDealBtnFinal').addEventListener('click', async () => {
        const managerName = document.getElementById('ropManagerName').value;
        const contractAmount = parseFloat(document.getElementById('ropContractAmount').value);
        const paymentAmount = parseFloat(document.getElementById('ropPaymentAmount').value);
        const dealType = document.getElementById('ropDealType').value;
        const paid = document.getElementById('ropPaid').checked;
        const upSigned = document.getElementById('ropUpdSigned').checked;

        if (!managerName || isNaN(contractAmount) || isNaN(paymentAmount)) {
          alert('Заполните все поля');
          return;
        }

        const isFullyPaid = paymentAmount >= contractAmount;
        const margin = 
          dealType === 'to' || dealType === 'pto' || dealType === 'rent' ? contractAmount * 0.7 :
          dealType === 'eq' ? contractAmount * 0.2 :
          dealType === 'comp' ? contractAmount * 0.3 :
          dealType === 'rep' ? contractAmount * 0.4 : 0;

        const bonusPaid = isFullyPaid ? calculateBonus(dealType, contractAmount, false, true, upSigned) : 0;

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
            margin: margin,
            bonus_paid: bonusPaid
          }]);

        if (error) {
          alert('Ошибка: ' + error.message);
          return;
        }

        document.getElementById('ropCreateFormResult').innerHTML = '✅ Сделка создана!';
        document.getElementById('ropCreateFormResult').style.display = 'block';
        setTimeout(() => {
          document.getElementById('mainApp').style.display = 'none';
          document.getElementById('ropScreen').style.display = 'block';
          loadRopData();
        }, 2000);
      });
    });
}

// 🖊️ Редактирование — без изменений
function showRopUpdateForm(deal) {
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  const { crm_id, contract_amount, total_paid, up_signed, paid, manager_name, deal_type } = deal;
  const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};
  const typeLabel = typeLabels[deal_type] || deal_type;

  document.getElementById('formContainer').innerHTML = `
    <button id="backToRopBtn">← Назад к панели РОПа</button>
    <h3>Редактировать сделку: ${crm_id}</h3>
    <p><strong>Менеджер:</strong> ${manager_name}</p>
    <p><strong>Тип:</strong> ${typeLabel}</p>
    <p><strong>Договор:</strong> ${contract_amount.toLocaleString('ru-RU')} ₽</p>
    <label>Новая сумма оплаты (₽):</label>
    <input type="number" id="ropPaymentAmount" value="${total_paid}" placeholder="Например: 100000">
    <div style="margin-top:15px;">
      <input type="checkbox" id="ropPaid" ${paid ? 'checked' : ''}>
      <label for="ropPaid">Оплачен полностью</label>
    </div>
    <div style="margin-top:10px;">
      <input type="checkbox" id="ropUpdSigned" ${up_signed ? 'checked' : ''}>
      <label for="ropUpdSigned">УПД подписан</label>
    </div>
    <button id="saveRopDealBtn" class="btn-success" style="margin-top:15px;">Сохранить</button>
    <div id="ropUpdateResult" class="result" style="margin-top:10px;"></div>
  `;

  document.getElementById('saveRopDealBtn').addEventListener('click', async () => {
    const newPayment = parseFloat(document.getElementById('ropPaymentAmount').value) || total_paid;
    const newPaid = document.getElementById('ropPaid').checked;
    const newUpd = document.getElementById('ropUpdSigned').checked;

    const { error } = await ropSupabaseClient
      .from('deals')
      .update({
        total_paid: newPayment,
        paid: newPaid,
        up_signed: newUpd
      })
      .eq('crm_id', crm_id);

    if (error) {
      alert('Ошибка: ' + error.message);
      return;
    }

    document.getElementById('ropUpdateResult').innerHTML = '✅ Изменения сохранены!';
    document.getElementById('ropUpdateResult').style.display = 'block';
    setTimeout(() => {
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
      loadRopData();
    }, 2000);
  });
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'backToRopBtn') {
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('ropScreen').style.display = 'block';
  }
});

function calculateBonus(dealType, revenue, isFirst, paid, upSigned) {
  if (!paid || !upSigned) return 0;
  if (dealType === 'to') return isFirst ? (revenue >= 70000 ? 6000 : 3000) : (revenue >= 70000 ? 2000 : 1000);
  if (dealType === 'pto') return revenue >= 360000 ? 6000 : 3000;
  if (dealType === 'comp' || dealType === 'rep') return revenue >= 300000 ? Math.round(revenue * 0.01) : Math.round(revenue * 0.03);
  if (dealType === 'eq') return Math.round(revenue * 0.01);
  if (dealType === 'rent') return 1500;
  return 0;
}
