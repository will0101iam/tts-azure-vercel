import http from "node:http"

const PORT = Number(process.env.PORT || 8787)
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY || ""
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || "eastus"
const AZURE_TTS_VOICE = process.env.AZURE_TTS_VOICE || "en-US-JennyNeural"

let cachedToken = ""
let cachedTokenExpiry = 0

const readJsonBody = async (req) => {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString("utf8")
  if (!raw) return {}
  return JSON.parse(raw)
}

const sendJson = (res, status, body) => {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.end(JSON.stringify(body))
}

const escapeXml = (text) =>
  String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const toProsodyRate = (rateFactor) => {
  const factor = clamp(Number(rateFactor || 1), 0.1, 2)
  const percent = Math.round((factor - 1) * 100)
  const clamped = clamp(percent, -90, 100)
  return `${clamped}%`
}

const getToken = async () => {
  const now = Date.now()
  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken
  }
  if (!AZURE_SPEECH_KEY) {
    throw new Error("AZURE_SPEECH_KEY is not configured")
  }
  const url = `https://${AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY
    }
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => "")
    throw new Error(`Token request failed: ${resp.status} ${text}`)
  }
  const token = await resp.text()
  cachedToken = token
  cachedTokenExpiry = now + 9 * 60 * 1000
  return token
}

const synthesize = async ({ text, rate, voice }) => {
  const token = await getToken()
  const ttsUrl = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${escapeXml(
    voice || AZURE_TTS_VOICE
  )}"><prosody rate="${escapeXml(toProsodyRate(rate))}">${escapeXml(
    text
  )}</prosody></voice></speak>`

  const resp = await fetch(ttsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      "User-Agent": "tts-selection-proxy"
    },
    body: ssml
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "")
    throw new Error(`TTS request failed: ${resp.status} ${errText}`)
  }
  const arrayBuffer = await resp.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)

  if (req.method === "OPTIONS") {
    res.statusCode = 204
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")
    res.end()
    return
  }

  if (req.method !== "POST" || url.pathname !== "/api/tts") {
    sendJson(res, 404, { error: "Not found" })
    return
  }

  try {
    const body = await readJsonBody(req)
    const text = String(body.text || "").trim()
    const rate = body.rate
    const voice = body.voice

    if (!text) {
      sendJson(res, 400, { error: "Missing text" })
      return
    }
    if (text.length > 2000) {
      sendJson(res, 413, { error: "Text too long" })
      return
    }

    const audio = await synthesize({ text, rate, voice })
    res.statusCode = 200
    res.setHeader("Content-Type", "audio/mpeg")
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.end(audio)
  } catch (error) {
    sendJson(res, 500, { error: String(error?.message || error || "Unknown error") })
  }
})

server.listen(PORT)
