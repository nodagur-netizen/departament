// ============================================================
// ====================== UI УТИЛИТЫ ==========================
// ============================================================
const UI = {
    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },
    openModal(title, bodyHTML) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHTML;
        document.getElementById('modal-overlay').classList.add('active');
    },
    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
    },
    confirm(message) { return window.confirm(message); },
    escape(str) {
        if (str == null) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    },
    formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    },
    roleName(role) {
        return { student:'Студент', teacher:'Преподаватель', staff:'Сотрудник' }[role] || role;
    },
    statusName(status) {
        return { available:'Свободен', issued:'Выдан', lost:'Утерян' }[status] || status;
    },
    actionName(action) {
        return { issue:'Выдача', return:'Возврат', lost:'Утеря' }[action] || action;
    },
};

// Закрытие модалки
document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') UI.closeModal();
});
document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
document.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeModal(); });

// ============================================================
// =================== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===================
// ============================================================
const eqState = { limit: 10, offset: 0, search: '', inventory: '', status: '', total: 0, isExpiredMode: false };

// ============================================================
// ===================== ИНИЦИАЛИЗАЦИЯ ========================
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initEquipmentPage();
    initKeysPage();
    initUsersPage();
    loadEquipment(); // стартовая вкладка
});

// ============================================================
// ========================= ВКЛАДКИ ==========================
// ============================================================
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const page = tab.dataset.page;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`page-${page}`).classList.add('active');
            if (page === 'equipment') loadEquipment();
            if (page === 'keys')      loadKeys();
            if (page === 'users')     loadUsers();
        });
    });
}

// ============================================================
// ==================== ОБОРУДОВАНИЕ ==========================
// ============================================================
function initEquipmentPage() {
    document.getElementById('btn-add-eq').addEventListener('click', () => showEquipmentForm());

    let searchTimer;
    document.getElementById('eq-search').addEventListener('input', e => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => { eqState.search = e.target.value; eqState.offset = 0; loadEquipment(); }, 300);
    });

    let invTimer;
    document.getElementById('eq-inventory').addEventListener('input', e => {
        clearTimeout(invTimer);
        invTimer = setTimeout(() => { eqState.inventory = e.target.value; eqState.offset = 0; loadEquipment(); }, 300);
    });

    document.getElementById('eq-status-filter').addEventListener('change', e => {
        eqState.status = e.target.value; eqState.offset = 0; loadEquipment();
    });

    document.getElementById('btn-expired-verification').addEventListener('click', () => {
        eqState.isExpiredMode = !eqState.isExpiredMode;
        const btn = document.getElementById('btn-expired-verification');
        if (eqState.isExpiredMode) {
            btn.className = 'btn btn-danger btn-sm';
            btn.textContent = '❌ Показать все';
        } else {
            btn.className = 'btn btn-warning btn-sm';
            btn.textContent = '⚠️ Просрочена поверка';
        }
        eqState.offset = 0;
        loadEquipment();
    });
}

async function loadEquipment() {
    const tbody = document.getElementById('equipment-table-body');
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Загрузка...</td></tr>';

    try {
        let data;
        if (eqState.isExpiredMode) {
            data = await api.getExpiredVerification(eqState.limit, eqState.offset);
        } else {
            data = await api.getEquipment({
                limit: eqState.limit, offset: eqState.offset,
                search: eqState.search, inventory: eqState.inventory, status: eqState.status
            });
        }

        const items = data.equipment || [];
        const meta  = data.paginated_metadata || { total: 0, page: 1, total_pages: 1 };
        eqState.total = meta.total;

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${eqState.isExpiredMode ? 'Нет оборудования с просроченной поверкой' : 'Оборудование не найдено'}</td></tr>`;
            document.getElementById('eq-pagination').innerHTML = '';
            return;
        }

        const rows = await Promise.all(items.map(async eq => {
            let resp = '—';
            if (eq.responsible_id) {
                try { const u = await api.getUser(eq.responsible_id); if (u) resp = u.full_name; } catch (_) {}
            }
            return renderEquipmentRow(eq, resp);
        }));

        tbody.innerHTML = rows.join('');
        attachEquipmentActions();
        renderEqPagination(meta.total_pages, meta.page);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state">Ошибка: ${UI.escape(err.message)}</td></tr>`;
        UI.toast(err.message, 'error');
    }
}

