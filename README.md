# 🎤 智能语音助手 (ASR-LLM)

一键复制粘贴，5 分钟部署到 Cloudflare Workers。

---

## 🚀 5 分钟部署指南

### 步骤 1：创建 Cloudflare Worker

1. 访问：https://dash.cloudflare.com
2. 登录（没账号就免费注册）
3. 左侧菜单 → **Workers & Pages**
4. 点击 **Create Application**
5. 选择 **Create Worker**
6. 起个名字（如：`my-voice-assistant`）
7. 点击 **Deploy**

---

### 步骤 2：粘贴代码

1. 在 Worker 页面，点击 **Edit Code**
2. **删除所有默认代码**
3. 打开项目的 **`worker.js`** 文件
4. **全选复制**所有内容
5. **粘贴**到编辑器
6. 点击 **Save and Deploy**

---

### 步骤 3：配置 AI 绑定

1. 回到 Worker 页面
2. 点击 **Settings** 标签
3. 向下滚动到 **AI Bindings**
4. 点击 **Add Binding**
5. 填写：
   - **Variable name**: `AI`
6. 点击 **Save**

---

### 步骤 4：测试

复制你的 Worker URL（如：`https://my-voice-assistant.你的账号.workers.dev`）

浏览器访问：
```
https://你的域名.workers.dev/health
```

看到 `{"status":"ok"}` 就成功了！🎉

---

## 📱 配合 iOS 快捷指令使用

### 创建快捷指令

打开 iPhone **快捷指令** App，按以下步骤创建：

#### 1. 录音
- 添加"**录制音频**"
- 设置"开始录制"

#### 2. 获取剪贴板
- 添加"**获取剪贴板**"

#### 3. 发送请求
- 添加"**获取 URL 内容**"
- **URL**: `https://你的域名.workers.dev/api/process`
- **方法**: `POST`
- **请求体**: `表单`
- 添加字段：
  - `audio` = 录音
  - `clipboard` = 剪贴板

#### 4. 提取结果
- 添加"**获取词典值**"
- **词典**: 上一步结果
- **键**: `processed_text`

#### 5. 复制结果
- 添加"**拷贝到剪贴板**"
- **输入**: 上一步结果

#### 6. 显示通知（可选）
- 添加"**显示通知**"
- **标题**: `✅ 完成`
- **正文**: 上一步结果

### 使用方法

1. 运行快捷指令
2. 说话（如："把这段翻译成英文"）
3. 等待 2-3 秒
4. 结果自动复制到剪贴板

---

## 💡 功能示例

### 1️⃣ 翻译
```
你说："把这段翻译成英文"
（剪贴板："今天天气真好"）

结果：The weather is really nice today.
```

### 2️⃣ 总结
```
你说："总结一下"
（剪贴板：长篇会议记录）

结果：
- 推迟项目发布
- 招聘 2 名工程师
- 下周三再开会
```

### 3️⃣ 改写风格
```
你说："改得客气点"
（剪贴板："快点还钱"）

结果：不好意思，麻烦您近期方便时把款项结算一下，谢谢。
```

### 4️⃣ 语音转文字（自动美化）
```
你说："嗯...那个...我明天三点...不对，五点在 Costco 见"

结果：那我们 5:00 在 Costco 见吧？
```

**自动优化**：
- 删除口头禅（嗯、啊、这个）
- 修正错别字
- 识别专有名词（iPhone、Costco）
- 中英文自动加空格

---

## 🔧 API 调用（程序员版）

### 请求

```bash
curl -X POST https://你的域名.workers.dev/api/process \
  -F "audio=@recording.mp3" \
  -F "clipboard=剪贴板内容（可选）"
```

### 响应

```json
{
  "success": true,
  "original_text": "嗯那个把这段翻译成英文",
  "is_command": true,
  "processed_text": "The weather is nice today.",
  "timestamp": "2024-01-18T12:00:00.000Z"
}
```

---

## 💰 费用

### 完全免费 ✅

- ✅ Cloudflare Workers AI（Whisper）：**每天 10,000 次**
- ✅ Cloudflare Workers AI（Llama）：**每天 10,000 次**
- ✅ Workers 运行：**每天 100,000 次**

**成本估算**：
- 偶尔使用：**$0/月** 🎉
- 每天 100 次：**$0/月** 🎉
- 达到免费额度上限才收费

---

## ❓ 常见问题

### Q: 为什么识别不准？
**A**:
- 安静环境录音
- 说话清晰
- 手机靠近嘴边

### Q: 为什么需要剪贴板？
**A**: 很多指令需要处理"某段内容"：
- "翻译这段" → 需要知道翻译什么
- "总结一下" → 需要知道总结什么

### Q: 能处理多长录音？
**A**: 建议 1 分钟内。太长会慢、可能超时。

### Q: 可以离线吗？
**A**: 不行，需要网络调用 Cloudflare API。

---

## 🐛 故障排除

### "Missing audio file"
- 检查快捷指令表单字段名是 `audio`

### "Workers AI response empty"
- Settings → AI Bindings
- 添加绑定，名称必须是 `AI`

### 返回很慢
- 缩短录音时长
- 检查网络

---

## 🔄 更新代码

项目更新时：
1. 复制新版 `worker.js`
2. Dashboard 编辑器粘贴
3. **Save and Deploy**

**AI 绑定无需重配！**

---

## 📊 性能

| 指标 | 数值 |
|------|------|
| 响应时间 | 2-3 秒 |
| ASR 准确率 | 95%+ (WER 7.75%) |
| 意图判断 | 94.5% |
| 月免费额度 | ~300,000 次 |

---

## 🛠️ 技术架构

```
录音 → Cloudflare Whisper → AI 判断 → 分支处理 → 结果
          ↓                    ↓
        转文字              【是指令】【不是】
                              ↓        ↓
                            执行任务  润色文字
```

**技术栈**：
- Cloudflare Workers AI Whisper Large v3 Turbo（语音识别，WER 7.75%）
- Cloudflare Workers AI Llama 3.1 8B（意图判断 + 文本处理）
- 全球边缘计算

---

## 📜 许可证

MIT License

---

**开源项目，欢迎使用！** ❤️
