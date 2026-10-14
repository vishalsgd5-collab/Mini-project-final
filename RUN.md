# How to open AURA

The app does **not** run on `localhost` until you start it **on your own computer**.
Opening `http://localhost:5173` in Chrome without that step shows “refused to connect”.

## Option A — Arena Live Preview (no install)

In this Arena chat, open the preview labelled **AURA Studio**.
Do **not** type `localhost` or `*.e2b.app` into Chrome.

Demo login: `demo@aura.health` / `aura1234`

## Option B — Run on your Windows / Mac / Linux PC

You need **Python 3.11+** and **Node.js 18+** installed.

```bash
git clone -b arena/c77322bf-mini-project-final https://github.com/vishalsgd5-collab/Mini-project-final.git
cd Mini-project-final
```

**Terminal 1 — backend**

```bash
cd backend
python -m venv .venv

# Windows:
.venv\Scripts\activate
# Mac / Linux:
source .venv/bin/activate

pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — frontend**

```bash
cd frontend
npm install
npm run dev
```

Only after both terminals are running, open:

**http://localhost:5173**

Allow the camera. Sign in with `demo@aura.health` / `aura1234`.
Go to **Live iris** and sit in frame.