function renderEquipmentRow(eq, responsibleName) {
    let verif = '<span class="text-muted">—</span>';
    if (eq.verification_date) {
        const expired = new Date(eq.verification_date) < new Date();
        const style = expired ? 'color:#dc2626;font-weight:bold;' : 'color:#16a34a;';
        verif = `<span style="${style}">${UI.formatDate(eq.verification_date).split(',')[0]}</span>`;
    }
    const badge = eq.status
        ? '<span class="badge badge-available">Доступно</span>'
        : '<span class="badge badge-lost">Недоступно</span>';

    return `<tr>
        <td>${eq.id}</td>
        <td><strong>${UI.escape(eq.name)}</strong>${eq.description ? `<br><small class="text-muted">${UI.escape(eq.description)}</small>` : ''}</td>
        <td>${UI.escape(eq.inventory_number || '—')}</td>
        <td>${UI.escape(eq.location || '—')}</td>
        <td>${UI.escape(responsibleName)}</td>
        <td>${verif}</td>
        <td>${badge}</td>
        <td class="actions-cell">
            <a href="/equipment/${eq.id}" class="btn btn-secondary btn-sm" title="Подробнее">👁️</a>
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${eq.id}" title="Редактировать">✏️</button>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${eq.id}" title="Удалить">🗑️</button>
        </td>
    </tr>`;
}

function attachEquipmentActions() {
    document.querySelectorAll('#equipment-table-body [data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id);
            if (btn.dataset.action === 'view')   await showEquipmentDetails(id);
            if (btn.dataset.action === 'edit')   await showEquipmentForm(id);
            if (btn.dataset.action === 'delete') await deleteEquipment(id);
        });
    });
}

async function showEquipmentDetails(id) {
    try {
        const eq = await api.getEquipmentById(id);
        
        // Получаем имя ответственного
        let responsibleName = 'Не назначен';
        if (eq.responsible_id) {
            try {
                const u = await api.getUser(eq.responsible_id);
                if (u) responsibleName = u.full_name;
            } catch (_) {}
        }

        // Форматируем документацию как ссылку, если это URL
        let docHtml = UI.escape(eq.documentation || '—');
        if (eq.documentation && (eq.documentation.startsWith('http://') || eq.documentation.startsWith('https://'))) {
            docHtml = `<a href="${UI.escape(eq.documentation)}" target="_blank" class="doc-link">🔗 Открыть документацию</a>`;
        }

        const statusBadge = eq.status
            ? '<span class="badge badge-available">Доступно</span>'
            : '<span class="badge badge-lost">Недоступно</span>';

        let verifHtml = '—';
        if (eq.verification_date) {
            const expired = new Date(eq.verification_date) < new Date();
            const style = expired ? 'color:#dc2626;font-weight:bold;' : 'color:#16a34a;';
            verifHtml = `<span style="${style}">${UI.formatDate(eq.verification_date).split(',')[0]}</span>`;
        }

        const html = `
            <div class="eq-details">
                <div class="eq-detail-row">
                    <span class="eq-label">Название:</span>
                    <span class="eq-value"><strong>${UI.escape(eq.name)}</strong></span>
                </div>
                <div class="eq-detail-row">
                    <span class="eq-label">Инв. номер:</span>
                    <span class="eq-value">${UI.escape(eq.inventory_number || '—')}</span>
                </div>
                <div class="eq-detail-row">
                    <span class="eq-label">Локация:</span>
                    <span class="eq-value">${UI.escape(eq.location || '—')}</span>
                </div>
                <div class="eq-detail-row">
                    <span class="eq-label">Статус:</span>
                    <span class="eq-value">${statusBadge}</span>
                </div>
                <div class="eq-detail-row">
                    <span class="eq-label">Дата поверки:</span>
                    <span class="eq-value">${verifHtml}</span>
                </div>
                <div class="eq-detail-row">
                    <span class="eq-label">Ответственный:</span>
                    <span class="eq-value">${UI.escape(responsibleName)}</span>
                </div>
                <div class="eq-detail-row">
                    <span class="eq-label">Описание:</span>
                    <span class="eq-value eq-description">${UI.escape(eq.description || 'Нет описания')}</span>
                </div>
                <div class="eq-detail-row">
                    <span class="eq-label">Документация:</span>
                    <span class="eq-value">${docHtml}</span>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="UI.closeModal()">Закрыть</button>
                <button type="button" class="btn btn-primary" onclick="UI.closeModal(); showEquipmentForm(${eq.id})">✏️ Редактировать</button>
            </div>
        `;

        UI.openModal(`Карточка оборудования #${eq.id}`, html);

    } catch (err) {
        UI.toast(err.message, 'error');
    }
}

