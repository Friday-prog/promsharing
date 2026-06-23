// --- MOCK DATA ---
const DEFAULT_COMPANIES = [
  { id: "COMP001", name: "Уфимский завод нефтегазового машиностроения", role: "Исполнитель", location: "Уфа", contact_email: "uznm-prod@mail.ru" },
  { id: "COMP002", name: "НПП ПромТехРешения", role: "Исполнитель", location: "Салават", contact_email: "info@promtech-slv.ru" },
  { id: "COMP003", name: "УралДетальЛизинг", role: "Заказчик", location: "Уфа", contact_email: "zakupki@uraldetal.ru" }
];

const DEFAULT_SLOTS = [
  { id: "SLOT001", owner_id: "COMP001", category: "ЧПУ фрезерная", model_name: "Вертикальный обрабатывающий центр Haas VF-3", status: "Свободен", price_per_hour: 3500 },
  { id: "SLOT002", owner_id: "COMP001", category: "Лазерная резка", model_name: "Оптоволоконный лазерный станок Unimach LaserCut", status: "Свободен", price_per_hour: 2800 },
  { id: "SLOT003", owner_id: "COMP002", category: "ЧПУ токарная", model_name: "Токарно-револьверный станок DMG MORI CTX 310", status: "Свободен", price_per_hour: 3100 },
  { id: "SLOT004", owner_id: "COMP002", category: "Сварка", model_name: "Роботизированный сварочный комплекс KUKA", status: "Занят", price_per_hour: 2200 }
];

const DEFAULT_ORDERS = [
  { id: "ORD001", customer_id: "COMP003", slot_id: "SLOT003", order_status: "В производстве", tz_description: "Изготовление партии переходных втулок по чертежу УДЛ-04-26 в количестве 500 шт. Материал — Сталь 45.", created_at: "2026-06-21T09:00:00.000Z" }
];

// --- DATABASE LAYER (Simulated using localStorage) ---
class LocalDB {
  static get(key, defaultValue) {
    const data = localStorage.getItem(`promsharing_${key}`);
    return data ? JSON.parse(data) : defaultValue;
  }

  static set(key, value) {
    localStorage.setItem(`promsharing_${key}`, JSON.stringify(value));
  }

  static initialize() {
    // Using v3 key to force re-initialization with the new mock data
    if (!localStorage.getItem('promsharing_initialized_v3')) {
      LocalDB.set('companies', DEFAULT_COMPANIES);
      LocalDB.set('slots', DEFAULT_SLOTS);
      LocalDB.set('orders', DEFAULT_ORDERS);
      localStorage.setItem('promsharing_initialized_v3', 'true');
    }
  }

  static getCompanies() {
    return LocalDB.get('companies', DEFAULT_COMPANIES);
  }

  static getSlots() {
    return LocalDB.get('slots', DEFAULT_SLOTS);
  }

  static saveSlots(slots) {
    LocalDB.set('slots', slots);
  }

  static getOrders() {
    return LocalDB.get('orders', DEFAULT_ORDERS);
  }

  static saveOrders(orders) {
    LocalDB.set('orders', orders);
  }

  static addOrder(order) {
    const orders = LocalDB.getOrders();
    orders.unshift(order); // Add to the beginning
    LocalDB.saveOrders(orders);
  }

  static updateOrderStatus(orderId, newStatus) {
    const orders = LocalDB.getOrders();
    const slots = LocalDB.getSlots();
    
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      const order = orders[orderIndex];
      order.order_status = newStatus;
      orders[orderIndex] = order;
      LocalDB.saveOrders(orders);
      
      // Update slot availability depending on the status change
      const slotIndex = slots.findIndex(s => s.id === order.slot_id);
      if (slotIndex !== -1) {
        if (newStatus === "В производстве") {
          slots[slotIndex].status = "Занят";
        } else if (newStatus === "Выполнен" || newStatus === "Отклонен") {
          // If execution is complete or request is rejected, the slot becomes free again
          slots[slotIndex].status = "Свободен";
        } else if (newStatus === "Новая заявка" || newStatus === "На согласовании") {
          slots[slotIndex].status = "Свободен";
        }
        LocalDB.saveSlots(slots);
      }
      return true;
    }
    return false;
  }
}

