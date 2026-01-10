// app.js — основной файл приложения (авторизация + роутинг)
console.log('🚀 app.js загружен');

// Глобальные переменные для хранения данных пользователя
let currentUserPhone = null;
let currentUserName = null;
let currentUserRole = null;
let supabaseClient = null;

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM загружен, инициализируем приложение...');
    initializeApp();
});

function initializeApp() {
    console.log('🔧 Инициализация приложения...');
    
    // Инициализация Supabase
    try {
        const supabaseUrl = 'https://ebgqaswbnsxklbshtkzo.supabase.co';
        const supabaseAnonKey = 'sb_publishable_xUFmnxRAnAPtHvQ9OJonwA_Tzt7TBui';
        
        if (typeof supabase === 'undefined') {
            throw new Error('Supabase не загружен! Проверьте подключение к интернету.');
        }
        
        supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
        console.log('✅ Supabase инициализирован');
    } catch (error) {
        console.error('❌ Ошибка инициализации Supabase:', error);
        showError('Ошибка подключения к базе данных. Проверьте интернет соединение.');
        return;
    }
    
    // Настройка начального состояния интерфейса
    setupInitialUI();
    
    // Настройка обработчиков событий
    setupEventListeners();
    
    // Обработка URL для роутинга
    handleRouting();
    
    console.log('✅ Приложение инициализировано');
}

function setupInitialUI() {
    // Скрываем все экраны кроме логина
    const screens = ['crmScreen', 'mainApp', 'ropScreen', 'finScreen', 'genScreen'];
    screens.forEach(screenId => {
        const screen = document.getElementById(screenId);
        if (screen) screen.style.display = 'none';
    });
    
    // Показываем экран логина
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) {
        loginScreen.style.display = 'block';
        console.log('✅ Экран логина показан');
    }
    
    // Сбрасываем поля формы
    const loginPhone = document.getElementById('loginPhone');
    const loginPassword = document.getElementById('loginPassword');
    const passwordField = document.getElementById('passwordField');
    
    if (loginPhone) loginPhone.value = '';
    if (loginPassword) loginPassword.value = '';
    if (passwordField) passwordField.style.display = 'none';
    
    // Скрываем ошибки
    const loginError = document.getElementById('loginError');
    if (loginError) loginError.style.display = 'none';
}

function setupEventListeners() {
    // Обработчик кнопки входа
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
        console.log('✅ Обработчик кнопки входа установлен');
    } else {
        console.error('❌ Кнопка входа не найдена!');
    }
    
    // Обработчик нажатия Enter в поле пароля
    const loginPassword = document.getElementById('loginPassword');
    if (loginPassword) {
        loginPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });
    }
    
    // Обработчик изменения номера телефона
    const loginPhone = document.getElementById('loginPhone');
    if (loginPhone) {
        loginPhone.addEventListener('input', () => {
            const loginError = document.getElementById('loginError');
            if (loginError) loginError.style.display = 'none';
        });
    }
}

async function handleLogin() {
    console.log('🔐 Обработка входа...');
    
    const phone = document.getElementById('loginPhone')?.value.trim();
    const password = document.getElementById('loginPassword')?.value.trim();
    const passwordField = document.getElementById('passwordField');
    const loginBtn = document.getElementById('loginBtn');
    const loginError = document.getElementById('loginError');
    
    // Валидация
    if (!phone) {
        showError('Введите номер телефона');
        return;
    }
    
    // Если поле пароля скрыто, показываем его
    if (passwordField && passwordField.style.display !== 'block') {
        passwordField.style.display = 'block';
        document.getElementById('loginPassword')?.focus();
        if (loginBtn) loginBtn.textContent = 'Войти';
        return;
    }
    
    if (!password) {
        showError('Введите пароль');
        return;
    }
    
    // Показываем индикатор загрузки
    if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Вход...';
    }
    
    try {
        console.log(`📞 Попытка входа для телефона: ${phone}`);
        
        // Запрос к базе данных
        const { data, error } = await supabaseClient
            .from('allowed_users')
            .select('phone, name, role, password')
            .eq('phone', phone)
            .single();
        
        // Обработка ошибок
        if (error) {
            console.error('Ошибка запроса:', error);
            showError('Ошибка сервера. Попробуйте позже.');
            return;
        }
        
        if (!data) {
            console.log('Пользователь не найден');
            showError('Пользователь не найден');
            return;
        }
        
        if (password !== data.password) {
            console.log('Неверный пароль');
            showError('Неверный пароль');
            return;
        }
        
        // Успешная авторизация
        console.log('✅ Авторизация успешна:', {
            name: data.name,
            role: data.role,
            phone: data.phone
        });
        
        // Сохраняем данные пользователя
        currentUserPhone = data.phone;
        currentUserName = data.name;
        currentUserRole = data.role;
        
        // Скрываем ошибку
        if (loginError) loginError.style.display = 'none';
        
        // Показываем соответствующий экран
        showUserScreen(data.role);
        
    } catch (error) {
        console.error('❌ Ошибка входа:', error);
        showError('Ошибка подключения. Проверьте интернет.');
    } finally {
        // Восстанавливаем кнопку
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Войти';
        }
    }
}

