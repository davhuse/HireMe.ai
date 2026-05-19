const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// ── Manual .env reader (bypasses dotenvx global injection) ──
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        const t = line.trim();
        if (t && !t.startsWith('#')) {
            const i = t.indexOf('=');
            if (i > 0) {
                const key = t.substring(0, i).trim();
                const value = t.substring(i + 1).trim();
                if (!process.env[key]) process.env[key] = value;
            }
        }
    }
}

const app   = express();
const PORT  = process.env.PORT || 4000;
const API_KEY  = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL    = process.env.MODEL_NAME || 'gpt-3.5-turbo';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_change_me';
const MONGODB_URI = process.env.MONGODB_URI || '';
const FREE_CREDITS = 10;

// OAuth
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const OAUTH_BASE_URL = process.env.OAUTH_BASE_URL || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbConnectPromise = null;
async function ensureDbConnection() {
    if (!MONGODB_URI) throw new Error('MONGODB_URI is missing');
    if (mongoose.connection.readyState === 1) return;
    if (!dbConnectPromise) {
        dbConnectPromise = mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10
        }).finally(() => {
            dbConnectPromise = null;
        });
    }
    await dbConnectPromise;
}

function getOAuthBaseUrl(req) {
    if (OAUTH_BASE_URL) return OAUTH_BASE_URL.replace(/\/+$/, '');
    const forwardedProto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim();
    const protocol = forwardedProto || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}`;
}

// ── Mongoose Connection ──
mongoose.connection.on('connecting', () => console.log('🔄 MongoDB Connecting...'));
mongoose.connection.on('connected', () => console.log('✅ MongoDB Connected successfully!'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB Connection Error:', err));
mongoose.connection.on('disconnected', () => console.log('🔌 MongoDB Disconnected!'));

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 10s to fail faster
    })
    .then(() => console.log('✅ Mongoose connection initialized'))
    .catch(err => console.error('❌ Mongoose initial connection error:', err));
} else {
    console.error('❌ MONGODB_URI is missing. Set it in environment variables.');
}

// ── Mongoose Models ──
const historySchema = new mongoose.Schema({
    id: String,
    toolName: String,
    title: String,
    content: String,
    date: Date
});

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Optional for OAuth
    googleId: { type: String, unique: true, sparse: true },
    githubId: { type: String, unique: true, sparse: true },
    credits: { type: Number, default: FREE_CREDITS },
    plan: { type: String, default: 'starter' },
    hasCompletedOnboarding: { type: Boolean, default: false },
    industry: { type: String, default: '' },
    targetRole: { type: String, default: '' },
    history: [historySchema],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

const ticketSchema = new mongoose.Schema({
    userEmail: String,
    userName: String,
    subject: String,
    category: String,
    message: String,
    status: { type: String, default: 'open' },
    reply: String,
    repliedAt: Date,
    createdAt: { type: Date, default: Date.now }
});

const Ticket = mongoose.model('Ticket', ticketSchema);

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

// ── Admin middleware ──
function adminMiddleware(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = jwt.verify(token, JWT_SECRET);
        if (!user.email.includes('admin')) return res.status(403).json({ error: 'Admin only' });
        req.user = user; next();
    } catch { res.status(401).json({ error: 'Invalid token' }); }
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
async function deductCredit(email) {
    const user = await User.findOne({ email });
    if (!user || user.credits <= 0) return false;
    user.credits--;
    await user.save();
    return true;
}

// ═══════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════
app.post('/api/auth/register', async (req, res) => {
    try {
        await ensureDbConnection();
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'All fields required.' });
        
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already registered.' });
        
        const hashed = await bcrypt.hash(password, 10);
        const newUser = await User.create({ name, email, password: hashed });
        
        const token = jwt.sign({ id: newUser._id, email, name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { name, email, credits: newUser.credits, plan: newUser.plan, hasCompletedOnboarding: newUser.hasCompletedOnboarding } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        await ensureDbConnection();
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !await bcrypt.compare(password, user.password)) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const token = jwt.sign({ id: user._id, email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, history, ...safeUser } = user.toObject();
        res.json({ token, user: safeUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        await ensureDbConnection();
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ name: user.name, email: user.email, credits: user.credits, plan: user.plan, hasCompletedOnboarding: user.hasCompletedOnboarding });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Google OAuth ──
app.get('/api/auth/google', (req, res) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(500).send('Google OAuth is not configured on server.');
    }
    const baseUrl = getOAuthBaseUrl(req);
    const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/google/callback`);
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20profile%20email`;
    res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/login.html?error=no_code');
    
    try {
        await ensureDbConnection();
        const baseUrl = getOAuthBaseUrl(req);
        // Exchange code for token
        const redirectUri = `${baseUrl}/api/auth/google/callback`;
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `code=${code}&client_id=${GOOGLE_CLIENT_ID}&client_secret=${GOOGLE_CLIENT_SECRET}&redirect_uri=${redirectUri}&grant_type=authorization_code`
        });
        const tokenData = await tokenRes.json();
        
        if (!tokenData.access_token) throw new Error('Failed to get access token');
        
        // Get user info
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        const userData = await userRes.json();
        if (!userData.email) throw new Error('No email found from Google');
        
        // Find or create user
        let user = await User.findOne({ $or: [{ googleId: userData.id }, { email: userData.email }] });
        
        if (!user) {
            user = await User.create({
                name: userData.name || 'Google User',
                email: userData.email,
                googleId: userData.id
            });
        } else if (!user.googleId) {
            user.googleId = userData.id;
            await user.save();
        }
        
        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.redirect(`/dashboard.html?token=${token}&user=${encodeURIComponent(JSON.stringify({name: user.name, email: user.email, credits: user.credits, plan: user.plan, hasCompletedOnboarding: user.hasCompletedOnboarding}))}`);
    } catch (err) {
        console.error('Google OAuth Error:', err.message, err.stack);
        res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
    }
});

// ── GitHub OAuth ──
app.get('/api/auth/github', (req, res) => {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
        return res.status(500).send('GitHub OAuth is not configured on server.');
    }
    const baseUrl = getOAuthBaseUrl(req);
    const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/github/callback`);
    const url = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${redirectUri}&scope=user:email`;
    res.redirect(url);
});

app.get('/api/auth/github/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.redirect('/login.html?error=no_code');
    
    try {
        await ensureDbConnection();
        const baseUrl = getOAuthBaseUrl(req);
        const redirectUri = `${baseUrl}/api/auth/github/callback`;
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: GITHUB_CLIENT_ID,
                client_secret: GITHUB_CLIENT_SECRET,
                code: code,
                redirect_uri: redirectUri
            })
        });
        const tokenData = await tokenRes.json();
        
        if (!tokenData.access_token) throw new Error('Failed to get access token');
        
        // Get user info
        const userRes = await fetch('https://api.github.com/user', {
            headers: { 
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: 'application/json',
                'User-Agent': 'HireMe-ai OAuth'
            }
        });
        const userData = await userRes.json();
        
        // Get user email
        const emailRes = await fetch('https://api.github.com/user/emails', {
            headers: { 
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: 'application/json',
                'User-Agent': 'HireMe-ai OAuth'
            }
        });
        const emailData = await emailRes.json();
        const primaryEmail = emailData.find(e => e.primary)?.email || emailData[0]?.email;
        
        if (!primaryEmail) throw new Error('No email found from GitHub');
        
        let user = await User.findOne({ $or: [{ githubId: userData.id.toString() }, { email: primaryEmail }] });
        
        if (!user) {
            user = await User.create({
                name: userData.name || userData.login || 'GitHub User',
                email: primaryEmail,
                githubId: userData.id.toString()
            });
        } else if (!user.githubId) {
            user.githubId = userData.id.toString();
            await user.save();
        }
        
        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.redirect(`/dashboard.html?token=${token}&user=${encodeURIComponent(JSON.stringify({name: user.name, email: user.email, credits: user.credits, plan: user.plan, hasCompletedOnboarding: user.hasCompletedOnboarding}))}`);
    } catch (err) {
        console.error('GitHub OAuth Error:', err.message, err.stack);
        res.redirect(`/login.html?error=${encodeURIComponent(err.message)}`);
    }
});

// ═══════════════════════════════════
// NEW FEATURES (History, Settings, Onboarding)
// ═══════════════════════════════════

// 1. History
app.get('/api/history', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ history: user.history || [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/history', authMiddleware, async (req, res) => {
    try {
        const { toolName, content, title } = req.body;
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.history.unshift({
            id: Date.now().toString(),
            toolName,
            title: title || toolName,
            content,
            date: new Date()
        });
        
        if (user.history.length > 50) user.history = user.history.slice(0, 50);
        await user.save();
        res.json({ success: true, history: user.history });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Onboarding
app.post('/api/user/onboarding', authMiddleware, async (req, res) => {
    try {
        const { industry, targetRole } = req.body;
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.industry = industry || '';
        user.targetRole = targetRole || '';
        user.hasCompletedOnboarding = true;
        await user.save();
        
        const { password: _, history, ...safeUser } = user.toObject();
        res.json({ success: true, user: safeUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Settings / Profile Update
app.post('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        if (name) user.name = name;
        await user.save();
        
        const { password: _, history, ...safeUser } = user.toObject();
        res.json({ success: true, user: safeUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Upgrade Plan
app.post('/api/user/upgrade', authMiddleware, async (req, res) => {
    res.status(402).json({
        error: 'Payments are not configured yet. Pro upgrades are temporarily disabled.'
    });
});

// ═══════════════════════════════════
// TOOL GENERATION ROUTES
// ═══════════════════════════════════
// (Keeping prompts exact same, just changing deductCredit call and adding async/await logic if needed)

// 1. Cover Letter
app.post('/api/generate/cover-letter', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription, tone, language } = req.body;
        if (!cv || !jobDescription) return res.status(400).json({ error: 'Resume and Job Description required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left. Please upgrade.' });
        
        const prompt = `Write a personalized cover letter.
