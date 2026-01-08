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

  loadRopManagers();
  loadRopData();
}

async function loadRopManagers() {
  try {
    const { data, error } = await ropSupabaseClient
      .from('deals')
      .select('manager_name')
      .order('manager_name');

    if (error) throw error;

    const managerSet = new Set(data.map(d => d.manager_name));
    if (ropCurrentUserName) {
      managerSet.add(ropCurrentUserName);
    }

    const managerSelect = document.getElementById('ropManagerFilter');
    managerSelect.innerHTML = '<option value="">Все менеджеры</option>';
    Array.from(managerSet).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      managerSelect.appendChild(opt);
    });
  } catch (error) {
    console.error('Ошибка загрузки менеджеров:', error);
  }
}

async function loadRopData() {
  if (!ropSupabaseClient) return;

  const period = document.getElementById('ropPeriod').value;
  const now = new Date();
  let startDate, endDate;

  switch (period) {
    case 'week':
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.setDate(diff));
      endDate = new Date(now.setDate(startDate.getDate() + 6));
      break;
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case 'quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      break;
    case 'year':
      startDate = new Date(now.getFullYear(), 0, 1);
      endDate = new Date(now.getFullYear(), 11, 31);
      break;
  }
  endDate.setHours(23, 59, 59, 999);

  try {
    const { data, error } = await ropSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, deal_type, contract_amount, margin, total_paid, paid, up_signed, created_at')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (error) throw error;

    if (!data || data.length === 0) {
      alert('Нет данных за выбранный период.');
      document.getElementById('ropSummary').style.display = 'none';
      document.getElementById('ropDealsTable').style.display = 'none';
      return;
    }

    const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
    const seasonalCoefficient = coefficients[now.getMonth()];
    const managers = [...new Set(data.map(d => d.manager_name))];
    const managerCount = managers.length || 1;
    const baseManagerPlan = 800000;
    const departmentPlan = managerCount * baseManagerPlan * seasonalCoefficient;

    let totalMargin = 0;
    data.forEach(deal => totalMargin += deal.margin || 0);
    const nds = totalMargin * 0.22;
    const cleanMargin = totalMargin - nds;
    const ropBonus = Math.round(cleanMargin * 0.10);
    const planPercent = Math.min(100, (totalMargin / departmentPlan) * 100);

    document.getElementById('totalMarginRop').textContent = totalMargin.toLocaleString('ru-RU');
    document.getElementById('ropBonus').textContent = ropBonus.toLocaleString('ru-RU');
    document.getElementById('totalDealsRop').textContent = data.length;

    document.getElementById('ropPlanBar').style.width = planPercent + '%';
    document.getElementById('ropPlanPercent').textContent = planPercent.toFixed(1) + '%';
    document.getElementById('ropPlanProgress').style.display = 'block';
    document.getElementById('ropSummary').style.display = 'block';
    document.getElementById('ropDealsTable').style.display = 'block';

    const managersObj = {};
    data.forEach(d => {
      if (!managersObj[d.manager_name]) managersObj[d.manager_name] = 0;
      managersObj[d.manager_name] += d.margin || 0;
    });
    renderAnalyticsChart('managersChart', managersObj, totalMargin, 'manager-label');

    const segments = {};
    const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};
    data.forEach(d => {
      const label = typeLabels[d.deal_type] || d.deal_type;
      if (!segments[label]) segments[label] = 0;
      segments[label] += d.margin || 0;
    });
    renderAnalyticsChart('segmentsChart', segments, totalMargin, 'segment-label');

    renderDealsTable(data, typeLabels);
  } catch (error) {
    console.error('Ошибка загрузки данных РОПа:', error);
    alert('Ошибка: ' + error.message);
  }
}

function renderAnalyticsChart(containerId, dataObj, total, labelClass) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  Object.entries(dataObj)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, value]) => {
      const percent = Math.round((value / total) * 100);
      container.innerHTML += `
        <div class="analytics-item">
          <div class="${labelClass}">${name}</div>
          <div class="value">${value.toLocaleString('ru-RU')} ₽</div>
          <div class="percent">${percent}%</div>
        </div>
      `;
    });
  document.getElementById(containerId.replace('Chart', 'Analytics')).style.display = 'block';
}

function renderDealsTable(deals, typeLabels) {
  const tbody = document.getElementById('ropDealsBody');
  tbody.innerHTML = '';
  deals.forEach(deal => {
    const status = deal.paid ? '✅ 100%' : `⏳ ${Math.round((deal.total_paid / deal.contract_amount) * 100)}%`;
    const updStatus = deal.up_signed ? '<span class="status-icon icon-success">✔️</span>' : '<span class="status-icon icon-danger">✖️</span>';
    const typeLabel = typeLabels[deal.deal_type] || deal.deal_type;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="no-wrap">${deal.crm_id}</td>
      <td class="no-wrap">${deal.manager_name}</td>
      <td class="no-wrap">${typeLabel}</td>
      <td class="no-wrap">${deal.contract_amount.toLocaleString('ru-RU')} ₽</td>
      <td class="no-wrap"><span class="margin-value">${(deal.margin || 0).toLocaleString('ru-RU')} ₽</span></td>
      <td class="no-wrap">${status}</td>
      <td class="no-wrap">${updStatus}</td>
      <td>
        <button class="editDealBtn" data-crm-id="${deal.crm_id}" style="background:var(--primary); color:white; border:none; padding:4px 8px; border-radius:4px; font-size:14px;">
          ✏️ Редакт.
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });
  document.getElementById('ropDealsTable').style.display = 'block';
}

