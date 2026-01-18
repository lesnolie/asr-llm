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
const COMMAND_EXECUTOR_PROMPT = `# Role
全能文本助手。根据用户意图处理输入内容。

# Input
用户输入即待处理内容。
若输入包含两个文本块并以空行分隔，第二块视为剪贴板上下文；除非用户明确要求，否则不要改写剪贴板内容。

# Core Rules
1) 执行所有指令：改写、翻译、总结、生成、格式化等都要准确完成
2) 禁止阉割：只改目标片段，其他上下文完整保留
3) 不臆造事实：不要新增不存在的信息
4) 只输出结果：不输出"好的/已完成/以下是"等元话术

# Examples
[翻译]
输入：把这段翻译成英文：今天天气不错
输出：The weather is nice today.

[总结]
输入：总结这段内容：[长文]
输出：[3–5 句精简总结，不带"以下是总结"]

[改写并保留上下文]
输入：前言...

把第二段改得更简洁：第二段很啰嗦...

结尾...
输出：前言...

[简洁后的第二段]

结尾...

# Processing
现在处理用户输入，直接输出最终结果。`;

// 智能秘书 Prompt
const TEXT_POLISH_PROMPT = `# Role
中文口语转写与润色助手。把口述文本变成自然、干净、可读的书面表达。

# Rules
1) 去除口头禅/填充词（嗯、啊、这个、然后等），保留必要语气词（啦/喔/呢）
2) 保持原意，不新增事实或夸大
3) 修正同音错字与常见专有名词（如 Costco、iPhone、7-11）
4) 中英文与数字之间自动加空格，标点规范化
5) 若内容本质是列表/步骤，使用 Markdown 列表排版
6) 只输出最终文本，不要解释或致意

# Examples
输入：嗯那个…我明天三点…不对，五点在 Costco 见吧，对吧
输出：那我们 5:00 在 Costco 见吧？

输入：帮我记一下：第一买牛奶 第二买鸡蛋 第三去全联买纸
输出：
1. 买牛奶
2. 买鸡蛋
3. 去全联买纸

# Processing
现在处理下面内容，只输出最终干净版本：`;

/**
 * 调用 ElevenLabs Scribe v2 API
 */
async function transcribeAudio(audioFile, apiKey) {
	const formData = new FormData();
	formData.append('file', audioFile);
	formData.append('model_id', 'scribe_v2');
	formData.append('timestamps_granularity', 'none');
	formData.append('tag_audio_events', 'false');

	const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
		method: 'POST',
		headers: {
			'xi-api-key': apiKey,
		},
		body: formData,
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`ElevenLabs API error: ${response.status} - ${error}`);
	}

	const result = await response.json();
	return result.text;
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
 * 测试 ElevenLabs 各种连接方式
 */
async function testElevenLabsConnections(env) {
	const apiKey = env.ELEVENLABS_API_KEY;
	const results = {};

	// 测试 1: 获取模型列表（GET 请求）
	try {
		const response = await fetch('https://api.elevenlabs.io/v1/models', {
			headers: { 'xi-api-key': apiKey }
		});
		results.test1_get_models = {
			status: response.status,
			ok: response.ok,
			statusText: response.statusText,
			data: response.ok ? await response.text() : await response.text()
		};
	} catch (error) {
		results.test1_get_models = { error: error.message };
	}

	// 测试 2: Speech-to-Text HTTP 端点
	try {
		const testAudio = new Blob(['test'], { type: 'audio/wav' });
		const formData = new FormData();
		formData.append('file', testAudio, 'test.wav');
		formData.append('model_id', 'scribe_v2');

		const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
			method: 'POST',
			headers: { 'xi-api-key': apiKey },
			body: formData
		});
		results.test2_http_stt = {
			status: response.status,
			ok: response.ok,
			statusText: response.statusText,
			data: await response.text()
		};
	} catch (error) {
		results.test2_http_stt = { error: error.message };
	}

	// 测试 3: 检查 WebSocket 支持（不实际连接，只检查能力）
	results.test3_websocket_support = {
		available: typeof WebSocket !== 'undefined',
		note: 'WebSocket constructor exists in Workers runtime'
	};

	// 测试 4: 用户信息端点
	try {
		const response = await fetch('https://api.elevenlabs.io/v1/user', {
			headers: { 'xi-api-key': apiKey }
		});
		results.test4_user_info = {
			status: response.status,
			ok: response.ok,
			statusText: response.statusText,
			data: response.ok ? await response.text() : await response.text()
		};
	} catch (error) {
		results.test4_user_info = { error: error.message };
	}

	// 测试 5: 不同的 speech-to-text 端点（旧版）
	try {
		const testAudio = new Blob(['test'], { type: 'audio/wav' });
		const formData = new FormData();
		formData.append('file', testAudio, 'test.wav');

		const response = await fetch('https://api.elevenlabs.io/v1/audio-native/scribe', {
			method: 'POST',
			headers: { 'xi-api-key': apiKey },
			body: formData
		});
		results.test5_old_endpoint = {
			status: response.status,
			ok: response.ok,
			statusText: response.statusText,
			data: await response.text()
		};
	} catch (error) {
		results.test5_old_endpoint = { error: error.message };
	}

	return new Response(JSON.stringify(results, null, 2), {
		headers: { 'Content-Type': 'application/json', ...getCorsHeaders() }
	});
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
		const transcribedText = await transcribeAudio(audioFile, env.ELEVENLABS_API_KEY);

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
