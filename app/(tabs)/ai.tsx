import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowUp, Bot, User, Check, X, RotateCcw, Battery, BarChart3, List, Zap, Mic, MicOff } from 'lucide-react-native';
import Markdown from 'react-native-markdown-display';
import Colors from '@/constants/colors';

let SpeechModule: typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule | null = null;
let useSpeechEvent: typeof import('expo-speech-recognition').useSpeechRecognitionEvent = (() => {}) as any;
try {
  const mod = require('expo-speech-recognition');
  SpeechModule = mod.ExpoSpeechRecognitionModule;
  useSpeechEvent = mod.useSpeechRecognitionEvent;
} catch {}
import { useSettings } from '@/contexts/SettingsContext';
import { useDevices } from '@/contexts/DeviceContext';
import { sendChatMessage, sendConfirmationResult, type ChatResponse, type ChartData } from '@/lib/aws-chat';
import { ChatChart } from '@/components/ChatChart';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  confirmation?: ChatResponse['confirmation'];
  confirmationHandled?: boolean;
  charts?: ChartData[];
}

const CONFIRM_LABELS: Record<string, { en: string; pl: string }> = {
  send_schedule_rule: { en: 'Send schedule rule', pl: 'Wysłanie reguły harmonogramu' },
  delete_schedule_rule: { en: 'Delete schedule rule', pl: 'Usunięcie reguły harmonogramu' },
  set_system_mode: { en: 'Change system mode', pl: 'Zmiana trybu systemu' },
  set_safety_limits: { en: 'Change safety limits', pl: 'Zmiana limitów bezpieczeństwa' },
};

