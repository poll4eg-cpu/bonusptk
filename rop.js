let ropSupabaseClient = null;
let ropCurrentUserPhone = null;
let ropCurrentUserName = null;

// Инициализация
function initRopPanel(supabaseClient, currentUserPhone, currentUserName) {
  ropSupabaseClient = supabaseClient;
  ropCurrentUserPhone = currentUserPhone;
  ropCurrentUserName = currentUserName;

  // Переключение вкладок
  document.getElementById('showAnalyticsBtn').addEventListener('click', () => {
    document.getElementById('analyticsBlock').style.display = 'block';
    document.getElementById('createDealBlock').style.display = 'none';
    document.getElementById('accessBlock').style.display = 'none';
  });
  document.getElementById('showCreateBtn').addEventListener('click', () => {
    document.getElementById('analyticsBlock').style.display = 'none';
    document.getElementById('createDealBlock').style.display = 'block';
    document.getElementById('accessBlock').style.display = 'none';
    loadRopManagersForForm();
  });
  document.getElementById('showAccessBtn').addEventListener('click', () => {
    document.getElementById('analyticsBlock').style.display = 'none';
    document.getElementById('createDealBlock').style.display = 'none';
    document.getElementById('accessBlock').style.display = 'block';
    loadUsersList();
  });

  // Аналитика
  document.getElementById('loadRopData').addEventListener('click', loadRopData);
  document.getElementById('applyRopFilters').addEventListener('click', loadRopData);

  // Создание сделки
  document.getElementById('ropCreateDealBtn').addEventListener('click', createRopDeal);

  // Управление доступом
  document.getElementById('addUserBtn').addEventListener('click', addUser);
}

// Загрузка менеджеров для формы
function loadRopManagersForForm() {
  ropSupabaseClient
    .from('deals')
    .select('manager_name')
    .order('manager_name')
    .then(({ data, error }) => {
      if (error) return;
      const managerSet = new Set(data.map(d => d.manager_name));
      if (ropCurrentUserName) managerSet.add(ropCurrentUserName);
      const select = document.getElementById('ropManagerName');
      select.innerHTML = '<option value="">Выберите менеджера</option>';
      Array.from(managerSet).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      });
    });
}

