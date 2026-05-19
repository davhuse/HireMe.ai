// Navbar scroll effect
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 30);
});

// Generate button
document.getElementById('generateBtn').addEventListener('click', async function() {
    const cv = document.getElementById('cvInput').value.trim();
    const job = document.getElementById('jobInput').value.trim();
    const tone = document.getElementById('toneInput').value;
    const lang = document.getElementById('langInput').value;
    const output = document.getElementById('outputContent');

    if (!cv || !job) {
        output.innerHTML = `<div style="color:#ef4444; padding:1rem; background:rgba(239,68,68,0.1); border-radius:10px; border:1px solid rgba(239,68,68,0.2);">
            <i class="ri-error-warning-line" style="margin-right:0.5rem;"></i>Please fill in both the Resume and Job Description fields.
        </div>`;
        return;
    }

    this.innerHTML = '<i class="ri-loader-4-line ri-spin"></i> Generating...';
    this.disabled = true;

    output.innerHTML = `
        <div class="loading-dots">
            <p>AI is crafting your personalized letter...</p>
            <div class="dots"><span></span><span></span><span></span></div>
        </div>`;

    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cv, jobDescription: job, tone, language: lang })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `Server error ${res.status}`);
        }

        const data = await res.json();
        const text = data.letter;

        // Typewriter effect
        output.innerHTML = '';
        let i = 0;

        function typeChar() {
            if (i < text.length) {
                if (text.charAt(i) === '\n') {
                    output.innerHTML += '<br>';
                } else {
                    output.innerHTML += text.charAt(i);
                }
                i++;
                output.scrollTop = output.scrollHeight;
                setTimeout(typeChar, 12);
            }
        }

        typeChar();

    } catch (err) {
        output.innerHTML = `<div style="color:#ef4444; padding:1.5rem; background:rgba(239,68,68,0.08); border-radius:12px; border:1px solid rgba(239,68,68,0.2);">
            <strong><i class="ri-error-warning-line"></i> Generation Failed</strong><br><br>
            ${err.message}<br><br>
            <small style="color:#94a3b8;">Check the server console for more details.</small>
        </div>`;
    } finally {
        this.innerHTML = '<i class="ri-magic-line"></i> Generate Cover Letter';
        this.disabled = false;
    }
});

// Copy button
document.getElementById('copyBtn').addEventListener('click', function() {
    const text = document.getElementById('outputContent').innerText;
    const isEmpty = text.includes('Your AI-crafted') || text.includes('Generation Failed') || text.includes('crafting');

    if (isEmpty || !text.trim()) return;

    navigator.clipboard.writeText(text).then(() => {
        const orig = this.innerHTML;
        this.innerHTML = '<i class="ri-check-line" style="color:#10b981;"></i> Copied!';
        setTimeout(() => this.innerHTML = orig, 2000);
    });
});
