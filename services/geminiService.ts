
import { GoogleGenAI, Modality, GenerateContentResponse } from "@google/genai";
import { NIA_MODELS, SYSTEM_INSTRUCTION } from "../constants.tsx";
import { MessageSource } from "../types.ts";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const getDynamicConfig = (message: string) => {
  const lower = message.toLowerCase();
  const isComplex = lower.length > 100 || /\b(why|how|explain|plan|reason|compare|analyze|summarize|help)\b/.test(lower);
  const needsSearch = /\b(news|today|weather|current|latest|price|stock|result|who is|where is)\b/.test(lower);

  return {
    thinkingBudget: isComplex ? 2000 : 0, 
    useSearch: needsSearch,
    temperature: isComplex ? 0.8 : 1.0,   
  };
};

export const getChatResponseStream = async function* (
  history: { role: 'user' | 'model', parts: { text?: string }[] }[], 
  message: string,
  language: string = 'en-US'
) {
  const ai = getAI();
  const model = NIA_MODELS.CHAT;
  const { thinkingBudget, useSearch, temperature } = getDynamicConfig(message);
  
  const localizedSystemInstruction = `${SYSTEM_INSTRUCTION}\n\nIMPORTANT: The user has selected the language: ${language}. Please respond strictly and only in this language.`;

  try {
    const responseStream = await ai.models.generateContentStream({
      model,
      contents: [...history, { role: 'user', parts: [{ text: message }] }],
      config: {
        systemInstruction: localizedSystemInstruction,
        temperature,
        topP: 0.95,
        topK: 40,
        thinkingConfig: { thinkingBudget },
        tools: useSearch ? [{ googleSearch: {} }] : undefined,
      },
    });
    
    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      const sources: MessageSource[] = [];
      const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
      
      if (groundingChunks) {
        groundingChunks.forEach((chunk: any) => {
          if (chunk.web) {
            sources.push({ uri: chunk.web.uri, title: chunk.web.title });
          }
        });
      }

      yield {
        text: c.text || "",
        sources: sources.length > 0 ? sources : undefined
      };
    }
  } catch (error: any) {
    if (error.message?.includes('429') || error.message?.includes('quota')) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    throw error;
  }
};

export const getSpeech = async (text: string, voiceName: string = 'Kore', mood: string = 'Steady'): Promise<string | undefined> => {
  const ai = getAI();
  try {
    let toneInstruction = "naturally and warmly";
    if (mood.includes("Stressed")) toneInstruction = "calmly, slowly, and reassuringly";
    else if (mood.includes("Low Energy")) toneInstruction = "encouragingly and with bright energy";
    else if (mood.includes("Needs Comfort")) toneInstruction = "very gently and with deep empathy";
    else if (mood.includes("Radiant")) toneInstruction = "playfully and happily";
    else if (mood.includes("Intimate") || mood.includes("Romantic")) toneInstruction = "very softly and warmly";

    const response = await ai.models.generateContent({
      model: NIA_MODELS.VOICE,
      contents: [{ parts: [{ text: `[VOICE INSTRUCTION: Say this ${toneInstruction}] ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error: any) {
    if (error.message?.includes('429') || error.message?.includes('quota')) throw new Error('QUOTA_EXHAUSTED');
    return undefined;
  }
};

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}
