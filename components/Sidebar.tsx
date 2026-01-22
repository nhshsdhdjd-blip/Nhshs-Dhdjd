
import React, { useState } from 'react';
import { Icons, SUPPORTED_LANGUAGES, VOICE_OPTIONS } from '../constants.tsx';
import { DailyGoal, VoiceType, UserMood, CustomCommand } from '../types.ts';

interface SidebarProps {
  goals: DailyGoal[];
  customCommands: CustomCommand[];
  selectedLanguage: string;
  selectedVoice: VoiceType;
  currentMood: UserMood;
  onAddGoal: (text: string) => void;
  onToggleGoal: (id: string) => void;
  onClearGoals: () => void;
  onAddCommand: (label: string, prompt: string) => void;
  onRemoveCommand: (id: string) => void;
  onTriggerCommand: (prompt: string) => void;
  onSelectLanguage: (code: string) => void;
  onSelectVoice: (voice: VoiceType) => void;
  onSelectMood: (mood: UserMood) => void;
  onResetChat: () => void;
}

const MOODS: { id: UserMood; label: string; icon: string }[] = [
  { id: 'Steady', label: 'Balanced', icon: '⚖️' },
  { id: 'Stressed', label: 'Stressed', icon: '😮‍💨' },
  { id: 'Low Energy', label: 'Tired', icon: '🔋' },
  { id: 'Needs Comfort', label: 'Sad', icon: '🫂' },
  { id: 'Radiant', label: 'Happy', icon: '☀️' },
  { id: 'Romantic', label: 'Intimate', icon: '🕯️' },
];