Tone: ${tone || 'professional'}
Language: ${language || 'English'}
Do not use placeholders like [Your Name]. If missing, omit it gracefully. Keep it under 300 words.
RESUME:
${cv}
JOB DESCRIPTION:
${jobDescription}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Resume Analyzer
app.post('/api/generate/resume-analyzer', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription } = req.body;
        if (!cv) return res.status(400).json({ error: 'Resume required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left. Please upgrade.' });
        
        const prompt = `Analyze this resume${jobDescription ? ' against the job description' : ''}. Give a concise output:
1. Overall ATS Score (0-100)
2. Top 3 Strengths
3. 2 Areas for Improvement
4. ATS Keywords Missing (if job description provided)
5. One specific actionable tip to immediately improve this resume.
Format with clear sections and emojis for readability.
RESUME:
${cv}
${jobDescription ? '\nJOB DESCRIPTION:\n' + jobDescription : ''}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Interview Prep
app.post('/api/generate/interview-prep', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription } = req.body;
        if (!jobDescription) return res.status(400).json({ error: 'Job Description required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left. Please upgrade.' });
        const prompt = `You are an expert interview coach. Based on the job description${cv ? ' and the candidate resume' : ''}, generate the top 8 most likely interview questions with ideal, specific, and impressive answer examples. Format as:
