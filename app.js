// app.js — только авторизация + роутинг
document.addEventListener('DOMContentLoaded', () => {
  console.log('app.js: инициализация...');

  // ✅ УБРАНЫ ПРОБЕЛЫ
  const supabaseUrl = 'https://ebgqaswbnsxklbshtkzo.supabase.co';
  const supabaseAnonKey = 'sb_publishable_xUFmnxRAnAPtHvQ9OJonwA_Tzt7TBui';
  
  // Проверяем, что Supabase загружен
  if (typeof supabase === 'undefined') {
    console.error('Supabase не загружен!');
    alert('Ошибка загрузки Supabase. Проверьте интернет соединение.');
    return;
  }
  
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
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const phoneInput = document.getElementById('loginPhone');
      const phone = phoneInput?.value.trim();
      if (!phone) { 
        alert('Введите номер телефона'); 
        return; 
      }

      const passwordField = document.getElementById('passwordField');
      if (passwordField && passwordField.style.display !== 'block') {
        passwordField.style.display = 'block';
        const passwordInput = document.getElementById('loginPassword');
        if (passwordInput) passwordInput.focus();
        if (loginBtn) loginBtn.textContent = 'Войти';
        return;
      }

      const passwordInput = document.getElementById('loginPassword');
      const password = passwordInput?.value.trim();
      if (!password) { 
        alert('Введите пароль'); 
        return; 
      }

      try {
        console.log('Попытка входа для телефона:', phone);
        
        const { data, error } = await supabaseClient
          .from('allowed_users')
          .select('phone, name, role, password')
          .eq('phone', phone)
          .single();

        console.log('Ответ от Supabase:', { data, error });

        if (error || !data || password !== data.password) {
          const loginError = document.getElementById('loginError');
          if (loginError) {
            loginError.textContent = 'Неверный логин или пароль';
            loginError.style.display = 'block';
          }
          return;
        }

        currentUserPhone = phone;
        currentUserName = data.name;
        currentUserRole = data.role;

        const loginScreen = document.getElementById('loginScreen');
        const loginError = document.getElementById('loginError');
        if (loginScreen) loginScreen.style.display = 'none';
        if (loginError) loginError.style.display = 'none';

        console.log('Пользователь авторизован:', { 
          name: currentUserName, 
          role: currentUserRole 
        });

        // Роутинг по ролям
        if (data.role === 'manager') {
          showScreen('crm');
          updateUrl('crm');
          if (!window.managerModuleLoaded) {
            console.log('Загрузка manager.js...');
            const script = document.createElement('script');
            script.src = 'manager.js';
            script.onload = () => {
              console.log('manager.js загружен');
              if (typeof initManagerPanel === 'function') {
                initManagerPanel(supabaseClient, currentUserPhone, currentUserName);
              }
              window.managerModuleLoaded = true;
            };
            script.onerror = () => {
              console.error('Ошибка загрузки manager.js');
              alert('Ошибка загрузки модуля менеджера');
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
  }

  // 🔙 Поддержка кнопки "Назад"
  window.addEventListener('popstate', (e) => {
    const screen = e.state?.screen || 'login';
    showScreen(screen);
  });

  // 🌐 Инициализация из URL
  const screenFromUrl = window.location.hash.replace('#', '') || 'login';
  showScreen(screenFromUrl);
  
  console.log('app.js инициализирован');
});