export const Sidebar: React.FC<SidebarProps> = ({ 
  goals, customCommands, selectedLanguage, selectedVoice, currentMood, 
  onAddGoal, onToggleGoal, onClearGoals, onAddCommand, onRemoveCommand, onTriggerCommand,
  onSelectLanguage, onSelectVoice, onSelectMood, onResetChat
}) => {
  const [newGoal, setNewGoal] = useState('');
  const [showCommandForm, setShowCommandForm] = useState(false);
  const [cmdLabel, setCmdLabel] = useState('');
  const [cmdPrompt, setCmdPrompt] = useState('');

  const handleGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoal.trim()) { onAddGoal(newGoal.trim()); setNewGoal(''); }
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cmdLabel.trim() && cmdPrompt.trim()) {
      onAddCommand(cmdLabel.trim(), cmdPrompt.trim());
      setCmdLabel(''); setCmdPrompt(''); setShowCommandForm(false);
    }
  };

  return (
    <div className="w-full md:w-80 h-full bg-rose-50/40 border-r border-rose-100 flex flex-col overflow-hidden">
      <div className="relative h-48 w-full shrink-0 overflow-hidden group">
        <img src="https://images.unsplash.com/photo-1501854140801-50d01674aa3e?auto=format&fit=crop&q=80&w=1000" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-[4000ms]" />
        <div className="absolute inset-0 bg-gradient-to-t from-rose-50 via-rose-50/10 to-black/20" />
        <div className="absolute bottom-6 left-6 right-6">
          <div className="inline-flex items-center gap-2 bg-white/80 px-3 py-1.5 rounded-full shadow-lg border border-white/50 mb-2">
            <Icons.Heart />
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-tighter">Human Intelligence</span>
          </div>
          <h2 className="text-3xl font-brand font-bold text-rose-950 drop-shadow-md leading-tight">NIA</h2>
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col gap-6 overflow-y-auto no-scrollbar">
        <div className="bg-white/40 rounded-2xl p-4 border border-rose-100/50">
          <div className="flex items-center gap-2 mb-3">
            <Icons.Sun /><h3 className="font-semibold text-rose-800 text-xs uppercase tracking-wider">Mood</h3>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MOODS.map(m => (
              <button key={m.id} onClick={() => onSelectMood(m.id)} className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${currentMood === m.id ? 'bg-rose-100 border-rose-300 shadow-sm' : 'bg-white/60 border-transparent'}`}>
                <span className="text-lg">{m.icon}</span>
                <span className="text-[8px] font-bold text-rose-700 mt-1">{m.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/40 rounded-2xl p-4 border border-rose-100/50">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2"><Icons.Sparkles /><h3 className="font-semibold text-rose-800 text-xs uppercase tracking-wider">Shortcuts</h3></div>
            <button onClick={() => setShowCommandForm(!showCommandForm)} className="text-rose-500"><Icons.Send /></button>
          </div>
          {showCommandForm && (
            <form onSubmit={handleCommandSubmit} className="mb-4 p-3 bg-white/60 rounded-xl border border-rose-100">
              <input type="text" value={cmdLabel} onChange={e => setCmdLabel(e.target.value)} placeholder="Name" className="w-full bg-white border border-rose-50 rounded-lg px-2 py-1.5 text-xs mb-2 outline-none" required />
              <textarea value={cmdPrompt} onChange={e => setCmdPrompt(e.target.value)} placeholder="Prompt" className="w-full bg-white border border-rose-50 rounded-lg px-2 py-1.5 text-xs mb-2 h-16 resize-none outline-none" required />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-rose-400 text-white py-1.5 rounded-lg text-[10px] font-bold uppercase">Save</button>
                <button type="button" onClick={() => setShowCommandForm(false)} className="px-3 text-rose-300 text-[10px] font-bold">Cancel</button>
              </div>
            </form>
          )}
          <div className="flex flex-col gap-2">
            {customCommands.map(cmd => (
              <div key={cmd.id} className="group relative">
                <button onClick={() => onTriggerCommand(cmd.prompt)} className="w-full text-left px-3 py-2.5 rounded-xl bg-white border border-white hover:border-rose-200 hover:bg-rose-50 transition-all flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-900 truncate pr-6">{cmd.label}</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-300" />
                </button>
                <button onClick={() => onRemoveCommand(cmd.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-rose-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><Icons.X /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/40 rounded-2xl p-4 border border-rose-100/50">
          <div className="flex items-center gap-2 mb-3"><Icons.Volume /><h3 className="font-semibold text-rose-800 text-xs uppercase tracking-wider">Voice</h3></div>
          <div className="flex flex-col gap-1.5">
            {VOICE_OPTIONS.map(v => (
              <button key={v.id} onClick={() => onSelectVoice(v.id)} className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left ${selectedVoice === v.id ? 'bg-rose-100 border-rose-300 shadow-sm' : 'bg-white/60 border-transparent'}`}>
                <span className="text-[11px] font-bold text-rose-900">{v.name}</span>
                {selectedVoice === v.id && <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white/60 rounded-2xl p-4 border border-rose-100/50">
          <div className="flex justify-between items-center mb-3"><h3 className="font-semibold text-rose-800 text-xs uppercase tracking-wider">Goals</h3><button onClick={onClearGoals} className="text-[10px] text-rose-400">Clear</button></div>
          <div className="space-y-2 mb-4">
            {goals.map(goal => (
              <div key={goal.id} onClick={() => onToggleGoal(goal.id)} className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all border ${goal.completed ? 'bg-rose-100/50 border-rose-200' : 'bg-white border-white'}`}>
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${goal.completed ? 'bg-rose-500 border-rose-500' : 'border-rose-200'}`}>{goal.completed && <Icons.Check />}</div>
                <span className={`text-xs font-medium truncate ${goal.completed ? 'line-through text-rose-400' : 'text-rose-800'}`}>{goal.text}</span>
              </div>
            ))}
          </div>
          <form onSubmit={handleGoalSubmit} className="flex gap-1.5"><input type="text" value={newGoal} onChange={e => setNewGoal(e.target.value)} placeholder="New goal..." className="flex-1 bg-white border border-rose-100 rounded-lg px-2 py-1.5 text-xs outline-none" /><button type="submit" className="bg-rose-400 text-white p-1.5 rounded-lg"><Icons.Check /></button></form>
        </div>

        <button onClick={onResetChat} className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white border border-rose-100 text-[11px] font-bold text-rose-400 hover:bg-rose-50 transition-all"><Icons.Recap />Reset Chat</button>
      </div>
    </div>
  );
};
