/* ─────────────────────────────
   Particle Canvas
───────────────────────────── */
const canvas = document.getElementById('particleCanvas');
const ctx = canvas.getContext('2d');
let W, H, particles = [];

function resize() { W = canvas.width = innerWidth; H = canvas.height = innerHeight; }
resize();
window.addEventListener('resize', resize);

class Particle {
    constructor() { this.reset(); }
    reset() {
        this.x = Math.random() * W;
        this.y = Math.random() * H;
        this.r = Math.random() * 1.8 + 0.3;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = (Math.random() - 0.5) * 0.4;
        this.a = Math.random() * 0.6 + 0.1;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99,102,241,${this.a})`;
        ctx.fill();
    }
}

for (let i = 0; i < 120; i++) particles.push(new Particle());

function drawLines() {
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 130) {
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                ctx.strokeStyle = `rgba(99,102,241,${0.12 * (1 - dist / 130)})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }
        }
    }
}

function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    drawLines();
    requestAnimationFrame(animate);
}
animate();

/* ─────────────────────────────
   Navbar scroll effect
───────────────────────────── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', scrollY > 50);
});

/* ─────────────────────────────
   Typewriter cycling hero text
───────────────────────────── */
const phrases = ['getting hired.', 'landing interviews.', 'writing cover letters.', 'acing interviews.', 'negotiating salary.'];
let pi = 0, ci = 0, deleting = false;
const typedEl = document.getElementById('typed');

function typeLoop() {
    const phrase = phrases[pi];
    if (!deleting) {
        typedEl.textContent = phrase.substring(0, ci + 1);
        ci++;
        if (ci === phrase.length) { deleting = true; setTimeout(typeLoop, 2000); return; }
    } else {
        typedEl.textContent = phrase.substring(0, ci - 1);
        ci--;
        if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; }
    }
    setTimeout(typeLoop, deleting ? 40 : 80);
}
typeLoop();

/* ─────────────────────────────
   Counter animation
───────────────────────────── */
function animateCounter(el, target) {
    let current = 0;
    const step = target / 60;
    const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        if (target >= 1000) el.textContent = Math.floor(current).toLocaleString() + '+';
        else el.textContent = Math.floor(current);
    }, 25);
}

/* ─────────────────────────────
   Scroll Reveal + Counter trigger
───────────────────────────── */
const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('visible');
            // Counter
            if (e.target.dataset.target) {
                animateCounter(e.target, parseInt(e.target.dataset.target));
                revealObs.unobserve(e.target);
            }
        }
    });
}, { threshold: 0.12 });

document.querySelectorAll('.tool-card, .step-card, .testi-card, .pricing-card').forEach((el, i) => {
    el.classList.add('reveal');
    const delay = ['', 'reveal-d1', 'reveal-d2'][i % 3];
    if (delay) el.classList.add(delay);
    revealObs.observe(el);
});

document.querySelectorAll('.stat-num[data-target]').forEach(el => revealObs.observe(el));

/* ─────────────────────────────
   Auth-aware navbar button
───────────────────────────── */
if (localStorage.getItem('hm_token')) {
    const btn = document.querySelector('.btn-nav-primary');
    if (btn) { btn.href = 'dashboard.html'; btn.innerHTML = 'Dashboard <i class="ri-dashboard-line"></i>'; }
    const heroBtn = document.querySelector('.btn-hero-primary');
    if (heroBtn) { heroBtn.href = 'dashboard.html'; heroBtn.innerHTML = '<i class="ri-dashboard-line"></i> Go to Dashboard'; }
}

/* ─────────────────────────────
   20-Person Testimonials Slider
───────────────────────────── */

