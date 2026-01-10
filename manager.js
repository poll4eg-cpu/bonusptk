// manager.js — изолированный модуль менеджера
let managerSupabaseClient = null;
let managerCurrentUserPhone = null;
let managerCurrentUserName = null;

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

  // Обратная связь
  function toggleFeedback() {
    const form = document.getElementById('feedbackForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }

  // Проверка CRM ID
  async function checkCrmId() {
    const crmId = document.getElementById('inputCrmId')?.value.trim();
    if (!crmId) {
      showError('crmError', 'Введите номер сделки');
      return;
    }

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
      showError('crmError', 'Ошибка: ' + err.message);
    }
  }

  // Расчёт премии за месяц
  async function loadMonthBonus() {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const deals = await window.cachedSupabaseQuery('deals', async () => {
        const { data, error } = await managerSupabaseClient
          .from('deals')
          .select('crm_id, deal_type, contract_amount, total_paid, paid, up_signed, bonus_paid')
          .eq('manager_name', managerCurrentUserName)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString());
        if (error) throw error;
        return data || [];
      });

      renderBonusReport(deals, now);
    } catch (err) {
      console.error('Ошибка расчёта премии:', err);
      alert('Не удалось загрузить премию');
    }
  }

  // Отправка обратной связи
  async function sendFeedback() {
    const msg = document.getElementById('feedbackText')?.value.trim();
    if (!msg) return alert('Введите сообщение');

    try {
      const { error } = await managerSupabaseClient
        .from('feedback')
        .insert([{ phone: managerCurrentUserPhone, message: msg, created_at: new Date().toISOString() }]);
      if (error) throw error;
      alert('✅ Сообщение отправлено!');
      document.getElementById('feedbackText').value = '';
      document.getElementById('feedbackForm').style.display = 'none';
    } catch (err) {
      alert('Ошибка отправки: ' + err.message);
    }
  }

  // Форма создания
  function showCreateForm(crmId) {
    document.getElementById('crmScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('formContainer').innerHTML = getCreateFormHtml(crmId);
    attachCreateFormHandlers();
  }

  // Форма обновления
  function showUpdateForm(deal) {
    document.getElementById('crmScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('formContainer').innerHTML = getUpdateFormHtml(deal);
    attachUpdateFormHandlers(deal);
  }

  // Вспомогательные функции (renderBonusReport, calculateBonus, getCreateFormHtml и т.д.)
  // → Полный код этих функций вы уже имеете в app.js — просто перенесите их сюда

  // Пример упрощённой функции расчёта бонуса
  function calculateBonus(dealType, revenue, isFirst, paid, upSigned) {
    if (!paid || !upSigned) return 0;
    if (dealType === 'to') return isFirst ? (revenue >= 70000 ? 6000 : revenue >= 35000 ? 3000 : 500) : (revenue >= 70000 ? 2000 : 1000);
    if (dealType === 'pto') return revenue >= 360000 ? 6000 : revenue >= 90000 ? 3000 : 1000;
    if (['comp', 'rep'].includes(dealType)) return revenue >= 300000 ? Math.round(revenue * 0.01) : Math.round(revenue * 0.03);
    if (dealType === 'eq') return Math.round(revenue * 0.01);
    if (dealType === 'rent') return 1500;
    return 0;
  }

  // ... остальные функции (renderBonusReport, getCreateFormHtml, attachCreateFormHandlers и т.д.)

  console.log('Модуль менеджера готов');
}

// Экспорт для глобального доступа
if (typeof window !== 'undefined') {
  window.initManagerPanel = initManagerPanel;
}

// Вспомогательная функция ошибок
function showError(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
    el.style.display = 'block';
  }
}