// Аналитика
async function loadRopData() {
  const period = document.getElementById('ropPeriod').value;
  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  
  if (period === 'week') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(now.setDate(diff));
    endDate = new Date(now.setDate(startDate.getDate() + 6));
  } else if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    startDate = new Date(now.getFullYear(), q * 3, 1);
    endDate = new Date(now.getFullYear(), q * 3 + 3, 0);
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  }
  endDate.setHours(23, 59, 59, 999);

  const { data, error } = await ropSupabaseClient
    .from('deals')
    .select('crm_id, manager_name, deal_type, contract_amount, margin, total_paid, paid, up_signed')
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (error || !data?.length) {
    document.getElementById('ropSummary').style.display = 'none';
    document.getElementById('ropDealsTable').style.display = 'none';
    return;
  }

  // Расчёт
  const managers = [...new Set(data.map(d => d.manager_name))];
  const coefficients = [0.7, 1.0, 1.0, 1.0, 0.8, 1.0, 1.0, 1.0, 1.1, 1.1, 1.1, 1.4];
  const seasonalCoefficient = coefficients[now.getMonth()];
  const departmentPlan = managers.length * 800000 * seasonalCoefficient;
  let totalMargin = 0;
  data.forEach(d => totalMargin += d.margin || 0);
  const cleanMargin = totalMargin * 0.78;
  const ropBonus = Math.round(cleanMargin * 0.10);
  const planPercent = Math.min(100, (totalMargin / departmentPlan) * 100);

  // Отображение итогов
  document.getElementById('totalMarginRop').textContent = totalMargin.toLocaleString('ru-RU');
  document.getElementById('ropBonus').textContent = ropBonus.toLocaleString('ru-RU');
  document.getElementById('totalDealsRop').textContent = data.length;
  document.getElementById('ropPlanBar').style.width = planPercent + '%';
  document.getElementById('ropPlanPercent').textContent = planPercent.toFixed(1) + '%';
  document.getElementById('ropSummary').style.display = 'block';
  document.getElementById('ropPlanProgress').style.display = 'block';

  // Фильтрация менеджеров
  const managerFilter = document.getElementById('ropManagerFilter');
  managerFilter.innerHTML = '<option value="">Все менеджеры</option>';
  managers.sort().forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    managerFilter.appendChild(opt);
  });

  // Таблица сделок
  const tbody = document.getElementById('ropDealsBody');
  tbody.innerHTML = '';
  const typeLabels = {'to':'ТО','pto':'ПТО','eq':'Оборудование','comp':'Комплектующие','rep':'Ремонты','rent':'Аренда'};
  data.forEach(deal => {
    const row = document.createElement('tr');
    const typeLabel = typeLabels[deal.deal_type] || deal.deal_type;
    const status = deal.paid ? '✅' : '⚠️';
    row.innerHTML = `
      <td>${deal.crm_id}</td>
      <td>${deal.manager_name}</td>
      <td>${typeLabel}</td>
      <td>${deal.contract_amount.toLocaleString('ru-RU')}</td>
      <td>${(deal.margin || 0).toLocaleString('ru-RU')}</td>
      <td><button class="editDealBtn" data-crm-id="${deal.crm_id}">✏️</button></td>
    `;
    tbody.appendChild(row);
  });
  document.getElementById('ropDealsTable').style.display = 'block';

  // Обработчик редактирования
  document.querySelectorAll('.editDealBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const crmId = btn.getAttribute('data-crm-id');
      // Для простоты — открываем стандартную форму редактирования
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

// Создание сделки
async function createRopDeal() {
  const crmId = document.getElementById('ropCrmId').value.trim();
  const manager = document.getElementById('ropManagerName').value;
  const contract = parseFloat(document.getElementById('ropContractAmount').value);
  const payment = parseFloat(document.getElementById('ropPaymentAmount').value);
  const dealType = document.getElementById('ropDealType').value;

  if (!crmId || !manager || isNaN(contract) || isNaN(payment)) {
    alert('Заполните все поля');
    return;
  }

  const paid = payment >= contract;
  const margin = contract * (dealType === 'eq' ? 0.2 : dealType === 'comp' || dealType === 'rep' ? 0.3 : 0.7);
  const bonus = paid ? calculateBonus(dealType, contract, false, true, false) : 0;

  const { error } = await ropSupabaseClient
    .from('deals')
    .insert([{
      crm_id: crmId,
      manager_name: manager,
      deal_type: dealType,
      contract_amount: contract,
      total_paid: payment,
      paid,
      up_signed: false,
      margin,
      bonus_paid: bonus
    }]);

  if (error) {
    alert('Ошибка: ' + error.message);
    return;
  }

  document.getElementById('ropCreateResult').textContent = '✅ Сделка создана!';
  setTimeout(() => document.getElementById('ropCreateResult').textContent = '', 2000);
  document.getElementById('ropCrmId').value = '';
  document.getElementById('ropContractAmount').value = '';
  document.getElementById('ropPaymentAmount').value = '';
}

// Управление доступом
async function addUser() {
  const phone = document.getElementById('newUserPhone').value.trim();
  const name = document.getElementById('newUserName').value.trim();
  const role = document.getElementById('newUserRole').value;
  const password = document.getElementById('newUserPassword').value.trim();

  if (!phone || !name || !password) {
    alert('Заполните все поля');
    return;
  }

  const { error } = await ropSupabaseClient
    .from('allowed_users')
    .insert([{ phone, name, role, password }]);

  if (error) {
    alert('Ошибка: ' + error.message);
    return;
  }

  document.getElementById('accessResult').textContent = '✅ Пользователь добавлен!';
  document.getElementById('newUserPhone').value = '';
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserPassword').value = '';
  setTimeout(() => document.getElementById('accessResult').textContent = '', 2000);
  loadUsersList();
}

async function loadUsersList() {
  const { data, error } = await ropSupabaseClient
    .from('allowed_users')
    .select('phone, name, role')
    .order('name', { ascending: true }); // ← Без created_at

  if (error) {
    console.error('Ошибка загрузки:', error);
    document.getElementById('usersList').innerHTML = '<p>Ошибка загрузки</p>';
    return;
  }

  const listDiv = document.getElementById('usersList');
  listDiv.innerHTML = '';

  data.forEach(user => {
    const canDelete = user.phone !== ropCurrentUserPhone;
    listDiv.innerHTML += `
      <div style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid #eee;">
        <div>
          <strong>${user.name}</strong><br>
          <small>${user.phone} • ${user.role === 'rop' ? 'РОП' : 'Менеджер'}</small>
        </div>
        ${canDelete ? `<button class="deleteBtn" data-phone="${user.phone}">Удалить</button>` : ''}
      </div>
    `;
  });

  document.querySelectorAll('.deleteBtn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Удалить?')) return;
      const phone = btn.getAttribute('phone');
      const { error } = await ropSupabaseClient
        .from('allowed_users')
        .delete()
        .eq('phone', phone);
      if (error) alert('Ошибка: ' + error.message);
      else loadUsersList();
    });
  });
}