function showUserScreen(role) {
    console.log(`👤 Показываем экран для роли: ${role}`);
    
    // Скрываем экран логина
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen) loginScreen.style.display = 'none';
    
    // Обновляем URL
    updateUrl(role);
    
    // Показываем соответствующий экран
    switch (role) {
        case 'manager':
            showScreen('crm');
            loadManagerModule();
            break;
        case 'rop':
            showScreen('rop');
            loadRopModule();
            break;
        case 'fin':
            showScreen('fin');
            loadFinModule();
            break;
        case 'gen':
            showScreen('gen');
            loadGenModule();
            break;
        default:
            console.error(`❌ Неизвестная роль: ${role}`);
            showScreen('login');
    }
}

function showScreen(screenName) {
    console.log(`🖥️ Переключаем на экран: ${screenName}`);
    
    // Скрываем все экраны
    const screens = ['loginScreen', 'crmScreen', 'mainApp', 'ropScreen', 'finScreen', 'genScreen'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    
    // Показываем нужный экран
    if (screenName === 'form') {
        const mainApp = document.getElementById('mainApp');
        if (mainApp) mainApp.style.display = 'block';
    } else {
        const targetId = screenName === 'login' ? 'loginScreen' : screenName + 'Screen';
        const target = document.getElementById(targetId);
        if (target) {
            target.style.display = 'block';
            console.log(`✅ Показан экран: ${targetId}`);
        } else {
            console.error(`❌ Экран не найден: ${targetId}`);
            // Возвращаем на логин
            const loginScreen = document.getElementById('loginScreen');
            if (loginScreen) loginScreen.style.display = 'block';
        }
    }
}

function updateUrl(screenName) {
    try {
        const newUrl = `${window.location.pathname}#${screenName}`;
        window.history.pushState({ screen: screenName }, '', newUrl);
        console.log(`🔗 URL обновлен: ${newUrl}`);
    } catch (error) {
        console.error('Ошибка обновления URL:', error);
    }
}

// Функции загрузки модулей
function loadManagerModule() {
    if (!window.managerModuleLoaded) {
        console.log('📦 Загружаем модуль менеджера...');
        const script = document.createElement('script');
        script.src = 'manager.js';
        script.onload = () => {
            console.log('✅ manager.js загружен');
            if (typeof initManagerPanel === 'function') {
                initManagerPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.managerModuleLoaded = true;
        };
        script.onerror = () => {
            console.error('❌ Ошибка загрузки manager.js');
            alert('Не удалось загрузить модуль менеджера');
        };
        document.head.appendChild(script);
    } else {
        console.log('📦 Модуль менеджера уже загружен');
    }
}

function loadRopModule() {
    if (!window.ropModuleLoaded) {
        console.log('📦 Загружаем модуль РОПа...');
        const script = document.createElement('script');
        script.src = 'rop.js';
        script.onload = () => {
            console.log('✅ rop.js загружен');
            if (typeof initRopPanel === 'function') {
                initRopPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.ropModuleLoaded = true;
        };
        document.head.appendChild(script);
    }
}

function loadFinModule() {
    if (!window.finModuleLoaded) {
        console.log('📦 Загружаем модуль финансиста...');
        const script = document.createElement('script');
        script.src = 'fin.js';
        script.onload = () => {
            console.log('✅ fin.js загружен');
            if (typeof initFinPanel === 'function') {
                initFinPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.finModuleLoaded = true;
        };
        document.head.appendChild(script);
    }
}

function loadGenModule() {
    if (!window.genModuleLoaded) {
        console.log('📦 Загружаем модуль генерального директора...');
        const script = document.createElement('script');
        script.src = 'gen.js';
        script.onload = () => {
            console.log('✅ gen.js загружен');
            if (typeof initGenPanel === 'function') {
                initGenPanel(supabaseClient, currentUserPhone, currentUserName);
            }
            window.genModuleLoaded = true;
        };
        document.head.appendChild(script);
    }
}

function handleRouting() {
    // Обработка кнопки "Назад"
    window.addEventListener('popstate', (event) => {
        const screen = event.state?.screen || 'login';
        console.log(`🔙 Кнопка "Назад": ${screen}`);
        showScreen(screen);
    });
    
    // Инициализация из URL
    const hash = window.location.hash.replace('#', '');
    const screenFromUrl = hash || 'login';
    
    console.log(`🌐 Инициализация из URL: ${screenFromUrl} (hash: ${hash})`);
    
    // Если в URL указана роль, но пользователь не авторизован,
    // всё равно показываем логин
    if (screenFromUrl !== 'login') {
        console.log('⚠️ В URL указан экран, но требуется авторизация');
    }
}

function showError(message) {
    console.error(`❌ Ошибка: ${message}`);
    
    const loginError = document.getElementById('loginError');
    if (loginError) {
        loginError.textContent = message;
        loginError.style.display = 'block';
        
        // Автоматическое скрытие через 5 секунд
        setTimeout(() => {
            loginError.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

// Экспортируем функции для использования в других модулях
if (typeof window !== 'undefined') {
    window.showScreen = showScreen;
    window.supabaseClient = () => supabaseClient;
    window.getCurrentUser = () => ({
        phone: currentUserPhone,
        name: currentUserName,
        role: currentUserRole
    });
}

console.log('✅ app.js готов к работе');
