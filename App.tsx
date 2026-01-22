
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Icons, SYSTEM_INSTRUCTION } from './constants.tsx';
import { UserMood, FontFamily, ThemePreset } from './types.ts';

// Helper functions
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

const THEME_PRESETS: ThemePreset[] = [
  { id: 'classic', name: 'Midnight Rose', primary: '#fb7185', secondary: '#818cf8', accent: '#f43f5e', font: 'sans' },
  { id: 'forest', name: 'Forest Mist', primary: '#34d399', secondary: '#3b82f6', accent: '#059669', font: 'sans' },
  { id: 'sunset', name: 'Amber Sunset', primary: '#fbbf24', secondary: '#f97316', accent: '#d97706', font: 'serif' },
  { id: 'ocean', name: 'Ocean Deep', primary: '#22d3ee', secondary: '#4f46e5', accent: '#0891b2', font: 'sans' },
  { id: 'royal', name: 'Royal Velvet', primary: '#c084fc', secondary: '#4338ca', accent: '#9333ea', font: 'serif' },
];

const FRAME_RATE = 1; 
const JPEG_QUALITY = 0.6;

const saveMemoryDeclaration: FunctionDeclaration = {
  name: 'save_memory',
  parameters: {
    type: Type.OBJECT,
    description: 'Save a specific fact or preference mentioned by the user to remember for future conversations.',
    properties: {
      fact: { type: Type.STRING, description: 'A concise fact or preference.' },
    },
    required: ['fact'],
  },
};

