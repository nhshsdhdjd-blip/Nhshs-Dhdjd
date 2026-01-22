
export enum Role {
  USER = 'user',
  NIA = 'nia'
}

export enum VoiceType {
  SWEET = 'Kore',
  STRONG = 'Fenrir',
  CHEERFUL = 'Puck',
  CALM = 'Charon',
  SOFT = 'Zephyr'
}

export type UserMood = 'Steady' | 'Stressed' | 'Low Energy' | 'Needs Comfort' | 'Radiant' | 'Romantic';

export type FontFamily = 'sans' | 'serif';

export interface ThemePreset {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  font: FontFamily;
}

export interface MessageSource {
  uri: string;
  title: string;
}

export interface Message {
  id: string;
  role: Role;
  text: string;
  timestamp: Date;
  isAudioLoading?: boolean;
  isSpeaking?: boolean;
  sources?: MessageSource[];
}

export interface DailyGoal {
  id: string;
  text: string;
  completed: boolean;
  streak: number;
  lastCompletedAt?: string; // ISO Date string
}

export interface CustomCommand {
  id: string;
  label: string;
  prompt: string;
}

export interface UserState {
  mood: UserMood;
  dailyWin: string;
  goals: DailyGoal[];
  language: string;
  theme: string;
  font: FontFamily;
}