function showRopCreateForm(crmId) {
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  ropSupabaseClient
    .from('deals')
    .select('manager_name')
    .order('manager_name')
    .then(({ data, error }) => {
      if (error) {
        alert('Ошибка загрузки менеджеров: ' + error.message);
        return;
      }

      const managerSet = new Set(data.map(d => d.manager_name));
      if (ropCurrentUserName) {
        managerSet.add(ropCurrentUserName);
      }

      const managerOptions = Array.from(managerSet)
        .sort()
        .map(name => `<option value="${name}">${name}</option>`)
        .join('');

      document.getElementById('formContainer').innerHTML = `
        <button id="backToRopBtn">← Назад к панели РОПа</button>
        <h3><i class="fas fa-plus-circle"></i> Создать сделку (РОП): ${crmId}</h3>
        <label>Менеджер:</label>
        <select id="ropManagerName">${managerOptions}</select>
        <label>Сумма договора (₽):</label>
        <input type="number" id="ropContractAmount" placeholder="600000" required>
        <label>Сумма предоплаты (₽):</label>
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
        <div id="ropAnnualSection" style="display:none; margin-top:10px;">
          <input type="checkbox" id="ropAnnualContract">
          <label for="ropAnnualContract">Годовой контракт</label>
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
        <button id="ropCreateDealBtn" class="success">Создать сделку</button>
        <div id="ropCreateFormResult" class="result" style="display:none;"></div>
      `;

      document.getElementById('ropDealType').addEventListener('change', () => {
        const isTO = document.getElementById('ropDealType').value === 'to';
        document.getElementById('ropArpuSection').style.display = isTO ? 'block' : 'none';
        document.getElementById('ropAnnualSection').style.display = isTO ? 'block' : 'none';
      });
      document.getElementById('ropDealType').dispatchEvent(new Event('change'));

      document.getElementById('ropCreateDealBtn').addEventListener('click', async () => {
        const managerName = document.getElementById('ropManagerName').value;
        const contractAmount = parseFloat(document.getElementById('ropContractAmount').value);
        const paymentAmount = parseFloat(document.getElementById('ropPaymentAmount').value);
        const dealType = document.getElementById('ropDealType').value;
        const arpuInput = document.getElementById('ropArpu').value;
        const annualContract = document.getElementById('ropAnnualContract').checked;
        const isFirst = document.getElementById('ropIsFirst').checked;
        const paid = document.getElementById('ropPaid').checked;
        const upSigned = document.getElementById('ropUpdSigned').checked;

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

        const { error } = await ropSupabaseClient
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

async function showRopUpdateForm(deal) {
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  const { crm_id, contract_amount, total_paid, up_signed, paid, manager_name, deal_type, is_first, arpu_input, annual_contract } = deal;
  const remaining = contract_amount - total_paid;
  const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};
  const typeLabel = typeLabels[deal_type] || deal_type;

  document.getElementById('formContainer').innerHTML = `
    <button id="backToRopBtn">← Назад к панели РОПа</button>
    <h3><i class="fas fa-edit"></i> Редактировать сделку (РОП): ${crm_id}</h3>
    <p><strong>Менеджер:</strong> ${manager_name}</p>
    <p><strong>Тип:</strong> ${typeLabel}</p>
    <p><strong>Сумма договора:</strong> ${contract_amount.toLocaleString('ru-RU')} ₽</p>
    <p><strong>Уже оплачено:</strong> ${total_paid.toLocaleString('ru-RU')} ₽</p>
    <p style="color:${remaining <= 0 ? 'green' : 'orange'};">
      <strong>Осталось оплатить:</strong> ${Math.max(0, remaining).toLocaleString('ru-RU')} ₽
    </p>
    <label>Новая сумма оплаты (₽):</label>
    <input type="number" id="ropPaymentAmount" value="${total_paid}" placeholder="Например: 140000">
    <div style="margin-top:15px;">
      <input type="checkbox" id="ropPaid" ${paid ? 'checked' : ''}>
      <label for="ropPaid">Оплачен полностью</label>
    </div>
    <div style="margin-top:10px;">
      <input type="checkbox" id="ropUpdSigned" ${up_signed ? 'checked' : ''}>
      <label for="ropUpdSigned">УПД подписан</label>
    </div>
    <button id="saveRopDealBtn" class="success">Сохранить изменения</button>
    <div id="ropUpdateResult" class="result" style="display:none; margin-top:15px;"></div>
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
        up_signed: newUpd,
        updated_at: new Date().toISOString()
      })
      .eq('crm_id', crm_id);

    if (error) {
      alert('Ошибка сохранения: ' + error.message);
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
  if (e.target.classList.contains('editDealBtn')) {
    const crmId = e.target.getAttribute('data-crm-id');
    ropSupabaseClient
      .from('deals')
      .select('*')
      .eq('crm_id', crmId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          alert('Ошибка загрузки сделки: ' + error.message);
          return;
        }
        if (data) showRopUpdateForm(data);
      });
  }
});

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
