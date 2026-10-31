const STORAGE_KEY = 'jeffa.settings';

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function isAdult() {
  return getSettings().adult === true;
}

export function setAdult(value) {
  if (value === true) {
    if (!confirm('Bestätigst du, dass du mindestens 18 Jahre alt bist?')) {
      return false;
    }
  }
  const settings = getSettings();
  settings.adult = value;
  saveSettings(settings);
  notifyListeners();
  return true;
}

const listeners = new Set();

export function onAdultChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners() {
  const adult = isAdult();
  listeners.forEach(cb => cb(adult));
}
