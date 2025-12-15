import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Upload, Users, MapPin, Clock, AlertCircle, CheckCircle, Edit2, Save, X, RefreshCw, Trash2, Plus, MessageCircle, FileSpreadsheet, Maximize2, Minimize2, Settings, ChevronLeft, ChevronRight, Truck, Navigation2, Shield, Bell, GripVertical, Sparkles, Bot, ListChecks, BarChart } from 'lucide-react';

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
const CHATBOT_URL = import.meta.env?.VITE_CHATBOT_URL || 'https://chat.bubbleexplorer.com/login';
const SHEET_URL = import.meta.env?.VITE_SHEET_URL || 'https://docs.google.com/spreadsheets/d/1eSjXF8_5GPyLr_spCQGcLU8Kx47XHcERlAUqROi8Hoc/edit?usp=sharing';
const PLAN_ENDPOINT = import.meta.env?.VITE_PLAN_ENDPOINT || '';
const NOTIFY_ENDPOINT = import.meta.env?.VITE_NOTIFICATION_ENDPOINT || 'http://localhost:8000/api/v1/notifications';
const NOTIFY_RESPONSE_ENDPOINT = import.meta.env?.VITE_NOTIFICATION_RESPONSE_ENDPOINT || '';
const REPLY_ENDPOINT = import.meta.env?.VITE_REPLY_ENDPOINT || 'http://localhost:4001/api/send-reply';
const REPLY_PROXY_ENDPOINT = `${API_BASE_URL}/notifications/reply`;
const ACCEPTED_NOTIFS_KEY = 'accepted_notifications_v1';
const REJECTED_NOTIFS_KEY = 'rejected_notifications_v1';
const APP_USERNAME = import.meta.env?.VITE_APP_USERNAME || '';
const APP_PASSWORD = import.meta.env?.VITE_APP_PASSWORD || '';
const API_KEY = import.meta.env?.VITE_API_KEY || '';
const NAV_TABS = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'drivers', label: 'Drivers', icon: Users },
  { id: 'routes', label: 'Routes', icon: MapPin },
  { id: 'availability', label: 'Availability', icon: Clock },
  { id: 'assignments', label: 'Fixed Assignments', icon: CheckCircle },
  { id: 'chatbot', label: 'Chatbot', icon: MessageCircle },
  { id: 'sheet', label: 'Plan Sheet', icon: FileSpreadsheet },
  { id: 'planner', label: 'Planner', icon: Settings },
  { id: 'notifications', label: 'Notify', icon: Bell }
];

const DAY_OPTIONS = [
  { value: 'Monday', label: 'Monday' },
  { value: 'Tuesday', label: 'Tuesday' },
  { value: 'Wednesday', label: 'Wednesday' },
  { value: 'Thursday', label: 'Thursday' },
  { value: 'Friday', label: 'Friday' },
  { value: 'Saturday', label: 'Saturday' },
  { value: 'Sunday', label: 'Sunday' }
];

