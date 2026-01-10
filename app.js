// app.js — только авторизация + роутинг
document.addEventListener('DOMContentLoaded', () => {
  console.log('app.js: инициализация...');

  // ✅ УБРАНЫ ПРОБЕЛЫ
  const supabaseUrl = 'https://ebgqaswbnsxklbshtkzo.supabase.co';
  const supabaseAnonKey = 'sb_publishable_xUFmnxRAnAPtHvQ9OJonwA_Tzt7TBui';
  const supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

  let currentUserPhone = null;
  let currentUserName = null;
  let currentUserRole = null;

  // 💡 Управление URL
  function updateUrl(screenName) {
    const newUrl = `${window.location.origin}/#${screenName}`;
    window.history.pushState({ screen: screenName }, '', newUrl);
  }

  // 🖥️ Показ экрана
  function showScreen(screenName) {
    const screens = ['loginScreen', 'crmScreen', 'mainApp', 'ropScreen', 'finScreen', 'genScreen'];
    screens.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    const target = document.getElementById(
      screenName === 'form' ? 'mainApp' : screenName + 'Screen'
    );
    if (target) target.style.display = 'block';
  }

  // 👤 Авторизация
  document.getElementById('loginBtn')?.addEventListener('click', async () => {
    const phone = document.getElementById('loginPhone')?.value.trim();
    if (!phone) { alert('Введите номер телефона'); return; }

    const passwordField = document.getElementById('passwordField');
    if (passwordField.style.display !== 'block') {
      passwordField.style.display = 'block';
      document.getElementById('loginPassword').focus();
      document.getElementById('loginBtn').textContent = 'Войти';
      return;
    }

    const password = document.getElementById('loginPassword')?.value.trim();
    if (!password) { alert('Введите пароль'); return; }

    try {
      const { data, error } = await supabaseClient
        .from('allowed_users')
        .select('phone, name, role, password')
        .eq('phone', phone)
        .single();

      if (error || !data || password !== data.password) {
        document.getElementById('loginError').textContent = 'Неверный логин или пароль';
        document.getElementById('loginError').style.display = 'block';
        return;
      }

      currentUserPhone = phone;
      currentUserName = data.name;
      currentUserRole = data.role;

      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('loginError').style.display = 'none';

      // Роутинг по ролям
      if (data.role === 'manager') {
        showScreen('crm');
        updateUrl('crm');
        if (!window.managerModuleLoaded) {
          const script = document.createElement('script');
          script.src = 'manager.js';
          script.onload = () => {
            if (typeof initManagerPanel === 'function') {
              initManagerPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.managerModuleLoaded = true;
          };
          document.head.appendChild(script);
        }
      }
      else if (data.role === 'rop') {
        showScreen('rop');
        updateUrl('rop');
        if (!window.ropModuleLoaded) {
          const script = document.createElement('script');
          script.src = 'rop.js';
          script.onload = () => {
            if (typeof initRopPanel === 'function') {
              initRopPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.ropModuleLoaded = true;
          };
          document.head.appendChild(script);
        }
      }
      else if (data.role === 'fin') {
        showScreen('fin');
        updateUrl('fin');
        if (!window.finModuleLoaded) {
          const script = document.createElement('script');
          script.src = 'fin.js';
          script.onload = () => {
            if (typeof initFinPanel === 'function') {
              initFinPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.finModuleLoaded = true;
          };
          document.head.appendChild(script);
        }
      }
      else if (data.role === 'gen') {
        showScreen('gen');
        updateUrl('gen');
        if (!window.genModuleLoaded) {
          const script = document.createElement('script');
          script.src = 'gen.js';
          script.onload = () => {
            if (typeof initGenPanel === 'function') {
              initGenPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.genModuleLoaded = true;
          };
          document.head.appendChild(script);
        }
      }
    } catch (err) {
      console.error('Ошибка входа:', err);
      alert('Ошибка подключения. Проверьте интернет.');
    }
  });

  // 🔙 Поддержка кнопки "Назад"
  window.addEventListener('popstate', (e) => {
    const screen = e.state?.screen || 'login';
    showScreen(screen);
  });

  // 🌐 Инициализация из URL
  const screenFromUrl = window.location.hash.replace('#', '') || 'login';
  showScreen(screenFromUrl);
});
