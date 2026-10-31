// v63: tiny getMe without the pickers UI, so the chat start does not load me.js/pickers.js
const STORAGE_KEY = 'jeffa.me';
export function getMe() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {
      name: '',
      look: {
        typ: '',
        age: 25,
        hair: '',
        style: '',
        kleidung: '',
        besonderes: ''
      },
      notes: ''
    };
  } catch {
    return { name: '', look: {}, notes: '' };
  }
}

