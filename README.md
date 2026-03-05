# Azure TTS 代理

## 准备

设置环境变量：

- AZURE_SPEECH_KEY：你的 Azure Speech 密钥
- AZURE_SPEECH_REGION：区域，例如 eastus
- AZURE_TTS_VOICE：可选，默认 en-US-JennyNeural
- OPENROUTER_API_KEY：可选，用于翻译接口 /api/translate
- OPENROUTER_MODEL：可选，默认 google/gemini-3.1-flash-lite-preview
- PORT：可选，默认 8787

## Vercel 部署

1. 将 /Users/bytedance/Desktop/1400/tts-selection-proxy 上传到 Git 仓库
2. 在 Vercel 新建项目并导入该仓库
3. 在 Vercel 项目 Settings → Environment Variables 添加：
   - AZURE_SPEECH_KEY
   - AZURE_SPEECH_REGION
   - AZURE_TTS_VOICE（可选）
   - OPENROUTER_API_KEY（如需翻译）
   - OPENROUTER_MODEL（可选）
   - API_TOKEN（可选，开启访问鉴权）
4. 部署完成后，Vercel 会提供域名

API 地址：

```
https://<你的项目>.vercel.app/api/tts
```

翻译接口：

```
https://<你的项目>.vercel.app/api/translate
```

## 启动

```bash
AZURE_SPEECH_KEY="..." AZURE_SPEECH_REGION="eastus" node server.mjs
```

## API

POST http://localhost:8787/api/tts

Body:

```json
{ "text": "hello world", "rate": 0.8 }
```

返回：

- 200：audio/mpeg