export const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [transcription, setTranscription] = useState<{ user: string, nia: string }>({ user: '', nia: '' });
  const [userMood, setUserMood] = useState<UserMood>('Steady');
  const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Persistence & State
  const [memories, setMemories] = useState<string[]>(() => {
    const saved = localStorage.getItem('nia_memories');
    return saved ? JSON.parse(saved) : [];
  });

  const [theme, setTheme] = useState<ThemePreset>(() => {
    const saved = localStorage.getItem('nia_theme_preset');
    return saved ? JSON.parse(saved) : THEME_PRESETS[0];
  });

  const [accentColor, setAccentColor] = useState<string>(() => {
    return localStorage.getItem('nia_accent_color') || theme.primary;
  });

  const [fontFamily, setFontFamily] = useState<FontFamily>(() => {
    return (localStorage.getItem('nia_font_family') as FontFamily) || theme.font;
  });

  // Audio Control State
  const [niaVolume, setNiaVolume] = useState(0.8);
  const [micSensitivity, setMicSensitivity] = useState(1.0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextInRef = useRef<AudioContext | null>(null);
  const audioContextOutRef = useRef<AudioContext | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const inputGainNodeRef = useRef<GainNode | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<number | null>(null);

  // Sync Theme to CSS Variables
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--theme-primary', accentColor);
    root.style.setProperty('--theme-secondary', theme.secondary);
    root.style.setProperty('--theme-accent', theme.accent);
    
    // Hex to RGB for pulse animation opacity
    const hex = accentColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    root.style.setProperty('--pulse-color', `${r}, ${g}, ${b}`);

    localStorage.setItem('nia_theme_preset', JSON.stringify(theme));
    localStorage.setItem('nia_accent_color', accentColor);
    localStorage.setItem('nia_font_family', fontFamily);
    localStorage.setItem('nia_memories', JSON.stringify(memories));
  }, [theme, accentColor, fontFamily, memories]);

  const applyPreset = (preset: ThemePreset) => {
    setTheme(preset);
    setAccentColor(preset.primary);
    setFontFamily(preset.font);
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    if (frameIntervalRef.current) { window.clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    for (const source of sourcesRef.current.values()) try { source.stop(); } catch(e) {}
    sourcesRef.current.clear();
    setIsConnected(false);
    setIsConnecting(false);
    outputGainNodeRef.current = null;
    inputGainNodeRef.current = null;
  }, []);

  const handleSaveMemory = useCallback((fact: string) => {
    setMemories(prev => prev.includes(fact) ? prev : [fact, ...prev].slice(0, 50));
    return "Memory saved.";
  }, []);

  const handleSessionError = useCallback(async (error: any) => {
    const errorMsg = error?.message || error?.toString() || "";
    if (errorMsg.includes("Requested entity was not found")) {
      setErrorMessage("Configuration error... let's check your API key? 💛");
      if (window.aistudio?.openSelectKey) await window.aistudio.openSelectKey();
    } else if (errorMsg.includes("quota") || errorMsg.includes("429")) {
      setErrorMessage("My circuits are a bit busy right now (Quota Exceeded). 💛");
    } else {
      setErrorMessage("I lost our connection... let's try waking me up again? 💛");
    }
    stopSession();
  }, [stopSession]);

  const startSession = async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const ctxIn = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const ctxOut = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextInRef.current = ctxIn; audioContextOutRef.current = ctxOut;

      const inGain = ctxIn.createGain(); inGain.gain.value = micSensitivity; inputGainNodeRef.current = inGain;
      const outGain = ctxOut.createGain(); outGain.gain.value = niaVolume; outGain.connect(ctxOut.destination); outputGainNodeRef.current = outGain;

      const memoryContext = memories.length > 0 ? `\n### MEMORIES:\n${memories.map(m => `- ${m}`).join('\n')}` : "";
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsConnected(true); setIsConnecting(false);
            const source = ctxIn.createMediaStreamSource(stream);
            const scriptProcessor = ctxIn.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              if (sessionRef.current) sessionRef.current.sendRealtimeInput({ media: { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' } });
            };
            source.connect(inGain); inGain.connect(scriptProcessor); scriptProcessor.connect(ctxIn.destination);
            frameIntervalRef.current = window.setInterval(() => {
              if (videoRef.current && canvasRef.current && sessionRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight;
                ctx?.drawImage(videoRef.current, 0, 0);
                canvasRef.current.toBlob(async (blob) => {
                  if (blob && sessionRef.current) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      const base64 = (reader.result as string).split(',')[1];
                      sessionRef.current.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } });
                    };
                    reader.readAsDataURL(blob);
                  }
                }, 'image/jpeg', JPEG_QUALITY);
              }
            }, 1000 / FRAME_RATE);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                if (fc.name === 'save_memory') {
                  const result = handleSaveMemory(fc.args.fact as string);
                  sessionRef.current.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } });
                }
              }
            }
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && ctxOut && outputGainNodeRef.current) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctxOut.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), ctxOut, 24000, 1);
              const source = ctxOut.createBufferSource();
              source.buffer = buffer; source.connect(outputGainNodeRef.current);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current); nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              for (const s of sourcesRef.current) try { s.stop(); } catch(e) {}
              sourcesRef.current.clear(); nextStartTimeRef.current = 0;
            }
            if (message.serverContent?.inputTranscription) setTranscription(prev => ({ ...prev, user: message.serverContent?.inputTranscription?.text || '' }));
            if (message.serverContent?.outputTranscription) setTranscription(prev => ({ ...prev, nia: (prev.nia + (message.serverContent?.outputTranscription?.text || '')) }));
            if (message.serverContent?.turnComplete) setTranscription(prev => ({ ...prev, nia: '' }));
          },
          onerror: (e: any) => handleSessionError(e),
          onclose: () => stopSession()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          tools: [{ functionDeclarations: [saveMemoryDeclaration] }],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } } },
          systemInstruction: SYSTEM_INSTRUCTION + memoryContext + `\nYou are NIA. You are high-empathy. Respond beautifully.`,
          inputAudioTranscription: {}, outputAudioTranscription: {},
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) { handleSessionError(err); }
  };

  return (
    <div className={`flex h-screen w-full bg-[#050505] overflow-hidden ${fontFamily === 'serif' ? 'font-serif-brand' : 'font-brand'} text-white theme-transition`}>
      {/* Dynamic Backgrounds */}
      <div className="absolute inset-0 opacity-20 pointer-events-none transition-all duration-1000">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] theme-transition" style={{ backgroundColor: accentColor }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] theme-transition" style={{ backgroundColor: theme.secondary }} />
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Main Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 pb-32">
        <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
          <div className={`absolute inset-0 rounded-full blur-2xl opacity-40 transition-all duration-1000 ${isConnected ? 'scale-125 animate-pulse' : 'scale-100'}`} style={{ backgroundColor: accentColor }} />
          <div className={`relative w-48 h-48 md:w-60 md:h-60 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-2xl transition-all duration-700 ${isConnected ? 'nia-active' : ''}`}>
             <div className="text-4xl md:text-5xl font-bold tracking-tighter text-white drop-shadow-lg">NIA</div>
             {isConnected && <div className="absolute inset-0 rounded-full border border-white/30 animate-[ping_3s_infinite]" style={{ borderColor: accentColor }} />}
          </div>
        </div>

        <div className="mt-12 w-full max-w-2xl text-center space-y-4 h-24 flex flex-col justify-center">
          {errorMessage ? (
            <div className="px-6 py-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
              <p className="text-red-400 text-sm font-bold flex items-center justify-center gap-2"><Icons.X /> {errorMessage}</p>
            </div>
          ) : (
            <>
              {transcription.user && <p className="opacity-60 text-sm italic font-medium animate-pulse">"{transcription.user}"</p>}
              {transcription.nia && <p className="text-xl md:text-3xl font-medium text-white drop-shadow-md leading-tight animate-in fade-in slide-in-from-bottom-2">{transcription.nia}</p>}
            </>
          )}
        </div>

        {/* Floating Controls Bar */}
        <div className="absolute bottom-12 flex items-center gap-4">
          {!isConnected ? (
            <button onClick={startSession} disabled={isConnecting} className={`px-10 py-5 font-bold rounded-3xl transition-all active:scale-95 shadow-2xl disabled:opacity-50 ${isConnecting ? 'bg-zinc-800' : 'bg-white text-black'}`} style={{ backgroundColor: isConnecting ? undefined : accentColor, color: 'white' }}>
              {isConnecting ? 'Waking up Nia...' : 'Connect with NIA'}
            </button>
          ) : (
            <button onClick={stopSession} className="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-all active:scale-90 shadow-xl"><Icons.Stop /></button>
          )}
          
          <button 
            onClick={() => setIsControlsOpen(true)}
            className="w-16 h-16 bg-white/10 backdrop-blur-md text-white rounded-full flex items-center justify-center hover:bg-white/20 transition-all active:scale-90 border border-white/10 shadow-xl"
          >
            <Icons.Sparkles />
          </button>
        </div>
      </div>

      {/* User Video PIP */}
      <div className={`absolute top-6 right-6 w-40 h-56 md:w-48 md:h-64 rounded-3xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl transition-all duration-500 z-10 ${isConnected ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Live</span>
        </div>
      </div>

      {/* Control Center Bottom Sheet */}
      <div 
        className={`fixed inset-0 z-50 flex items-end justify-center transition-all duration-500 ${isControlsOpen ? 'bg-black/40 backdrop-blur-sm' : 'bg-transparent pointer-events-none'}`}
        onClick={() => setIsControlsOpen(false)}
      >
        <div 
          className={`w-full max-w-2xl bg-zinc-900/80 backdrop-blur-3xl rounded-t-[3rem] border-t border-white/10 shadow-2xl transition-all duration-500 ease-out overflow-hidden ${isControlsOpen ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle */}
          <div className="w-full flex justify-center py-4 cursor-pointer" onClick={() => setIsControlsOpen(false)}>
            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
          </div>

          <div className="px-8 pb-12 max-h-[80vh] overflow-y-auto no-scrollbar space-y-8">
            <header className="flex justify-between items-center">
              <h2 className="text-2xl font-bold tracking-tight">Control Center</h2>
              <button onClick={() => setIsControlsOpen(false)} className="p-2 bg-white/5 rounded-full hover:bg-white/10"><Icons.X /></button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Aesthetics & Typography */}
              <section className="space-y-4">
                <label className="text-xs font-bold uppercase text-white/40 tracking-widest px-1">Aesthetics</label>
                <div className="grid grid-cols-5 gap-3">
                  {THEME_PRESETS.map(p => (
                    <button 
                      key={p.id} 
                      onClick={() => applyPreset(p)}
                      className={`w-full aspect-square rounded-full border-2 transition-all ${theme.id === p.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60 hover:opacity-100'}`}
                      style={{ backgroundColor: p.primary }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setFontFamily('sans')} className={`flex-1 py-3 rounded-2xl text-xs font-bold border transition-all ${fontFamily === 'sans' ? 'bg-white/10 border-white/40' : 'border-transparent opacity-40'}`}>Modern Sans</button>
                  <button onClick={() => setFontFamily('serif')} className={`flex-1 py-3 rounded-2xl text-xs font-bold border transition-all ${fontFamily === 'serif' ? 'bg-white/10 border-white/40 font-serif-brand' : 'border-transparent opacity-40'}`}>Classic Serif</button>
                </div>
              </section>

              {/* Voice & Mood */}
              <section className="space-y-4">
                <div className="space-y-4">
                  <label className="text-xs font-bold uppercase text-white/40 tracking-widest px-1">Voice Profile</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Zephyr', 'Kore', 'Fenrir', 'Puck'].map(v => (
                      <button 
                        key={v} 
                        onClick={() => setSelectedVoice(v)}
                        className={`py-3 rounded-2xl text-xs font-bold border transition-all ${selectedVoice === v ? 'bg-white text-black' : 'bg-white/5 border-white/5 text-white/60'}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Audio Mixing */}
              <section className="space-y-6">
                <label className="text-xs font-bold uppercase text-white/40 tracking-widest px-1">Audio Balance</label>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between px-1"><span className="text-[10px] font-bold opacity-60">NIA VOLUME</span><span className="text-[10px] opacity-60">{Math.round(niaVolume * 100)}%</span></div>
                    <input type="range" min="0" max="1.5" step="0.05" value={niaVolume} onChange={(e) => setNiaVolume(parseFloat(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer" style={{ accentColor }} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between px-1"><span className="text-[10px] font-bold opacity-60">MIC SENSITIVITY</span><span className="text-[10px] opacity-60">{Math.round(micSensitivity * 100)}%</span></div>
                    <input type="range" min="0" max="3" step="0.1" value={micSensitivity} onChange={(e) => setMicSensitivity(parseFloat(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer" style={{ accentColor }} />
                  </div>
                </div>
              </section>

              {/* Mood Selection */}
              <section className="space-y-4">
                <label className="text-xs font-bold uppercase text-white/40 tracking-widest px-1">Your Current State</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Steady', 'Low Energy', 'Romantic', 'Stressed'].map(m => (
                    <button 
                      key={m} 
                      onClick={() => setUserMood(m as any)} 
                      className={`py-3 rounded-2xl text-xs font-bold border transition-all ${userMood === m ? 'bg-white/10 border-white/40 shadow-xl ring-1 ring-white/20' : 'border-white/5 bg-white/5 opacity-40 hover:opacity-100'}`}
                      style={{ color: userMood === m ? accentColor : 'white' }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Memory Bank (Full Width) */}
            <section className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-bold uppercase text-white/40 tracking-widest">Memory Bank</label>
                {memories.length > 0 && <button onClick={() => setMemories([])} className="text-[10px] text-red-400 font-bold uppercase">Clear All</button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {memories.length === 0 ? (
                  <div className="col-span-full py-8 text-center bg-white/5 rounded-[2rem] border border-dashed border-white/10">
                    <p className="text-xs opacity-30 italic">NIA is still learning your story...</p>
                  </div>
                ) : (
                  memories.map((m, i) => (
                    <div key={i} className="group relative bg-white/5 border border-white/5 rounded-2xl px-4 py-3 text-xs leading-relaxed opacity-80 hover:opacity-100 transition-opacity flex justify-between items-center">
                      <span className="truncate pr-4">{m}</span>
                      <button onClick={() => setMemories(p => p.filter((_, idx) => idx !== i))} className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Icons.X /></button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
