// ── Handle OAuth Redirects ──
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get('token');
const urlUser = urlParams.get('user');

if (urlToken) {
    localStorage.setItem('hm_token', urlToken);
    if (urlUser) {
        localStorage.setItem('hm_user', urlUser);
    }
    // Remove query params from URL without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
}

// ── Auth Guard ──
const token = localStorage.getItem('hm_token');
if (!token) window.location.href = 'login.html';

let currentTool = 'cover-letter';
let currentUser = JSON.parse(localStorage.getItem('hm_user') || '{}');

// ── Tool metadata ──
const TOOLS = {
    'cover-letter':    { title: 'Cover Letter Generator',   desc: 'Generate a personalized, ATS-friendly cover letter in seconds.' },
    'resume-analyzer': { title: 'Resume Analyzer',          desc: 'Get an AI-powered analysis of your resume with a score and actionable feedback.' },
    'interview-prep':  { title: 'Interview Prep',           desc: 'Generate tailored interview questions and ideal answers based on the job.' },
    'linkedin-summary':{ title: 'LinkedIn Summary Writer',  desc: 'Write a compelling LinkedIn "About" section that attracts recruiters.' },
    'cold-email':      { title: 'Cold Email Generator',     desc: 'Craft a personalized cold email to recruiters that gets responses.' },
    'thank-you-email': { title: 'Thank You Email',          desc: 'Send a polished follow-up note after interviews and networking chats.' },
    'salary-negotiation': { title: 'Salary Negotiation',    desc: 'Write a confident salary counter-offer without sounding aggressive.' },
    'rejection-response': { title: 'Rejection Response',    desc: 'Respond professionally to a rejection while keeping the door open.' },
    'professional-bio': { title: 'Professional Bio',        desc: 'Create a sharp short bio for your site, portfolio, or speaker profile.' },
    'skills-gap':      { title: 'Skills Gap Analyzer',      desc: 'Compare your resume to a role and see what to improve next.' },
    'history':         { title: 'Document History',         desc: 'Review, copy, and reuse your previous AI-generated documents.' },
    'settings':        { title: 'Settings & Billing',       desc: 'Manage your profile, credits, theme, and current plan.' },
    'support':         { title: 'Support Center',           desc: 'Submit tickets, check FAQs, and track replies from support.' }
};

// ── Init UI ──
function initUI() {
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(u => {
            if (u.error) { localStorage.clear(); window.location.href = 'login.html'; return; }
            currentUser = u;
            localStorage.setItem('hm_user', JSON.stringify(u));
            document.getElementById('userName').textContent = u.name;
            document.getElementById('userEmail').textContent = u.email;
            document.getElementById('userAvatar').textContent = u.name.charAt(0).toUpperCase();
            const topbarAvatar = document.getElementById('topbarAvatar');
            const topbarName = document.getElementById('topbarName');
            if (topbarAvatar) topbarAvatar.textContent = u.name.charAt(0).toUpperCase();
            if (topbarName) topbarName.textContent = u.name;
            updateCredits(u.credits);
        })
        .catch(() => { localStorage.clear(); window.location.href = 'login.html'; });
}

function updateCredits(credits) {
    document.getElementById('creditCount').textContent = credits;
    const topbarCreditNum = document.getElementById('topbarCreditNum');
    if (topbarCreditNum) topbarCreditNum.textContent = credits;
    const pct = Math.min((credits / 10) * 100, 100);
    document.getElementById('creditFill').style.width = pct + '%';
}

