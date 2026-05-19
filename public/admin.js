const token = localStorage.getItem('hm_token');
let currentSection = 'overview';
let currentTicketId = null;

// ── Admin guard ──
async function initAdmin() {
    if (!token) { window.location.href = 'login.html'; return; }
    const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    const u = await r.json();
    if (u.error || !u.email.includes('admin')) {
        alert('Access denied. Admin only.');
        window.location.href = '/';
        return;
    }
    loadSection('overview');
}

// ── Nav ──
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item[data-section]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${btn.dataset.section}`).classList.add('active');
        loadSection(btn.dataset.section);
    });
});

document.getElementById('adminLogout').addEventListener('click', () => {
    localStorage.clear(); window.location.href = 'login.html';
});

// ── Data loaders ──
async function loadSection(section) {
    if (section === 'overview') { await loadStats(); await loadRecentUsers(); }
    if (section === 'users')   { await loadUsers(); }
    if (section === 'tickets') { await loadTickets(); }
}

async function apiFetch(url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    return r.json();
}

async function loadStats() {
    const data = await apiFetch('/api/admin/stats');
    document.getElementById('stat-users').textContent = data.totalUsers ?? '–';
    document.getElementById('stat-generations').textContent = data.creditsUsed ?? '–';
    document.getElementById('stat-tickets').textContent = data.openTickets ?? '–';
}

async function loadRecentUsers() {
    const data = await apiFetch('/api/admin/users');
    const el = document.getElementById('recent-users-list');
    if (!data.users || !data.users.length) { el.innerHTML = '<div class="loading-row">No users yet.</div>'; return; }
    el.innerHTML = data.users.slice(0, 5).map(u => `
        <div class="recent-user-row">
            <div class="u-avatar">${u.name.charAt(0).toUpperCase()}</div>
            <div><div class="u-name">${u.name}</div><div class="u-email">${u.email}</div></div>
            <div class="u-time">${timeSince(u.createdAt)}</div>
        </div>`).join('');
}

async function loadUsers() {
    const data = await apiFetch('/api/admin/users');
    const tbody = document.getElementById('usersTableBody');
    document.getElementById('userCountBadge').textContent = data.users?.length ?? 0;
    if (!data.users?.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No users yet.</td></tr>'; return; }
    tbody.innerHTML = data.users.map(u => `
        <tr>
            <td class="user-name-cell">${u.name}</td>
            <td>${u.email}</td>
            <td><span class="credit-pill"><i class="ri-coin-line" style="margin-right:4px;"></i>${u.credits}</span></td>
            <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>
                <button class="table-btn" onclick="addCredits('${u.email}')"><i class="ri-add-line"></i> Credits</button>
                <button class="table-btn danger" onclick="deleteUser('${u.email}')"><i class="ri-delete-bin-line"></i></button>
            </td>
        </tr>`).join('');
}

async function loadTickets() {
    const data = await apiFetch('/api/admin/tickets');
    const el = document.getElementById('ticketsList');
    document.getElementById('ticketCountBadge').textContent = data.tickets?.length ?? 0;
    if (!data.tickets?.length) { el.innerHTML = '<div class="loading-row">No tickets yet.</div>'; return; }
    el.innerHTML = data.tickets.map(t => `
        <div class="ticket-row">
            <div>
                <div class="ticket-subject">${t.subject}</div>
                <div class="ticket-meta">
                    <span><i class="ri-user-line"></i> ${t.userName}</span>
                    <span><i class="ri-time-line"></i> ${timeSince(t.createdAt)}</span>
                    <span class="t-badge t-category">${t.category}</span>
                </div>
            </div>
            <span class="t-badge ${t.status === 'open' ? 't-open' : 't-closed'}">${t.status}</span>
            <button class="table-btn" onclick="openTicket('${t.id}')"><i class="ri-eye-line"></i> View & Reply</button>
        </div>`).join('');
}

// ── Admin actions ──
async function addCredits(email) {
    const amount = prompt('How many credits to add?', '10');
    if (!amount || isNaN(amount)) return;
    const r = await fetch('/api/admin/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, amount: parseInt(amount) })
    });
    if (r.ok) { alert('Credits added!'); loadUsers(); }
    else { const d = await r.json(); alert('Error: ' + d.error); }
}

async function deleteUser(email) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    const r = await fetch('/api/admin/users/' + encodeURIComponent(email), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
    });
    if (r.ok) { loadUsers(); loadStats(); } else alert('Delete failed.');
}

// ── Ticket modal ──
async function openTicket(id) {
    currentTicketId = id;
    const data = await apiFetch('/api/admin/tickets');
    const t = data.tickets.find(x => x.id === id);
    if (!t) return;
    document.getElementById('modalTitle').textContent = t.subject;
    document.getElementById('modalTicketDetails').innerHTML = `
        <div class="ticket-detail-block"><div class="label">From</div><div class="value">${t.userName} (${t.userEmail})</div></div>
        <div class="ticket-detail-block"><div class="label">Category</div><div class="value">${t.category}</div></div>
        <div class="ticket-detail-block"><div class="label">Message</div><div class="value">${t.message}</div></div>
        ${t.reply ? `<div class="ticket-detail-block" style="border:1px solid rgba(16,185,129,0.2);"><div class="label" style="color:#34d399;">Admin Reply</div><div class="value">${t.reply}</div></div>` : ''}
    `;
    document.getElementById('adminReply').value = '';
    document.getElementById('ticketModal').classList.remove('hidden');
}

function closeModal() { document.getElementById('ticketModal').classList.add('hidden'); }

async function sendReply() {
    const reply = document.getElementById('adminReply').value.trim();
    if (!reply) { alert('Please type a reply.'); return; }
    const r = await fetch(`/api/admin/tickets/${currentTicketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reply })
    });
    if (r.ok) { closeModal(); loadTickets(); } else alert('Failed to send reply.');
}

// ── Helpers ──
function timeSince(dateStr) {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

initAdmin();
