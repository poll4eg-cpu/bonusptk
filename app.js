// app.js — только авторизация + роутинг

// Ждём загрузки ВСЕХ ресурсов
window.addEventListener('load', () => {
  console.log('Страница полностью загружена');
  initApp();
});

function initApp() {
  console.log('app.js: инициализация...');

  // Проверяем загружены ли библиотеки
  if (typeof supabase === 'undefined') {
    console.error('Supabase не загружен!');
    document.body.innerHTML = '<h1 style="color:red; text-align:center; margin-top:50px;">Ошибка: Supabase не загружен. Проверьте интернет соединение.</h1>';
    return;
  }

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
    console.log('Показываем экран:', screenName);
    
    const screens = ['loginScreen', 'crmScreen', 'mainApp', 'ropScreen', 'finScreen', 'genScreen'];
    screens.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });

    // Специальный случай для формы менеджера
    if (screenName === 'form') {
      const mainApp = document.getElementById('mainApp');
      if (mainApp) mainApp.style.display = 'block';
    } else {
      const targetId = screenName + 'Screen';
      const target = document.getElementById(targetId);
      if (target) {
        target.style.display = 'block';
        console.log('Экран показан:', targetId);
      } else {
        console.error('Экран не найден:', targetId);
        // Показываем логин по умолчанию
        const loginScreen = document.getElementById('loginScreen');
        if (loginScreen) loginScreen.style.display = 'block';
      }
    }
  }

  // 👤 Авторизация
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    console.log('Кнопка входа найдена');
    loginBtn.addEventListener('click', handleLogin);
  } else {
    console.error('Кнопка входа не найдена!');
  }

  async function handleLogin() {
    console.log('Нажата кнопка входа');
    const phone = document.getElementById('loginPhone')?.value.trim();
    if (!phone) { 
      alert('Введите номер телефона'); 
      return; 
    }

    const passwordField = document.getElementById('passwordField');
    if (passwordField && passwordField.style.display !== 'block') {
      passwordField.style.display = 'block';
      document.getElementById('loginPassword')?.focus();
      document.getElementById('loginBtn').textContent = 'Войти';
      return;
    }

    const password = document.getElementById('loginPassword')?.value.trim();
    if (!password) { 
      alert('Введите пароль'); 
      return; 
    }

    try {
      console.log('Отправляем запрос авторизации для:', phone);
      const { data, error } = await supabaseClient
        .from('allowed_users')
        .select('phone, name, role, password')
        .eq('phone', phone)
        .single();

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

      console.log('Авторизация успешна:', { name: currentUserName, role: currentUserRole });

      // Скрываем экран входа
      const loginScreen = document.getElementById('loginScreen');
      const loginError = document.getElementById('loginError');
      if (loginScreen) loginScreen.style.display = 'none';
      if (loginError) loginError.style.display = 'none';

      // Роутинг по ролям
      if (data.role === 'manager') {
        console.log('Загружаем панель менеджера');
        showScreen('crm');
        updateUrl('crm');
        
        // Загружаем модуль менеджера
        if (!window.managerModuleLoaded) {
          const script = document.createElement('script');
          script.src = 'manager.js';
          script.onload = () => {
            console.log('manager.js загружен');
            if (typeof initManagerPanel === 'function') {
              initManagerPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.managerModuleLoaded = true;
          };
          script.onerror = (err) => {
            console.error('Ошибка загрузки manager.js:', err);
            alert('Не удалось загрузить модуль менеджера');
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
      else {
        console.error('Неизвестная роль:', data.role);
        showScreen('login');
      }
    } catch (err) {
      console.error('Ошибка входа:', err);
      alert('Ошибка подключения. Проверьте интернет.');
    }
  }

  // 🔙 Поддержка кнопки "Назад"
  window.addEventListener('popstate', (e) => {
    const screen = e.state?.screen || 'login';
    showScreen(screen);
  });

  // 🌐 Инициализация из URL
  const screenFromUrl = window.location.hash.replace('#', '') || 'login';
  console.log('Экран из URL:', screenFromUrl);
  
  // Если не login, скрываем loginScreen
  if (screenFromUrl !== 'login') {
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';
  }
  
  showScreen(screenFromUrl);
  
  console.log('app.js инициализирован');
}