function selectTool(tool) {
    const meta = TOOLS[tool];
    if (!meta) return;
    document.querySelectorAll('.nav-item[data-tool]').forEach((b) => {
        b.classList.toggle('active', b.dataset.tool === tool);
    });
    document.querySelectorAll('.tool-panel').forEach((p) => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${tool}`);
    if (panel) panel.classList.add('active');
    document.getElementById('toolTitle').textContent = meta.title;
    document.getElementById('toolDesc').textContent = meta.desc;
    currentTool = tool;
    const mobileToolSelect = document.getElementById('mobileToolSelect');
    if (mobileToolSelect) mobileToolSelect.value = tool;
    if (tool === 'settings') initSettings();
}

// ── Navigation ──
document.querySelectorAll('.nav-item[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
        selectTool(btn.dataset.tool);
    });
});

const mobileToolSelect = document.getElementById('mobileToolSelect');
if (mobileToolSelect) {
    mobileToolSelect.addEventListener('change', (e) => selectTool(e.target.value));
}

// ── Logout ──
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.clear();
    window.location.href = 'login.html';
});

// ── Generic AI call ──
async function runTool(tool) {
    const outputEl = document.getElementById(`output-${tool}`);
    const btn = document.querySelector(`#panel-${tool} .btn-generate`);

    let body = {};
    if (tool === 'cover-letter')     body = { cv: v('cl-cv'), jobDescription: v('cl-job'), tone: v('cl-tone'), language: v('cl-lang') };
    if (tool === 'resume-analyzer')  body = { cv: v('ra-cv'), jobDescription: v('ra-job') };
    if (tool === 'interview-prep')   body = { jobDescription: v('ip-job'), cv: v('ip-cv') };
    if (tool === 'linkedin-summary') body = { cv: v('li-cv'), targetRole: v('li-role'), tone: v('li-tone') };
    if (tool === 'cold-email')       body = { cv: v('ce-cv'), recruiterName: v('ce-name'), companyName: v('ce-company'), targetRole: v('ce-role') };
    if (tool === 'salary-negotiation') body = { offeredSalary: v('sn-offered'), targetSalary: v('sn-target'), jobTitle: v('sn-title'), companyName: v('sn-company'), cv: v('sn-cv') };
    if (tool === 'thank-you-email')    body = { interviewerName: v('ty-name'), companyName: v('ty-company'), jobTitle: v('ty-role'), keyPoint: v('ty-keypoint') };
    if (tool === 'professional-bio')   body = { cv: v('pb-cv'), platform: v('pb-platform'), tone: v('pb-tone') };
    if (tool === 'skills-gap')         body = { cv: v('sg-cv'), jobDescription: v('sg-job') };
    if (tool === 'rejection-response') body = { recruiterName: v('rr-name'), companyName: v('rr-company'), jobTitle: v('rr-role') };

    if (!validateInputs(tool, body)) return;

    btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Generating...';
    btn.disabled = true;
    outputEl.innerHTML = `<div class="loading-state"><p>AI is working on it...</p><div class="dots"><span></span><span></span><span></span></div></div>`;

    try {
        const res = await fetch(`/api/generate/${tool}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 402) {
                outputEl.innerHTML = `<div class="error-msg">⚡ You've run out of credits! <a href="index.html#pricing" style="color:#818cf8;font-weight:700;">Upgrade your plan →</a></div>`;
            } else {
                throw new Error(data.error || 'Unknown error');
            }
            return;
        }

        // Typewriter effect
        outputEl.textContent = '';
        outputEl.style.whiteSpace = 'pre-wrap';
        const text = data.result;
        let i = 0;
        function type() {
            if (i < text.length) {
                outputEl.textContent += text[i++];
                outputEl.scrollTop = outputEl.scrollHeight;
                setTimeout(type, 10);
            }
        }
        type();

        // Update credits
        currentUser.credits = Math.max(0, (currentUser.credits || 0) - 1);
        updateCredits(currentUser.credits);

    } catch (err) {
        outputEl.innerHTML = `<div class="error-msg"><strong>Error:</strong> ${err.message}</div>`;
    } finally {
        btn.innerHTML = btn.innerHTML.replace('<i class="ri-loader-4-line ri-spin"></i> Generating...', '');
        btn.disabled = false;
        // Reset button text based on tool
        const icons = { 'cover-letter': 'ri-magic-line', 'resume-analyzer': 'ri-bar-chart-grouped-line', 'interview-prep': 'ri-question-answer-line', 'linkedin-summary': 'ri-linkedin-box-line', 'cold-email': 'ri-mail-send-line' };
        const labels = { 'cover-letter': 'Generate Cover Letter', 'resume-analyzer': 'Analyze My Resume', 'interview-prep': 'Generate Interview Q&A', 'linkedin-summary': 'Generate LinkedIn Summary', 'cold-email': 'Generate Cold Email' };
        btn.innerHTML = `<i class="${icons[tool]}"></i> ${labels[tool]}`;
    }
}

