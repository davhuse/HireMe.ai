const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ── Manual .env reader (bypasses dotenvx global injection) ──
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#')) {
            const i = t.indexOf('=');
            if (i > 0) process.env[t.substring(0, i).trim()] = t.substring(i + 1).trim();
        }
    }
}

const app   = express();
const PORT  = process.env.PORT || 4000;
const API_KEY  = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL    = process.env.MODEL_NAME || 'gpt-3.5-turbo';
const JWT_SECRET = process.env.JWT_SECRET || 'hireme_ai_secret_2025';
const USERS_FILE = path.join(__dirname, 'users.json');
const FREE_CREDITS = 10;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── User DB helpers ──
function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}
let users = loadUsers();
function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Auth middleware ──
function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ── AI call helper ──
async function callAI(prompt) {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
            'HTTP-Referer': 'http://localhost:4000',
            'X-Title': 'HireMe.ai'
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
        })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error?.message || 'AI API error');
    return data.choices[0].message.content;
}

// ── Credit deduct helper ──
function deductCredit(email) {
    const u = users.find(x => x.email === email);
    if (!u || u.credits <= 0) return false;
    u.credits--;
    saveUsers();
    return true;
}

// ═══════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required.' });
        
        if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered.' });
        
        const hashed = await bcrypt.hash(password, 10);
        const newUser = { id: Date.now().toString(), name, email, password: hashed, credits: FREE_CREDITS, plan: 'starter', history: [], hasCompletedOnboarding: false, industry: '', targetRole: '' };
        users.push(newUser);
        saveUsers();
        
        const token = jwt.sign({ id: newUser.id, email, name }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, history, ...safeUser } = newUser;
        res.json({ token, user: safeUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = users.find(u => u.email === email);
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const token = jwt.sign({ id: user.id, email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, history, ...safeUser } = user;
        res.json({ token, user: safeUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    try {
        const user = users.find(u => u.email === req.user.email);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { password: _, history, ...safeUser } = user;
        res.json(safeUser);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════
// NEW FEATURES (History, Settings, Onboarding)
// ═══════════════════════════════════

// 1. History
app.get('/api/history', authMiddleware, (req, res) => {
    const user = users.find(u => u.email === req.user.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ history: user.history || [] });
});

app.post('/api/history', authMiddleware, (req, res) => {
    const { toolName, content, title } = req.body;
    const user = users.find(u => u.email === req.user.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (!user.history) user.history = [];
    user.history.unshift({
        id: Date.now().toString(),
        toolName,
        title: title || toolName,
        content,
        date: new Date().toISOString()
    });
    
    // Keep only last 50 items to save space
    if (user.history.length > 50) user.history = user.history.slice(0, 50);
    
    saveUsers();
    res.json({ success: true, history: user.history });
});

// 2. Onboarding
app.post('/api/user/onboarding', authMiddleware, (req, res) => {
    const { industry, targetRole } = req.body;
    const user = users.find(u => u.email === req.user.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.industry = industry || '';
    user.targetRole = targetRole || '';
    user.hasCompletedOnboarding = true;
    saveUsers();
    
    // Return sanitized user
    const { password: _, history, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// 3. Settings / Profile Update
app.post('/api/user/profile', authMiddleware, (req, res) => {
    const { name } = req.body;
    const user = users.find(u => u.email === req.user.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    if (name) user.name = name;
    saveUsers();
    
    const { password: _, history, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// 4. Upgrade Plan (Stripe Simulation)
app.post('/api/user/upgrade', authMiddleware, (req, res) => {
    const user = users.find(u => u.email === req.user.email);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.plan = 'pro';
    user.credits = 999999; // Unlimited
    saveUsers();
    
    const { password: _, history, ...safeUser } = user;
    res.json({ success: true, user: safeUser });
});

// ═══════════════════════════════════
// TOOL GENERATION ROUTES
// ═══════════════════════════════════
app.post('/api/generate/cover-letter', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription, tone, language } = req.body;
        if (!cv || !jobDescription) return res.status(400).json({ error: 'Resume and Job Description required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left. Please upgrade.' });
        
        const prompt = `Write a personalized cover letter. Tone: ${tone || 'professional'}. Language: ${language || 'English'}. Keep it under 300 words. RESUME:\n${cv}\nJOB DESCRIPTION:\n${jobDescription}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/resume-analyzer', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription } = req.body;
        if (!cv) return res.status(400).json({ error: 'Resume required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Analyze this resume${jobDescription ? ' against the job description' : ''}. Give ATS score (0-100), 3 strengths, 2 areas for improvement, missing keywords, and 1 tip. Format with emojis. RESUME:\n${cv}\n${jobDescription ? 'JOB DESCRIPTION:\n' + jobDescription : ''}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/interview-prep', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription } = req.body;
        if (!jobDescription) return res.status(400).json({ error: 'Job Description required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Generate 8 interview questions and ideal answers (STAR method) based on the job description. JOB DESCRIPTION:\n${jobDescription}\n${cv ? 'RESUME:\n' + cv : ''}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/linkedin-summary', authMiddleware, async (req, res) => {
    try {
        const { cv, targetRole, tone } = req.body;
        if (!cv) return res.status(400).json({ error: 'Resume required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a keyword-rich LinkedIn "About" section for this professional. Target role: ${targetRole || 'not specified'}. Tone: ${tone || 'professional'}. Max 2600 chars. RESUME:\n${cv}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/cold-email', authMiddleware, async (req, res) => {
    try {
        const { cv, recruiterName, companyName, targetRole } = req.body;
        if (!cv || !companyName) return res.status(400).json({ error: 'Resume and Company Name required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a short cold outreach email to ${recruiterName || 'Hiring Manager'} at ${companyName} for ${targetRole || 'a position'}. Format: SUBJECT: ... [email body]. RESUME:\n${cv}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/salary-negotiation', authMiddleware, async (req, res) => {
    try {
        const { cv, offeredSalary, targetSalary, jobTitle, companyName } = req.body;
        if (!offeredSalary || !targetSalary) return res.status(400).json({ error: 'Offered and target salary required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a salary negotiation email to ${companyName || 'the company'} for ${jobTitle || 'the position'}. Offered: ${offeredSalary}, Target: ${targetSalary}. Keep it under 200 words. ${cv ? 'RESUME:\n' + cv : ''}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/thank-you-email', authMiddleware, async (req, res) => {
    try {
        const { interviewerName, companyName, jobTitle, keyPoint } = req.body;
        if (!companyName) return res.status(400).json({ error: 'Company name required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a Thank You email after an interview for ${jobTitle || 'the position'} at ${companyName}. Interviewer: ${interviewerName || 'Hiring Manager'}. Key Point: ${keyPoint || 'the exciting challenges'}.`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/professional-bio', authMiddleware, async (req, res) => {
    try {
        const { cv, platform, tone } = req.body;
        if (!cv) return res.status(400).json({ error: 'Resume required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a professional bio for ${platform || 'Website/Portfolio'}. Tone: ${tone || 'Professional'}. RESUME:\n${cv}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/skills-gap', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription } = req.body;
        if (!cv || !jobDescription) return res.status(400).json({ error: 'Both resume and job description required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Provide a Skills Gap Analysis between the resume and job description. List skills they have, missing skills, and how to close the gap. RESUME:\n${cv}\nJOB DESCRIPTION:\n${jobDescription}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/generate/rejection-response', authMiddleware, async (req, res) => {
    try {
        const { recruiterName, companyName, jobTitle } = req.body;
        if (!companyName) return res.status(400).json({ error: 'Company name required.' });
        if (!deductCredit(req.user.email)) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a graceful response to a job rejection email from ${companyName} for ${jobTitle || 'the position'}.`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════
// ADMIN & SUPPORT
// ═══════════════════════════════════
const TICKETS_FILE = path.join(__dirname, 'tickets.json');
function loadTickets() { if (!fs.existsSync(TICKETS_FILE)) fs.writeFileSync(TICKETS_FILE, '[]'); return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf8')); }
function saveTickets(t) { fs.writeFileSync(TICKETS_FILE, JSON.stringify(t, null, 2)); }

function adminMiddleware(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = jwt.verify(token, JWT_SECRET);
        if (!user.email.includes('admin')) return res.status(403).json({ error: 'Admin only' });
        req.user = user; next();
    } catch { res.status(401).json({ error: 'Invalid token' }); }
}

app.get('/api/admin/stats', adminMiddleware, (req, res) => {
    const tickets = loadTickets();
    const totalCreditsGiven = users.length * 10;
    const creditsRemaining = users.reduce((s, u) => s + (u.credits || 0), 0);
    res.json({ totalUsers: users.length, creditsUsed: totalCreditsGiven - creditsRemaining, openTickets: tickets.filter(t => t.status === 'open').length });
});

app.get('/api/admin/users', adminMiddleware, (req, res) => {
    const uList = users.map(({ password, history, ...u }) => u);
    res.json({ users: uList });
});

app.post('/api/admin/credits', adminMiddleware, (req, res) => {
    const { email, amount } = req.body;
    const u = users.find(x => x.email === email);
    if (!u) return res.status(404).json({ error: 'User not found' });
    u.credits += amount;
    saveUsers();
    res.json({ ok: true });
});

app.delete('/api/admin/users/:email', adminMiddleware, (req, res) => {
    users = users.filter(u => u.email !== decodeURIComponent(req.params.email));
    saveUsers();
    res.json({ ok: true });
});

app.get('/api/admin/tickets', adminMiddleware, (req, res) => {
    res.json({ tickets: loadTickets() });
});

app.post('/api/admin/tickets/:id', adminMiddleware, (req, res) => {
    const tickets = loadTickets();
    const t = tickets.find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Ticket not found' });
    t.reply = req.body.reply;
    t.status = 'closed';
    t.repliedAt = new Date().toISOString();
    saveTickets(tickets);
    res.json({ ok: true });
});

app.post('/api/support/ticket', authMiddleware, (req, res) => {
    const { subject, category, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: 'Subject and message required.' });
    const u = users.find(x => x.email === req.user.email);
    const tickets = loadTickets();
    const ticket = { id: Date.now().toString(), userEmail: req.user.email, userName: u?.name || req.user.email, subject, category: category || 'other', message, status: 'open', reply: null, createdAt: new Date().toISOString(), repliedAt: null };
    tickets.push(ticket);
    saveTickets(tickets);
    res.json({ ok: true, id: ticket.id });
});

app.get('/api/support/tickets', authMiddleware, (req, res) => {
    const tickets = loadTickets().filter(t => t.userEmail === req.user.email);
    res.json({ tickets });
});

app.listen(PORT, () => {
    console.log(`✅ HireMe.ai server running at http://localhost:${PORT}`);
    console.log(`🔗 API: ${BASE_URL} | 🤖 Model: ${MODEL}`);
});
