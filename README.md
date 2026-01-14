# Classroom Q&A

A real-time classroom Question & Answer system that allows students to ask questions, peers to upvote them, and teachers to moderate discussions live.

---

## ✨ Features

- Real-time question submission and live updates
- Peer upvoting to prioritize important questions
- Teacher moderation (pin, mark answered, delete)
- Server-side and client-side rate limiting
- Persistent storage using JSON
- Light / Dark mode toggle
- Clean, premium UI with subtle animations

---

## 🛠 Tech Stack

- **Backend:** Node.js, Express
- **Realtime:** Socket.IO
- **Frontend:** Vanilla HTML, CSS, JavaScript

No frontend frameworks or external UI libraries are used.

---

## 👥 Roles

- **Student:** ask and upvote questions  
- **Teacher:** pin, answer, and delete questions  

Role is determined via URL query parameter.

---

## ▶️ Run Locally

Install dependencies:
```bash
npm install
```
Start the server:
```bash
node index.js
```
Open in browser:

Student view: http://localhost:3000

Teacher view: http://localhost:3000/?role=teacher