/* ─────────────────────────────
   20-Person Testimonials Slider
───────────────────────────── */
const TESTIMONIALS = [
    { name:'Alex Johnson',   role:'Hired at Stripe',      avatar:'A', grad:'135deg,#6366f1,#a855f7', text:'Got 3 interview calls in my first week. The cover letter generator is insane — it picked up details from the job post I would have missed.' },
    { name:'Maria Santos',   role:'Hired at Shopify',     avatar:'M', grad:'135deg,#10b981,#06b6d4', text:'Applied for 3 months with zero results. Used the Resume Analyzer, rewrote my CV, got an offer in 2 weeks. Life changing.' },
    { name:'James Park',     role:'Hired at Airbnb',      avatar:'J', grad:'135deg,#f59e0b,#ef4444', text:'The interview prep tool is gold. It predicted 5 out of 8 questions. I accepted an offer 40% higher than my last salary.' },
    { name:'Priya Sharma',   role:'Hired at Google',      avatar:'P', grad:'135deg,#0ea5e9,#6366f1', text:'My LinkedIn summary rewrote itself from mediocre to magnetic. Recruiters started reaching out to me instead of the other way around.' },
    { name:'Lucas Müller',   role:'Hired at SAP',         avatar:'L', grad:'135deg,#a855f7,#ec4899', text:'Used Cold Email to contact 10 companies directly. 4 replied within a day. This tool pays for itself in one job offer.' },
    { name:'Yuki Tanaka',    role:'Hired at Sony',        avatar:'Y', grad:'135deg,#f59e0b,#10b981', text:'As a non-native English speaker, writing cover letters was my biggest fear. HireMe.ai made them perfect every time.' },
    { name:'Sara Ahmed',     role:'Hired at Deloitte',    avatar:'S', grad:'135deg,#06b6d4,#a855f7', text:'The salary negotiation email got me $12k more than the initial offer. Made back 100x the subscription price in one email.' },
    { name:'Daniel Wright',  role:'Hired at Netflix',     avatar:'D', grad:'135deg,#ef4444,#f59e0b', text:'From 0 callbacks to 6 in one month. I changed my resume based on Skills Gap Analyzer. Should have used this years ago.' },
    { name:'Lena Fischer',   role:'Hired at Adidas',      avatar:'L', grad:'135deg,#10b981,#fbbf24', text:'The Professional Bio tool wrote something I could never have written myself. Portfolio inquiries went up 300% in a week.' },
    { name:'Carlos Ruiz',    role:'Hired at Spotify',     avatar:'C', grad:'135deg,#1db954,#06b6d4', text:'Got rejected and used the Rejection Response tool to write back gracefully. The recruiter called me 3 days later with a new opening.' },
    { name:'Aisha Okafor',   role:'Hired at Microsoft',   avatar:'A', grad:'135deg,#0078d4,#a855f7', text:'I was switching industries completely. The cover letter nailed the tone of confidence despite my unrelated background. Hired!' },
    { name:'Tom Reynolds',   role:'Hired at Meta',        avatar:'T', grad:'135deg,#0866ff,#6366f1', text:'The Thank You Email after my Meta interview was so well-written, the hiring manager mentioned it in my offer call.' },
    { name:'Nadia Kowalski', role:'Hired at HSBC',        avatar:'N', grad:'135deg,#ec4899,#a855f7', text:'Resume Analyzer caught 7 missing key skills for finance roles. Fixed them all. First finance interview — landed the job.' },
    { name:'Kenji Ito',      role:'Hired at Toyota',      avatar:'K', grad:'135deg,#ef4444,#6366f1', text:'Cold email to a company with no open roles. HireMe.ai crafted it so well they created a position for me. Unbelievable.' },
    { name:'Sofia Papadaki', role:'Hired at Booking.com', avatar:'S', grad:'135deg,#003580,#06b6d4', text:'Interview prep generated exactly the questions I got asked. I felt like I had cheated — but it was just really smart preparation.' },
    { name:'Ethan Brooks',   role:'Hired at Apple',       avatar:'E', grad:'135deg,#555,#aaa',        text:'Applied to Apple three times before. Used HireMe.ai on the fourth try. Finally got the job. Resume Analyzer was the difference.' },
    { name:'Amara Diallo',   role:'Hired at Uber',        avatar:'A', grad:'135deg,#000,#fbbf24',     text:'Skills Gap analysis saved me 6 months of guesswork. Told me exactly which certifications to get. Worth every penny.' },
    { name:'Ivan Petrov',    role:'Hired at JetBrains',   avatar:'I', grad:'135deg,#6366f1,#06b6d4', text:'Developer here. I dreaded writing anything non-code. HireMe.ai writes everything for me — cover letter, LinkedIn, cold emails.' },
    { name:'Chloe Martin',   role:"Hired at L'Oreal",     avatar:'C', grad:'135deg,#ec4899,#f59e0b', text:'Switched from teaching to marketing at 34. The cover letter explained my transferable skills better than I ever could.' },
    { name:'Omar Hassan',    role:'Hired at Aramco',      avatar:'O', grad:'135deg,#16a34a,#fbbf24',  text:'Used all 10 tools. Got 2 competing offers and used salary negotiation to push the better one even higher. Dream outcome.' },
];