// Редактирование сделки (упрощённая версия)
function showRopUpdateForm(deal) {
  document.getElementById('ropScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('formContainer').innerHTML = `
    <button id="backToRopBtn">← Назад</button>
    <h3>Редактировать сделку: ${deal.crm_id}</h3>
    <p>Менеджер: ${deal.manager_name}</p>
    <p>Договор: ${deal.contract_amount.toLocaleString('ru-RU')} ₽</p>
    <label>Новая оплата:</label>
    <input type="number" id="newPayment" value="${deal.total_paid}" style="width:100%; margin-bottom:10px;">
    <div>
      <input type="checkbox" id="paid" ${deal.paid ? 'checked' : ''}>
      <label for="paid">Оплачен</label>
    </div>
    <div>
      <input type="checkbox" id="upSigned" ${deal.up_signed ? 'checked' : ''}>
      <label for="upSigned">УПД подписан</label>
    </div>
    <button id="saveDeal" class="btn-success" style="margin-top:10px;">Сохранить</button>
  `;

  document.getElementById('saveDeal').addEventListener('click', async () => {
    const newPayment = parseFloat(document.getElementById('newPayment').value) || 0;
    const paid = document.getElementById('paid').checked;
    const upSigned = document.getElementById('upSigned').checked;

    const { error } = await ropSupabaseClient
      .from('deals')
      .update({ total_paid: newPayment, paid, up_signed: upSigned })
      .eq('crm_id', deal.crm_id);

    if (error) alert('Ошибка: ' + error.message);
    else {
      document.getElementById('mainApp').style.display = 'none';
      document.getElementById('ropScreen').style.display = 'block';
      loadRopData();
    }
  });
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'backToRopBtn') {
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('ropScreen').style.display = 'block';
  }
});

// Расчёт премии (упрощённая версия)
function calculateBonus(dealType, revenue, isFirst, paid, upSigned) {
  if (!paid || !upSigned) return 0;
  if (dealType === 'to') return isFirst ? (revenue >= 70000 ? 6000 : 3000) : (revenue >= 70000 ? 2000 : 1000);
  if (dealType === 'pto') return revenue >= 360000 ? 6000 : 3000;
  if (dealType === 'comp' || dealType === 'rep') return revenue >= 300000 ? Math.round(revenue * 0.01) : Math.round(revenue * 0.03);
  if (dealType === 'eq') return Math.round(revenue * 0.01);
  if (dealType === 'rent') return 1500;
  return 0;
}