async function showEquipmentForm(id = null) {
    let eq = { name:'', description:'', location:'', documentation:'', inventory_number:'', responsible_id:'', status:true, verification_date:'' };

    if (id) {
        try {
            eq = await api.getEquipmentById(id);
            if (eq.verification_date) eq.verification_date = eq.verification_date.substring(0, 10);
        } catch (err) { UI.toast(err.message, 'error'); return; }
    }

    let users = [];
    try { users = await api.getUsers(); } catch (_) {}

    const opts = users.map(u =>
        `<option value="${u.id}" ${eq.responsible_id === u.id ? 'selected' : ''}>${UI.escape(u.full_name)} (${UI.roleName(u.role)})</option>`
    ).join('');

    UI.openModal(id ? 'Редактировать оборудование' : 'Новое оборудование', `
        <form id="eq-form">
            <div class="form-group">
                <label>Название *</label>
                <input type="text" class="input" name="name" value="${UI.escape(eq.name)}" required>
            </div>
            <div class="form-group">
                <label>Описание</label>
                <textarea class="input" name="description" rows="2">${UI.escape(eq.description || '')}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="form-group">
                    <label>Инвентарный номер</label>
                    <input type="text" class="input" name="inventory_number" value="${UI.escape(eq.inventory_number || '')}">
                </div>
                <div class="form-group">
                    <label>Локация</label>
                    <input type="text" class="input" name="location" value="${UI.escape(eq.location || '')}">
                </div>
            </div>
            <div class="form-group">
                <label>Документация</label>
                <input type="text" class="input" name="documentation" value="${UI.escape(eq.documentation || '')}" placeholder="https://...">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <div class="form-group">
                    <label>Ответственный</label>
                    <select class="input" name="responsible_id">
                        <option value="">Не назначен</option>
                        ${opts}
                    </select>
                </div>
                <div class="form-group">
                    <label>Дата поверки</label>
                    <input type="date" class="input" name="verification_date" value="${eq.verification_date || ''}">
                </div>
            </div>
            <div class="form-group">
                <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
                    <input type="checkbox" name="status" ${eq.status ? 'checked' : ''}> Доступно
                </label>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="UI.closeModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">${id ? 'Сохранить' : 'Создать'}</button>
            </div>
        </form>
    `);

    document.getElementById('eq-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = {
            name:             fd.get('name').trim(),
            description:      fd.get('description').trim() || null,
            location:         fd.get('location').trim() || null,
            documentation:    fd.get('documentation').trim() || null,
            inventory_number: fd.get('inventory_number').trim() || null,
            responsible_id:   fd.get('responsible_id') || null,
            status:           fd.get('status') === 'on',
            verification_date: fd.get('verification_date') || null
        };
        try {
            if (id) { await api.updateEquipment(id, payload); UI.toast('Обновлено', 'success'); }
            else    { await api.createEquipment(payload);     UI.toast('Создано', 'success'); }
            UI.closeModal();
            loadEquipment();
        } catch (err) { UI.toast(err.message, 'error'); }
    });
}