// --- STATE MANAGEMENT ---
const AppState = {
  currentView: 'catalog-page',
  selectedSlotIdForBooking: null,
  currentCompanyId: 'COMP003', // Default acting user (УралДетальЛизинг - Customer)
  searchQuery: '',
  selectedCategory: 'Все', // Active category filter chip

  init() {
    LocalDB.initialize();
    
    // Load saved preferences and validate against existing companies
    const savedCompanyId = localStorage.getItem('promsharing_current_company');
    const companies = LocalDB.getCompanies();
    if (savedCompanyId && companies.some(c => c.id === savedCompanyId)) {
      this.currentCompanyId = savedCompanyId;
    } else {
      this.currentCompanyId = 'COMP003';
      localStorage.setItem('promsharing_current_company', 'COMP003');
    }
  },

  setCurrentCompany(id) {
    this.currentCompanyId = id;
    localStorage.setItem('promsharing_current_company', id);
  }
};

// --- ROUTER ---
function navigateTo(viewId, context = null) {
  AppState.currentView = viewId;
  if (viewId === 'order-page') {
    AppState.selectedSlotIdForBooking = context;
  }
  
  // Update UI navigation state
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-view') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Switch pages
  document.querySelectorAll('.page-section').forEach(section => {
    if (section.id === viewId) {
      section.classList.add('active');
    } else {
      section.classList.remove('active');
    }
  });

  // Render view-specific elements
  if (viewId === 'catalog-page') {
    renderCategoryChips();
    renderCatalog();
  } else if (viewId === 'order-page') {
    renderOrderPage();
  } else if (viewId === 'cabinet-page') {
    renderCabinet();
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close">&times;</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });

  container.appendChild(toast);

  // Auto-remove toast after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(15px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// --- CATEGORY CHIPS RENDER ---
function renderCategoryChips() {
  const container = document.getElementById('category-filters-container');
  if (!container) return;

  const slots = LocalDB.getSlots();
  // Unique categories
  const categories = ["Все", ...new Set(slots.map(s => s.category))];

  container.innerHTML = categories.map(cat => {
    const isActive = AppState.selectedCategory === cat;
    return `
      <button class="category-chip ${isActive ? 'active' : ''}" onclick="handleCategorySelect('${cat}')">
        ${cat}
      </button>
    `;
  }).join('');
}

window.handleCategorySelect = function(category) {
  AppState.selectedCategory = category;
  renderCategoryChips();
  renderCatalog();
  
  // Update header text based on active category
  const headerText = document.getElementById('catalog-header-text');
  if (headerText) {
    headerText.textContent = category === 'Все' ? 'Рекомендуемые мощности' : `Категория: ${category}`;
  }
};

// --- RENDER CATALOG ---
function renderCatalog() {
  const grid = document.getElementById('equipment-grid');
  const slots = LocalDB.getSlots();
  const companies = LocalDB.getCompanies();

  // Filter slots where status is "Свободен"
  let filteredSlots = slots.filter(slot => slot.status === 'Свободен');

  // Filter by category chip selection
  if (AppState.selectedCategory !== 'Все') {
    filteredSlots = filteredSlots.filter(slot => slot.category === AppState.selectedCategory);
  }

  // Filter by search query
  if (AppState.searchQuery.trim() !== '') {
    const q = AppState.searchQuery.toLowerCase();
    filteredSlots = filteredSlots.filter(slot => 
      slot.model_name.toLowerCase().includes(q) || 
      slot.category.toLowerCase().includes(q)
    );
  }

  if (filteredSlots.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <svg class="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin='round' stroke-width='2' d='M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
        </svg>
        <div class="empty-title">Ничего не найдено</div>
        <div class="empty-description">Попробуйте изменить поисковый запрос или категорию.</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredSlots.map(slot => {
    const owner = companies.find(c => c.id === slot.owner_id) || { name: 'Неизвестно', location: '-' };
    
    // Choose beautiful emoji and modern gradient styling for the card based on category
    let categoryEmoji = '⚙️';
    let gradientClass = 'grad-milling';
    
    if (slot.category.includes('фрезерная')) {
      categoryEmoji = '🖥️';
      gradientClass = 'grad-milling';
    } else if (slot.category.includes('токарная')) {
      categoryEmoji = '🔄';
      gradientClass = 'grad-turning';
    } else if (slot.category.includes('резка')) {
      categoryEmoji = '⚡';
      gradientClass = 'grad-laser';
    } else if (slot.category.includes('Сварка')) {
      categoryEmoji = '🔥';
      gradientClass = 'grad-welding';
    } else if (slot.category.includes('Штамповка')) {
      categoryEmoji = '🔩';
      gradientClass = 'grad-stamping';
    }

    return `
      <div class="equipment-card">
        <div class="card-image-placeholder ${gradientClass}">
          <div style="font-size: 3.5rem;">${categoryEmoji}</div>
        </div>
        <div class="card-content">
          <div class="price-text-line">
            ${slot.price_per_hour.toLocaleString('ru-RU')} ₽<span class="price-unit"> / ч</span>
          </div>
          <a class="equipment-title-link" onclick="navigateTo('order-page', '${slot.id}')">
            ${slot.model_name}
          </a>
          <div class="card-info-row">
            <span style="color: var(--text-muted); font-weight: 500;">${slot.category}</span>
          </div>
          <div class="card-info-row" style="margin-top: 0.25rem;">
            <span>${owner.name}</span>
          </div>
          <div class="card-info-row location">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color: var(--text-muted); margin-right: 0.15rem;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
            <span>${owner.location}</span>
          </div>
          <div class="card-actions-row">
            <button class="btn-card-book" onclick="navigateTo('order-page', '${slot.id}')">
              Забронировать
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// --- RENDER ORDER PAGE ---
function renderOrderPage() {
  const slotId = AppState.selectedSlotIdForBooking;
  if (!slotId) {
    navigateTo('catalog-page');
    return;
  }

  const slots = LocalDB.getSlots();
  const companies = LocalDB.getCompanies();
  const slot = slots.find(s => s.id === slotId);

  if (!slot) {
    showToast('Выбранный слот оборудования не найден!', 'error');
    navigateTo('catalog-page');
    return;
  }

  const provider = companies.find(c => c.id === slot.owner_id) || { name: 'Неизвестно', location: '-' };
  const currentCompany = companies.find(c => c.id === AppState.currentCompanyId);

  // Set Breadcrumbs
  document.getElementById('breadcrumb-category').textContent = slot.category;
  document.getElementById('breadcrumb-category').onclick = () => {
    AppState.selectedCategory = slot.category;
    navigateTo('catalog-page');
    const headerText = document.getElementById('catalog-header-text');
    if (headerText) headerText.textContent = `Категория: ${slot.category}`;
  };
  document.getElementById('breadcrumb-model').textContent = slot.model_name;

  // Fill in Main Column Details
  document.getElementById('order-info-model').textContent = slot.model_name;
  document.getElementById('order-info-category').textContent = slot.category;
  document.getElementById('order-info-location-top').textContent = provider.location;

  // Clear textarea
  document.getElementById('form-tz').value = '';

  // Setup client name text
  document.getElementById('form-client-name').textContent = currentCompany ? currentCompany.name : 'Не выбрано';

  // Fill in Right Sidebar details
  document.getElementById('order-info-price').textContent = `${slot.price_per_hour.toLocaleString('ru-RU')} ₽`;
  document.getElementById('order-info-provider').textContent = provider.name;
  document.getElementById('order-info-location').textContent = provider.location;

  // Bind right sidebar submit button
  const sidebarSubmitBtn = document.getElementById('btn-sidebar-submit-action');
  if (sidebarSubmitBtn) {
    sidebarSubmitBtn.onclick = () => {
      // Trigger HTML form submit event to handle browser validation
      const form = document.getElementById('order-creation-form');
      if (form) {
        // Trigger submit
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    };
  }
}

// --- RENDER CABINET ---
function renderCabinet() {
  const currentCompanyId = AppState.currentCompanyId;
  const companies = LocalDB.getCompanies();
  const currentCompany = companies.find(c => c.id === currentCompanyId);

  if (!currentCompany) {
    document.getElementById('cabinet-content').innerHTML = `<div class="empty-state"><div class="empty-title">Компания не выбрана</div></div>`;
    return;
  }

  const isCustomer = currentCompany.role === 'Заказчик';
  const roleName = currentCompany.role;
  const orders = LocalDB.getOrders();
  const slots = LocalDB.getSlots();

  // Set Header Information
  document.getElementById('cabinet-company-name').textContent = currentCompany.name;
  document.getElementById('cabinet-role-badge').textContent = `Роль: ${roleName}`;
  document.getElementById('cabinet-type-title').textContent = isCustomer ? 'Мои исходящие заказы' : 'Входящие заказы';
  document.getElementById('cabinet-type-subtitle').textContent = isCustomer 
    ? 'Список отправленных вами заявок на производство деталей' 
    : 'Заявки от заказчиков на бронирование ваших производственных мощностей';

  // Table columns heading based on role
  const tableHeader = document.querySelector('#orders-table-element thead tr');
  if (isCustomer) {
    tableHeader.innerHTML = `
      <th>ID заказа</th>
      <th>Оборудование</th>
      <th>Исполнитель</th>
      <th>Техническое задание (ТЗ)</th>
      <th>Статус</th>
      <th>Дата заказа</th>
    `;
  } else {
    tableHeader.innerHTML = `
      <th>ID заказа</th>
      <th>Оборудование</th>
      <th>Заказчик</th>
      <th>Техническое задание (ТЗ)</th>
      <th>Статус</th>
      <th>Управление</th>
    `;
  }

  // Filter orders
  let filteredOrders = [];
  if (isCustomer) {
    filteredOrders = orders.filter(o => o.customer_id === currentCompanyId);
  } else {
    // Show orders where the equipment is owned by this company
    filteredOrders = orders.filter(o => {
      const slot = slots.find(s => s.id === o.slot_id);
      return slot && slot.owner_id === currentCompanyId;
    });
  }

  const tbody = document.querySelector('#orders-table-element tbody');
  
  if (filteredOrders.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem 1.5rem;">
          <div style="color: var(--text-muted); font-size: 0.95rem;">Заказы в этой категории отсутствуют</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filteredOrders.map(order => {
    const slot = slots.find(s => s.id === order.slot_id) || { model_name: 'Оборудование удалено', category: '-' };
    const dateStr = new Date(order.created_at).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let statusPillClass = 'status-new';
    switch (order.order_status) {
      case 'Новая заявка': statusPillClass = 'status-new'; break;
      case 'На согласовании': statusPillClass = 'status-agreement'; break;
      case 'В производстве': statusPillClass = 'status-production'; break;
      case 'Выполнен': statusPillClass = 'status-completed'; break;
      case 'Отклонен': statusPillClass = 'status-rejected'; break;
    }

    if (isCustomer) {
      const provider = companies.find(c => c.id === slot.owner_id) || { name: '-' };
      return `
        <tr>
          <td><span class="order-id-badge">#${order.id.split('-')[1] || order.id}</span></td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary);">${slot.model_name}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${slot.category}</div>
          </td>
          <td>
            <div style="font-weight: 500;">${provider.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${provider.location}</div>
          </td>
          <td>
            <div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${order.tz_description}">
              ${order.tz_description}
            </div>
          </td>
          <td>
            <span class="order-status-pill ${statusPillClass}">${order.order_status}</span>
          </td>
          <td><span style="color: var(--text-secondary); font-size: 0.85rem;">${dateStr}</span></td>
        </tr>
      `;
    } else {
      const customer = companies.find(c => c.id === order.customer_id) || { name: 'Неизвестный клиент' };
      // Executor actions: dropdown selector
      const statuses = ["Новая заявка", "На согласовании", "В производстве", "Выполнен", "Отклонен"];
      const selectOptions = statuses.map(st => 
        `<option value="${st}" ${order.order_status === st ? 'selected' : ''}>${st}</option>`
      ).join('');

      return `
        <tr>
          <td><span class="order-id-badge">#${order.id.split('-')[1] || order.id}</span></td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary);">${slot.model_name}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${slot.category}</div>
          </td>
          <td>
            <div style="font-weight: 500;">${customer.name}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${customer.location}</div>
          </td>
          <td>
            <div style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${order.tz_description}">
              ${order.tz_description}
            </div>
          </td>
          <td>
            <span class="order-status-pill ${statusPillClass}">${order.order_status}</span>
          </td>
          <td>
            <select class="action-select" onchange="handleStatusChange('${order.id}', this.value)">
              ${selectOptions}
            </select>
          </td>
        </tr>
      `;
    }
  }).join('');
}

// --- CONTROLLER ACTIONS ---
window.handleStatusChange = function(orderId, newStatus) {
  if (LocalDB.updateOrderStatus(orderId, newStatus)) {
    showToast(`Статус заказа обновлен на "${newStatus}"`, 'success');
    renderCabinet();
  } else {
    showToast('Не удалось обновить статус заказа', 'error');
  }
};

// --- INITIALIZATION AND GLOBAL EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
  // Init state
  AppState.init();

  // Populate company switcher dropdown
  const userSelect = document.getElementById('global-user-select');
  const companies = LocalDB.getCompanies();
  
  const populateUserSwitcher = () => {
    if (!userSelect) return;
    const isMobile = window.innerWidth <= 600;
    userSelect.innerHTML = companies.map(comp => {
      let displayName = comp.name;
      if (isMobile && displayName.length > 22) {
        displayName = displayName.substring(0, 20) + '...';
      }
      return `<option value="${comp.id}" ${comp.id === AppState.currentCompanyId ? 'selected' : ''}>
        ${displayName} (${comp.role})
      </option>`;
    }).join('');
  };

  populateUserSwitcher();
  window.addEventListener('resize', populateUserSwitcher);

  // Dropdown event listener
  userSelect.addEventListener('change', (e) => {
    AppState.setCurrentCompany(e.target.value);
    showToast(`Вы переключились на роль: ${userSelect.options[userSelect.selectedIndex].text}`);
    
    // Refresh page details based on current view
    if (AppState.currentView === 'cabinet-page') {
      renderCabinet();
    } else if (AppState.currentView === 'order-page') {
      renderOrderPage();
    } else if (AppState.currentView === 'catalog-page') {
      renderCatalog();
    }
  });

  // Setup tab routing click handlers
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      navigateTo(view);
    });
  });

  // Search logic handler
  const performSearch = () => {
    const searchInput = document.getElementById('catalog-search');
    if (searchInput) {
      AppState.searchQuery = searchInput.value;
      renderCatalog();
    }
  };

  const searchInput = document.getElementById('catalog-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value;
      renderCatalog();
    });
    // Search on enter key
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        performSearch();
      }
    });
  }

  const searchSubmitBtn = document.getElementById('btn-search-submit');
  if (searchSubmitBtn) {
    searchSubmitBtn.addEventListener('click', performSearch);
  }

  // Sidebar buttons linking for Cabinet view
  const cabinetOrdersBtn = document.getElementById('cabinet-menu-orders-btn');
  if (cabinetOrdersBtn) {
    cabinetOrdersBtn.addEventListener('click', () => {
      navigateTo('cabinet-page');
    });
  }

  // Form Submission
  const orderForm = document.getElementById('order-creation-form');
  orderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const slotId = AppState.selectedSlotIdForBooking;
    const tzDesc = document.getElementById('form-tz').value.trim();

    if (!slotId) {
      showToast('Ошибка оформления: Оборудование не выбрано.', 'error');
      navigateTo('catalog-page');
      return;
    }

    if (!tzDesc) {
      showToast('Пожалуйста, заполните описание Технического Задания!', 'error');
      return;
    }

    const newOrder = {
      id: `ord-${Date.now()}`,
      customer_id: AppState.currentCompanyId,
      slot_id: slotId,
      order_status: 'Новая заявка',
      tz_description: tzDesc,
      created_at: new Date().toISOString()
    };

    // Save to Database
    LocalDB.addOrder(newOrder);
    
    showToast(`Заявка успешно отправлена! ID: #${newOrder.id.split('-')[1] || newOrder.id}`, 'success');
    
    // Reset booking state and navigate back
    AppState.selectedSlotIdForBooking = null;
    navigateTo('catalog-page');
  });

  // Cancel order button
  const cancelBtn = document.getElementById('btn-cancel-order');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      AppState.selectedSlotIdForBooking = null;
      navigateTo('catalog-page');
    });
  }

  // Initial load
  navigateTo('catalog-page');
});
