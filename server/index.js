const express = require("express")
const http = require("http")
const fs = require("fs")
const path = require("path")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: { origin: "*" },
})

const DATA_FILE = path.join(__dirname, "questions.json")

// ---------------- RATE LIMIT CONFIG ----------------
const RATE_LIMITS = {
  questions: { count: 3, windowMs: 60_000 },
  upvotes: { count: 10, windowMs: 10_000 },
  teacher: { count: 15, windowMs: 30_000 },
}

const rateLimits = {}

// ---------------- RATE LIMIT CHECK ----------------
function checkRateLimit(clientId, type) {
  const now = Date.now()

  if (!rateLimits[clientId]) {
    rateLimits[clientId] = { questions: [], upvotes: [], teacher: [] }
  }

  const limit = RATE_LIMITS[type]
  const bucket = rateLimits[clientId][type]

  while (bucket.length && now - bucket[0] > limit.windowMs) {
    bucket.shift()
  }

  if (bucket.length >= limit.count) {
    const waitMs = limit.windowMs - (now - bucket[0])
    return { allowed: false, waitSeconds: Math.ceil(waitMs / 1000) }
  }

  bucket.push(now)
  return { allowed: true }
}

// ---------------- LOAD / SAVE ----------------
function loadQuestions() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8")
    const parsed = JSON.parse(raw)
    return parsed.map(q => ({
      ...q,
      voters: new Set(q.voters || []),
    }))
  } catch {
    return []
  }
}

function saveQuestions() {
  const serializable = questions.map(q => ({
    ...q,
    voters: Array.from(q.voters),
  }))
  fs.writeFileSync(DATA_FILE, JSON.stringify(serializable, null, 2))
}

// ---------------- STATE ----------------
const questions = loadQuestions()

function sortQuestions() {
  questions.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned
    if (a.answered !== b.answered) return a.answered - b.answered
    if (a.votes !== b.votes) return b.votes - a.votes
    return a.createdAt - b.createdAt
  })
}

function sanitizedQuestions() {
  return questions.map(q => ({
    id: q.id,
    text: q.text,
    votes: q.votes,
    pinned: q.pinned,
    answered: q.answered,
  }))
}

// ---------------- SOCKET ----------------
io.on("connection", (socket) => {
  const role = socket.handshake.query.role || "student"
  const clientId = socket.handshake.query.clientId || socket.id

  socket.emit("state:init", sanitizedQuestions())

  // CLEANUP RATE LIMIT ON DISCONNECT (ISSUE 1 FIX)
  socket.on("disconnect", () => {
    delete rateLimits[clientId]
  })

  // CREATE QUESTION
  socket.on("question:create", (text) => {
    const limit = checkRateLimit(clientId, "questions")
    if (!limit.allowed) {
      socket.emit("rate:limited", { wait: limit.waitSeconds })
      return
    }

    if (!text || !text.trim()) return
    if (text.length > 300) return // ISSUE 3 FIX

    questions.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      votes: 0,
      voters: new Set(),
      pinned: false,
      answered: false,
      createdAt: Date.now(),
    })

    sortQuestions()
    saveQuestions()
    io.emit("state:init", sanitizedQuestions())
  })

  // UPVOTE
  socket.on("question:upvote", (id) => {
    const limit = checkRateLimit(clientId, "upvotes")
    if (!limit.allowed) return

    const q = questions.find(q => q.id === id)
    if (!q || q.voters.has(clientId)) return

    q.voters.add(clientId)
    q.votes++

    sortQuestions()
    saveQuestions()
    io.emit("state:init", sanitizedQuestions())
  })

  // TOGGLE ANSWER (TEACHER)
  socket.on("question:answer", (id) => {
    if (role !== "teacher") return
    if (!checkRateLimit(clientId, "teacher").allowed) return

    const q = questions.find(q => q.id === id)
    if (!q) return

    q.answered = !q.answered
    sortQuestions()
    saveQuestions()
    io.emit("state:init", sanitizedQuestions())
  })

  // PIN (TEACHER)
  socket.on("question:pin", (id) => {
    if (role !== "teacher") return
    if (!checkRateLimit(clientId, "teacher").allowed) return

    const q = questions.find(q => q.id === id)
    if (!q) return

    q.pinned = !q.pinned
    sortQuestions()
    saveQuestions()
    io.emit("state:init", sanitizedQuestions())
  })

  // DELETE (TEACHER)
  socket.on("question:delete", (id) => {
    if (role !== "teacher") return
    if (!checkRateLimit(clientId, "teacher").allowed) return

    const index = questions.findIndex(q => q.id === id)
    if (index === -1) return

    questions.splice(index, 1)
    saveQuestions()
    io.emit("state:init", sanitizedQuestions())
  })
})

server.listen(3000, () => {
  console.log("Server running on port 3000")
})