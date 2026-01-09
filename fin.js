// fin.js — МИНИМАЛЬНАЯ версия
let finSupabaseClient = null;

function initFinPanel(supabaseClient) {
  finSupabaseClient = supabaseClient;
  
  document.getElementById('loadFinData').addEventListener('click', loadFinData);
  document.getElementById('backToRopFromFin').addEventListener('click', () => {
    document.getElementById('finScreen').style.display = 'none';
    document.getElementById('ropScreen').style.display = 'block';
  });
}

async function loadFinData() {
  try {
    const {  deals, error } = await finSupabaseClient
      .from('deals')
      .select('crm_id, manager_name, contract_amount')
      .limit(10); // только первые 10

    if (error) throw error;

    const tbody = document.getElementById('finDealsBody');
    tbody.innerHTML = '';

    if (deals.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:10px;">Нет данных</td></tr>';
    } else {
      deals.forEach(deal => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="padding:8px; border:1px solid #ddd;">${deal.crm_id}</td>
          <td style="padding:8px; border:1px solid #ddd;">${deal.manager_name}</td>
          <td style="padding:8px; border:1px solid #ddd;">${deal.contract_amount} ₽</td>
        `;
        tbody.appendChild(row);
      });
    }

    document.getElementById('finDealsTable').style.display = 'block';

  } catch (error) {
    alert('Ошибка: ' + error.message);
    console.error(error);
  }
}