async function deleteEquipment(id) {
    if (!UI.confirm('Удалить это оборудование?')) return;
    try {
        await api.deleteEquipment(id);
        UI.toast('Удалено', 'success');
        loadEquipment();
    } catch (err) { UI.toast(err.message, 'error'); }
}

function renderEqPagination(totalPages, currentPage) {
    const c = document.getElementById('eq-pagination');
    if (totalPages <= 1) { c.innerHTML = ''; return; }
    c.innerHTML = `<div style="display:flex;gap:5px;justify-content:center;margin-top:20px;">
        <button class="btn btn-sm btn-secondary" ${currentPage===1?'disabled':''} onclick="changeEqPage(${currentPage-1})">← Назад</button>
        <span style="padding:5px 10px;font-size:14px;">Стр. ${currentPage} из ${totalPages}</span>
        <button class="btn btn-sm btn-secondary" ${currentPage===totalPages?'disabled':''} onclick="changeEqPage(${currentPage+1})">Вперёд →</button>
    </div>`;
}

window.changeEqPage = function(page) {
    if (page < 1) return;
    eqState.offset = (page - 1) * eqState.limit;
    loadEquipment();
};

// ============================================================
// ======================= КЛЮЧИ ==============================
// ============================================================
function initKeysPage() {
    document.getElementById('btn-add-key').addEventListener('click', () => showKeyForm());
    document.getElementById('key-status-filter').addEventListener('change', e => loadKeys(e.target.value));
}

