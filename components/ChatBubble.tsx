
import React from 'react';
import { Role, Message } from '../types.ts';
import { Icons } from '../constants.tsx';

interface ChatBubbleProps {
  message: Message;
  onPlayAudio?: (text: string) => void;
  onStopAudio?: () => void;
  isGlobalSpeaking?: boolean;
}

const AudioWaveform: React.FC = () => (
  <div className="flex items-center gap-[2px] h-3 px-1">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="w-[2px] bg-orange-400 rounded-full animate-audio-bar" style={{ animationDelay: `${i * 0.15}s` }} />
    ))}
  </div>
);

const Sparkles: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="sparkle-particle" style={{ width: `${Math.random() * 8 + 4}px`, height: `${Math.random() * 8 + 4}px`, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animationDelay: `${Math.random() * 2}s` }} />
    ))}
  </div>
);

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, onPlayAudio, onStopAudio, isGlobalSpeaking }) => {
  const isNia = message.role === Role.NIA;
  return (
    <div className={`flex w-full ${isNia ? 'justify-start' : 'justify-end'} mb-4 px-2`}>
      <div className={`max-w-[85%] md:max-w-[70%] ${isNia ? 'flex gap-3' : ''}`}>
        {isNia && <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 via-orange-300 to-indigo-400 flex-shrink-0 flex items-center justify-center shadow-lg border border-white/50"><span className="text-white text-[10px] font-bold">NIA</span></div>}
        <div className="flex flex-col gap-1">
          <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed relative transition-all duration-500 ${isNia ? `bg-white text-orange-950 rounded-tl-none border nia-message-glow ${message.isSpeaking ? 'border-indigo-200 ring-2 ring-indigo-50 shadow-md scale-[1.01]' : 'border-rose-100'}` : 'bg-gradient-to-br from-rose-400 to-orange-400 text-white rounded-tr-none shadow-md'}`}>
            {isNia && <Sparkles />}
            <div className="relative z-10 whitespace-pre-wrap">{message.text}</div>
            {isNia && onPlayAudio && message.text.length > 0 && (
              <div className="inline-flex items-center ml-2 align-middle gap-2">
                {message.isSpeaking && <AudioWaveform />}
                <div className="flex items-center gap-1">
                  {!message.isSpeaking ? (
                    <button onClick={() => onPlayAudio(message.text)} disabled={message.isAudioLoading || isGlobalSpeaking} className="text-rose-300 hover:text-rose-500 disabled:opacity-50 transition-all p-1 hover:bg-rose-50 rounded-full">
                      {message.isAudioLoading ? <span className="flex gap-1"><span className="animate-bounce w-1 h-1 bg-rose-400 rounded-full" /><span className="animate-bounce w-1 h-1 bg-rose-400 rounded-full [animation-delay:0.2s]" /></span> : <Icons.Volume />}
                    </button>
                  ) : <button onClick={onStopAudio} className="text-rose-400 hover:text-rose-600 transition-all p-1 bg-rose-50 rounded-full"><Icons.Stop /></button>}
                </div>
              </div>
            )}
            {isNia && message.sources && message.sources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-rose-50 space-y-2">
                <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1"><Icons.Globe /> Sources</p>
                <div className="flex flex-wrap gap-2">{message.sources.slice(0, 3).map((source, idx) => (
                  <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="inline-block px-2 py-1 bg-indigo-50/50 hover:bg-indigo-100 text-[10px] text-indigo-600 rounded-lg border border-indigo-100/30 transition-all truncate max-w-[150px]">{source.title || "Link"}</a>
                ))}</div>
              </div>
            )}
          </div>
          <span className={`text-[10px] text-rose-300 px-1 opacity-70 mt-1 ${isNia ? 'text-left' : 'text-right'}`}>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
    </div>
  );
};
