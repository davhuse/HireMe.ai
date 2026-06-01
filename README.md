# HireMe.ai - Land Your Dream Job 10x Faster with AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-v16%2B-green.svg)](https://nodejs.org/)
[![Model Support](https://img.shields.io/badge/LLM-GPT--4%20%7C%20OpenRouter-purple.svg)](https://openrouter.ai/)

HireMe.ai is a full-stack SaaS platform designed to eliminate writer's block for job seekers by generating highly tailored, ATS-friendly cover letters in seconds. By analyzing a candidate's resume against a specific job description, HireMe.ai leverages OpenAI & OpenRouter API interfaces to craft professional, high-conversion cover letters in multiple tones and languages.

---

## 🌟 Key Features

*   **🤖 Intelligent AI Cover Letter Generator:** Fully maps work history and skills from your resume directly to the requirements of the targeted job description.
*   **🎯 ATS Keyword Optimization:** Incorporates relevant industry keywords dynamically to maximize passing scores on Applicant Tracking Systems (ATS).
*   **🎭 Multi-Tone Customization:** Choose between *Professional*, *Confident*, or *Enthusiastic* writing tones to match target company cultures.
*   **🌐 Internationalization & Language Support:** Automatically translates and constructs cover letters in English, Turkish, German, Spanish, French, and 30+ other languages.
*   **🎨 Premium Glassmorphism UI:** Stunning, responsive front-end built using Outfit modern typography, grid overlays, mesh gradients, and interactive hover effects.
*   **💳 Tiered Subscriptions & Pricing Plans:** Built-in hooks for Starter, Pro, and Team-level billing plans.

---

## 🛠️ Technology Stack

*   **Backend:** Node.js, Express.js
*   **Frontend:** Vanilla HTML5, CSS3 (Custom Variables, Flexbox, CSS Grid), Vanilla Javascript
*   **LLM API Service:** OpenRouter API (GPT-4 / GPT-3.5-turbo models)
*   **Icons:** Remix Icons CDN
*   **Fonts:** Outfit via Google Fonts

---

## 📂 Repository Structure

```bash
ai-cover-letter-saas/
├── server.js              # Express backend server (handles OpenRouter integration)
├── server_mongo.js        # MongoDB-integrated server alternative
├── app.js                 # Frontend API router and DOM controller
├── index.html             # High-conversion Landing Page & generator interface
├── style.css              # Custom styled premium CSS sheet
├── .env.template          # Environment setup template
├── LICENSE                # MIT License
└── package.json           # Node project configuration & dependencies
```

---

## 🚀 Getting Started

### 📋 Prerequisites
*   Node.js v16 or higher installed locally.
*   An API key from [OpenRouter](https://openrouter.ai/) or [OpenAI](https://openai.com/).
*   (Optional) MongoDB database instance running locally or on Atlas (for `server_mongo.js`).

### ⚙️ Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/davhuse/HireMe.ai.git
    cd HireMe.ai
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Setup Environment Variables:**
    Copy the template configuration file:
    ```bash
    cp .env.template .env
    ```
    Open `.env` and fill in your OpenRouter API token:
    ```env
    OPENAI_API_KEY=your_openrouter_api_key
    OPENAI_BASE_URL=https://openrouter.ai/api/v1
    MODEL_NAME=openai/gpt-3.5-turbo
    MONGODB_URI=mongodb://localhost:27017/hiremeai
    PORT=3000
    ```

4.  **Run the application server:**
    ```bash
    npm start
    ```
    Open your browser and navigate to `http://localhost:3000`.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