async function loadKeys(status = '') {
    const tbody = document.getElementById('keys-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Загрузка...</td></tr>';
    try {
        const keys = await api.getKeys(status);
        if (!keys.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Ключи не найдены</td></tr>'; return; }
        const rows = await Promise.all(keys.map(async key => {
            let holder = '—';
            if (key.status === 'issued') {
                try {
                    const h = await api.getKeyHolder(key.id);
                    if (h?.user_id) { const u = await api.getUser(h.user_id); holder = u ? u.full_name : h.user_id.slice(0,8); }
                } catch (_) {}
            }
            return `<tr>
                <td>${key.id}</td>
                <td><strong>${UI.escape(key.key_number)}</strong></td>
                <td>${UI.escape(key.room_description)}</td>
                <td><span class="badge badge-${key.status}">${UI.statusName(key.status)}</span></td>
                <td>${UI.escape(holder)}</td>
                <td class="actions-cell">
                    ${key.status==='available' ? `<button class="btn btn-success btn-sm" data-action="issue" data-id="${key.id}">Выдать</button>` : ''}
                    ${key.status==='issued' ? `<button class="btn btn-warning btn-sm" data-action="return" data-id="${key.id}">Вернуть</button><button class="btn btn-danger btn-sm" data-action="lost" data-id="${key.id}">Утерян</button>` : ''}
                    <button class="btn btn-secondary btn-sm" data-action="history" data-id="${key.id}">История</button>
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${key.id}">✏️</button>
                </td>
            </tr>`;
        }));
        tbody.innerHTML = rows.join('');
        document.querySelectorAll('#keys-table-body [data-action]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = parseInt(btn.dataset.id);
                switch (btn.dataset.action) {
                    case 'issue':   await showIssueForm(id); break;
                    case 'return':  if (UI.confirm('Вернуть ключ?')) { try { await api.returnKey(id,{comment:'Возврат'}); UI.toast('Возвращён','success'); loadKeys(status); } catch(e){UI.toast(e.message,'error');} } break;
                    case 'lost':    if (UI.confirm('Пометить как утерянный?')) { try { await api.markLost(id,{comment:'Утеря'}); UI.toast('Утерян','success'); loadKeys(status); } catch(e){UI.toast(e.message,'error');} } break;
                    case 'history': await showKeyHistory(id); break;
                    case 'edit':    await showKeyForm(id); break;
                }
            });
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Ошибка: ${UI.escape(err.message)}</td></tr>`;
        UI.toast(err.message, 'error');
    }
}

async function showKeyForm(id = null) {
    let key = { key_number:'', room_description:'', notes:'', status:'available' };
    if (id) { try { key = await api.getKey(id); } catch(e){ UI.toast(e.message,'error'); return; } }
    UI.openModal(id ? 'Редактировать ключ' : 'Новый ключ', `
        <form id="key-form">
            <div class="form-group"><label>Номер ключа *</label><input type="text" class="input" name="key_number" value="${UI.escape(key.key_number)}" required></div>
            <div class="form-group"><label>Помещение *</label><input type="text" class="input" name="room_description" value="${UI.escape(key.room_description)}" required></div>
            <div class="form-group"><label>Примечания</label><input type="text" class="input" name="notes" value="${UI.escape(key.notes||'')}"></div>
            ${id ? `<div class="form-group"><label>Статус</label><select class="input" name="status"><option value="available" ${key.status==='available'?'selected':''}>Свободен</option><option value="issued" ${key.status==='issued'?'selected':''}>Выдан</option><option value="lost" ${key.status==='lost'?'selected':''}>Утерян</option></select></div>` : ''}
            <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="UI.closeModal()">Отмена</button><button type="submit" class="btn btn-primary">${id?'Сохранить':'Создать'}</button></div>
        </form>
    `);
    document.getElementById('key-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = { key_number: fd.get('key_number').trim(), room_description: fd.get('room_description').trim(), notes: fd.get('notes').trim()||null };
        if (id) data.status = fd.get('status');
        try {
            if (id) { await api.updateKey(id, data); UI.toast('Обновлён','success'); }
            else    { await api.createKey(data);     UI.toast('Создан','success'); }
            UI.closeModal(); loadKeys(document.getElementById('key-status-filter').value);
        } catch(err){ UI.toast(err.message,'error'); }
    });
}

async function showIssueForm(keyId) {
    let users = [];
    try { users = await api.getUsers(); } catch(e){ UI.toast(e.message,'error'); return; }
    if (!users.length) { UI.toast('Сначала добавьте пользователей','error'); return; }
    const opts = users.map(u => `<option value="${u.id}">${UI.escape(u.full_name)} (${UI.roleName(u.role)})</option>`).join('');
    UI.openModal('Выдача ключа', `
        <form id="issue-form">
            <div class="form-group"><label>Кому выдать *</label><select class="input" name="user_id" required><option value="">Выберите...</option>${opts}</select></div>
            <div class="form-group"><label>Комментарий</label><input type="text" class="input" name="comment"></div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" onclick="UI.closeModal()">Отмена</button><button type="submit" class="btn btn-success">Выдать</button></div>
        </form>
    `);
    document.getElementById('issue-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        try {
            await api.issueKey(keyId, { user_id: fd.get('user_id'), comment: fd.get('comment').trim()||null });
            UI.toast('Выдан','success'); UI.closeModal(); loadKeys(document.getElementById('key-status-filter').value);
        } catch(err){ UI.toast(err.message,'error'); }
    });
}

async function showKeyHistory(keyId) {
    let logs = [];
    try { logs = await api.getKeyHistory(keyId); } catch(e){ UI.toast(e.message,'error'); return; }
    if (!logs.length) { UI.openModal(`История #${keyId}`, '<div class="empty-state">Пуста</div>'); return; }
    const items = await Promise.all(logs.map(async log => {
        let name = log.user_id ? log.user_id.slice(0,8) : 'Система';
        if (log.user_id) { try { const u = await api.getUser(log.user_id); if(u) name = u.full_name; } catch(_){} }
        return `<li class="history-item"><div><div class="history-action">${UI.actionName(log.action_type)}</div><div>${UI.escape(name)}</div>${log.comment?`<div class="history-time">💬 ${UI.escape(log.comment)}</div>`:''}</div><div class="history-time">${UI.formatDate(log.timestamp)}</div></li>`;
    }));
    UI.openModal(`История ключа #${keyId}`, `<ul class="history-list">${items.join('')}</ul>`);
}

// ============================================================
// ==================== ПОЛЬЗОВАТЕЛИ ==========================
// ============================================================
function initUsersPage() {
    document.getElementById('btn-add-user').addEventListener('click', () => showUserForm());
}

async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Загрузка...</td></tr>';
    try {
        const users = await api.getUsers();
        if (!users.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Не найдены</td></tr>'; return; }
        tbody.innerHTML = users.map(u => `<tr>
            <td><strong>${UI.escape(u.full_name)}</strong></td>
            <td><span class="badge badge-role">${UI.roleName(u.role)}</span></td>
            <td>${UI.escape(u.phone||'—')}</td>
            <td>${UI.escape(u.email||'—')}</td>
            <td class="actions-cell">
                <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${u.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-action="deactivate" data-id="${u.id}">🚫</button>
            </td>
        </tr>`).join('');
        document.querySelectorAll('#users-table-body [data-action]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (btn.dataset.action === 'edit') await showUserForm(id);
                if (btn.dataset.action === 'deactivate' && UI.confirm('Деактивировать?')) {
                    try { await api.deactivateUser(id); UI.toast('Деактивирован','success'); loadUsers(); } catch(e){ UI.toast(e.message,'error'); }
                }
            });
        });
    } catch(err) {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Ошибка: ${UI.escape(err.message)}</td></tr>`;
        UI.toast(err.message,'error');
    }
}

async function showUserForm(id = null) {
    let user = { full_name: '', role: 'student', phone: '', email: '' };
    if (id) { 
        try { user = await api.getUser(id); } 
        catch(e) { UI.toast(e.message, 'error'); return; } 
    }
    
    UI.openModal(id ? 'Редактировать пользователя' : 'Новый пользователь', `
        <form id="user-form">
            <div class="form-group">
                <label>ФИО *</label>
                <input type="text" class="input" name="full_name" value="${UI.escape(user.full_name)}" required minlength="3">
            </div>
            <div class="form-group">
                <label>Роль *</label>
                <select class="input" name="role" required>
                    <option value="student" ${user.role === 'student' ? 'selected' : ''}>Студент</option>
                    <option value="teacher" ${user.role === 'teacher' ? 'selected' : ''}>Преподаватель</option>
                    <option value="staff" ${user.role === 'staff' ? 'selected' : ''}>Сотрудник</option>
                </select>
            </div>
            <div class="form-group">
                <label>Телефон</label>
                <input type="tel" class="input" name="phone" value="${UI.escape(user.phone || '')}">
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" class="input" name="email" value="${UI.escape(user.email || '')}">
            </div>
            ${!id ? `
            <div class="form-group">
                <label>Пароль *</label>
                <input type="password" class="input" name="password" required minlength="8" placeholder="Минимум 8 символов">
            </div>
            ` : ''}
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="UI.closeModal()">Отмена</button>
                <button type="submit" class="btn btn-primary">${id ? 'Сохранить' : 'Создать'}</button>
            </div>
        </form>
    `);

    document.getElementById('user-form').addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = { 
            full_name: fd.get('full_name').trim(), 
            role: fd.get('role'), 
            phone: fd.get('phone').trim() || null, 
            email: fd.get('email').trim() || null 
        };
        
        // Добавляем пароль только при создании нового пользователя
        if (!id) {
            data.password = fd.get('password');
        }

        try {
            if (id) { 
                await api.updateUser(id, data); 
                UI.toast('Обновлён', 'success'); 
            } else { 
                await api.createUser(data);     
                UI.toast('Создан', 'success'); 
            }
            UI.closeModal(); 
            loadUsers();
        } catch(err) { 
            UI.toast(err.message, 'error'); 
        }
    });
}