function v(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function validateInputs(tool, body) {
    if (tool === 'cover-letter' && (!body.cv || !body.jobDescription)) { alert('Please fill in both Resume and Job Description.'); return false; }
    if (tool === 'resume-analyzer' && !body.cv) { alert('Please paste your resume.'); return false; }
    if (tool === 'interview-prep' && !body.jobDescription) { alert('Please paste the job description.'); return false; }
    if (tool === 'linkedin-summary' && !body.cv) { alert('Please paste your resume.'); return false; }
    if (tool === 'cold-email' && (!body.cv || !body.companyName)) { alert('Please paste your resume and enter the company name.'); return false; }
    if (tool === 'salary-negotiation' && (!body.offeredSalary || !body.targetSalary)) { alert('Please enter offered and target salary.'); return false; }
    if (tool === 'thank-you-email' && !body.companyName) { alert('Company name required.'); return false; }
    if (tool === 'professional-bio' && !body.cv) { alert('Please paste your resume.'); return false; }
    if (tool === 'skills-gap' && (!body.cv || !body.jobDescription)) { alert('Both resume and job description required.'); return false; }
    if (tool === 'rejection-response' && !body.companyName) { alert('Company name required.'); return false; }
    return true;
}

function copyOutput() {
    const outputEl = document.getElementById(`output-${currentTool}`);
    const text = outputEl.innerText;
    if (!text || text.includes('will appear here') || text.includes('AI is working')) return;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector(`#panel-${currentTool} .copy-btn`);
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="ri-check-line" style="color:#10b981;"></i> Copied!';
        setTimeout(() => btn.innerHTML = orig, 2000);
    });
}

initUI();

// �� Support panel in TOOLS ��
const origTools = TOOLS;
TOOLS['support'] = { title: 'Support Center', desc: 'Submit a ticket or browse FAQs. We reply within 24 hours.' };

async function submitTicket() {
    const subject  = document.getElementById('ticket-subject').value.trim();
    const category = document.getElementById('ticket-category').value;
    const message  = document.getElementById('ticket-message').value.trim();
    if (!subject || !message) { alert('Please fill in Subject and Message.'); return; }
    const btn = document.querySelector('#panel-support .btn-generate');
    btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Submitting...';
    btn.disabled = true;
    try {
        const r = await fetch('/api/support/ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ subject, category, message })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        document.getElementById('ticket-success').classList.remove('hidden');
        document.getElementById('ticket-subject').value = '';
        document.getElementById('ticket-message').value = '';
        loadMyTickets();
    } catch (err) { alert('Error: ' + err.message); }
    finally { btn.innerHTML = '<i class="ri-send-plane-line"></i> Submit Ticket'; btn.disabled = false; }
}

async function loadMyTickets() {
    const r = await fetch('/api/support/tickets', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    const el = document.getElementById('myTicketsList');
    if (!d.tickets?.length) { el.innerHTML = '<div class="ticket-empty">No tickets yet.</div>'; return; }
    el.innerHTML = d.tickets.map(t => `
        <div class="ticket-item">
            <div class="ticket-item-subject">${t.subject}</div>
            <div class="ticket-item-meta">
                <span class="ticket-badge ${t.status === 'open' ? 'badge-open' : 'badge-closed'}">${t.status}</span>
                <span>${t.category}</span>
            </div>
            ${t.reply ? `<div style="margin-top:0.5rem;font-size:0.83rem;color:#34d399;"><i class="ri-reply-line"></i> ${t.reply}</div>` : ''}
        </div>`).join('');
}

function toggleFaq(el) {
    const item = el.parentElement;
    item.classList.toggle('open');
}



// ── ONBOARDING LOGIC ──
function checkOnboarding() {
    if (!currentUser.hasCompletedOnboarding) {
        document.getElementById('ob-name').value = currentUser.name || '';
        document.getElementById('onboardingModal').classList.add('active');
    }
}

function nextObStep(step) {
    document.querySelectorAll('.modal-step').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.mp-dot').forEach(d => d.classList.remove('active'));
    
    document.getElementById(`ob-step-${step}`).classList.add('active');
    for(let i=1; i<=step; i++) {
        document.getElementById(`dot-${i}`).classList.add('active');
    }
}

async function submitOnboarding() {
    const btn = document.getElementById('btn-ob-submit');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Saving...';
    btn.disabled = true;
    
    const name = document.getElementById('ob-name').value;
    const industry = document.getElementById('ob-industry').value;
    const role = document.getElementById('ob-role').value;
    
    try {
        // Save name if changed
        if (name && name !== currentUser.name) {
            await fetch('/api/user/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('hm_token')}` },
                body: JSON.stringify({ name })
            });
        }
        
        // Complete onboarding
        const res = await fetch('/api/user/onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('hm_token')}` },
            body: JSON.stringify({ industry, targetRole: role })
        });
        
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('hm_user', JSON.stringify(currentUser));
            initUI(); // Refresh UI
            document.getElementById('onboardingModal').classList.remove('active');
        }
    } catch (e) {
        alert('Error saving onboarding info.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

setTimeout(checkOnboarding, 500);

// ── THEME LOGIC ──
const savedTheme = localStorage.getItem('hm_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
updateThemeIcon();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('hm_theme', next);
    updateThemeIcon();
}

function updateThemeIcon() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const icon = document.getElementById('themeIcon');
    if(icon) icon.className = isLight ? 'ri-moon-line' : 'ri-sun-line';
}


// ── EXPORT LOGIC ──
function getOutputContent() {
    const obody = document.getElementById(`output-${currentTool}`);
    if(!obody || obody.querySelector('.placeholder-msg')) return null;
    return obody.innerText;
}

function exportOutput(format) {
    const text = getOutputContent();
    if(!text) { alert('Nothing to export yet.'); return; }
    
    const title = `${TOOLS[currentTool].title.replace(/\s+/g, '_')}_HireMeAI`;
    
    if (format === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        doc.setFontSize(12);
        const splitText = doc.splitTextToSize(text, 180);
        doc.text(splitText, 15, 20);
        doc.save(`${title}.pdf`);
    } else if (format === 'word') {
        const blob = new Blob([text], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.doc`;
        a.click();
        URL.revokeObjectURL(url);
    }
}


// ── HISTORY LOGIC ──
async function loadHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '<div class="placeholder-msg"><i class="ri-loader-4-line ri-spin"></i><p>Loading history...</p></div>';
    
    try {
        const res = await fetch('/api/history', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('hm_token')}` }
        });
        const data = await res.json();
        
        if (!data.history || data.history.length === 0) {
            list.innerHTML = '<div class="placeholder-msg"><i class="ri-folder-open-line"></i><p>No documents generated yet.</p></div>';
            return;
        }
        
        list.innerHTML = data.history.map(h => `
            <div style="background:rgba(0,0,0,0.2); border:1px solid var(--border); border-radius:12px; padding:1.2rem;">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.8rem;">
                    <div style="font-weight:700; color:var(--primary);"><i class="ri-file-text-line"></i> ${h.title}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">${new Date(h.date).toLocaleString()}</div>
                </div>
                <div style="font-size:0.9rem; color:var(--text-subtle); max-height:80px; overflow:hidden; position:relative;">
                    ${h.content.replace(/\n/g, '<br>')}
                    <div style="position:absolute; bottom:0; left:0; right:0; height:40px; background:linear-gradient(transparent, var(--bg));"></div>
                </div>
                <button class="copy-btn" style="margin-top:0.8rem;" onclick="navigator.clipboard.writeText(\`${h.content.replace(/`/g, '\\`')}\`); alert('Copied from history!')"><i class="ri-file-copy-line"></i> Copy Full Text</button>
            </div>
        `).join('');
    } catch(e) {
        list.innerHTML = '<div class="placeholder-msg"><i class="ri-error-warning-line"></i><p>Failed to load history.</p></div>';
    }
}

