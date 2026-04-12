# Dreamy Tales ⭐

AI-powered bedtime story generator for children ages 4–7. Built with the **Stardust Pop** design system.

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start both servers
npm run dev
```

- **App** → http://localhost:5173
- **API** → http://localhost:3001
- **Metrics dashboard** → http://localhost:3001/dashboard

## Tech Stack

| Layer       | Tech                        |
|-------------|-----------------------------|
| Frontend    | React + Vite + TypeScript   |
| Backend     | Express + TypeScript        |
| Database    | SQLite (local file)         |
| AI          | Google Gemini 2.5 Flash Lite        |
| Auth        | JWT + argon2id              |

## Environment

Copy `.env.example` → `.env` and fill in your Gemini API key.

## Project Structure

```
packages/
  api/   — Express backend (port 3001)
  web/   — React frontend (port 5173)
data/
  dreamy-tales.db   — SQLite database (auto-created)
```
