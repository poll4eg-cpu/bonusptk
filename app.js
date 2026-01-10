// app.js - ТЕСТОВЫЙ КОД
console.log('✅ app.js загружен!');

// Проверяем загрузку библиотек
console.log('Supabase:', typeof supabase);
console.log('FontAwesome:', typeof window.FontAwesome || 'не загружен');

// Ждем полной загрузки страницы
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ DOMContentLoaded сработал');
  
  // Показываем отладочную информацию
  const debugDiv = document.createElement('div');
  debugDiv.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #4CAF50;
    color: white;
    padding: 15px;
    border-radius: 5px;
    z-index: 9999;
    font-family: Arial;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `;
  debugDiv.innerHTML = `
    <strong>✅ JavaScript работает!</strong><br>
    <small>Страница загружена: ${new Date().toLocaleTimeString()}</small>
  `;
  document.body.appendChild(debugDiv);
  
  // Показываем экран логина
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) {
    loginScreen.style.display = 'block';
    console.log('✅ Экран логина показан');
  } else {
    console.error('❌ Экран логина не найден!');
  }
  
  // Проверяем все элементы
  console.log('Элементы страницы:');
  console.log('- loginScreen:', document.getElementById('loginScreen'));
  console.log('- loginBtn:', document.getElementById('loginBtn'));
  console.log('- loginPhone:', document.getElementById('loginPhone'));
  
  // Тест кнопки входа
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      alert('Кнопка входа работает!');
      console.log('Кнопка входа нажата');
    });
  }
});

// Также срабатываем при полной загрузке
window.addEventListener('load', () => {
  console.log('✅ Страница полностью загружена');
});
