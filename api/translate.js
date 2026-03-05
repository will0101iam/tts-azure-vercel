const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ""
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-3.1-flash-lite-preview"
const API_TOKEN = process.env.API_TOKEN || ""

const json = (res, status, body) => {
  res.status(status)
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.end(JSON.stringify(body))
}

const buildUserPrompt = ({ text, wantPos, wantGlossary, wantExample }) => {
  const parts = []
  parts.push("将用户提供的英文内容翻译为中文，并给出非常简短的解释。")
  parts.push("输出必须是严格 JSON，不要包含多余文本。")
  parts.push("JSON 字段：translation(string), explanation(string)")
  if (wantPos) {
    parts.push("如果是单词或短语，补充 pos(string, 词性/用法)；否则 pos 为空字符串。")
  } else {
    parts.push("pos 为空字符串。")
  }
  if (wantGlossary) {
    parts.push("glossary 为数组，每项包含 term(string) 与 meaning(string)，最多 5 项；否则 glossary 为空数组。")
  } else {
    parts.push("glossary 为空数组。")
  }
  if (wantExample) {
    parts.push("example 为一句英文例句 + 对应中文翻译（用 \\n 分隔），否则 example 为空字符串。")
  } else {
    parts.push("example 为空字符串。")
  }
  parts.push('不要使用 Markdown 代码块。不要换行输出 JSON 以外内容。')
  parts.push("")
  parts.push(`内容：${text}`)
  return parts.join("\n")
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.status(204)
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res.end()
    return
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" })
    return
  }

  try {
    if (API_TOKEN) {
      const authHeader = String(req.headers.authorization || "")
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
      if (token !== API_TOKEN) {
        json(res, 401, { error: "Unauthorized" })
        return
      }
    }

    if (!OPENROUTER_API_KEY) {
      json(res, 500, { error: "OPENROUTER_API_KEY not configured" })
      return
    }

    const body = req.body || {}
    const text = String(body.text || "").trim()
    const wantPos = Boolean(body.wantPos)
    const wantGlossary = Boolean(body.wantGlossary)
    const wantExample = Boolean(body.wantExample)

    if (!text) {
      json(res, 400, { error: "Missing text" })
      return
    }
    if (text.length > 2000) {
      json(res, 413, { error: "Text too long" })
      return
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a precise translator. Always follow the output schema. Output must be valid JSON only."
          },
          {
            role: "user",
            content: buildUserPrompt({ text, wantPos, wantGlossary, wantExample })
          }
        ]
      })
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      json(res, response.status, { error: `OpenRouter error: ${response.status} ${errText}` })
      return
    }

    const data = await response.json()
    const content = String(data?.choices?.[0]?.message?.content || "").trim()
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      json(res, 502, { error: "Bad model output" })
      return
    }

    json(res, 200, {
      translation: String(parsed.translation || ""),
      explanation: String(parsed.explanation || ""),
      pos: String(parsed.pos || ""),
      glossary: Array.isArray(parsed.glossary) ? parsed.glossary : [],
      example: String(parsed.example || "")
    })
  } catch (error) {
    json(res, 500, { error: String(error?.message || error || "Unknown error") })
  }
}