(function initTestiSlider() {
    const track  = document.getElementById('testiTrack');
    const dotsEl = document.getElementById('testiDots');
    const btnPrev= document.getElementById('testiBtnPrev');
    const btnNext= document.getElementById('testiBtnNext');
    if (!track) return;

    const PER_VIEW = window.innerWidth < 768 ? 1 : window.innerWidth < 1100 ? 2 : 3;
    const GAP = 24;
    let idx = 0, timer = null;
    const maxIdx = TESTIMONIALS.length - PER_VIEW;

    /* Build cards */
    TESTIMONIALS.forEach((t, i) => {
        const c = document.createElement('div');
        c.className = 'testi-card' + (i === 1 ? ' testi-featured' : '');
        c.innerHTML = `
            <div class="testi-stars">★★★★★</div>
            <p>"${t.text}"</p>
            <div class="testi-author">
                <div class="testi-avatar" style="background:linear-gradient(${t.grad})">${t.avatar}</div>
                <div><div class="testi-name">${t.name}</div><div class="testi-role">${t.role}</div></div>
            </div>`;
        track.appendChild(c);
    });

    /* Compute and set pixel widths */
    function setCardWidths() {
        const pv = window.innerWidth < 768 ? 1 : window.innerWidth < 1100 ? 2 : 3;
        const containerW = track.parentElement.offsetWidth;
        const cardW = (containerW - GAP * (pv - 1)) / pv;
        track.querySelectorAll('.testi-card').forEach(c => {
            c.style.width = cardW + 'px';
            c.style.minWidth = cardW + 'px';
        });
        return cardW;
    }

    /* Build dots */
    const pages = TESTIMONIALS.length - (window.innerWidth < 768 ? 1 : window.innerWidth < 1100 ? 2 : 3) + 1;
    for (let i = 0; i < pages; i++) {
        const d = document.createElement('button');
        d.className = 'testi-dot' + (i === 0 ? ' active' : '');
        d.addEventListener('click', () => { go(i); reset(); });
        dotsEl.appendChild(d);
    }

    function go(newIdx) {
        const pv = window.innerWidth < 768 ? 1 : window.innerWidth < 1100 ? 2 : 3;
        const mx = TESTIMONIALS.length - pv;
        idx = Math.max(0, Math.min(newIdx, mx));
        const cardW = setCardWidths();
        track.style.transform = `translateX(-${idx * (cardW + GAP)}px)`;

        /* Update dots */
        document.querySelectorAll('.testi-dot').forEach((d, i) => d.classList.toggle('active', i === idx));

        /* Update featured card */
        track.querySelectorAll('.testi-card').forEach((c, i) => {
            c.classList.toggle('testi-featured', i === idx + Math.floor(pv / 2));
        });
    }

    function start() { timer = setInterval(() => go(idx >= maxIdx ? 0 : idx + 1), 4500); }
    function reset() { clearInterval(timer); start(); }

    btnNext?.addEventListener('click', () => { go(idx + 1); reset(); });
    btnPrev?.addEventListener('click', () => { go(idx - 1); reset(); });

    window.addEventListener('resize', () => { go(idx); });

    /* Init */
    setCardWidths();
    start();
    setTimeout(() => go(0), 100); /* Re-run after layout */
})();
