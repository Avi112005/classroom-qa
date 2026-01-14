// ================== THEME ==================
const html = document.documentElement
const themeToggle = document.getElementById("themeToggle")
const THEME_KEY = "classroom-qa-theme"

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const dark = saved ? saved === "dark" : prefersDark

  html.classList.toggle("dark-theme", dark)
  themeToggle.textContent = dark ? "☀️" : "🌙"
}

themeToggle.onclick = () => {
  const dark = html.classList.toggle("dark-theme")
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light")
  themeToggle.textContent = dark ? "☀️" : "🌙"
}

initTheme()

// ================== SOCKET ==================
const role = new URLSearchParams(location.search).get("role") || "student"

let clientId = localStorage.getItem("clientId")
if (!clientId) {
  clientId = crypto.randomUUID()
  localStorage.setItem("clientId", clientId)
}

const socket = io("http://localhost:3000", {
  query: { role, clientId }
})

// ================== DOM ==================
const questionInput = document.getElementById("questionInput")
const submitBtn = document.getElementById("submitBtn")
const questionsList = document.getElementById("questionsList")
const rateLimitMessage = document.getElementById("rateLimitMessage")
const filterBtns = document.querySelectorAll(".filter-btn")

// ================== STATE ==================
let questions = []
let currentFilter = "all"
let isCoolingDown = false
let cooldownTimer = null

// ================== SOCKET EVENTS ==================
socket.on("state:init", serverQuestions => {
  questions = serverQuestions
  renderQuestions()
})

socket.on("rate:limited", ({ wait }) => {
  startCooldown(wait)
})

// ================== SUBMIT ==================
submitBtn.onclick = submitQuestion

function submitQuestion() {
  if (isCoolingDown) return

  const text = questionInput.value.trim()
  if (!text) return

  // OPTIMISTIC LOCK (THIS WAS MISSING)
  lockSubmit()

  socket.emit("question:create", text)
  questionInput.value = ""

  // SAFETY UNLOCK (if server allows it)
  setTimeout(() => {
    if (isCoolingDown) {
      unlockSubmit()
    }
  }, 800)
}

// ================== COOLDOWN CONTROL ==================
function lockSubmit() {
  isCoolingDown = true
  submitBtn.disabled = true
}

function unlockSubmit() {
  isCoolingDown = false
  submitBtn.disabled = false
  rateLimitMessage.style.display = "none"
  if (cooldownTimer) {
    clearInterval(cooldownTimer)
    cooldownTimer = null
  }
}

function startCooldown(seconds) {
  lockSubmit()
  rateLimitMessage.style.display = "block"

  let t = seconds
  rateLimitMessage.textContent = `⏱️ Please wait ${t}s before asking again`

  cooldownTimer = setInterval(() => {
    t--
    if (t <= 0) {
      unlockSubmit()
    } else {
      rateLimitMessage.textContent = `⏱️ Please wait ${t}s before asking again`
    }
  }, 1000)
}

// ================== RENDER ==================
function renderQuestions() {
  const filtered = questions.filter(q => {
    if (currentFilter === "pinned") return q.pinned
    if (currentFilter === "answered") return q.answered
    return true
  })

  if (!filtered.length) {
    questionsList.innerHTML = `<div class="empty-state"><p>No questions yet.</p></div>`
    return
  }

  questionsList.innerHTML = filtered.map(renderCard).join("")
  attachHandlers()
}

function renderCard(q) {
  return `
    <div class="question-card ${q.pinned ? "pinned" : ""} ${q.answered ? "answered" : ""}">
      <p class="question-text">${escapeHtml(q.text)}</p>
      <div class="question-footer">
        <button class="upvote-btn" data-id="${q.id}">⬆️ ${q.votes}</button>
        ${
          role === "teacher"
            ? `
            <div class="teacher-controls">
              <button class="teacher-btn pin-btn" data-id="${q.id}">📌</button>
              <button class="teacher-btn answer-btn" data-id="${q.id}">✅</button>
              <button class="teacher-btn delete-btn" data-id="${q.id}">❌</button>
            </div>
          `
            : ""
        }
      </div>
    </div>
  `
}

// ================== HANDLERS ==================
function attachHandlers() {
  document.querySelectorAll(".upvote-btn").forEach(btn => {
    btn.onclick = () => socket.emit("question:upvote", btn.dataset.id)
  })

  document.querySelectorAll(".pin-btn").forEach(btn => {
    btn.onclick = () => socket.emit("question:pin", btn.dataset.id)
  })

  document.querySelectorAll(".answer-btn").forEach(btn => {
    btn.onclick = () => socket.emit("question:answer", btn.dataset.id)
  })

  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.onclick = () => socket.emit("question:delete", btn.dataset.id)
  })
}

// ================== FILTERS ==================
filterBtns.forEach(btn => {
  btn.onclick = () => {
    filterBtns.forEach(b => b.classList.remove("active"))
    btn.classList.add("active")
    currentFilter = btn.dataset.filter
    renderQuestions()
  }
})

// ================== UTILS ==================
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]))
}