// ── SETTINGS LOGIC ──
function initSettings() {
    document.getElementById('set-name').value = currentUser.name || '';
    document.getElementById('set-email').value = currentUser.email || '';
    document.getElementById('set-plan').textContent = currentUser.plan || 'Starter';
    document.getElementById('set-credits').textContent = currentUser.credits === 999999 ? 'Unlimited' : currentUser.credits;
    document.getElementById('set-fill').style.width = currentUser.credits === 999999 ? '100%' : Math.min(currentUser.credits * 10, 100) + '%';
    
    if (currentUser.plan === 'pro') {
        document.getElementById('set-fill').style.background = 'linear-gradient(90deg, #10b981, #059669)';
        document.getElementById('set-fill').style.boxShadow = '0 0 15px rgba(16,185,129,0.5)';
    }
}

async function saveSettings() {
    const name = document.getElementById('set-name').value;
    try {
        const res = await fetch('/api/user/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('hm_token')}` },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.success) {
            currentUser = data.user;
            localStorage.setItem('hm_user', JSON.stringify(currentUser));
            initUI();
            alert('Settings saved successfully!');
        }
    } catch(e) {
        alert('Failed to save settings.');
    }
}

// ── STRIPE CHECKOUT SIMULATION ──
function openCheckoutModal() {
    if(currentUser.plan === 'pro') { alert('You are already on the Pro plan!'); return; }
    document.getElementById('checkoutModal').classList.add('active');
}

function closeCheckout() {
    document.getElementById('checkoutModal').classList.remove('active');
}

async function submitCheckout() {
    closeCheckout();
}

// Hook settings panel open without relying on a global selectTool function
document.querySelectorAll('.nav-item[data-tool="settings"]').forEach((btn) => {
    btn.addEventListener('click', initSettings);
});
