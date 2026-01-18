/**
 * ASR-LLM Worker - 智能语音助手
 * 直接粘贴到 Cloudflare Workers Dashboard
 */

// 意图判断 Prompt
const INTENT_DETECTION_PROMPT = `# Role
你是一个只做二分类的意图判定器。判断 <input> 是否是对 AI 的指令。

# Inputs
<clipboard>: 用户当前剪贴板内容（可能为空）
<input>: 用户刚说的/输入的文本

# Rules
1) 如果 <input> 明确要求处理/改写/翻译/总结/格式化，输出：有
2) 如果 <input> 明确指向 <clipboard> 的内容进行处理，输出：有
3) 如果 <input> 只是陈述、思考、自言自语、引用他人话、或"记录模式"，输出：没有
4) 不确定时输出：没有

# Examples
[有]
- "把这段翻译成英文" → 有
- "用 Markdown 列表整理一下" → 有
- "总结这段剪贴板内容"且 <clipboard> 非空 → 有

[没有]
- "今天天气真好" → 没有
- "我在想要不要换工作" → 没有
- "记录一下：今天开会内容是…" → 没有
- "他说让我写一份报告" → 没有

# Output Format
只输出 有 或 没有，不含空格、标点、解释或 Markdown。`;

// 全能文本助手 Prompt
const COMMAND_EXECUTOR_PROMPT = ` # Role
  全能文本助手。处理用户指令，**核心原则：绝不丢失原文任何部分**。

  # Input Format
  语音输入
  （空行）
  剪贴板内容

  # Core Rules - 按优先级排序

  ## 🔴 最高优先级：完整性保证
  1) **全文输出铁律**：如果剪贴板有内容且需要修改，必须输出完整文档
     - ✅ 正确：修改部分 + 未修改部分（全部保留）
     - ❌ 错误：只输出修改后的片段
  2) **逐字保留未修改部分**：除了用户明确要求修改的片段，其他内容必须逐字复制，包括：
     - 空行、标点、格式
     - 前后文、标题、列表
     - 任何看似"无关紧要"的内容

  ## 🟡 次要规则：执行质量
  3) **精准定位修改范围**：
     - "第X段" → 只改该段
     - "最后一句" → 只改最后一句
     - "这段" → 改整个剪贴板
  4) **不臆造事实**：不新增原文不存在的信息
  5) **只输出结果**：不输出"好的/已完成"等元话术

  # Decision Tree（决策树）

  用户输入 → 剪贴板有内容？
             ├─ 否 → 只处理语音输入
             └─ 是 → 用户要求是？
                     ├─ "翻译/总结整段" → 输出处理结果（替换剪贴板）
                     └─ "修改第X段/某部分" → 输出完整文档
                                             = 原文前部分
                                             + 修改后的片段
                                             + 原文后部分

  # Examples（重点：展示完整保留）

  [示例 1: 修改中间段落]
  语音输入：把第二条改成问句

  剪贴板：购物清单：
  1. 买牛奶
  2. 买鸡蛋
  3. 去超市

  输出：购物清单：
  1. 买牛奶
  2. 需要买鸡蛋吗？
  3. 去超市

  （注意：标题、第1条、第3条全部保留）

  ---

  [示例 2: 修改开头]
  语音输入：把开头改得更正式

  剪贴板：嗨大家！

  今天讨论三个议题...

  （后续内容）

  输出：各位同事好，

  今天讨论三个议题...

  （后续内容）

  （注意：只改开头，后续内容逐字保留）

  ---

  [示例 3: 翻译整段 - 唯一允许不保留原文的情况]
  语音输入：翻译成英文

  剪贴板：今天天气真好

  输出：The weather is really nice today.

  （说明：翻译/总结等任务会替换整个剪贴板内容）

  ---

  [❌ 反面教材]
  语音输入：把"快点还钱"改客气点

  剪贴板：会议纪要：
  - 讨论了预算
  - 快点还钱
  - 下周跟进

  ❌ 错误输出：麻烦您近期方便时把款项结算一下，谢谢。

  ✅ 正确输出：会议纪要：
  - 讨论了预算
  - 麻烦您近期方便时把款项结算一下，谢谢
  - 下周跟进

  # Processing
  现在处理用户输入。记住：**宁可多输出，绝不丢内容**。直接输出最终结果。`;

