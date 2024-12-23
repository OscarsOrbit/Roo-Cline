import { Anthropic } from "@anthropic-ai/sdk"
import { GoogleGenerativeAI } from "@google/generative-ai"
import * as vscode from 'vscode'
import { ApiHandler } from "../"
import { ApiHandlerOptions, geminiDefaultModelId, GeminiModelId, geminiModels, ModelInfo } from "../../shared/api"
import { convertAnthropicMessageToGemini } from "../transform/gemini-format"
import { ApiStream } from "../transform/stream"
import { GeminiKeyRotator } from "./key-rotation/gemini-key-rotator"

export class GeminiHandler implements ApiHandler {
	private options: ApiHandlerOptions
	private keyRotator: GeminiKeyRotator;
	private client: GoogleGenerativeAI;

	constructor(options: ApiHandlerOptions) {
		this.options = options;
		
		if (!options.geminiApiKey) {
			throw new Error("Primary API key is required for Google Gemini");
		}

		// Initialize key rotator with primary and additional keys
		this.keyRotator = new GeminiKeyRotator(options.geminiApiKey, options.geminiApiKeys);
		
		// Initialize client with first key
		this.client = new GoogleGenerativeAI(this.keyRotator.getCurrentKey());
	}

	private updateClientWithRotatedKey() {
		const nextKey = this.keyRotator.rotateKey();
		this.client = new GoogleGenerativeAI(nextKey);
	}

	async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		let retryCount = 0;
		const maxRetries = this.options.geminiApiKeys?.length || 1;

		try {
			const model = this.client.getGenerativeModel({
				model: this.getModel().id,
				systemInstruction: systemPrompt,
			});

			const result = await model.generateContentStream({
				contents: messages.map(convertAnthropicMessageToGemini),
				generationConfig: {
					temperature: 0,
				},
			});

			// Increment request count for current key
			this.keyRotator.incrementRequestCount();

			for await (const chunk of result.stream) {
				yield {
					type: "text",
					text: chunk.text(),
				};
			}

			const response = await result.response;
			yield {
				type: "usage",
				inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
				outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
			};
		} catch (error) {
			if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
				// Try with next key
				this.updateClientWithRotatedKey();
				// Retry the request with new key
				yield* this.createMessage(systemPrompt, messages);
				return;
			}
			throw error;
		}
	}

	getModel(): { id: GeminiModelId; info: ModelInfo } {
		const modelId = this.options.apiModelId
		if (modelId && modelId in geminiModels) {
			const id = modelId as GeminiModelId
			return { id, info: geminiModels[id] }
		}
		return { id: geminiDefaultModelId, info: geminiModels[geminiDefaultModelId] }
	}
}