const ROUTE_TYPE_OPTIONS = [
  { value: 'regular', label: 'Regular' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
];

const DEFAULT_RULE_BLOCKS = [
  {
    id: 'weekly-limit',
    baseId: 'weekly-limit',
    title: 'Weekly hours Γëñ 48h',
    description: 'Matches max_weekly_hours in the optimizer so a driver never receives routes above 48 hours of work for the week.',
    tag: 'hours'
  },
  {
    id: 'consecutive-limit',
    baseId: 'consecutive-limit',
    title: 'Consecutive hours Γëñ 36h',
    description: 'Uses max_consecutive_hours to stop stacking long days back-to-back. Protects safety and matches optimizer guard rails.',
    tag: 'fatigue'
  },
  {
    id: 'availability',
    baseId: 'availability',
    title: 'Respect availability',
    description: 'Skip any driver/date pair marked unavailable. Optimizer auto-adds F_ entries for unavailable drivers with no assignment.',
    tag: 'availability'
  },
  {
    id: 'fixed-first',
    baseId: 'fixed-first',
    title: 'Honor fixed assignments first',
    description: 'Pre-assign locked routes (including Saturday 452SA special rule) before optimizing flexible routes.',
    tag: 'priority'
  },
  {
    id: 'one-route-per-day',
    baseId: 'one-route-per-day',
    title: 'One route per driver per day',
    description: 'Daily constraint keeps a driver on a single route per date while maximizing coverage.',
    tag: 'fairness'
  },
  {
    id: 'hour-budgets',
    baseId: 'hour-budgets',
    title: 'Monthly hours guardrail',
    description: 'Blocks assignments that exceed remaining monthly hours on the driver profile to avoid overscheduling.',
    tag: 'capacity'
  },
  {
    id: 'objective',
    baseId: 'objective',
    title: 'Capacity-weighted objective',
    description: 'Solver favors assignments that fit remaining capacity (weighting by hours left) to balance workload while maximizing coverage.',
    tag: 'objective'
  }
];

const RULES_STORAGE_KEY = 'optimizer_rule_blocks_v1';
const RULE_LIBRARY = [
  {
    id: 'fatigue-buffer',
    baseId: 'fatigue-buffer',
    title: 'Add fatigue buffer days (sample)',
    description: 'After any day above 10 hours, block the next day unless capacity and availability allow a short shift. Use to reduce burnout.',
    tag: 'sample'
  },
  {
    id: 'weekend-protection',
    baseId: 'weekend-protection',
    title: 'Protect weekend capacity (sample)',
    description: 'Keep at least 2 drivers under 16 weekly hours unassigned until Friday for weekend coverage.',
    tag: 'sample'
  },
  {
    id: 'spread-coverage',
    baseId: 'spread-coverage',
    title: 'Spread coverage across depots',
    description: 'Prefer assignments that balance routes across depots to avoid overloading a single site (derive depot from route_code).',
    tag: 'idea'
  }
];

const DriverSchedulingSystem = () => {
  const withApiKey = (headers = {}) => (API_KEY ? { ...headers, 'X-API-Key': API_KEY } : headers);
  const jsonHeaders = (headers = {}) => ({
    'Content-Type': 'application/json',
    ...withApiKey(headers)
  });
  const fetchWithKey = (url, options = {}) => {
    const mergedHeaders = withApiKey(options.headers || {});
    return fetch(url, { ...options, headers: mergedHeaders });
  };

  const [authed, setAuthed] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [weekStart, setWeekStart] = useState('');
  const [file, setFile] = useState(null);
  const [action, setAction] = useState('replace');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [toast, setToast] = useState(null);
  
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [fixedAssignments, setFixedAssignments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [planningResult, setPlanningResult] = useState(null);
  const [planningLastRun, setPlanningLastRun] = useState(null);
  const [plannerView, setPlannerView] = useState('rules');
  const [showUnassignedBanner, setShowUnassignedBanner] = useState(false);
  const [pendingPlannerScroll, setPendingPlannerScroll] = useState(null);
  const unassignedSectionRef = useRef(null);
  const fixedFailureSectionRef = useRef(null);
  const [expandedUnassigned, setExpandedUnassigned] = useState({});
  const [expandedFixedFailures, setExpandedFixedFailures] = useState({});
  
  const [editingDriver, setEditingDriver] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [editingAvailability, setEditingAvailability] = useState(null);
  const [driverDraft, setDriverDraft] = useState(null);
  const [routeDraft, setRouteDraft] = useState(null);
  const [availabilityDraft, setAvailabilityDraft] = useState(null);
  const [newDriver, setNewDriver] = useState({
    name: '',
    type: '',
    employment_percentage: '',
    monthly_hours_target: '',
    monthly_hours_worked: '',
    monthly_hours_remaining: '',
    fixed_route_with_school: '',
    fixed_route_without_school: ''
  });
  const [newAvailability, setNewAvailability] = useState({
    driver_id: '',
    date: '',
    available: true,
    shift_preference: '',
    notes: ''
  });
  const [newAssignment, setNewAssignment] = useState({
    driver_id: '',
    route_id: '',
    date: ''
  });
  const [newRoute, setNewRoute] = useState({
    route_name: '',
    date: '',
    day_of_week: '',
    type: '',
    duration_hours: '',
    diaten: '',
    vad_time: '',
    location: '',
    duty_code: '',
    duty_name: ''
  });
  const [chatFullscreen, setChatFullscreen] = useState(false);
  const [sheetFullscreen, setSheetFullscreen] = useState(false);
  const [planEndpoint, setPlanEndpoint] = useState(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('planner_endpoint') : null;
    return stored || PLAN_ENDPOINT || '';
  });
  const [showPlanningPrompt, setShowPlanningPrompt] = useState(false);
  const [planningLoading, setPlanningLoading] = useState(false);
  const [notificationEndpoint, setNotificationEndpoint] = useState(NOTIFY_ENDPOINT);
  const [notificationResponseEndpoint, setNotificationResponseEndpoint] = useState(NOTIFY_RESPONSE_ENDPOINT || NOTIFY_ENDPOINT);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pendingRejection, setPendingRejection] = useState(null);
  const [pendingAccept, setPendingAccept] = useState(null);
  const [acceptForm, setAcceptForm] = useState({ driverId: '', date: '', notes: '' });
  const [pendingView, setPendingView] = useState(null);
  const [rejectionMessage, setRejectionMessage] = useState('rejected');
  const [acceptedNotifications, setAcceptedNotifications] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(ACCEPTED_NOTIFS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [rejectedNotifications, setRejectedNotifications] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(REJECTED_NOTIFS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [notificationPollingEnabled, setNotificationPollingEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem('notif_poll_enabled');
      return stored ? stored === '1' : true;
    } catch {
      return true;
    }
  });
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [draftPollingEnabled, setDraftPollingEnabled] = useState(true);
  const [draftPollingInterval, setDraftPollingInterval] = useState(20000);
  const [notificationPollingInterval, setNotificationPollingInterval] = useState(() => {
    if (typeof window === 'undefined') return 20000;
    try {
      const stored = localStorage.getItem('notif_poll_interval');
      return stored ? parseInt(stored, 10) || 20000 : 20000;
    } catch {
      return 20000;
    }
  });
  const [ruleBlocks, setRuleBlocks] = useState(DEFAULT_RULE_BLOCKS);
  const [ruleLibrary, setRuleLibrary] = useState(RULE_LIBRARY);
  const [draggingRuleId, setDraggingRuleId] = useState(null);
  const [ruleDraft, setRuleDraft] = useState({ title: '', description: '', tag: 'custom' });
  const [showRuleComposer, setShowRuleComposer] = useState(false);
  const [showRuleChatbot, setShowRuleChatbot] = useState(true);
  const [ruleChatbotExpanded, setRuleChatbotExpanded] = useState(false);
  const [ruleChatbotPos, setRuleChatbotPos] = useState({ x: 24, y: 72 });
  const [ruleChatbotSize, setRuleChatbotSize] = useState({ width: 420, height: 560 });
  const chatbotDragRef = useRef({ mode: null, startX: 0, startY: 0, startPos: null, startSize: null });
  const audioContextRef = useRef(null);
  const [soundUnlocked, setSoundUnlocked] = useState(false);

  useEffect(() => {
    try {
      const storedAuth = localStorage.getItem('app_authed');
      if (storedAuth === '1') {
        setAuthed(true);
      }
    } catch (error) {
      console.error('Failed to read auth state', error);
    }
  }, []);

  useEffect(() => {
    try {
      if (authed) {
        localStorage.setItem('app_authed', '1');
      } else {
        localStorage.removeItem('app_authed');
      }
    } catch (error) {
      console.error('Failed to persist auth state', error);
    }
  }, [authed]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RULES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed.map((rule) => ({
            ...rule,
            baseId: rule.baseId || rule.id
          }));
          setRuleBlocks(normalized);
        }
      }
    } catch (error) {
      console.error('Failed to load stored rules', error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(ruleBlocks));
    } catch (error) {
      console.error('Failed to persist rules', error);
    }
  }, [ruleBlocks]);

  useEffect(() => {
    try {
      localStorage.setItem(ACCEPTED_NOTIFS_KEY, JSON.stringify(acceptedNotifications));
    } catch (error) {
      console.error('Failed to persist accepted notifications', error);
    }
  }, [acceptedNotifications]);

  useEffect(() => {
    try {
      localStorage.setItem(REJECTED_NOTIFS_KEY, JSON.stringify(rejectedNotifications));
    } catch (error) {
      console.error('Failed to persist rejected notifications', error);
    }
  }, [rejectedNotifications]);

  useEffect(() => {
    try {
      localStorage.setItem('notif_poll_enabled', notificationPollingEnabled ? '1' : '0');
      localStorage.setItem('notif_poll_interval', String(notificationPollingInterval));
    } catch (error) {
      console.error('Failed to persist notification polling settings', error);
    }
  }, [notificationPollingEnabled, notificationPollingInterval]);

  useEffect(() => {
    if (showNotifSettings) {
      setDraftPollingEnabled(notificationPollingEnabled);
      setDraftPollingInterval(notificationPollingInterval);
    }
  }, [showNotifSettings]);

  useEffect(() => {
    if (pendingPlannerScroll && activeTab === 'planner') {
      if (pendingPlannerScroll && pendingPlannerScroll !== 'rules' && plannerView !== 'report') {
        setPlannerView('report');
        return;
      }
      const scrollTarget =
        pendingPlannerScroll === 'unassigned'
          ? unassignedSectionRef
          : pendingPlannerScroll === 'fixed'
            ? fixedFailureSectionRef
            : null;
      setTimeout(() => {
        if (scrollTarget?.current) {
          scrollTarget.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 120);
      setPendingPlannerScroll(null);
    }
  }, [pendingPlannerScroll, activeTab, plannerView]);

  useEffect(() => {
    try {
      if (planEndpoint) {
        localStorage.setItem('planner_endpoint', planEndpoint);
      }
    } catch (error) {
      console.error('Failed to persist planner endpoint', error);
    }
  }, [planEndpoint]);

  useEffect(() => {
    if (ruleChatbotExpanded && typeof window !== 'undefined') {
      const margin = 24;
      const width = ruleChatbotSize.width;
      setRuleChatbotPos((pos) => ({
        x: pos?.x || Math.max(margin, (window.innerWidth || 1200) - width - margin),
        y: pos?.y || 72
      }));
    }
  }, [ruleChatbotExpanded, ruleChatbotSize.width]);

  const validateMonday = (dateString) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    return date.getDay() === 1;
  };

  const getNearestMondays = (dateString) => {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const previousMonday = new Date(date);
    previousMonday.setDate(date.getDate() - daysToSubtract);
    
    const nextMonday = new Date(previousMonday);
    nextMonday.setDate(previousMonday.getDate() + 7);
    
    return {
      previous: previousMonday.toISOString().split('T')[0],
      next: nextMonday.toISOString().split('T')[0]
    };
  };

  const handleLogin = () => {
    setLoginError(null);
    if (!APP_USERNAME && !APP_PASSWORD) {
      setAuthed(true);
      return;
    }
    if (loginUser === APP_USERNAME && loginPass === APP_PASSWORD) {
      setAuthed(true);
      return;
    }
    setLoginError('Invalid credentials');
  };

  const handleFileUpload = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Please select a file' });
      return;
    }
    
    if (!weekStart) {
      setMessage({ type: 'error', text: 'Please select a week start date' });
      return;
    }
    
    if (!validateMonday(weekStart)) {
      const mondays = getNearestMondays(weekStart);
      const selectedDate = new Date(weekStart);
      const dayName = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      setMessage({
        type: 'error',
        text: `The date ${weekStart} is a ${dayName}, not a Monday!`,
        suggestions: {
          previous: mondays.previous,
          next: mondays.next
        }
      });
      return;
    }
    
      setLoading(true);
      setMessage(null);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('week_start', weekStart);
      formData.append('action', action);
      formData.append('unavailable_drivers', '[]');
      
      try {
        const response = await fetch(`${API_BASE_URL}/upload/weekly-plan`, {
          method: 'POST',
          headers: withApiKey(),
          body: formData,
        });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.detail && data.detail.error) {
          setMessage({
            type: 'error',
            text: data.detail.message,
            suggestions: data.detail.suggestions
          });
        } else {
          throw new Error(data.detail || 'Upload failed');
        }
      } else {
        setMessage({
          type: 'success',
          text: `Γ£à Upload successful! Created ${data.records_created.drivers} drivers, ${data.records_created.routes} routes, ${data.records_created.fixed_assignments} fixed assignments.`
        });

        await fetchWeeklyData(weekStart);
        setShowPlanningPrompt(true);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const triggerPlanning = async () => {
    if (!weekStart) {
      setMessage({ type: 'error', text: 'Week start is missing for planning.' });
      return;
    }
    if (!planEndpoint) {
      setMessage({ type: 'error', text: 'Planning endpoint is missing. Set it in the Planner tab input (persisted in your browser).' });
      return;
    }
    setPlanningLoading(true);
    try {
      const response = await fetch(planEndpoint, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ week_start: weekStart })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error((data && (data.detail || data.error)) || 'Failed to send planning request');
      }
      setPlanningResult(data || null);
      setPlanningLastRun(new Date().toISOString());
      const grouped = groupUnassignedByDate(data || {});
      const groupedFixed = groupFixedFailuresByDate(data || {});
      const unassignedCount = countUnassigned(grouped);
      const fixedFailCount = countFixedFailures(groupedFixed);
      const statusNote = data?.solver_status ? ` (solver: ${data.solver_status})` : '';
      const unassignedNote = unassignedCount > 0 ? ` · ${unassignedCount} unassigned route${unassignedCount === 1 ? '' : 's'} to review` : ' · all routes covered';
      const fixedNote = fixedFailCount > 0 ? ` · ${fixedFailCount} fixed assignment issue${fixedFailCount === 1 ? '' : 's'}` : '';
      setShowUnassignedBanner(unassignedCount > 0 || fixedFailCount > 0);
      setMessage({ type: 'success', text: `Planning request sent successfully${statusNote}${unassignedNote}${fixedNote}.` });
    } catch (error) {
      setPlanningResult(null);
      setShowUnassignedBanner(false);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setPlanningLoading(false);
      setShowPlanningPrompt(false);
    }
  };

  const handleRuleDragStart = (ruleId) => {
    setDraggingRuleId(ruleId);
  };

  const handleRuleDragOver = (event, targetId) => {
    event.preventDefault();
    if (!draggingRuleId || draggingRuleId === targetId) return;

    setRuleBlocks((prev) => {
      const updated = [...prev];
      const fromIndex = updated.findIndex((r) => r.id === draggingRuleId);
      const toIndex = updated.findIndex((r) => r.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return prev;
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  };

  const handleRuleDrop = () => {
    setDraggingRuleId(null);
  };

  const removeRuleBlock = (ruleId) => {
    setRuleBlocks((prev) => {
      const target = prev.find((rule) => rule.id === ruleId);
      const remaining = prev.filter((rule) => rule.id !== ruleId);
      if (target) {
        const baseId = target.baseId || target.id;
        setRuleLibrary((library) => {
          const exists = library.some((r) => (r.baseId || r.id) === baseId);
          if (exists) return library;
          return [...library, { id: baseId, baseId, title: target.title, description: target.description, tag: target.tag || 'custom' }];
        });
      }
      return remaining;
    });
  };

  const startChatbotDrag = (event, mode) => {
    if (!ruleChatbotExpanded) return;
    event.preventDefault();
    chatbotDragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startPos: ruleChatbotPos,
      startSize: ruleChatbotSize
    };
    window.addEventListener('mousemove', handleChatbotDrag);
    window.addEventListener('mouseup', stopChatbotDrag);
  };

  const handleChatbotDrag = (event) => {
    const state = chatbotDragRef.current;
    if (!state?.mode) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (state.mode === 'move') {
      setRuleChatbotPos({
        x: Math.max(8, state.startPos.x + dx),
        y: Math.max(8, state.startPos.y + dy)
      });
    } else if (state.mode === 'resize') {
      setRuleChatbotSize({
        width: Math.max(320, state.startSize.width + dx),
        height: Math.max(360, state.startSize.height + dy)
      });
    }
  };

  const stopChatbotDrag = () => {
    chatbotDragRef.current = { mode: null, startX: 0, startY: 0, startPos: null, startSize: null };
    window.removeEventListener('mousemove', handleChatbotDrag);
    window.removeEventListener('mouseup', stopChatbotDrag);
  };

  const addRuleBlock = () => {
    if (!ruleDraft.title.trim() || !ruleDraft.description.trim()) {
      setMessage({ type: 'error', text: 'Rule title and description are required.' });
      return;
    }

    const baseId = ruleDraft.title.trim().toLowerCase().replace(/\s+/g, '-') || 'custom-rule';
    const newRule = {
      id: `rule-${Date.now()}`,
      baseId,
      title: ruleDraft.title.trim(),
      description: ruleDraft.description.trim(),
      tag: ruleDraft.tag.trim() || 'custom'
    };

    setRuleBlocks((prev) => [...prev, newRule]);
    setRuleDraft({ title: '', description: '', tag: 'custom' });
    setShowRuleComposer(false);
    setMessage({ type: 'success', text: 'Rule added to the optimizer board.' });
  };

  const addRuleFromLibrary = (ruleId) => {
    const rule = ruleLibrary.find((r) => r.id === ruleId || r.baseId === ruleId);
    if (!rule) return;
    const uniqueId = `${rule.baseId || rule.id}-${Date.now()}`;
    setRuleBlocks((prev) => [...prev, { ...rule, id: uniqueId, baseId: rule.baseId || rule.id }]);
    setMessage({ type: 'success', text: `Added "${rule.title}" from samples.` });
  };

  const fetchNotifications = async () => {
    setNotificationLoading(true);
    try {
      const response = await fetch(notificationEndpoint, { headers: withApiKey() });
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.notifications || [];
      const pending = items
        .map((item) => ({
          ...item,
          actual_message: item.actual_message || item.Actual_message || item.message || item.reason
        }))
        .filter((n) => n.driver_name || n.reason || n.actual_message || n.whatsapp_from);
      setNotifications(pending);
      if (pending.length > notifications.length) {
        playNotificationTone();
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setNotificationLoading(false);
    }
  };

  const sendNotificationResponse = async (notif, status, message) => {
    if (!notificationResponseEndpoint) return;
    const payload = {
      id: notif.id,
      driver_name: notif.driver_name,
      date: notif.date,
      status,
      message: message || status
    };
    const response = await fetch(notificationResponseEndpoint, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || 'Failed to send response');
    }
  };

  const sendWhatsAppReply = async (notif, reply) => {
    if (!notif?.whatsapp_from) return { ok: false, skipped: true };
    const endpoint = REPLY_PROXY_ENDPOINT || REPLY_ENDPOINT;
    if (!endpoint) return { ok: false, skipped: true };
    try {
      const to = notif.whatsapp_from.startsWith('whatsapp:') ? notif.whatsapp_from : `whatsapp:${notif.whatsapp_from}`;
      const body = { to, reply };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return { ok: false, error: error.detail || `Reply endpoint returned ${response.status}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Failed to send WhatsApp reply (possibly CORS or network)' };
    }
  };

  const playNotificationTone = async () => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } catch (e) {
      try {
        const beep = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=');
        beep.play().catch(() => {});
      } catch (err) {
        console.warn('Notification tone failed', e);
      }
    }
  };

  const sendNotification = async (accept = false) => {
    if (!notificationPayload.driver_name || !notificationPayload.date || !notificationPayload.message) {
      setMessage({ type: 'error', text: 'Driver, date, and message are required for notifications.' });
      return;
    }
    setNotificationLoading(true);
    try {
      const response = await fetch(notificationEndpoint, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ ...notificationPayload, accept })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to send notification');
      }
      setMessage({ type: 'success', text: accept ? 'Notification sent and accepted.' : 'Notification sent.' });
      if (accept && weekStart && validateMonday(weekStart)) {
        fetchWeeklyData(weekStart, true);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setNotificationLoading(false);
    }
  };

  const acceptNotification = async (notif) => {
    const driver = drivers.find(
      (d) => notif.driver_name && d.name.toLowerCase() === notif.driver_name.toLowerCase()
    );
    setPendingAccept(notif);
    setAcceptForm({
      driverId: driver?.driver_id || '',
      date: notif.date || '',
      notes: notif.reason || notif.message || 'Unavailable request'
    });
  };

  const rejectNotification = (notif) => {
    setPendingRejection(notif);
    setRejectionMessage(notif.reason || notif.message || 'rejected');
  };

  const handleRejectionDecision = async (sendResponse) => {
    if (!pendingRejection) return;
    const notif = pendingRejection;
    setNotificationLoading(true);
    try {
        if (sendResponse) {
          await sendNotificationResponse(notif, 'rejected', rejectionMessage || 'rejected');
          const waResult = await sendWhatsAppReply(notif, rejectionMessage || 'rejected');
          if (waResult?.error) {
            setMessage({ type: 'error', text: `Rejection saved but WhatsApp reply failed: ${waResult.error}` });
          } else {
            setMessage({ type: 'success', text: 'Notification rejected and reply sent' });
          }
        }
        setNotifications((prev) =>
          prev
            .map((n) => {
              if ((notif.id && n.id === notif.id) || (!notif.id && n === notif)) {
                return { ...n, status: 'rejected', responseMessage: sendResponse ? (rejectionMessage || 'rejected') : n.responseMessage };
              }
              return n;
            })
            .filter((n) => n.status !== 'pending')
        );
      if (notif?.id) {
        try {
          await fetch(`${notificationEndpoint}/${notif.id}`, { method: 'DELETE', headers: withApiKey() });
        } catch {
          /* ignore */
        }
      }
      // remove any pending duplicates for same driver/date
      setNotifications((prev) =>
        prev.filter(
          (n) =>
            n.id !== notif?.id &&
            !(n.driver_name === notif?.driver_name && n.date === notif?.date && (n.status || 'pending') === 'pending')
        )
      );
      if (!sendResponse) {
        setMessage({ type: 'success', text: 'Notification rejected' });
      }
      setRejectedNotifications((prev) => [
        ...prev,
        {
          id: notif?.id,
          driver_name: notif?.driver_name,
          date: notif?.date,
          reason: notif?.reason,
          actual_message: notif?.actual_message,
          whatsapp_from: notif?.whatsapp_from,
          responseMessage: sendResponse ? (rejectionMessage || 'rejected') : undefined
        }
      ]);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setPendingRejection(null);
      setNotificationLoading(false);
    }
  };

  const handleAcceptConfirm = async () => {
    if (!acceptForm.driverId || !acceptForm.date) {
      setMessage({ type: 'error', text: 'Driver and date are required.' });
      return;
    }
    const notif = pendingAccept;
    setNotificationLoading(true);
    try {
      const driver = drivers.find((d) => d.driver_id === acceptForm.driverId);
      const payload = {
        driver_id: acceptForm.driverId,
        date: acceptForm.date,
        available: false,
        notes: acceptForm.notes || 'Unavailable request'
      };
      const response = await fetch(`${API_BASE_URL}/weekly/availability`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to update availability');
      }
      const data = await response.json();
      const driverName = driver?.name || notif?.driver_name || 'Driver';
      setAvailability((prev) => [...prev, { ...data, driver_name: driverName }]);
      try {
        await sendNotificationResponse(notif, 'approved', 'approved');
      } catch (err) {
        setMessage({ type: 'error', text: `Availability updated but response failed: ${err.message}` });
      }
      try {
        const waResult = await sendWhatsAppReply(notif, acceptForm.notes || 'approved');
        if (waResult?.error) {
          setMessage({ type: 'error', text: `Availability updated but reply failed: ${waResult.error}` });
        }
      } catch {
        /* ignore */
      }
      setNotifications((prev) =>
        prev
          .map((n) => {
            if ((notif?.id && n.id === notif.id) || (!notif?.id && n === notif)) {
              return { ...n, status: 'accepted', responseMessage: 'approved', driver_name: driverName };
            }
            return n;
          })
          .filter((n) => n.status !== 'pending')
      );
      if (notif?.id) {
        try {
          await fetch(`${notificationEndpoint}/${notif.id}`, { method: 'DELETE', headers: withApiKey() });
        } catch {
          /* ignore */
        }
      }
      setNotifications((prev) =>
        prev.filter(
          (n) =>
            n.id !== notif?.id &&
            !(n.driver_name === notif?.driver_name && n.date === notif?.date && (n.status || 'pending') === 'pending')
        )
      );
      setMessage({ type: 'success', text: `Marked ${driverName} unavailable on ${acceptForm.date}` });
      setAcceptedNotifications((prev) => [
        ...prev,
        {
          id: notif?.id,
          driver_name: driverName,
          date: acceptForm.date,
          reason: notif?.reason,
          actual_message: notif?.actual_message,
          whatsapp_from: notif?.whatsapp_from,
          responseMessage: 'approved'
        }
      ]);
      setPendingAccept(null);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setNotificationLoading(false);
    }
  };

  const deleteNotification = async (notif) => {
    setNotifications(prev => prev.filter(n => n !== notif));
    if (notif.id) {
      try {
        await fetch(`${notificationEndpoint}/${notif.id}`, { method: 'DELETE', headers: withApiKey() });
      } catch {
        /* ignore failures for now */
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!authed || !notificationEndpoint || !notificationPollingEnabled) return;
    fetchNotifications();
    const id = setInterval(() => {
      fetchNotifications();
    }, notificationPollingInterval);
    return () => clearInterval(id);
  }, [authed, notificationEndpoint, notificationPollingEnabled, notificationPollingInterval]);

  useEffect(() => {
    const unlock = () => {
      try {
        const ctx = audioContextRef.current || new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = ctx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        setSoundUnlocked(true);
      } catch (err) {
        console.warn('Audio unlock failed', err);
      }
      window.removeEventListener('click', unlock);
    };
    window.addEventListener('click', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const fetchWeeklyData = async (date, quiet = false) => {
    if (!date || !validateMonday(date)) return;
    
    setLoading(true);
    try {
      const [driversRes, routesRes, availRes, assignRes, summaryRes] = await Promise.all([
        fetchWithKey(`${API_BASE_URL}/weekly/drivers?week_start=${date}`),
        fetchWithKey(`${API_BASE_URL}/weekly/routes?week_start=${date}`),
        fetchWithKey(`${API_BASE_URL}/weekly/availability?week_start=${date}`),
        fetchWithKey(`${API_BASE_URL}/weekly/fixed-assignments?week_start=${date}`),
        fetchWithKey(`${API_BASE_URL}/weekly/summary?week_start=${date}`)
      ]);
      
      const [driversData, routesData, availData, assignData, summaryData] = await Promise.all([
        driversRes.json(),
        routesRes.json(),
        availRes.json(),
        assignRes.json(),
        summaryRes.json()
      ]);
      
      setDrivers(driversData.drivers || []);
      setRoutes(routesData.routes || []);
      setAvailability(availData.availability || []);
      setFixedAssignments(assignData.fixed_assignments || []);
      setSummary(summaryData);
      
      if (!quiet) {
        setMessage({ type: 'success', text: 'Data loaded successfully' });
      }
      return true;
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load data: ' + error.message });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const formatDurationHours = (hours) => {
    if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return '—';
    const totalMinutes = Math.round(Number(hours) * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const dayLabel = (dateStr) => {
    if (!dateStr) return 'Unknown day';
    const d = new Date(dateStr);
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday} · ${dateStr}`;
  };

  const groupUnassignedByDate = (result) => {
    const grouped = {};
    if (!result) return grouped;
    const seen = new Set();

    const addItem = (dateKey, item) => {
      const routeName = item.route_name || item.name || item.route || 'Unknown route';
      const routeId = item.route_id || item.id || null;
      const duration = item.duration_hours;
      const key = `${dateKey}|${routeId || 'no-id'}|${routeName}|${duration || 'no-duration'}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({
        route_name: routeName,
        route_id: routeId,
        date: item.date || dateKey,
        duration_hours: duration,
        reason: item.reason || item.message || 'No reason provided'
      });
    };

    if (result.daily_reports && typeof result.daily_reports === 'object') {
      Object.values(result.daily_reports).forEach((report) => {
        const list = report?.unassigned_details || report?.unassigned_routes || [];
        if (Array.isArray(list) && list.length > 0) {
          list.forEach((item) => addItem(report.date, item));
        }
      });
    }

    if (Array.isArray(result.unassigned_routes)) {
      result.unassigned_routes.forEach((item) => {
        const dateKey = item.date || 'Unknown date';
        addItem(dateKey, item);
      });
    }

    return grouped;
  };

  const countUnassigned = (grouped) =>
    Object.values(grouped || {}).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);

  const groupFixedFailuresByDate = (result) => {
    const grouped = {};
    if (!result || !result.daily_reports) return grouped;
    const seen = new Set();

    Object.values(result.daily_reports).forEach((report) => {
      const list = report?.fixed_assignment_failures || [];
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        const dateKey = item.date || report.date || 'Unknown date';
        const routeName = item.route_name || item.name || item.route || 'Unknown route';
        const routeId = item.route_id || item.id || null;
        const driverId = item.driver_id || item.driver || null;
        const key = `${dateKey}|${routeId || 'no-id'}|${routeName}|${driverId || 'no-driver'}`;
        if (seen.has(key)) return;
        seen.add(key);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({
          route_name: routeName,
          route_id: routeId,
          driver_id: driverId,
          date: dateKey,
          reason: item.reason || item.message || 'No reason provided'
        });
      });
    });

    return grouped;
  };

  const countFixedFailures = (grouped) =>
    Object.values(grouped || {}).reduce((acc, list) => acc + (Array.isArray(list) ? list.length : 0), 0);

  const buildReasonCounts = (unassignedByDate, fixedByDate) => {
    const counts = {};
    const addReason = (reason) => {
      if (!reason) return;
      const key = reason.trim();
      counts[key] = (counts[key] || 0) + 1;
    };
    Object.values(unassignedByDate || {}).forEach((list) => {
      list.forEach((item) => addReason(item.reason));
    });
    Object.values(fixedByDate || {}).forEach((list) => {
      list.forEach((item) => addReason(item.reason));
    });
    return Object.entries(counts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  };

  const toNullIfEmpty = (value) => {
    if (value === '' || value === undefined) return null;
    return value;
  };

  const cleanObject = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== null && value !== '' && value !== undefined)
  );

  const formatDateLocal = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  useEffect(() => {
    if (message) {
      setToast({ type: message.type, text: message.text });
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const parseDateLocal = (valueStr) => {
    const [y, m, d] = valueStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12); // noon avoids TZ shifts
  };

  const MessageBanner = () => {
    if (!message) return null;
    return (
      <div style={{
        margin: '16px 0',
        padding: '16px',
        borderRadius: '8px',
        backgroundColor: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
        border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          {message.type === 'success' ? (
            <CheckCircle size={20} style={{ color: '#059669', flexShrink: 0 }} />
          ) : (
            <AlertCircle size={20} style={{ color: '#dc2626', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            <p style={{ color: message.type === 'success' ? '#065f46' : '#991b1b' }}>
              {message.text}
            </p>
            {message.suggestions && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
                  Use one of these Mondays instead:
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setWeekStart(message.suggestions.previous)}
                    className="secondary-button"
                  >
                    {message.suggestions.previous}
                  </button>
                  <button
                    onClick={() => setWeekStart(message.suggestions.next)}
                    className="secondary-button"
                  >
                    {message.suggestions.next}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setMessage(null)}
            className="ghost-button"
            style={{ padding: '6px', lineHeight: 1 }}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  };

  const MessageToast = () => {
    if (!toast) return null;
    const isSuccess = toast.type === 'success';
    return (
      <div style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        minWidth: '280px',
        maxWidth: '420px',
        padding: '12px 14px',
        borderRadius: '10px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
        backgroundColor: isSuccess ? '#0f172a' : '#7f1d1d',
        color: '#f8fafc',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          {isSuccess ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <div style={{ flex: 1, lineHeight: 1.4 }}>{toast.text}</div>
          <button
            onClick={() => setToast(null)}
            className="ghost-button"
            style={{ color: '#f8fafc', padding: '4px', lineHeight: 1 }}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  };

  const UnassignedWarningBanner = () => {
    if (!showUnassignedBanner) return null;
    return (
      <div
        style={{
          margin: '12px 0',
          padding: '14px 16px',
          borderRadius: '10px',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#92400e' }}>
          <AlertCircle size={18} />
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>Optimizer returned unassigned routes or fixed assignment issues.</p>
            <p style={{ margin: '4px 0 0', color: '#92400e' }}>Click to review the day-by-day breakdown.</p>
          </div>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setActiveTab('planner');
            setPlannerView('report');
            setPendingPlannerScroll('unassigned');
          }}
          style={{ background: '#f59e0b', borderColor: '#d97706' }}
        >
          View details
        </button>
      </div>
    );
  };

  const DatePicker = ({ value, onChange, placeholder = 'Select date' }) => {
    const [open, setOpen] = useState(false);
    const [viewDate, setViewDate] = useState(value ? parseDateLocal(value) : new Date());
    const pickerRef = useRef(null);

    useEffect(() => {
      const handler = (e) => {
        if (pickerRef.current && !pickerRef.current.contains(e.target)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
      if (value) {
        setViewDate(parseDateLocal(value));
      }
    }, [value]);

    const buildCalendar = () => {
      const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
      const startOffset = (first.getDay() + 6) % 7; // Monday start
      const start = new Date(first);
      start.setDate(first.getDate() - startOffset);
      const days = [];
      for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
      }
      return days;
    };

    const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const selectedValue = value ? value : '';

    return (
      <div className="date-picker" ref={pickerRef}>
        <div className="date-input" onClick={() => setOpen(true)}>
          <div>{selectedValue || placeholder}</div>
          <Calendar size={16} />
        </div>
        {open && (
          <div className="date-popover">
            <div className="date-popover-header">
              <button className="ghost-button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
                <ChevronLeft size={16} />
              </button>
              <span>{monthLabel}</span>
              <button className="ghost-button" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="date-grid">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <div key={d} className="date-grid-heading">{d}</div>
              ))}
              {buildCalendar().map((d) => {
                const dateStr = formatDateLocal(d);
                const isCurrentMonth = d.getMonth() === viewDate.getMonth();
                const isSelected = selectedValue === dateStr;
                return (
                  <button
                    key={dateStr + d.getTime()}
                    className={`date-grid-cell ${isCurrentMonth ? '' : 'muted'} ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onChange(dateStr);
                      setOpen(false);
                    }}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleDriverEdit = (driver) => {
    setEditingDriver(driver.driver_id);
    setDriverDraft({
      name: driver.name,
      type: driver.details.type || '',
      employment_percentage: driver.details.employment_percentage !== undefined && driver.details.employment_percentage !== null
        ? String(driver.details.employment_percentage)
        : '',
      monthly_hours_target: driver.details.monthly_hours_target || '',
      monthly_hours_worked: driver.details.monthly_hours_worked || '',
      monthly_hours_remaining: driver.details.monthly_hours_remaining || '',
      fixed_route_with_school: driver.details.fixed_route_with_school || '',
      fixed_route_without_school: driver.details.fixed_route_without_school || ''
    });
  };

  const cancelDriverEdit = () => {
    setEditingDriver(null);
    setDriverDraft(null);
  };

  const saveDriverEdits = async () => {
    if (!editingDriver || !driverDraft) return;
    if (!driverDraft.name.trim()) {
      setMessage({ type: 'error', text: 'Driver name is required' });
      return;
    }
    const employmentValue = driverDraft.employment_percentage === '' || driverDraft.employment_percentage === null
      ? null
      : parseInt(driverDraft.employment_percentage, 10);
    const detailsPayload = cleanObject({
      type: driverDraft.type || null,
      employment_percentage: Number.isNaN(employmentValue) ? null : employmentValue,
      monthly_hours_target: driverDraft.monthly_hours_target || null,
      monthly_hours_worked: driverDraft.monthly_hours_worked || null,
      monthly_hours_remaining: driverDraft.monthly_hours_remaining || null,
      fixed_route_with_school: driverDraft.fixed_route_with_school || null,
      fixed_route_without_school: driverDraft.fixed_route_without_school || null
    });
    const payload = { name: driverDraft.name.trim() };
    if (Object.keys(detailsPayload).length > 0) {
      payload.details = detailsPayload;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/drivers/${editingDriver}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to update driver');
      }
      const data = await response.json();
      setDrivers(drivers.map(d => d.driver_id === data.driver_id ? data : d));
      cancelDriverEdit();
      setMessage({ type: 'success', text: 'Driver updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleDriverCreate = async () => {
    if (!newDriver.name.trim()) {
      setMessage({ type: 'error', text: 'Driver name is required' });
      return;
    }
    const newEmployment = newDriver.employment_percentage === '' ? null : parseInt(newDriver.employment_percentage, 10);
    const detailsPayload = cleanObject({
      type: newDriver.type || null,
      employment_percentage: Number.isNaN(newEmployment) ? null : newEmployment,
      monthly_hours_target: newDriver.monthly_hours_target || null,
      monthly_hours_worked: newDriver.monthly_hours_worked || null,
      monthly_hours_remaining: newDriver.monthly_hours_remaining || null,
      fixed_route_with_school: newDriver.fixed_route_with_school || null,
      fixed_route_without_school: newDriver.fixed_route_without_school || null
    });
    const payload = { name: newDriver.name.trim() };
    if (Object.keys(detailsPayload).length > 0) {
      payload.details = detailsPayload;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/drivers`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to create driver');
      }
      const data = await response.json();
      setDrivers([...drivers, data]);
      setNewDriver({
        name: '',
        type: '',
        employment_percentage: '',
        monthly_hours_target: '',
        monthly_hours_worked: '',
        monthly_hours_remaining: '',
        fixed_route_with_school: '',
        fixed_route_without_school: ''
      });
      setMessage({ type: 'success', text: 'Driver created successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleDeleteDriver = async (driverId) => {
    const driver = drivers.find(d => d.driver_id === driverId);
    if (driver && !window.confirm(`Delete driver "${driver.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/drivers/${driverId}`, {
        method: 'DELETE',
        headers: withApiKey()
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to delete driver');
      }
      setDrivers(drivers.filter(d => d.driver_id !== driverId));
      setAvailability(availability.filter(a => a.driver_id !== driverId));
      setFixedAssignments(fixedAssignments.filter(a => a.driver_id !== driverId));
      setMessage({ type: 'success', text: 'Driver deleted successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleRouteEdit = (route) => {
    setEditingRoute(route.route_id);
    setRouteDraft({
      route_name: route.route_name,
      day_of_week: route.day_of_week || '',
      type: route.details.type || '',
      duration_hours: route.details.duration_hours ?? '',
      diaten: route.details.diaten ?? '',
      vad_time: route.details.vad_time || '',
      location: route.details.location || '',
      duty_code: route.details.duty_code || '',
      duty_name: route.details.duty_name || ''
    });
  };

  const cancelRouteEdit = () => {
    setEditingRoute(null);
    setRouteDraft(null);
  };

  const saveRouteEdits = async () => {
    if (!editingRoute || !routeDraft) return;
    if (!routeDraft.route_name || !routeDraft.route_name.trim()) {
      setMessage({ type: 'error', text: 'Route name is required' });
      return;
    }
    const durationValue = routeDraft.duration_hours === '' ? null : parseFloat(routeDraft.duration_hours);
    const diatenValue = routeDraft.diaten === '' ? null : parseFloat(routeDraft.diaten);
    const detailsPayload = cleanObject({
      type: routeDraft.type || null,
      duration_hours: Number.isNaN(durationValue) ? null : durationValue,
      diaten: Number.isNaN(diatenValue) ? null : diatenValue,
      vad_time: routeDraft.vad_time || null,
      location: routeDraft.location || null,
      duty_code: routeDraft.duty_code || null,
      duty_name: routeDraft.duty_name || null
    });
    const payload = cleanObject({
      route_name: routeDraft.route_name.trim(),
      day_of_week: routeDraft.day_of_week || null
    });
    if (Object.keys(detailsPayload).length > 0) {
      payload.details = detailsPayload;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/routes/${editingRoute}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to update route');
      }
      const data = await response.json();
      setRoutes(routes.map(r => r.route_id === data.route_id ? data : r));
      cancelRouteEdit();
      setMessage({ type: 'success', text: 'Route updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleCreateRoute = async () => {
    if (!newRoute.route_name.trim() || !newRoute.date) {
      setMessage({ type: 'error', text: 'Route name and date are required' });
      return;
    }
    const durationValue = newRoute.duration_hours === '' ? null : parseFloat(newRoute.duration_hours);
    const diatenValue = newRoute.diaten === '' ? null : parseFloat(newRoute.diaten);
    const detailsPayload = cleanObject({
      type: newRoute.type || null,
      duration_hours: Number.isNaN(durationValue) ? null : durationValue,
      diaten: Number.isNaN(diatenValue) ? null : diatenValue,
      vad_time: newRoute.vad_time || null,
      location: newRoute.location || null,
      duty_code: newRoute.duty_code || null,
      duty_name: newRoute.duty_name || null
    });
    const payload = cleanObject({
      route_name: newRoute.route_name.trim(),
      date: newRoute.date,
      day_of_week: newRoute.day_of_week || null,
      details: Object.keys(detailsPayload).length > 0 ? detailsPayload : undefined
    });
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/routes`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to create route');
      }
      const data = await response.json();
      setRoutes([...routes, data]);
      setNewRoute({
        route_name: '',
        date: '',
        day_of_week: '',
        type: '',
        duration_hours: '',
        diaten: '',
        vad_time: '',
        location: '',
        duty_code: '',
        duty_name: ''
      });
      setMessage({ type: 'success', text: 'Route created successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleDeleteRoute = async (routeId) => {
    const route = routes.find(r => r.route_id === routeId);
    if (route && !window.confirm(`Delete route "${route.route_name}" on ${route.date}?`)) {
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/routes/${routeId}`, {
        method: 'DELETE',
        headers: withApiKey()
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 409) {
          throw new Error('Cannot delete this route because a fixed route is assigned to a driver. Edit that fixed assignment first.');
        }
        throw new Error(error.detail || 'Failed to delete route');
      }
      setRoutes(routes.filter(r => r.route_id !== routeId));
      setFixedAssignments(fixedAssignments.filter(a => a.route_id !== routeId));
      setMessage({ type: 'success', text: 'Route deleted successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleAvailabilityEdit = (record) => {
    setEditingAvailability(record.id);
    setAvailabilityDraft({
      driver_id: record.driver_id,
      date: record.date,
      available: record.available,
      shift_preference: record.shift_preference || '',
      notes: record.notes || ''
    });
  };

  const cancelAvailabilityEdit = () => {
    setEditingAvailability(null);
    setAvailabilityDraft(null);
  };

  const saveAvailabilityEdits = async () => {
    if (!editingAvailability || !availabilityDraft) return;
    const payload = cleanObject({
      driver_id: Number(availabilityDraft.driver_id),
      date: availabilityDraft.date,
      available: availabilityDraft.available,
      shift_preference: availabilityDraft.shift_preference || null,
      notes: availabilityDraft.notes || null
    });
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/availability/${editingAvailability}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to update availability');
      }
      const data = await response.json();
      const driverName = drivers.find(d => d.driver_id === data.driver_id)?.name || 'Unknown driver';
      setAvailability(availability.map(a => 
        a.id === data.id ? { ...data, driver_name: driverName } : a
      ));
      cancelAvailabilityEdit();
      setMessage({ type: 'success', text: 'Availability updated successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleCreateAvailability = async () => {
    if (!newAvailability.driver_id || !newAvailability.date) {
      setMessage({ type: 'error', text: 'Driver and date are required' });
      return;
    }
    const payload = {
      driver_id: Number(newAvailability.driver_id),
      date: newAvailability.date,
      available: newAvailability.available,
      shift_preference: toNullIfEmpty(newAvailability.shift_preference),
      notes: toNullIfEmpty(newAvailability.notes)
    };
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/availability`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to create availability');
      }
      const data = await response.json();
      const driverName = drivers.find(d => d.driver_id === data.driver_id)?.name || 'Unknown driver';
      setAvailability([...availability, { ...data, driver_name: driverName }]);
      setNewAvailability({
        driver_id: '',
        date: '',
        available: true,
        shift_preference: '',
        notes: ''
      });
      setMessage({ type: 'success', text: 'Availability created successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleCreateAssignment = async () => {
    if (!newAssignment.driver_id || !newAssignment.date) {
      setMessage({ type: 'error', text: 'Driver and date are required for assignments' });
      return;
    }
    const payload = {
      driver_id: Number(newAssignment.driver_id),
      route_id: newAssignment.route_id ? Number(newAssignment.route_id) : null,
      date: newAssignment.date
    };
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/fixed-assignments`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to create assignment');
      }
      const data = await response.json();
      const driverName = drivers.find(d => d.driver_id === data.driver_id)?.name || 'Unknown driver';
      const routeName = data.route_id
        ? routes.find(r => r.route_id === data.route_id)?.route_name || 'Route'
        : 'Unassigned';
      setFixedAssignments([
        ...fixedAssignments,
        { ...data, driver_name: driverName, route_name: routeName }
      ]);
      setNewAssignment({ driver_id: '', route_id: '', date: '' });
      setMessage({ type: 'success', text: 'Fixed assignment created successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/weekly/fixed-assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: withApiKey()
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to delete assignment');
      }
      setFixedAssignments(fixedAssignments.filter(a => a.id !== assignmentId));
      setMessage({ type: 'success', text: 'Assignment removed' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const renderUploadTab = () => (
    <div className="panel" style={{ maxWidth: '920px', margin: '0 auto' }}>
      <h2 style={{
        fontSize: '24px',
        fontWeight: 'bold',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <Upload size={24} />
        Upload Weekly Plan
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
            Excel File (.xlsx, .xls, .xlsm)
          </label>
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm"
            onChange={(e) => setFile(e.target.files[0])}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          />
          {file && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#059669' }}>
              Selected: {file.name}
            </p>
          )}
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
            Week Start Date (Must be Monday)
          </label>
          <DatePicker
            value={weekStart}
            onChange={(date) => setWeekStart(date)}
            placeholder="Select Monday"
          />
          {weekStart && !validateMonday(weekStart) && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertCircle size={16} />
              Warning: Selected date is not a Monday
            </p>
          )}
          {weekStart && validateMonday(weekStart) && (
            <p style={{ marginTop: '8px', fontSize: '14px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={16} />
              Valid Monday selected
            </p>
          )}
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '8px' }}>
            Action
          </label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              padding: '10px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px'
            }}
          >
            <option value="replace">Replace (Clear old data for this week)</option>
            <option value="append">Append (Keep old data)</option>
          </select>
        </div>
        
        <button
          onClick={handleFileUpload}
          disabled={loading || !file || !weekStart}
          style={{
            width: '100%',
            backgroundColor: loading || !file || !weekStart ? '#9ca3af' : '#2563eb',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            fontWeight: '600',
            border: 'none',
            cursor: loading || !file || !weekStart ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '16px'
          }}
        >
          {loading ? (
            <>
              <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
              Uploading...
            </>
          ) : (
            <>
              <Upload size={20} />
              Upload and Process
            </>
          )}
        </button>
      </div>
    </div>
  );

  const renderDriversTab = () => {
    const driverTypes = [
      { label: 'Full time', value: 'full_time' },
      { label: 'Reduced hours', value: 'reduced_hours' },
      { label: 'Part time', value: 'part_time' }
    ];
    return (
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={24} />
            Drivers ({drivers.length})
          </h2>
          <button
            onClick={() => fetchWeeklyData(weekStart)}
            disabled={!weekStart || loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: !weekStart || loading ? 0.5 : 1
            }}
          >
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        <div className="panel muted" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            Quick Add Driver
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <input
              type="text"
              placeholder="Name"
              value={newDriver.name}
              onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
              style={{ flex: '1', minWidth: '180px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <select
              value={newDriver.type}
              onChange={(e) => setNewDriver({ ...newDriver, type: e.target.value })}
              style={{ width: '160px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="">Type</option>
              {driverTypes.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Employment %"
              value={newDriver.employment_percentage}
              onChange={(e) => setNewDriver({ ...newDriver, employment_percentage: e.target.value })}
              style={{ width: '140px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Target HH:MM"
              value={newDriver.monthly_hours_target}
              onChange={(e) => setNewDriver({ ...newDriver, monthly_hours_target: e.target.value })}
              style={{ width: '140px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Worked HH:MM"
              value={newDriver.monthly_hours_worked}
              onChange={(e) => setNewDriver({ ...newDriver, monthly_hours_worked: e.target.value })}
              style={{ width: '140px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Remaining HH:MM"
              value={newDriver.monthly_hours_remaining}
              onChange={(e) => setNewDriver({ ...newDriver, monthly_hours_remaining: e.target.value })}
              style={{ width: '150px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Fixed (with school)"
              value={newDriver.fixed_route_with_school}
              onChange={(e) => setNewDriver({ ...newDriver, fixed_route_with_school: e.target.value })}
              style={{ minWidth: '200px', flex: '1', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Fixed (without school)"
              value={newDriver.fixed_route_without_school}
              onChange={(e) => setNewDriver({ ...newDriver, fixed_route_without_school: e.target.value })}
              style={{ minWidth: '200px', flex: '1', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <button
              onClick={handleDriverCreate}
              style={{
                padding: '10px 16px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              Add Driver
            </button>
          </div>
        </div>
        
        {drivers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
            <Users size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>No drivers found. Upload a weekly plan to get started.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Name</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Type</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Employment %</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Target Hours</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Worked</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Remaining</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Fixed (mS)</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Fixed (oS)</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers.map((driver, idx) => {
                  const isEditing = editingDriver === driver.driver_id;
                  return (
                    <tr key={driver.driver_id} style={{ borderTop: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td style={{ padding: '16px', fontWeight: '500' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={driverDraft?.name || ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, name: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          driver.name
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <select
                            value={driverDraft?.type || ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, type: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          >
                            <option value="">Select type</option>
                            {driverTypes.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            borderRadius: '12px',
                            backgroundColor: driver.details.type === 'full_time' ? '#d1fae5' : driver.details.type === 'reduced_hours' ? '#dbeafe' : '#f3f4f6',
                            color: driver.details.type === 'full_time' ? '#065f46' : driver.details.type === 'reduced_hours' ? '#1e40af' : '#374151'
                          }}>
                            {driver.details.type?.replace('_', ' ') || 'N/A'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <input
                            type="number"
                            value={driverDraft?.employment_percentage ?? ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, employment_percentage: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          <>
                            {driver.details.employment_percentage || 'N/A'}%
                          </>
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={driverDraft?.monthly_hours_target || ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, monthly_hours_target: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          driver.details.monthly_hours_target || 'N/A'
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={driverDraft?.monthly_hours_worked || ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, monthly_hours_worked: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          driver.details.monthly_hours_worked || 'N/A'
                        )}
                      </td>
                      <td style={{ padding: '16px', color: '#059669', fontWeight: '500' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={driverDraft?.monthly_hours_remaining || ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, monthly_hours_remaining: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          driver.details.monthly_hours_remaining || 'N/A'
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={driverDraft?.fixed_route_with_school || ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, fixed_route_with_school: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          driver.details.fixed_route_with_school || '-'
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={driverDraft?.fixed_route_without_school || ''}
                            onChange={(e) => setDriverDraft({ ...driverDraft, fixed_route_without_school: e.target.value })}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          driver.details.fixed_route_without_school || '-'
                        )}
                      </td>
                      <td style={{ padding: '16px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={saveDriverEdits}
                              style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={cancelDriverEdit}
                              style={{ background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}
                            >
                              <X size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteDriver(driver.driver_id)}
                              style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleDriverEdit(driver)}
                              style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteDriver(driver.driver_id)}
                              style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderRoutesTab = () => {
    const groupedRoutes = routes.reduce((acc, route) => {
      const date = route.date;
      if (!acc[date]) acc[date] = [];
      acc[date].push(route);
      return acc;
    }, {});

    const formatDate = (dateString) =>
      new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={24} />
            Routes ({routes.length})
          </h2>
          <button
            onClick={() => fetchWeeklyData(weekStart)}
            disabled={!weekStart || loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
        
        <div className="panel muted" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            Quick Add Route
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <input
              type="text"
              placeholder="Route name"
              value={newRoute.route_name}
              onChange={(e) => setNewRoute({ ...newRoute, route_name: e.target.value })}
              style={{ flex: '1', minWidth: '200px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <DatePicker
              value={newRoute.date}
              onChange={(date) => setNewRoute({ ...newRoute, date })}
              placeholder="Route date"
            />
            <select
              value={newRoute.day_of_week}
              onChange={(e) => setNewRoute({ ...newRoute, day_of_week: e.target.value })}
              style={{ width: '150px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="">Day of week</option>
              {DAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={newRoute.type}
              onChange={(e) => setNewRoute({ ...newRoute, type: e.target.value })}
              style={{ width: '150px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="">Type</option>
              {ROUTE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              type="number"
              step="0.1"
              placeholder="Duration hrs"
              value={newRoute.duration_hours}
              onChange={(e) => setNewRoute({ ...newRoute, duration_hours: e.target.value })}
              style={{ width: '140px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="number"
              step="0.1"
              placeholder="Di├ñten"
              value={newRoute.diaten}
              onChange={(e) => setNewRoute({ ...newRoute, diaten: e.target.value })}
              style={{ width: '140px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="VAD time"
              value={newRoute.vad_time}
              onChange={(e) => setNewRoute({ ...newRoute, vad_time: e.target.value })}
              style={{ width: '160px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Location"
              value={newRoute.location}
              onChange={(e) => setNewRoute({ ...newRoute, location: e.target.value })}
              style={{ flex: '1', minWidth: '180px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Duty code"
              value={newRoute.duty_code}
              onChange={(e) => setNewRoute({ ...newRoute, duty_code: e.target.value })}
              style={{ width: '140px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Duty name"
              value={newRoute.duty_name}
              onChange={(e) => setNewRoute({ ...newRoute, duty_name: e.target.value })}
              style={{ width: '160px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <button
              onClick={handleCreateRoute}
              style={{ padding: '10px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Add Route
            </button>
          </div>
        </div>

        {routes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
            <MapPin size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>No routes found. Upload a weekly plan to get started.</p>
          </div>
        ) : (
          <div>
            {Object.entries(groupedRoutes).sort().map(([date, dayRoutes]) => (
              <div key={date} style={{ marginBottom: '24px', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} />
                  {formatDate(date)}
                  <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 'normal' }}>({dayRoutes.length} routes)</span>
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                  {dayRoutes.map((route) => {
                    const isEditing = editingRoute === route.route_id;
                    return (
                      <div key={route.route_id} style={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <span style={{ fontWeight: '600', color: '#1e40af' }}>{route.route_name}</span>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{
                              padding: '2px 8px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              backgroundColor: route.details.type === 'regular' ? '#d1fae5' : route.details.type === 'saturday' ? '#e0e7ff' : '#fed7aa',
                              color: route.details.type === 'regular' ? '#065f46' : route.details.type === 'saturday' ? '#3730a3' : '#9a3412'
                            }}>
                              {route.details.type}
                            </span>
                            {isEditing ? (
                              <>
                                <button
                                  onClick={saveRouteEdits}
                                  style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                                >
                                  <Save size={14} />
                                </button>
                                <button
                                  onClick={cancelRouteEdit}
                                  style={{ background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                                >
                                  <X size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteRoute(route.route_id)}
                                  style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => handleRouteEdit(route)}
                                  style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteRoute(route.route_id)}
                                  style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
                            <input
                              type="text"
                              placeholder="Route name"
                              value={routeDraft?.route_name || ''}
                              onChange={(e) => setRouteDraft({ ...routeDraft, route_name: e.target.value })}
                              style={{ padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <select
                                value={routeDraft?.day_of_week || ''}
                                onChange={(e) => setRouteDraft({ ...routeDraft, day_of_week: e.target.value })}
                                style={{ flex: 1, padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                              >
                                <option value="">Day of week</option>
                                {DAY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                              <select
                                value={routeDraft?.type || ''}
                                onChange={(e) => setRouteDraft({ ...routeDraft, type: e.target.value })}
                                style={{ flex: 1, padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                              >
                                <option value="">Type</option>
                                {ROUTE_TYPE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="number"
                                step="0.1"
                                placeholder="Duration hrs"
                                value={routeDraft?.duration_hours ?? ''}
                                onChange={(e) => setRouteDraft({ ...routeDraft, duration_hours: e.target.value })}
                                style={{ flex: 1, padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                              />
                              <input
                                type="number"
                                step="0.1"
                                placeholder="Diaeten"
                                value={routeDraft?.diaten ?? ''}
                                onChange={(e) => setRouteDraft({ ...routeDraft, diaten: e.target.value })}
                                style={{ flex: 1, padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                              />
                            </div>
                            <input
                              type="text"
                              placeholder="VAD time"
                              value={routeDraft?.vad_time || ''}
                              onChange={(e) => setRouteDraft({ ...routeDraft, vad_time: e.target.value })}
                              style={{ padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                            />
                            <input
                              type="text"
                              placeholder="Location"
                              value={routeDraft?.location || ''}
                              onChange={(e) => setRouteDraft({ ...routeDraft, location: e.target.value })}
                              style={{ padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                placeholder="Duty code"
                                value={routeDraft?.duty_code || ''}
                                onChange={(e) => setRouteDraft({ ...routeDraft, duty_code: e.target.value })}
                                style={{ flex: 1, padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                              />
                              <input
                                type="text"
                                placeholder="Duty name"
                                value={routeDraft?.duty_name || ''}
                                onChange={(e) => setRouteDraft({ ...routeDraft, duty_name: e.target.value })}
                                style={{ flex: 1, padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: '14px', color: '#6b7280' }}>
                            {route.details.vad_time && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                <Clock size={14} />
                                VAD: {route.details.vad_time}
                              </div>
                            )}
                            {route.details.diaten && <div>Diaeten: {route.details.diaten}h</div>}
                            {route.details.duration_hours && <div>Dauer: {route.details.duration_hours}h</div>}
                            {route.details.location && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <MapPin size={14} />
                                {route.details.location}
                              </div>
                            )}
                            {route.details.duty_code && (
                              <div>Duty: {route.details.duty_code} {route.details.duty_name || ''}</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAvailabilityTab = () => {
    const sortedAvailability = [...availability].sort((a, b) => new Date(a.date) - new Date(b.date));
    return (
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={24} />
            Availability ({availability.length})
          </h2>
          <button
            onClick={() => fetchWeeklyData(weekStart)}
            disabled={!weekStart || loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="panel muted" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            Add Manual Availability
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <select
              value={newAvailability.driver_id}
              onChange={(e) => setNewAvailability({ ...newAvailability, driver_id: e.target.value })}
              style={{ minWidth: '220px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="">Select driver</option>
              {drivers.map((driver) => (
                <option key={driver.driver_id} value={String(driver.driver_id)}>{driver.name}</option>
              ))}
            </select>
            <DatePicker
              value={newAvailability.date}
              onChange={(date) => setNewAvailability({ ...newAvailability, date })}
              placeholder="Date"
            />
            <select
              value={newAvailability.available ? 'true' : 'false'}
              onChange={(e) => setNewAvailability({ ...newAvailability, available: e.target.value === 'true' })}
              style={{ width: '160px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="true">Available</option>
              <option value="false">Unavailable</option>
            </select>
            <input
              type="text"
              placeholder="Shift preference"
              value={newAvailability.shift_preference}
              onChange={(e) => setNewAvailability({ ...newAvailability, shift_preference: e.target.value })}
              style={{ minWidth: '200px', flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
              type="text"
              placeholder="Notes"
              value={newAvailability.notes}
              onChange={(e) => setNewAvailability({ ...newAvailability, notes: e.target.value })}
              style={{ minWidth: '200px', flex: 1, padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <button
              onClick={handleCreateAvailability}
              style={{ padding: '10px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Add Entry
            </button>
          </div>
        </div>

        {availability.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
            <Clock size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>No availability entries for this week.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Driver</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Shift Pref</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Notes</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedAvailability.map((record, idx) => {
                  const isEditing = editingAvailability === record.id;
                  const driverName = record.driver_name || drivers.find(d => d.driver_id === record.driver_id)?.name || 'Unknown';
                  return (
                    <tr key={record.id} style={{ borderTop: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td style={{ padding: '12px' }}>
                        {isEditing ? (
                          <select
                            value={String(availabilityDraft?.driver_id ?? record.driver_id)}
                            onChange={(e) => setAvailabilityDraft(prev => ({ ...(prev || { ...record }), driver_id: Number(e.target.value) }))}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          >
                            {drivers.map(driver => (
                              <option key={driver.driver_id} value={String(driver.driver_id)}>{driver.name}</option>
                            ))}
                          </select>
                        ) : (
                          driverName
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {isEditing ? (
                          <DatePicker
                            value={availabilityDraft?.date || record.date}
                            onChange={(date) => setAvailabilityDraft(prev => ({ ...(prev || { ...record }), date }))}
                          />
                        ) : (
                          record.date
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {isEditing ? (
                          <select
                            value={(availabilityDraft?.available ?? record.available) ? 'true' : 'false'}
                            onChange={(e) => setAvailabilityDraft(prev => ({ ...(prev || { ...record }), available: e.target.value === 'true' }))}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          >
                            <option value="true">Available</option>
                            <option value="false">Unavailable</option>
                          </select>
                        ) : (
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '999px',
                            backgroundColor: record.available ? '#dcfce7' : '#fee2e2',
                            color: record.available ? '#166534' : '#991b1b',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {record.available ? 'Available' : 'Unavailable'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={availabilityDraft?.shift_preference || record.shift_preference || ''}
                            onChange={(e) => setAvailabilityDraft(prev => ({ ...(prev || { ...record }), shift_preference: e.target.value }))}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          record.shift_preference || '-'
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={availabilityDraft?.notes || record.notes || ''}
                            onChange={(e) => setAvailabilityDraft(prev => ({ ...(prev || { ...record }), notes: e.target.value }))}
                            style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                          />
                        ) : (
                          record.notes || '-'
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={saveAvailabilityEdits}
                              style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={cancelAvailabilityEdit}
                              style={{ background: '#f3f4f6', color: '#111827', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer' }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAvailabilityEdit(record)}
                            style={{ color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderAssignmentsTab = () => {
    const assignmentRows = fixedAssignments.map((assignment) => {
      const driverName = assignment.driver_name || drivers.find(d => d.driver_id === assignment.driver_id)?.name || 'Unknown';
      const routeName = assignment.route_name || (assignment.route_id ? routes.find(r => r.route_id === assignment.route_id)?.route_name : null) || 'Unassigned';
      return { ...assignment, driverName, routeName };
    });
    return (
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={24} />
            Fixed Assignments ({assignmentRows.length})
          </h2>
          <button
            onClick={() => fetchWeeklyData(weekStart)}
            disabled={!weekStart || loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        <div className="panel muted" style={{ marginBottom: '24px' }}>
          <h3 style={{ fontWeight: '600', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            Create Assignment
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <select
              value={newAssignment.driver_id}
              onChange={(e) => setNewAssignment({ ...newAssignment, driver_id: e.target.value })}
              style={{ minWidth: '220px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="">Select driver</option>
              {drivers.map((driver) => (
                <option key={driver.driver_id} value={String(driver.driver_id)}>{driver.name}</option>
              ))}
            </select>
            <select
              value={newAssignment.route_id}
              onChange={(e) => setNewAssignment({ ...newAssignment, route_id: e.target.value })}
              style={{ minWidth: '220px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            >
              <option value="">Optional route</option>
              {routes.map((route) => (
                <option key={route.route_id} value={String(route.route_id)}>{route.route_name}</option>
              ))}
            </select>
            <DatePicker
              value={newAssignment.date}
              onChange={(date) => setNewAssignment({ ...newAssignment, date })}
              placeholder="Assignment date"
            />
            <button
              onClick={handleCreateAssignment}
              style={{ padding: '10px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
            >
              Assign
            </button>
          </div>
        </div>

        {assignmentRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
            <CheckCircle size={64} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>No fixed assignments yet.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Driver</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Route</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignmentRows.map((assignment, idx) => (
                  <tr key={assignment.id} style={{ borderTop: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? 'white' : '#f9fafb' }}>
                    <td style={{ padding: '12px', fontWeight: '500' }}>{assignment.driverName}</td>
                    <td style={{ padding: '12px' }}>{assignment.routeName}</td>
                    <td style={{ padding: '12px' }}>{assignment.date}</td>
                    <td style={{ padding: '12px' }}>
                      <button
                        onClick={() => handleDeleteAssignment(assignment.id)}
                        style={{ color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Trash2 size={16} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderChatbotTab = () => (
    <div className={`panel embed-wrapper ${chatFullscreen ? 'fullscreen' : ''}`} style={{ height: chatFullscreen ? '100%' : '80vh', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageCircle size={24} />
          Bubbleexplorer Chatbot
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pill" style={{ color: '#0f172a' }}>Embedded</span>
          <button className="ghost-button" onClick={() => setChatFullscreen(!chatFullscreen)}>
            {chatFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {chatFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </div>
      <p style={{ color: '#475569' }}>You can sign in and chat directly without leaving the console.</p>
      <div className="chatbot-frame">
        <iframe
          title="Bubbleexplorer Chatbot"
          src={CHATBOT_URL}
          allow="clipboard-write; microphone; camera"
        />
      </div>
    </div>
  );

  const renderSheetTab = () => (
    <div className={`panel embed-wrapper ${sheetFullscreen ? 'fullscreen' : ''}`} style={{ height: sheetFullscreen ? '100%' : '80vh', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileSpreadsheet size={24} />
          Weekly Plan Sheet
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <a className="pill" style={{ color: '#0f172a' }} href={SHEET_URL} target="_blank" rel="noreferrer">Open in new tab</a>
          <button className="ghost-button" onClick={() => setSheetFullscreen(!sheetFullscreen)}>
            {sheetFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {sheetFullscreen ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </div>
      <p style={{ color: '#475569' }}>Embedded Google Sheet view of the weekly plan.</p>
      <div className="chatbot-frame">
        <iframe
          title="Weekly Plan Sheet"
          src={SHEET_URL}
        />
      </div>
    </div>
  );

  const renderPlannerTab = () => {
    const unassignedByDate = groupUnassignedByDate(planningResult);
    const totalUnassigned = countUnassigned(unassignedByDate);
    const fixedFailuresByDate = groupFixedFailuresByDate(planningResult);
    const totalFixedFailures = countFixedFailures(fixedFailuresByDate);
    const hasPlannerResult = !!planningResult;
    const reasonStats = buildReasonCounts(unassignedByDate, fixedFailuresByDate);
    const maxReasonCount = reasonStats.length > 0 ? Math.max(...reasonStats.map((r) => r.count)) : 1;

    return (
      <div className="panel" style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ListChecks size={20} />
          <h3 style={{ margin: 0 }}>Planner & optimizer rules</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pill" style={{ color: '#0f172a' }}>Drag cards to reprioritize</span>
          <button className="ghost-button" onClick={() => { setRuleBlocks(DEFAULT_RULE_BLOCKS); setRuleLibrary(RULE_LIBRARY); }}>
            <RefreshCw size={14} />
            Reset defaults
          </button>
          <button className="primary-button" onClick={triggerPlanning} disabled={planningLoading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {planningLoading ? 'SendingΓÇª' : 'Send planning'}
          </button>
        </div>
      </div>
      <p style={{ color: '#475569', marginBottom: '14px' }}>
        Visualize the optimizer constraints as editable blocks. Reorder to show intent, add new rules, and capture notes from the Bubble chatbot alongside the planning endpoint.
      </p>

      <div style={{ display: 'inline-flex', gap: '8px', marginBottom: '14px' }}>
        <button
          className={`tab-button ${plannerView === 'rules' ? 'active' : ''}`}
          onClick={() => setPlannerView('rules')}
          style={{ padding: '8px 12px' }}
        >
          Rules & Endpoint
        </button>
        <button
          className={`tab-button ${plannerView === 'report' ? 'active' : ''}`}
          onClick={() => setPlannerView('report')}
          style={{ padding: '8px 12px' }}
        >
          Planner Report
        </button>
      </div>

      {plannerView === 'rules' && (
      <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(320px, 4fr)', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={18} />
                <h4 style={{ margin: 0 }}>Optimizer rule board</h4>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="ghost-button" onClick={() => setShowRuleComposer(!showRuleComposer)}>
                  <Sparkles size={14} />
                  {showRuleComposer ? 'Hide composer' : 'New rule'}
                </button>
              </div>
            </div>
            <p style={{ color: '#475569', margin: '8px 0 12px' }}>
              Based on the enhanced optimizer: weekly cap 48h, consecutive cap 36h, availability filters, fixed-first assignment, one route per driver per day, and capacity-weighted objectives.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              {ruleLibrary.map((rule) => (
                <button
                  key={rule.id}
                  className="ghost-button"
                  onClick={() => addRuleFromLibrary(rule.id)}
                  style={{ padding: '8px 10px' }}
                >
                  <Plus size={14} />
                  Add sample: {rule.title}
                </button>
              ))}
              <span className="pill" style={{ color: '#0f172a' }}>SamplesΓÇöask chatbot for more</span>
            </div>

            {showRuleComposer && (
              <div style={{ padding: '12px', borderRadius: '10px', background: '#fff', border: '1px dashed #cbd5e1', marginBottom: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Rule title</label>
                    <input
                      type="text"
                      className="input"
                      value={ruleDraft.title}
                      onChange={(e) => setRuleDraft({ ...ruleDraft, title: e.target.value })}
                      placeholder="e.g., Protect weekend capacity"
                      style={{ marginTop: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Tag</label>
                    <input
                      type="text"
                      className="input"
                      value={ruleDraft.tag}
                      onChange={(e) => setRuleDraft({ ...ruleDraft, tag: e.target.value })}
                      placeholder="priority, safety, custom"
                      style={{ marginTop: '6px' }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Description</label>
                  <textarea
                    className="input"
                    value={ruleDraft.description}
                    onChange={(e) => setRuleDraft({ ...ruleDraft, description: e.target.value })}
                    placeholder="Describe how this should influence assignments or constraints."
                    rows={3}
                    style={{ width: '100%', marginTop: '6px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button className="ghost-button" onClick={() => setShowRuleComposer(false)}>
                    <X size={14} />
                    Cancel
                  </button>
                  <button className="primary-button" onClick={addRuleBlock}>
                    <Plus size={14} />
                    Add rule
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              {ruleBlocks.map((rule) => (
                <div
                  key={rule.id}
                  className="panel-compact"
                  draggable
                  onDragStart={() => handleRuleDragStart(rule.id)}
                  onDragOver={(e) => handleRuleDragOver(e, rule.id)}
                  onDrop={handleRuleDrop}
                  style={{
                    cursor: 'grab',
                    border: draggingRuleId === rule.id ? '1px dashed #2563eb' : '1px solid #e2e8f0',
                    background: '#fff'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <GripVertical size={16} color="#94a3b8" />
                      <span className="pill" style={{ color: '#0f172a', textTransform: 'capitalize' }}>{rule.tag || 'rule'}</span>
                    </div>
                    <button className="ghost-button" onClick={() => removeRuleBlock(rule.id)} style={{ padding: '6px 8px' }}>
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                  <h4 style={{ margin: '10px 0 6px', fontSize: '16px' }}>{rule.title}</h4>
                  <p style={{ color: '#475569', lineHeight: 1.4 }}>{rule.description}</p>
                </div>
              ))}
              {ruleBlocks.length === 0 && (
                <div className="panel-compact" style={{ border: '1px dashed #cbd5e1', background: '#fff' }}>
                  <p style={{ color: '#475569' }}>No rules yet. Add one or reset to defaults to pull in the optimizer constraints.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="panel-compact" style={{ border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Settings size={18} />
              <h4 style={{ margin: 0 }}>Planning endpoint</h4>
            </div>
            <p style={{ color: '#475569', marginBottom: '12px' }}>Configure where the planner JSON is sent after upload confirmation.</p>
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Endpoint URL</label>
            <input
              type="text"
              className="input"
              value={planEndpoint}
              onChange={(e) => setPlanEndpoint(e.target.value)}
              style={{ width: '100%', marginBottom: '14px', marginTop: '6px' }}
            />
            <label style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Payload preview</label>
            <pre style={{ marginTop: '6px', background: '#0f172a', color: '#e2e8f0', padding: '12px', borderRadius: '10px', fontSize: '13px' }}>
{`POST ${planEndpoint}
Content-Type: application/json

{
  "week_start": "${weekStart || 'YYYY-MM-DD'}"
}`}
            </pre>
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              <button
                className="primary-button"
                onClick={triggerPlanning}
                disabled={planningLoading}
              >
                {planningLoading ? 'Sending...' : 'Send planning request'}
              </button>
            </div>
          </div>

          <div className="panel-compact" style={{ border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot size={18} />
                <h4 style={{ margin: 0 }}>Rule helper chatbot</h4>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="ghost-button" onClick={() => setRuleChatbotExpanded(!ruleChatbotExpanded)} style={{ padding: '6px 10px' }}>
                  {ruleChatbotExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  {ruleChatbotExpanded ? 'Dock' : 'Float'}
                </button>
                <button className="ghost-button" onClick={() => setShowRuleChatbot(!showRuleChatbot)} style={{ padding: '6px 10px' }}>
                  {showRuleChatbot ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  {showRuleChatbot ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <p style={{ color: '#475569', margin: '8px 0 10px' }}>
              Ask the Bubble chatbot to propose new constraints or descriptions, then drop them into the rule board.
            </p>
            {showRuleChatbot && !ruleChatbotExpanded && (
              <div className="chatbot-frame" style={{ height: '360px', marginTop: '8px' }}>
                <iframe
                  title="Rule helper chatbot"
                  src={CHATBOT_URL}
                  allow="clipboard-write; microphone; camera"
                />
              </div>
            )}
            {showRuleChatbot && ruleChatbotExpanded && (
              <div className="panel-compact" style={{ border: '1px dashed #cbd5e1', marginTop: '8px', background: '#fff' }}>
                <p style={{ color: '#475569', margin: 0 }}>Floating window is open on the right. Click ΓÇ£DockΓÇ¥ to bring it back here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {plannerView === 'rules' && showRuleChatbot && ruleChatbotExpanded && (
        <div
          style={{
            position: 'fixed',
            top: `${ruleChatbotPos.y}px`,
            left: `${ruleChatbotPos.x}px`,
            width: `${ruleChatbotSize.width}px`,
            height: `${ruleChatbotSize.height}px`,
            zIndex: 50,
            boxShadow: '0 18px 60px rgba(15,23,42,0.35)',
            borderRadius: '14px',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            background: '#fff'
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#0b1224', color: '#e2e8f0', cursor: 'grab' }}
            onMouseDown={(e) => startChatbotDrag(e, 'move')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={16} />
              <span style={{ fontWeight: 700 }}>Rule helper chatbot</span>
            </div>
            <button className="ghost-button" onClick={() => setRuleChatbotExpanded(false)} style={{ padding: '6px 10px', background: '#111827', color: '#e2e8f0', borderColor: '#334155' }}>
              <Minimize2 size={14} />
              Dock
            </button>
          </div>
          <div className="chatbot-frame" style={{ height: 'calc(100% - 12px)', position: 'relative' }}>
            <iframe
              title="Rule helper chatbot floating"
              src={CHATBOT_URL}
              allow="clipboard-write; microphone; camera"
            />
            <div
              style={{
                position: 'absolute',
                width: '16px',
                height: '16px',
                bottom: '6px',
                right: '6px',
                cursor: 'se-resize',
                background: '#0b1224',
                borderRadius: '4px'
              }}
              onMouseDown={(e) => startChatbotDrag(e, 'resize')}
            />
          </div>
        </div>
      )}
      </>
      )}

      {plannerView === 'report' && (
      <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '12px' }}>
        <div
          className="panel-compact"
          style={{ border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}
          onClick={() => { setActiveTab('planner'); setPlannerView('report'); setPendingPlannerScroll('unassigned'); }}
        >
          <p style={{ margin: 0, color: '#475569' }}>Unassigned routes</p>
          <h3 style={{ margin: '4px 0', color: totalUnassigned > 0 ? '#b91c1c' : '#0f172a' }}>
            {hasPlannerResult ? totalUnassigned : '—'}
          </h3>
          <p style={{ margin: 0, color: '#475569', fontSize: '13px' }}>From optimizer output</p>
        </div>
        <div
          className="panel-compact"
          style={{ border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}
          onClick={() => { setActiveTab('planner'); setPlannerView('report'); setPendingPlannerScroll('fixed'); }}
        >
          <p style={{ margin: 0, color: '#475569' }}>Fixed assignment failures</p>
          <h3 style={{ margin: '4px 0', color: totalFixedFailures > 0 ? '#b91c1c' : '#0f172a' }}>
            {hasPlannerResult ? totalFixedFailures : '—'}
          </h3>
          <p style={{ margin: 0, color: '#475569', fontSize: '13px' }}>Drivers that could not be locked</p>
        </div>
        <div className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <p style={{ margin: 0, color: '#475569' }}>Solver status</p>
          <h3 style={{ margin: '4px 0', color: '#0f172a' }}>
            {hasPlannerResult ? (planningResult?.solver_status || 'Unknown') : '—'}
          </h3>
          <p style={{ margin: 0, color: '#475569', fontSize: '13px' }}>
            {planningLastRun ? `Updated ${new Date(planningLastRun).toLocaleString()}` : 'Run planning to populate'}
          </p>
        </div>
        <div className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <p style={{ margin: 0, color: '#475569' }}>Week start</p>
          <h3 style={{ margin: '4px 0', color: '#0f172a' }}>
            {hasPlannerResult ? (planningResult?.week_start || weekStart || '—') : (weekStart || '—')}
          </h3>
          <p style={{ margin: 0, color: '#475569', fontSize: '13px' }}>Planner request scope</p>
        </div>
      </div>

      {hasPlannerResult && reasonStats.length > 0 && (
        <div className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#fff', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <BarChart size={16} />
            <h4 style={{ margin: 0 }}>Top blocker reasons</h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {reasonStats.map((r) => (
              <div key={r.reason}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a', fontSize: '14px' }}>
                  <span style={{ maxWidth: '70%' }}>{r.reason}</span>
                  <span style={{ color: '#475569' }}>{r.count}</span>
                </div>
                <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(8, (r.count / maxReasonCount) * 100)}%`,
                      background: '#fb923c',
                      height: '100%'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <div className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>
          <h4 style={{ margin: '0 0 8px', color: '#0f172a' }}>Assignment coverage</h4>
          <div style={{ marginBottom: '8px', color: '#475569', fontSize: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', background: '#22c55e', borderRadius: '4px', display: 'inline-block' }} />
              Assigned: {hasPlannerResult ? (planningResult?.total_assignments ?? Math.max(0, (planningResult?.total_routes || 0) - totalUnassigned)) : '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '4px', display: 'inline-block' }} />
              Unassigned: {hasPlannerResult ? totalUnassigned : '—'}
            </div>
          </div>
          <div style={{ height: '18px', background: '#e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            {hasPlannerResult ? (
              <div style={{ display: 'flex', height: '100%' }}>
                <div
                  style={{
                    width: `${Math.min(100, planningResult?.total_routes ? ((planningResult?.total_assignments ?? Math.max(0, planningResult.total_routes - totalUnassigned)) / planningResult.total_routes) * 100 : 0)}%`,
                    background: '#22c55e',
                    transition: 'width 0.2s ease'
                  }}
                />
                <div
                  style={{
                    width: `${Math.min(100, planningResult?.total_routes ? (totalUnassigned / planningResult.total_routes) * 100 : 0)}%`,
                    background: '#ef4444',
                    transition: 'width 0.2s ease'
                  }}
                />
              </div>
            ) : (
              <div style={{ width: '100%', height: '100%', background: '#e2e8f0' }} />
            )}
          </div>
        </div>
        <div className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#fff' }}>
          <h4 style={{ margin: '0 0 8px', color: '#0f172a' }}>Fixed assignment issues by day</h4>
          {hasPlannerResult && totalFixedFailures > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {Object.keys(fixedFailuresByDate).sort().map((dateKey) => {
                const count = fixedFailuresByDate[dateKey].length;
                const maxCount = Math.max(...Object.values(fixedFailuresByDate).map((list) => list.length));
                return (
                  <div key={dateKey}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#0f172a', fontSize: '13px' }}>
                      <span>{dateKey}</span>
                      <span style={{ color: '#b91c1c' }}>{count}</span>
                    </div>
                    <div style={{ height: '10px', background: '#fee2e2', borderRadius: '6px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.max(10, (count / (maxCount || 1)) * 100)}%`,
                          background: '#ef4444',
                          height: '100%'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, color: '#475569', fontSize: '14px' }}>No fixed assignment failures yet.</p>
          )}
        </div>
      </div>

      <div style={{ marginTop: '16px' }}>
        <div ref={unassignedSectionRef} className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Navigation2 size={18} />
              <h4 style={{ margin: 0 }}>Unassigned routes (optimizer)</h4>
            </div>
            {hasPlannerResult && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#0f172a', fontSize: '13px' }}>
                {planningResult?.solver_status && (
                  <span className="pill" style={{ background: '#e0f2fe', color: '#0f172a' }}>
                    Solver: {planningResult.solver_status}
                  </span>
                )}
                {planningResult?.week_start && (
                  <span className="pill" style={{ background: '#eef2ff', color: '#312e81' }}>
                    Week: {planningResult.week_start}
                  </span>
                )}
                {planningLastRun && (
                  <span className="pill" style={{ background: '#f1f5f9', color: '#0f172a' }}>
                    Updated: {new Date(planningLastRun).toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
          <p style={{ color: '#475569', margin: '6px 0 12px' }}>
            Routes the optimizer could not assign, grouped by day. This block is separate from the rule board so existing planner controls stay unchanged.
          </p>

          {!hasPlannerResult && (
            <div style={{ padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '10px', background: '#fff' }}>
              <p style={{ color: '#475569', margin: 0 }}>Send a planning request to pull unassigned routes from the optimizer.</p>
            </div>
          )}

          {hasPlannerResult && totalUnassigned === 0 && (
            <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#ecfdf3' }}>
              <p style={{ margin: 0, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} />
                All routes assigned. No unassigned items reported by the optimizer.
              </p>
            </div>
          )}

          {hasPlannerResult && totalUnassigned > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
              {Object.keys(unassignedByDate).sort().map((dateKey) => (
                <div key={dateKey} className="panel-compact" style={{ border: '1px solid #e5e7eb', background: '#fff' }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}
                    onClick={() => setExpandedUnassigned((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }))}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={16} />
                      <strong style={{ color: '#0f172a' }}>{dayLabel(dateKey)}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="pill" style={{ background: '#fef3c7', color: '#92400e' }}>
                        {unassignedByDate[dateKey].length} unassigned
                      </span>
                      <ChevronRight
                        size={16}
                        style={{
                          transform: expandedUnassigned[dateKey] === false ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.12s ease'
                        }}
                      />
                    </div>
                  </div>
                  {expandedUnassigned[dateKey] !== false && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {unassignedByDate[dateKey].map((route, idx) => (
                        <div key={`${dateKey}-${idx}`} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', background: '#f8fafc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Truck size={16} />
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{route.route_name}</span>
                            </div>
                            {route.route_id && (
                              <span className="pill" style={{ background: '#e2e8f0', color: '#0f172a' }}>ID: {route.route_id}</span>
                            )}
                          </div>
                          <div style={{ marginTop: '6px', color: '#475569', fontSize: '14px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                              <Clock size={14} />
                              <span>{formatDurationHours(route.duration_hours)} hrs</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                              <AlertCircle size={14} color="#b91c1c" style={{ marginTop: '2px' }} />
                              <span style={{ color: '#b91c1c' }}>{route.reason}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <div ref={fixedFailureSectionRef} className="panel-compact" style={{ border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} />
              <h4 style={{ margin: 0 }}>Fixed assignment failures</h4>
            </div>
            {hasPlannerResult && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#0f172a', fontSize: '13px' }}>
                <span className="pill" style={{ background: '#e2e8f0', color: '#0f172a' }}>{totalFixedFailures} issues</span>
              </div>
            )}
          </div>
          <p style={{ color: '#475569', margin: '6px 0 12px' }}>
            Driver/route pairs the optimizer could not lock due to constraints. Click a day to expand details.
          </p>

          {!hasPlannerResult && (
            <div style={{ padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '10px', background: '#fff' }}>
              <p style={{ color: '#475569', margin: 0 }}>Run planning to see fixed assignment issues.</p>
            </div>
          )}

          {hasPlannerResult && totalFixedFailures === 0 && (
            <div style={{ padding: '12px', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#ecfdf3' }}>
              <p style={{ margin: 0, color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={16} />
                All fixed assignments honored. No failures reported.
              </p>
            </div>
          )}

          {hasPlannerResult && totalFixedFailures > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
              {Object.keys(fixedFailuresByDate).sort().map((dateKey) => (
                <div key={dateKey} className="panel-compact" style={{ border: '1px solid #e5e7eb', background: '#fff' }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}
                    onClick={() => setExpandedFixedFailures((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }))}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={16} />
                      <strong style={{ color: '#0f172a' }}>{dayLabel(dateKey)}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="pill" style={{ background: '#fee2e2', color: '#b91c1c' }}>
                        {fixedFailuresByDate[dateKey].length} failed
                      </span>
                      <ChevronRight
                        size={16}
                        style={{
                          transform: expandedFixedFailures[dateKey] === false ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.12s ease'
                        }}
                      />
                    </div>
                  </div>
                  {expandedFixedFailures[dateKey] !== false && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {fixedFailuresByDate[dateKey].map((item, idx) => (
                        <div key={`${dateKey}-${idx}`} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', background: '#f8fafc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Truck size={16} />
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.route_name}</span>
                            </div>
                            {item.route_id && (
                              <span className="pill" style={{ background: '#e2e8f0', color: '#0f172a' }}>ID: {item.route_id}</span>
                            )}
                          </div>
                          <div style={{ marginTop: '6px', color: '#475569', fontSize: '14px' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                              <Users size={14} />
                              <span>Driver ID: {item.driver_id || 'Unknown'}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                              <AlertCircle size={14} color="#b91c1c" style={{ marginTop: '2px' }} />
                              <span style={{ color: '#b91c1c' }}>{item.reason}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      </>
      )}
    </div>
  );
  };

  const renderNotificationsTab = () => (
    <div className="panel" style={{ maxWidth: '720px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={20} />
          <h3 style={{ margin: 0 }}>Notifications</h3>
        </div>
         <div style={{ display: 'flex', gap: '8px' }}>
           <button className="ghost-button" onClick={fetchNotifications} disabled={notificationLoading}>
            {notificationLoading ? 'Loading...' : 'Refresh'}
           </button>
           <button className="ghost-button" onClick={() => setShowNotifSettings(true)}>
             <Settings size={14} />
             Settings
           </button>
         </div>
      </div>
      <p style={{ color: '#475569', marginBottom: '12px' }}>
        Incoming requests (driver, date, reason). Accept updates availability; reject moves to a rejected list. Use your API (Postman) to POST to {notificationEndpoint}.
      </p>
      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Response endpoint</label>
        <input
          type="text"
          className="input"
          value={notificationResponseEndpoint}
          onChange={(e) => setNotificationResponseEndpoint(e.target.value)}
          placeholder="Where to POST approval/rejection responses"
          style={{ width: '100%', marginTop: '6px' }}
        />
        <p style={{ color: '#6b7280', marginTop: '6px', fontSize: '13px' }}>
          Accept sends "approved". Rejection asks before sending; you can edit the message.
        </p>
      </div>

      <h4 style={{ margin: '12px 0 8px', color: '#0f172a' }}>Incoming</h4>
      {notifications.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No pending notifications.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {notifications.map((n, idx) => (
            <div
              key={`${n.id || idx}-${n.driver_name}-${n.date}`}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'center',
                background:
                  n.status === 'accepted'
                    ? '#ecfdf3'
                    : n.status === 'rejected'
                      ? '#fef2f2'
                      : '#fff',
                borderColor:
                  n.status === 'accepted'
                    ? '#4ade80'
                    : n.status === 'rejected'
                      ? '#fca5a5'
                      : '#e5e7eb'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#0f172a', textDecoration: n.status === 'rejected' ? 'line-through' : 'none' }}>
                    {n.driver_name || 'Unknown driver'}
                  </p>
                  {n.status && n.status !== 'pending' && (
                    <span
                      className="pill"
                      style={{
                        background: n.status === 'accepted' ? '#22c55e' : '#ef4444',
                        color: '#fff'
                      }}
                    >
                      {n.status}
                    </span>
                  )}
                </div>
                <p style={{
                  margin: '4px 0',
                  color: n.status === 'accepted' ? '#166534' : n.status === 'rejected' ? '#b91c1c' : '#475569',
                  fontSize: '14px',
                  textDecoration: n.status === 'rejected' ? 'line-through' : 'none'
                }}>
                  {`${n.date || 'No date'} -> ${n.reason || n.message || 'No reason provided'}`}
                </p>
                {n.responseMessage && (
                  <p style={{ margin: 0, color: '#334155', fontSize: '13px' }}>
                    Response sent: {n.responseMessage}
                  </p>
                )}
                {n.actual_message && (
                  <p style={{ margin: '4px 0 0', color: '#0f172a', fontSize: '13px' }}>
                    <button className="ghost-button" onClick={() => setPendingView(n)} style={{ padding: '4px 8px' }}>
                      View message
                    </button>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {n.status === 'pending' && (
                  <>
                    <button className="ghost-button" onClick={() => rejectNotification(n)} disabled={notificationLoading}>Reject</button>
                    <button className="primary-button" onClick={() => acceptNotification(n)} disabled={notificationLoading}>Accept</button>
                  </>
                )}
                {n.status !== 'pending' && (
                  <button className="ghost-button" disabled style={{ cursor: 'default' }}>
                    {n.status === 'accepted' ? 'Accepted' : 'Rejected'}
                  </button>
                )}
                <button className="ghost-button" onClick={() => deleteNotification(n)} disabled={notificationLoading}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}


      <h4 style={{ margin: '16px 0 8px', color: '#0f172a' }}>Accepted</h4>
      {acceptedNotifications.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No accepted notifications.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {acceptedNotifications.map((n, idx) => (
            <div
              key={`${n.id || idx}-${n.driver_name}-${n.date}-accepted`}
              style={{
                border: '1px solid #4ade80',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'center',
                background: '#ecfdf3'
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>{n.driver_name || 'Unknown driver'}</p>
                <p style={{ margin: '4px 0', color: '#166534', fontSize: '14px' }}>
                  {`${n.date || 'No date'} -> ${n.reason || n.message || 'No reason provided'}`}
                </p>
                {n.actual_message && (
                  <p style={{ margin: 0, color: '#0f172a', fontSize: '13px' }}>
                    <button className="ghost-button" onClick={() => setPendingView(n)} style={{ padding: '4px 8px' }}>
                      View message
                    </button>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="ghost-button" onClick={() => setAcceptedNotifications((prev) => prev.filter((x) => x !== n))}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ margin: '16px 0 8px', color: '#0f172a' }}>Rejected</h4>
      {rejectedNotifications.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No rejected notifications.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rejectedNotifications.map((n, idx) => (
            <div
              key={`${n.id || idx}-${n.driver_name}-${n.date}-rejected`}
              style={{
                border: '1px solid #fca5a5',
                borderRadius: '12px',
                padding: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                alignItems: 'center',
                background: '#fef2f2'
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, color: '#b91c1c', textDecoration: 'line-through' }}>
                  {n.driver_name || 'Unknown driver'}
                </p>
                <p style={{ margin: '4px 0', color: '#b91c1c', fontSize: '14px' }}>
                  {`${n.date || 'No date'} -> ${n.reason || n.message || 'No reason provided'}`}
                </p>
                {n.actual_message && (
                  <p style={{ margin: 0, color: '#0f172a', fontSize: '13px' }}>
                    <button className="ghost-button" onClick={() => setPendingView(n)} style={{ padding: '4px 8px' }}>
                      View message
                    </button>
                  </p>
                )}
                {n.responseMessage && (
                  <p style={{ margin: 0, color: '#334155', fontSize: '13px' }}>
                    Response sent: {n.responseMessage}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="ghost-button" onClick={() => setRejectedNotifications((prev) => prev.filter((x) => x !== n))}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );

  if (!authed) {
    return (
      <div className="app-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0b1224' }}>
        <div className="panel" style={{ width: '360px', boxShadow: '0 16px 48px rgba(0,0,0,0.25)' }}>
          <h2 style={{ marginBottom: '12px' }}>Sign in</h2>
          <p style={{ color: '#475569', marginBottom: '16px' }}>Enter the console credentials to continue.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              className="input"
              placeholder="Username"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
            />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
            />
            {loginError && <p style={{ color: '#dc2626', margin: 0 }}>{loginError}</p>}
            <button className="primary-button" onClick={handleLogin}>
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="hero-bar">
        <div className="hero-content">
          <div className="hero-top">
            <div>
              <div className="brand-row">
                <img
                  src="/bubble-logo.png"
                  alt="Bubble logo"
                  className="brand-logo"
                />
                <span className="eyebrow">Operations console</span>
              </div>
              <h1 className="hero-title">
                Driver Scheduling Management System
              </h1>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <img src="/hero-bus.jpg" alt="" className="hero-visual-img" />
            </div>
          </div>
        </div>
      </div>

      <div className="tabbar-panel">
        <div className="tab-strip">
          {NAV_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`tab-button ${activeTab === id ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(id);
                if (id !== 'upload' && weekStart && validateMonday(weekStart)) {
                  fetchWeeklyData(weekStart, true);
                }
              }}
            >
              <Icon size={16} />
              {label}
              {id === 'notifications' && notifications.some((n) => (n.status || 'pending') === 'pending') && (
                <span className="badge">
                  {notifications.filter((n) => (n.status || 'pending') === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="content-shell">
        <MessageBanner />
        <UnassignedWarningBanner />
        <div>
          {activeTab === 'upload' && renderUploadTab()}
          {activeTab === 'drivers' && renderDriversTab()}
          {activeTab === 'routes' && renderRoutesTab()}
          {activeTab === 'availability' && renderAvailabilityTab()}
          {activeTab === 'assignments' && renderAssignmentsTab()}
          {activeTab === 'planner' && renderPlannerTab()}
          {activeTab === 'notifications' && renderNotificationsTab()}
          <div style={{ display: activeTab === 'chatbot' ? 'block' : 'none' }}>
            {renderChatbotTab()}
          </div>
          <div style={{ display: activeTab === 'sheet' ? 'block' : 'none' }}>
            {renderSheetTab()}
          </div>
        </div>
      </div>

      <MessageToast />

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {pendingAccept && (
        <div className="modal-backdrop">
          <div className="modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <CheckCircle size={18} />
              <h3 style={{ margin: 0 }}>Confirm availability update</h3>
            </div>
            <p style={{ color: '#475569', marginBottom: '10px' }}>
              Select the driver and confirm details before marking unavailable.
            </p>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Driver</label>
                <select
                  className="input"
                  value={acceptForm.driverId}
                  onChange={(e) => setAcceptForm((f) => ({ ...f, driverId: e.target.value }))}
                  style={{ width: '100%', marginTop: '6px' }}
                >
                  <option value="">Select driver</option>
                  {drivers.map((d) => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Date</label>
                <input
                  type="date"
                  className="input"
                  value={acceptForm.date}
                  onChange={(e) => setAcceptForm((f) => ({ ...f, date: e.target.value }))}
                  style={{ width: '100%', marginTop: '6px' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Notes</label>
                <textarea
                  className="input"
                  rows={3}
                  value={acceptForm.notes}
                  onChange={(e) => setAcceptForm((f) => ({ ...f, notes: e.target.value }))}
                  style={{ width: '100%', marginTop: '6px' }}
                  placeholder="Reason or note"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="ghost-button" onClick={() => setPendingAccept(null)} disabled={notificationLoading}>
                Cancel
              </button>
              <button className="primary-button" onClick={handleAcceptConfirm} disabled={notificationLoading}>
                Confirm & accept
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRejection && (
        <div className="modal-backdrop">
          <div className="modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <AlertCircle size={18} />
              <h3 style={{ margin: 0 }}>Send rejection response?</h3>
            </div>
            <p style={{ color: '#475569', marginBottom: '8px' }}>
              Do you want to send a rejection message back? You can edit it below.
            </p>
            <textarea
              className="input"
              value={rejectionMessage}
              onChange={(e) => setRejectionMessage(e.target.value)}
              rows={3}
              style={{ width: '100%', marginBottom: '10px' }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="ghost-button" onClick={() => setPendingRejection(null)} disabled={notificationLoading}>
                Cancel
              </button>
              <button className="ghost-button" onClick={() => handleRejectionDecision(false)} disabled={notificationLoading}>
                Reject only
              </button>
              <button className="primary-button" onClick={() => handleRejectionDecision(true)} disabled={notificationLoading}>
                Send and reject
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingView && (
        <div className="modal-backdrop">
          <div className="modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <MessageCircle size={18} />
              <h3 style={{ margin: 0 }}>Notification message</h3>
            </div>
            <p style={{ color: '#475569', marginBottom: '12px' }}>
              {pendingView.driver_name || 'Driver'} — {pendingView.date || 'No date'}
            </p>
            <div style={{ background: '#0f172a', color: '#e2e8f0', padding: '12px', borderRadius: '10px', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
              {pendingView.actual_message || pendingView.message || pendingView.reason || 'No message provided.'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="primary-button" onClick={() => setPendingView(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlanningPrompt && (
        <div className="modal-backdrop">
          <div className="modal">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Settings size={18} />
              <h3 style={{ margin: 0 }}>Proceed with planning?</h3>
            </div>
            <p style={{ color: '#475569', marginBottom: '12px' }}>
              The weekly data has been uploaded and synced. Send the payload to the optimizer?
            </p>
            <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '12px', borderRadius: '10px', fontSize: '13px', marginBottom: '12px' }}>
{`POST ${planEndpoint}
Content-Type: application/json

{ "week_start": "${weekStart}" }`}
            </pre>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="ghost-button" onClick={() => setShowPlanningPrompt(false)} disabled={planningLoading}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={triggerPlanning}
                disabled={planningLoading}
              >
                {planningLoading ? 'SendingΓÇª' : 'Yes, send it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotifSettings && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '520px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={16} />
                <h3 style={{ margin: 0 }}>Notification settings</h3>
              </div>
              <button className="ghost-button" onClick={() => setShowNotifSettings(false)}>
                <X size={14} />
              </button>
            </div>
            <p style={{ color: '#475569', marginBottom: '12px' }}>
              Control auto-refresh for incoming notifications.
            </p>
            <div style={{ display: 'grid', gap: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: '#0f172a' }}>
                <input
                  type="checkbox"
                  checked={draftPollingEnabled}
                  onChange={(e) => setDraftPollingEnabled(e.target.checked)}
                />
                Enable auto-refresh
              </label>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>Refresh interval (ms)</label>
                <input
                  type="number"
                  className="input"
                  value={draftPollingInterval}
                  onChange={(e) => setDraftPollingInterval(Math.max(5000, Number(e.target.value) || 20000))}
                  style={{ width: '100%', marginTop: '6px' }}
                  min={5000}
                />
                <p style={{ color: '#6b7280', marginTop: '6px', fontSize: '13px' }}>
                  Minimum 5000 ms. Lower values increase polling frequency.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px' }}>
              <button className="ghost-button" onClick={() => setShowNotifSettings(false)}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setNotificationPollingEnabled(draftPollingEnabled);
                  setNotificationPollingInterval(Math.max(5000, Number(draftPollingInterval) || 20000));
                  setShowNotifSettings(false);
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverSchedulingSystem;