export default function AIScreen() {
  const { t, language } = useSettings();
  const { selectedDevice } = useDevices();
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: '1', text: t.ai.helpPrompt, isUser: false, timestamp: new Date() },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const flatListRef = useRef<FlatList>(null);
  const [isListening, setIsListening] = useState(false);
  const hasSpeech = SpeechModule != null;

  useSpeechEvent('start', () => setIsListening(true));
  useSpeechEvent('end', () => setIsListening(false));
  useSpeechEvent('result', (ev: any) => {
    setInputText(ev.results[0]?.transcript ?? '');
  });
  useSpeechEvent('error', () => setIsListening(false));

  const toggleVoice = useCallback(async () => {
    if (!SpeechModule) return;
    if (isListening) {
      SpeechModule.stop();
      return;
    }
    const { granted } = await SpeechModule.requestPermissionsAsync();
    if (!granted) return;
    SpeechModule.start({
      lang: language === 'pl' ? 'pl-PL' : 'en-US',
      interimResults: true,
      continuous: false,
    });
  }, [isListening, language]);

  const mdStyles = useMemo(() => StyleSheet.create({
    body: { color: Colors.text, fontSize: 15, lineHeight: 22 },
    heading1: { color: Colors.text, fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 4 },
    heading2: { color: Colors.text, fontSize: 16, fontWeight: '700', marginTop: 6, marginBottom: 3 },
    heading3: { color: Colors.text, fontSize: 15, fontWeight: '700', marginTop: 4, marginBottom: 2 },
    strong: { fontWeight: '700', color: Colors.text },
    em: { fontStyle: 'italic' },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 1 },
    paragraph: { marginTop: 2, marginBottom: 6 },
    table: { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, marginVertical: 6 },
    thead: { backgroundColor: Colors.surface },
    th: { padding: 6, borderRightWidth: 1, borderColor: Colors.border, fontWeight: '700', fontSize: 12 },
    td: { padding: 6, borderRightWidth: 1, borderColor: Colors.border, fontSize: 12 },
    tr: { borderBottomWidth: 1, borderColor: Colors.border },
    code_inline: { backgroundColor: Colors.surface, color: Colors.primary, fontSize: 13, paddingHorizontal: 4, borderRadius: 4 },
    fence: { backgroundColor: Colors.surface, padding: 8, borderRadius: 8, marginVertical: 4, fontSize: 12 },
    blockquote: { backgroundColor: Colors.primaryLight, borderLeftWidth: 3, borderLeftColor: Colors.primary, paddingLeft: 10, paddingVertical: 4, marginVertical: 4 },
    hr: { backgroundColor: Colors.border, height: 1, marginVertical: 8 },
    link: { color: Colors.primary },
  }), []);

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now().toString() + Math.random(), timestamp: new Date() }]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const resetChat = useCallback(() => {
    sessionIdRef.current = `session-${Date.now()}`;
    setMessages([{ id: '1', text: t.ai.helpPrompt, isUser: false, timestamp: new Date() }]);
  }, [t]);

  const quickActions = useMemo(() => [
    { key: 'battery', label: t.ai.quickBattery, icon: Battery },
    { key: 'chart', label: t.ai.quickChart, icon: BarChart3 },
    { key: 'rules', label: t.ai.quickRules, icon: List },
    { key: 'prices', label: t.ai.quickPrices, icon: Zap },
  ], [t]);

  const showQuickActions = messages.length <= 1 && !isLoading;

  const sendText = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !selectedDevice) return;
    addMessage({ text, isUser: true });
    setIsLoading(true);
    try {
      const res = await sendChatMessage(text, sessionIdRef.current, selectedDevice.device_id);
      if (res.confirmation) {
        addMessage({ text: res.text || '', isUser: false, confirmation: res.confirmation, charts: res.charts });
      } else {
        addMessage({ text: res.text, isUser: false, charts: res.charts });
      }
    } catch (err) {
      addMessage({ text: t.ai.errorSending, isUser: false });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, selectedDevice, addMessage, t]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    await sendText(text);
  }, [inputText, sendText]);

  const handleConfirmation = useCallback(async (msg: Message, accepted: boolean) => {
    if (!msg.confirmation || msg.confirmationHandled) return;

    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmationHandled: true } : m));
    setIsLoading(true);

    try {
      const res = await sendConfirmationResult(
        sessionIdRef.current,
        msg.confirmation.invocation_id,
        accepted,
        msg.confirmation.tool_name,
        msg.confirmation.action_group,
        msg.confirmation.http_method,
        selectedDevice?.device_id,
      );
      addMessage({ text: res.text || (accepted ? 'Action confirmed.' : 'Action rejected.'), isUser: false });
    } catch (err) {
      addMessage({ text: t.ai.errorSending, isUser: false });
    } finally {
      setIsLoading(false);
    }
  }, [addMessage, t, selectedDevice]);

  const getConfirmLabel = (toolName: string) => {
    const labels = CONFIRM_LABELS[toolName];
    return labels ? labels[language] || labels.en : toolName;
  };

  const ACTION_LABELS: Record<string, string> = useMemo(() => ({
    ch: t.ai.actionCh, dis: t.ai.actionDis, sb: t.ai.actionSb,
    ct: t.ai.actionCt, dt: t.ai.actionDt, sl: t.ai.actionSl,
  }), [t]);

  const DAY_NAMES = useMemo(() => language === 'pl'
    ? ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  [language]);

  const formatHhmm = (v: number) => {
    const s = String(v).padStart(4, '0');
    return `${s.slice(0, 2)}:${s.slice(2)}`;
  };

  const formatDays = (d: any): string => {
    if (!d) return t.ai.daysEveryday;
    if (d === 'ed' || d === 'everyday' || d === 'all') return t.ai.daysEveryday;
    if (d === 'wd' || d === 'weekdays') return t.ai.daysWeekdays;
    if (d === 'we' || d === 'weekend') return t.ai.daysWeekend;
    if (Array.isArray(d)) return d.map((i: number) => DAY_NAMES[i] ?? i).join(', ');
    return String(d);
  };

  const formatRuleParams = useCallback((params: Record<string, any>): Array<[string, string]> => {
    const rule = params.rule_json ?? params.rule;
    if (!rule || typeof rule !== 'object') {
      return Object.entries(params)
        .filter(([k]) => k !== 'site_id' && k !== 'priority')
        .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    }

    const lines: Array<[string, string]> = [];
    const a = rule.a;
    if (a?.t) {
      const label = ACTION_LABELS[a.t] || a.t;
      lines.push([t.ai.ruleAction, a.pw ? `${label} — ${a.pw} kW` : label]);
    }

    const c = rule.c;
    if (c?.ts != null || c?.te != null) {
      const ts = c.ts != null ? formatHhmm(c.ts) : '00:00';
      const te = c.te != null ? formatHhmm(c.te) : '24:00';
      lines.push([t.ai.ruleTime, `${ts} – ${te}`]);
    } else {
      lines.push([t.ai.ruleTime, t.ai.allDay]);
    }

    if (rule.d) lines.push([t.ai.ruleDays, formatDays(rule.d)]);

    if (c?.sm != null || c?.sx != null) {
      lines.push([t.ai.ruleSoc, `${c.sm ?? 0}% – ${c.sx ?? 100}%`]);
    }
    if (a?.soc != null) lines.push([t.ai.ruleTargetSoc, `${a.soc}%`]);
    if (a?.maxp != null) lines.push([t.ai.rulePower, `max ${a.maxp} kW`]);
    if (a?.maxg != null || a?.ming != null) {
      const parts: string[] = [];
      if (a.ming != null) parts.push(`min ${a.ming} kW`);
      if (a.maxg != null) parts.push(`max ${a.maxg} kW`);
      lines.push([t.ai.ruleGridTrigger, parts.join(', ')]);
    }

    return lines;
  }, [t, ACTION_LABELS, DAY_NAMES]);

  const confirmParamsToShow = useCallback((params: Record<string, any>) => {
    return Object.entries(params).filter(([k]) => k !== 'site_id');
  }, []);

  const renderMessage = ({ item }: { item: Message }) => {
    const isConfirmation = item.confirmation && !item.confirmationHandled;

    return (
      <View style={[styles.messageRow, item.isUser ? styles.messageRowUser : styles.messageRowAi]}>
        {!item.isUser && (
          <View style={styles.avatarAi}><Bot size={16} color={Colors.primary} /></View>
        )}
        <View style={[styles.bubble, item.isUser ? styles.bubbleUser : styles.bubbleAi]}>
          {item.text ? (
            item.isUser ? (
              <Text style={[styles.messageText, styles.messageTextUser]}>{item.text}</Text>
            ) : (
              <Markdown style={mdStyles}>{item.text}</Markdown>
            )
          ) : null}

          {item.charts && item.charts.length > 0 && item.charts.map((chart, i) => (
            <ChatChart key={i} data={chart} />
          ))}

          {isConfirmation && (
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>{t.ai.confirmTitle}</Text>
              <Text style={styles.confirmAction}>{getConfirmLabel(item.confirmation!.tool_name)}</Text>
              {(item.confirmation!.tool_name === 'send_schedule_rule'
                ? formatRuleParams(item.confirmation!.parameters)
                : confirmParamsToShow(item.confirmation!.parameters).map(([k, v]) =>
                    [k, typeof v === 'object' ? JSON.stringify(v) : String(v)] as [string, string]
                  )
              ).map(([k, v]) => (
                <Text key={k} style={styles.confirmParam}>
                  {k}: {v}
                </Text>
              ))}
              <View style={styles.confirmButtons}>
                <TouchableOpacity style={styles.confirmAccept} onPress={() => handleConfirmation(item, true)}>
                  <Check size={16} color="#fff" />
                  <Text style={styles.confirmBtnText}>{t.ai.confirmAccept}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmReject} onPress={() => handleConfirmation(item, false)}>
                  <X size={16} color={Colors.error} />
                  <Text style={[styles.confirmBtnText, { color: Colors.error }]}>{t.ai.confirmReject}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
        {item.isUser && (
          <View style={styles.avatarUser}><User size={16} color="#fff" /></View>
        )}
      </View>
    );
  };

  if (!selectedDevice) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{t.ai.title}</Text>
            <Text style={styles.headerSubtitle}>{t.ai.subtitle}</Text>
          </View>
        </View>
        <View style={styles.centered}>
          <Bot size={48} color={Colors.textSecondary} />
          <Text style={styles.noDeviceText}>{t.ai.noDevice}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 36 }} />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t.ai.title}</Text>
          <Text style={styles.headerSubtitle}>{selectedDevice.name}</Text>
        </View>
        <TouchableOpacity onPress={resetChat} style={styles.headerBtn} hitSlop={8}>
          <RotateCcw size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {isLoading && (
          <View style={styles.thinkingRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.thinkingText}>{t.ai.thinking}</Text>
          </View>
        )}

        {showQuickActions && (
          <View style={styles.quickActions}>
            {quickActions.map(({ key, label, icon: Icon }) => (
              <TouchableOpacity
                key={key}
                style={styles.quickChip}
                onPress={() => sendText(label)}
                activeOpacity={0.7}
              >
                <Icon size={14} color={Colors.primary} />
                <Text style={styles.quickChipText} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={[styles.input, isListening && styles.inputListening]}
            placeholder={isListening ? '...' : t.ai.placeholder}
            placeholderTextColor={isListening ? Colors.error : Colors.textSecondary}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            editable={!isLoading}
            multiline
          />
          {hasSpeech && (
            <TouchableOpacity
              style={[styles.micButton, isListening && styles.micButtonActive]}
              onPress={toggleVoice}
              disabled={isLoading}
              hitSlop={4}
            >
              {isListening ? <MicOff size={18} color="#fff" /> : <Mic size={18} color={Colors.textSecondary} />}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.sendButton, inputText.trim() && !isLoading && styles.sendButtonActive]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
          >
            <ArrowUp size={20} color={inputText.trim() && !isLoading ? '#fff' : Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '600', color: Colors.text },
  headerSubtitle: { fontSize: 14, color: Colors.primary, marginTop: 2 },
  content: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  noDeviceText: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 32 },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end', gap: 8 },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAi: { justifyContent: 'flex-start' },
  avatarAi: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarUser: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleAi: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  messageText: { fontSize: 15, lineHeight: 21, color: Colors.text },
  messageTextUser: { color: '#fff' },
  confirmCard: { marginTop: 8, backgroundColor: Colors.background, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.warning },
  confirmTitle: { fontSize: 13, fontWeight: '700', color: Colors.warning, marginBottom: 4 },
  confirmAction: { fontSize: 14, fontWeight: '600', color: Colors.text, marginBottom: 6 },
  confirmParam: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  confirmButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  confirmAccept: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: Colors.success, borderRadius: 8, paddingVertical: 10 },
  confirmReject: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(244,67,54,0.08)', borderRadius: 8, paddingVertical: 10, borderWidth: 1, borderColor: Colors.error },
  confirmBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 8 },
  thinkingText: { fontSize: 13, color: Colors.textSecondary },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  quickChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: Colors.primaryLight, borderWidth: 1, borderColor: Colors.primary + '30' },
  quickChipText: { fontSize: 13, color: Colors.primary, fontWeight: '500', flexShrink: 1 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: Colors.text, backgroundColor: Colors.surface, maxHeight: 100 },
  inputListening: { borderColor: Colors.error },
  micButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  micButtonActive: { backgroundColor: Colors.error },
  sendButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  sendButtonActive: { backgroundColor: Colors.primary },
});
