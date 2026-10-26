# reCAPTCHA Game

[日本語](README.md) | [English](README.en.md)

## 🎮 Overview

A new real-time competitive game inspired by the familiar image-selection CAPTCHA.

Players race to reach a target score by quickly and accurately selecting images that match a prompt (for example, “car,” “traffic light,” or “stairs”).

The game offers solo CPU matches and intense one-on-one online matches, and now also supports a Battle Royale mode where up to four players compete to survive.

## ✨ Features

- **Battle Royale for up to four players**  
  The progress of the other three players is synchronized on screen in real time. A dedicated cross-layout UI creates the tension of a multiplayer match.

- **Real-time view of the match (RIVAL VIEW)**  
  Low-latency WebSocket synchronization shows which image the opponent is selecting right now in the “RIVAL VIEW,” with a thrilling UI designed to build suspense.

- **Combo and interference effects**  
  Build a combo by answering correctly in succession to trigger interference effects on the opponent’s screen:
  - `SHAKE` (shake) / `SPIN` (rotate) / `SKEW` (skew)
  - `BLUR` (blur) / `INVERT` (invert colors) / `GRAYSCALE` (grayscale)
  - `ONION_RAIN` (a mysterious effect where onions rain across the screen) 🧅

- **Polished UI/UX and sound**  
  Smooth Framer Motion animations combine with rich browser audio from Tone.js to create satisfying interactions.

- **Modern, lightweight frontend**  
  Zustand is used for lightweight state management instead of Redux, keeping the codebase simple and extensible. Tailwind CSS is used for styling.

## 🛠 Tech stack

### Frontend

- **Core:** React 18, TypeScript, Vite
- **State management:** Zustand
- **Styling:** Tailwind CSS, clsx, tailwind-merge
- **Animation:** Framer Motion
- **Communication:** react-use-websocket
- **Audio:** Tone.js

### Backend

- **Core:** Go (Golang)
- **Communication:** WebSocket (`net/http`)
- **Architecture:** A lightweight, simple server based on standard modules

## 🚀 How to play

1. Select a game mode (CPU, online, or Battle Royale).
2. Read the prompt at the top of the screen (for example, “Select all images with: cars”).
3. Click every matching image among the nine panels.
4. Press “Confirm” to submit your selection. Correct answers add to your score.
5. The first player to reach the Winning Score wins.
6. *Hint: Answer quickly and accurately to build combos and interfere with your opponent’s screen!*

## 📦 Local setup

### Backend (Go)

```bash
cd backend
go mod download
go run main.go
# Starts on port 8080 by default
```

### Frontend (React/Vite)

```bash
cd frontend
npm install
npm run dev
# Opens a preview at localhost:5173 or another available port
```