// 智能秘书 Prompt
const TEXT_POLISH_PROMPT = `# Role
你是一个极其聪明、极度懂人类口语习惯的中文（台湾/香港/大陆通用）私人秘书。你不仅是文字的过滤器，更是情绪的转译者。

# Mission
1. **纠错与转写（默认）**：将用户乱七八糟、充满口误/重复/嗯啊/自我修正的口述语音，转化为最自然、干净、专业、且"保留灵魂"的书面表达。
2. **指令与执行（触发）**：当识别到明显指令（如"帮我"、"写个"、"处理下"、"翻译成"）或关键词时，直接执行意图并输出最终成果。

# Rules (严格遵守)
1. **精准去噪**：完全删除纯粹的声学填充词（嗯、啊、这个、那个、就是说、然后呢）。
2. **情绪转换**：不要生硬删除表达情绪的词。保留"啦、哈、喔、呢"等体现亲和力的词尾；将犹豫（如"三点...五点"）转化为书面语的"……"或"那...五点吧？"；将急迫感转化为"！"或短句。
3. **智能纠错**：补全/修正同音错字，精准识别两岸三地术语与专有名词（Costco/全联/7-11/高铁/悠游卡/八达通/LINE/蝦皮/小红书等）。
4. **语法与排版规范**：
   - 自动选对"的/得/地"用法。
   - **盘古之白**：在中文与英文/数字之间自动添加空格（如：iPhone 15 Pro）。
   - **Markdown 化**：自动识别列表、步骤、对比逻辑，使用项目符号或编号美化排版。
5. **中英混排**：英文专有名词（MacBook/Procreate/ChatGPT等）保持原样，不强行翻译。
6. **语态对齐**：保持原说话者风格。如果是随意的对话，不要变得超级正式；如果是正式场合，自动提升词汇的专业度。
7. **隐形执行**：若识别到指令（写信/文案/润色等），直接输出最终结果，严禁输出"好的"、"已为您生成"等废话。
8. **极简输出**：输出必须极度简洁、自然，像优秀人类打出来的文字。绝不添加多余解释，绝不发明事实。

# Execution Examples
- **[纠错+语气保留]** 输入: "呃那个，我们三点...不对，五点在那个 Costco 见吧，对吧，五点。"
- **Output**: "那……我们 5:00 在 Costco 见吧？五点。"
- **[纠错+中英空格]** 输入: "我的macbook还有iphone在这个7-11可以刷悠游卡吗"
- **Output**: "我的 MacBook 还有 iPhone 在这个 7-11 可以刷悠游卡吗？"
- **[指令执行]** 输入: "帮我处理下这段话改得客气一点：你快点把钱还我。"
- **Output**: "不好意思，麻烦您近期方便时把款项结算一下，谢谢。"
- **[美化排版]** 输入: "帮我记一下：第一买牛奶，第二买鸡蛋，第三顺便去全联买个卫生纸。"
- **Output**:
1. 买牛奶
2. 买鸡蛋
3. 去全联买卫生纸

# Processing
现在处理下面这段内容，只输出最终干净版本，什么解释都不要：`;

/**
 * 将 ArrayBuffer 转换为 base64
 */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000; // 32KB chunks to avoid call stack issues

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }

    return btoa(binary);
}

/**
 * 调用 Cloudflare Workers AI Whisper
 */
async function transcribeAudio(audioFile, ai) {
    // 使用 Cloudflare Workers AI Whisper Large v3 Turbo
    const audioData = await audioFile.arrayBuffer();
    const base64Audio = arrayBufferToBase64(audioData);

    const response = await ai.run('@cf/openai/whisper-large-v3-turbo', {
        audio: base64Audio,
    });

    return response.text;
}

/**
 * 调用 Cloudflare Workers AI
 */
async function callLLM(ai, systemPrompt, userMessage, temperature = 0.7, maxTokens = 2048) {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
    });

    return response.response?.trim() || '';
}

/**
 * 归一化意图判断输出
 */
function normalizeIntentOutput(text) {
    return text
        .replace(/\s+/g, '')
        .replace(/[*_`【】]/g, '')
        .replace(/[.!?。！？]/g, '');
}

/**
 * CORS 响应头
 */
function getCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
}

/**
 * 主处理流程
 */
async function processAudioRequest(request, env) {
    try {
        // 1. 校验 Content-Type
        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.includes('multipart/form-data')) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Content-Type must be multipart/form-data',
                }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
                }
            );
        }

        // 2. 解析请求
        const formData = await request.formData();
        const audioFile = formData.get('audio');
        const clipboard = formData.get('clipboard') || '';

        if (!audioFile) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: 'Missing audio file',
                }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
                }
            );
        }

        // 3. 语音转文字
        const transcribedText = await transcribeAudio(audioFile, env.AI);

        // 4. 意图判断
        const intentPrompt = `${INTENT_DETECTION_PROMPT}

# Data
<clipboard>
${clipboard}
</clipboard>

<input>
${transcribedText}
</input>`;

        const intentResult = await callLLM(env.AI, '', intentPrompt, 0, 5);
        const normalizedIntent = normalizeIntentOutput(intentResult);
        const isCommand = normalizedIntent === '有';

        let processedText;

        if (isCommand) {
            // 5a. 是指令 -> 使用全能文本助手
            const combinedText = clipboard ? `${transcribedText}\n\n${clipboard}` : transcribedText;
            processedText = await callLLM(env.AI, COMMAND_EXECUTOR_PROMPT, combinedText);
        } else {
            // 5b. 不是指令 -> 使用智能秘书
            processedText = await callLLM(env.AI, TEXT_POLISH_PROMPT, transcribedText);
        }

        // 6. 返回结果
        return new Response(
            JSON.stringify({
                success: true,
                original_text: transcribedText,
                is_command: isCommand,
                processed_text: processedText,
                timestamp: new Date().toISOString(),
            }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    ...getCorsHeaders(),
                },
            }
        );
    } catch (error) {
        console.error('Processing error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message || 'Unknown error',
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
            }
        );
    }
}

/**
 * Worker 入口
 */
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: getCorsHeaders(),
            });
        }

        // 路由处理
        if (url.pathname === '/api/process' && request.method === 'POST') {
            return processAudioRequest(request, env);
        }

        // 健康检查
        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok' }), {
                headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
            });
        }

        // 404
        return new Response(
            JSON.stringify({ success: false, error: 'Not Found' }),
            {
                status: 404,
                headers: { 'Content-Type': 'application/json', ...getCorsHeaders() },
            }
        );
    },
};