Q1: [Question]
💡 Ideal Answer: [Detailed answer example]
---
Make answers specific, use STAR method where appropriate, and tailor to the role.
JOB DESCRIPTION:
${jobDescription}
${cv ? '\nCANDIDATE RESUME:\n' + cv : ''}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. LinkedIn Summary
app.post('/api/generate/linkedin-summary', authMiddleware, async (req, res) => {
    try {
        const { cv, targetRole, tone } = req.body;
        if (!cv) return res.status(400).json({ error: 'Resume text required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left. Please upgrade.' });
        const prompt = `You are a LinkedIn personal branding expert. Write a compelling, keyword-rich LinkedIn "About" section for this professional.
Tone: ${tone || 'professional and authentic'}. Target role: ${targetRole || 'not specified'}.
- 3-5 short punchy paragraphs
- Start with a strong hook (not "I am a...")
- Include key skills and achievements
- End with a call to action
- Max 2600 characters
- Write in first person
RESUME:
${cv}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Cold Email to Recruiter
app.post('/api/generate/cold-email', authMiddleware, async (req, res) => {
    try {
        const { cv, recruiterName, companyName, targetRole } = req.body;
        if (!cv || !companyName) return res.status(400).json({ error: 'Resume and Company Name required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left. Please upgrade.' });
        const prompt = `You are an expert at writing cold outreach emails for job seekers. Write a short, punchy, personalized cold email to a recruiter that will get a response.
- Keep it under 150 words
- Have a compelling subject line
- Reference specific value you can bring
- Not desperate or generic
- End with a soft CTA
Recruiter Name: ${recruiterName || 'Hiring Manager'}
Company: ${companyName}
Target Role: ${targetRole || 'a suitable position'}
CANDIDATE RESUME:
${cv}
Format:
SUBJECT: [subject line]
[email body]`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. Salary Negotiation Email
app.post('/api/generate/salary-negotiation', authMiddleware, async (req, res) => {
    try {
        const { cv, offeredSalary, targetSalary, jobTitle, companyName } = req.body;
        if (!offeredSalary || !targetSalary) return res.status(400).json({ error: 'Offered and target salary required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a professional, confident, and respectful salary negotiation email. The candidate has received an offer and wants to counter. Be persuasive but not aggressive. Keep it under 200 words.
Job Title: ${jobTitle || 'the position'}
Company: ${companyName || 'the company'}
Offered Salary: ${offeredSalary}
Target Salary: ${targetSalary}
${cv ? 'Candidate Background:\n' + cv : ''}
Format:
SUBJECT: [subject line]
[email body]`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 7. Thank You Email after Interview
app.post('/api/generate/thank-you-email', authMiddleware, async (req, res) => {
    try {
        const { interviewerName, companyName, jobTitle, keyPoint } = req.body;
        if (!companyName) return res.status(400).json({ error: 'Company name required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a professional "Thank You" email to send after a job interview.
- Keep it under 150 words
- Express gratitude and reiterate interest
- Mention a specific point discussed in the interview
Interviewer: ${interviewerName || 'Hiring Manager'}
Company: ${companyName}
Role: ${jobTitle || 'the position'}
Key Point Discussed: ${keyPoint || 'the exciting challenges of the role'}
Format:
SUBJECT: [subject line]
[email body]`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 8. Professional Bio
app.post('/api/generate/professional-bio', authMiddleware, async (req, res) => {
    try {
        const { cv, platform, tone } = req.body;
        if (!cv) return res.status(400).json({ error: 'Resume required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a professional bio for a candidate based on their resume. 
Target Platform: ${platform || 'Website/Portfolio'} (Adapt length and style accordingly. E.g. Twitter is max 160 chars, Website is a few paragraphs).
Tone: ${tone || 'Professional'}
Make it engaging, highlight key achievements and unique value proposition.
RESUME:
${cv}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 9. Skills Gap Analysis
app.post('/api/generate/skills-gap', authMiddleware, async (req, res) => {
    try {
        const { cv, jobDescription } = req.body;
        if (!cv || !jobDescription) return res.status(400).json({ error: 'Both resume and job description required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `You are a senior technical recruiter and career coach. Compare the candidate's resume against the job description and provide a detailed Skills Gap Analysis:
1. ✅ Skills You Already Have (relevant to this role)
2. ❌ Missing Skills (critical gaps)
3. ⚠️ Partially Matching Skills (need improvement)
4. 💡 How to Close Each Gap (specific courses, certifications, or projects – be very specific)
5. 📊 Overall Match Score (out of 100) with brief explanation
Be specific and actionable. Format clearly with sections.
RESUME:\n${cv}\n\nJOB DESCRIPTION:\n${jobDescription}`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 10. Job Rejection Response
app.post('/api/generate/rejection-response', authMiddleware, async (req, res) => {
    try {
        const { recruiterName, companyName, jobTitle } = req.body;
        if (!companyName) return res.status(400).json({ error: 'Company name required.' });
        if (!(await deductCredit(req.user.email))) return res.status(402).json({ error: 'No credits left.' });
        const prompt = `Write a graceful, professional response to a job rejection email. The goal is to:
- Thank them for their time
- Express continued interest in the company for future roles
- Ask for brief feedback if appropriate
- Leave a lasting positive impression
- Keep it under 120 words and professional
Recruiter/Hiring Manager: ${recruiterName || 'Hiring Team'}
Company: ${companyName}
Role Applied: ${jobTitle || 'the position'}
Format:
SUBJECT: [subject line]
[email body]`;
        const result = await callAI(prompt);
        res.json({ result });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════
// ADMIN & SUPPORT
// ═══════════════════════════════════

// Admin stats
app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find({});
        const tickets = await Ticket.find({});
        const totalCreditsGiven = users.length * 10;
        const creditsRemaining = users.reduce((s, u) => s + (u.credits || 0), 0);
        res.json({ totalUsers: users.length, creditsUsed: totalCreditsGiven - creditsRemaining, openTickets: tickets.filter(t => t.status === 'open').length });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin users
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find({}, '-password -history').lean();
        res.json({ users });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin add credits
app.post('/api/admin/credits', adminMiddleware, async (req, res) => {
    try {
        const { email, amount } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });
        user.credits += amount;
        await user.save();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin delete user
app.delete('/api/admin/users/:email', adminMiddleware, async (req, res) => {
    try {
        await User.findOneAndDelete({ email: decodeURIComponent(req.params.email) });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin tickets
app.get('/api/admin/tickets', adminMiddleware, async (req, res) => {
    try {
        const tickets = await Ticket.find({}).sort({ createdAt: -1 });
        res.json({ tickets });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin reply to ticket
app.post('/api/admin/tickets/:id', adminMiddleware, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        ticket.reply = req.body.reply;
        ticket.status = 'closed';
        ticket.repliedAt = new Date();
        await ticket.save();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// User submit ticket
app.post('/api/support/ticket', authMiddleware, async (req, res) => {
    try {
        const { subject, category, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: 'Subject and message required.' });
        const user = await User.findOne({ email: req.user.email });
        
        const ticket = await Ticket.create({
            userEmail: req.user.email,
            userName: user?.name || req.user.email,
            subject,
            category: category || 'other',
            message,
            status: 'open'
        });
        res.json({ ok: true, id: ticket._id });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// User get own tickets
app.get('/api/support/tickets', authMiddleware, async (req, res) => {
    try {
        const tickets = await Ticket.find({ userEmail: req.user.email }).sort({ createdAt: -1 });
        res.json({ tickets });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`✅ HireMe.ai server running at http://localhost:${PORT}`);
    console.log(`🔗 API: ${BASE_URL} | 🤖 Model: ${MODEL}`);
});
