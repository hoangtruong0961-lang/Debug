import { dbService } from '../db/indexedDB';
import { WorldData, Entity } from '../../types';

// Registry definitions to allow React to connect to Tavo
export const tavoRegistry: {
  activeWorld: WorldData | null,
  updateWorld: ((data: Partial<WorldData>) => void) | null,
  getHistory: () => any[],
  updateHistory: ((history: any[]) => void) | null,
  generateText: ((prompt: string, options: any) => Promise<string>) | null,
  getInputValue: (() => string) | null,
  setInputValue: ((text: string) => void) | null,
  appendInputValue: ((text: string) => void) | null,
  clearInputValue: (() => void) | null,
  sendInput: (() => void) | null,
  showSelect: ((options: any, title?: string, defaultValue?: any) => Promise<any>) | null,
} = {
  activeWorld: null,
  updateWorld: null,
  getHistory: () => [],
  updateHistory: null,
  generateText: null,
  getInputValue: null,
  setInputValue: null,
  appendInputValue: null,
  clearInputValue: null,
  sendInput: null,
  showSelect: null,
};

// Internal utilities
function clone(obj: any) {
  return obj ? JSON.parse(JSON.stringify(obj)) : null;
}

const getPath = (obj: any, path: string) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const setPath = (obj: any, path: string, value: any) => {
  const parts = path.split('.');
  const last = parts.pop();
  if (!last) return;
  const target = parts.reduce((acc, part) => {
    if (!acc[part]) acc[part] = {};
    return acc[part];
  }, obj);
  target[last] = value;
};

const unsetPath = (obj: any, path: string) => {
  const parts = path.split('.');
  const last = parts.pop();
  if (!last) return;
  const target = parts.reduce((acc, part) => acc && acc[part], obj);
  if (target) delete target[last];
};

const getLocalList = async (key: string) => {
  return await dbService.getTavoData(key);
};
const setLocalList = async (key: string, list: any[]) => {
  await dbService.setTavoData(key, list);
};
const genId = () => crypto.randomUUID();

const simpleSearch = (list: any[], name: string, options: any = { match: 'exact' }) => {
  return list.filter(item => {
    if (!item || !item.name) return false;
    const itemN = String(item.name).toLowerCase();
    const q = name.toLowerCase();
    if (options.match === 'prefix') return itemN.startsWith(q);
    if (options.match === 'suffix') return itemN.endsWith(q);
    if (options.match === 'contains') return itemN.includes(q);
    return itemN === q;
  });
};

export const tavoApi = {
  memory: {
    current: async () => {
      const active = tavoRegistry.activeWorld;
      if (!active) return { id: Date.now(), enabled: false, memories: [] };
      const mem = active.extensions?.memory || { enabled: false, memories: [] };
      return { id: 1, ...clone(mem) };
    },
    update: async (mem: any) => {
      if (!tavoRegistry.updateWorld || !tavoRegistry.activeWorld) return mem;
      const extensions = clone(tavoRegistry.activeWorld.extensions || {});
      extensions.memory = {
        enabled: !!mem.enabled,
        memories: mem.memories || []
      };
      tavoRegistry.updateWorld({ extensions });
      return { id: 1, ...extensions.memory };
    }
  },
  get: async (name: string, scope: 'chat' | 'global' = 'chat') => {
    if (scope === 'global') {
      const settings = await dbService.getSettings();
      return settings?.tavoGlobalVars ? getPath(settings.tavoGlobalVars, name) : undefined;
    } else {
      if (!tavoRegistry.activeWorld) return undefined;
      const tavoVars = tavoRegistry.activeWorld.tavoVars || {};
      return getPath(tavoVars, name);
    }
  },

  set: async (name: string, value: any, scope: 'chat' | 'global' = 'chat') => {
    if (scope === 'global') {
      const settings = await dbService.getSettings();
      const updatedVars = settings?.tavoGlobalVars ? clone(settings.tavoGlobalVars) : {};
      setPath(updatedVars, name, value);
      await dbService.saveSettings({ ...settings, tavoGlobalVars: updatedVars } as any);
    } else {
      if (!tavoRegistry.activeWorld || !tavoRegistry.updateWorld) return;
      const tavoVars = tavoRegistry.activeWorld.tavoVars ? clone(tavoRegistry.activeWorld.tavoVars) : {};
      setPath(tavoVars, name, value);
      tavoRegistry.updateWorld({ tavoVars });
    }
  },

  unset: async (name: string, scope: 'chat' | 'global' = 'chat') => {
    if (scope === 'global') {
      const settings = await dbService.getSettings();
      const updatedVars = settings?.tavoGlobalVars ? clone(settings.tavoGlobalVars) : {};
      unsetPath(updatedVars, name);
      await dbService.saveSettings({ ...settings, tavoGlobalVars: updatedVars } as any);
    } else {
      if (!tavoRegistry.activeWorld || !tavoRegistry.updateWorld) return;
      const tavoVars = tavoRegistry.activeWorld.tavoVars ? clone(tavoRegistry.activeWorld.tavoVars) : {};
      unsetPath(tavoVars, name);
      tavoRegistry.updateWorld({ tavoVars });
    }
  },

  message: {
    find: async (indexRange: number | [number, number] | [number] | null, filter?: {role?: string, hidden?: boolean, characters?: any[]}) => {
      const history = tavoRegistry.getHistory();
      let start = 0;
      let end = history.length - 1;

      if (typeof indexRange === 'number') {
         const target = indexRange < 0 ? history.length + indexRange : indexRange;
         start = target;
         end = target;
      } else if (Array.isArray(indexRange)) {
         start = indexRange[0];
         end = indexRange.length > 1 ? indexRange[1] : history.length - 1;
      }

      if (start < 0) start = 0;
      if (end >= history.length) end = history.length - 1;

      const result = [];
      for (let i = start; i <= end; i++) {
        if (!history[i]) continue;
        const msg = clone(history[i]);
        msg.id = i;
        if (!msg.content && msg.text) msg.content = msg.text;
        
        let pass = true;
        if (filter?.role && msg.role !== filter.role) pass = false;
        // In our app we may not have hidden exactly, but we'll adapt
        if (filter?.hidden !== undefined && !!msg.hidden !== filter.hidden) pass = false;
        if (filter?.characters && (!msg.characterId || !filter.characters.includes(msg.characterId))) pass = false;
        
        if (pass) result.push(msg);
      }
      return result;
    },
    get: async (messageId: number) => {
       const history = tavoRegistry.getHistory();
       const msg = history[messageId] ? clone(history[messageId]) : null;
       if (msg) {
         msg.id = messageId;
         if (!msg.content && msg.text) msg.content = msg.text;
       }
       return msg;
    },
    current: async () => {
       // Return last message as fallback if we don't have current tracking mapped
       const history = tavoRegistry.getHistory();
       const id = history.length - 1;
       const msg = history[id] ? clone(history[id]) : null;
       if (msg) {
         msg.id = id;
         if (!msg.content && msg.text) msg.content = msg.text;
       }
       return msg;
    },
    count: async () => {
       return tavoRegistry.getHistory().length;
    },
    append: async (message: any) => {
       if (!tavoRegistry.updateHistory) return null;
       const history = clone(tavoRegistry.getHistory());
       history.push({
         role: message.role || 'assistant',
         text: message.content || '',
         content: message.content || '',
         timestamp: Date.now(),
         hidden: message.hidden || false,
         characterId: message.characterId,
       });
       tavoRegistry.updateHistory(history);
       return history.length - 1;
    },
    update: async (message: any) => {
       if (!tavoRegistry.updateHistory || message.id === undefined) return null;
       const history = clone(tavoRegistry.getHistory());
       if (!history[message.id]) return null;
       history[message.id].text = message.content !== undefined ? message.content : history[message.id].text;
       history[message.id].content = message.content !== undefined ? message.content : history[message.id].content;
       if (message.reasoning !== undefined) history[message.id].reasoning = message.reasoning;
       if (message.hidden !== undefined) history[message.id].hidden = message.hidden;
       tavoRegistry.updateHistory(history);
       return message.id;
    },
    delete: async (messageId: number) => {
       if (!tavoRegistry.updateHistory) return null;
       const history = clone(tavoRegistry.getHistory());
       if (!history[messageId]) return null;
       history.splice(messageId, 1);
       tavoRegistry.updateHistory(history);
       return messageId;
    }
  },

  chat: {
    current: async () => {
      const active = tavoRegistry.activeWorld;
      if (!active) return null;
      return {
        id: 1, // simplified
        name: active.world.worldName || 'Active World',
        characters: active.entities.filter(e => e.type === 'NPC'),
        persona: active.player,
        lorebooks: active.lorebook ? [{ id: 1, name: 'Lorebook' }] : [],
        regexes: active.extensions?.regex_scripts || [],
      };
    },
    update: async (chat: any) => {
      if (!tavoRegistry.updateWorld || !tavoRegistry.activeWorld) return;
      const dataToUpdate: Partial<WorldData> = {};
      const world = clone(tavoRegistry.activeWorld.world);
      if (chat.name) world.worldName = chat.name;
      dataToUpdate.world = world;

      if (chat.persona) {
         dataToUpdate.player = chat.persona;
      }
      
      if (chat.lorebooks && chat.lorebooks.length > 0) {
         // SillyTavern lorebook uses array of entries, we need to convert to Record if needed, but WorldData expects lorebook with Record
         const lb = chat.lorebooks[0];
         const entriesRecord: any = {};
         if (Array.isArray(lb.entries)) {
             lb.entries.forEach((e: any, i: number) => {
                 entriesRecord[e.identifier || String(i)] = e;
             });
         }
         dataToUpdate.lorebook = {
             name: lb.name || 'Imported',
             entries: entriesRecord
         };
      }
      
      if (chat.regexes) {
         const exts = clone(tavoRegistry.activeWorld.extensions || {});
         exts.regex_scripts = chat.regexes;
         dataToUpdate.extensions = exts;
      }

      tavoRegistry.updateWorld(dataToUpdate);
    }
  },

  character: {
    all: async () => {
      const active = tavoRegistry.activeWorld;
      if (!active) return [];
      return active.entities.filter(e => e.type === 'NPC').map((e: any) => {
         e.firstMes = e.description;
         return e;
      });
    },
    get: async (characterId: any) => {
      const active = tavoRegistry.activeWorld;
      if (!active) return null;
      const char = active.entities.find((e: any) => String(e.id) === String(characterId) || e.name === characterId);
      if (char) {
        (char as any).firstMes = char.description;
        return char;
      }
      return null;
    },
    find: async (name: string, options: any = { match: 'exact' }) => {
      const active = tavoRegistry.activeWorld;
      if (!active) return [];
      return active.entities.filter((e: any) => {
         if (e.type !== 'NPC') return false;
         if (options.match === 'prefix') return e.name.startsWith(name);
         if (options.match === 'suffix') return e.name.endsWith(name);
         if (options.match === 'contains') return e.name.includes(name);
         return e.name === name;
      }).map((e: any) => {
         e.firstMes = e.description;
         return e;
      });
    },
    create: async (character: any) => {
      if (!tavoRegistry.updateWorld || !tavoRegistry.activeWorld) return null;
      const entities = clone(tavoRegistry.activeWorld.entities || []);
      const newId = character.id || Date.now().toString();
      entities.push({
        id: newId,
        type: 'NPC',
        name: character.name,
        description: character.description || character.firstMes || '',
        avatar: character.avatar,
        firstMes: character.first_mes || character.firstMes,
        personality: character.personality,
      });
      tavoRegistry.updateWorld({ entities });
      return newId;
    },
    update: async (character: any) => {
      if (!tavoRegistry.updateWorld || !tavoRegistry.activeWorld) return null;
      const entities = clone(tavoRegistry.activeWorld.entities || []);
      const idx = entities.findIndex((e: any) => String(e.id) === String(character.id));
      if (idx !== -1) {
        entities[idx] = { ...entities[idx], ...character };
        tavoRegistry.updateWorld({ entities });
        return character.id;
      }
      return null;
    },
    import: async (card: any) => {
      const charName = card.name || card.char_name || "Nhân vật bí ẩn";
      const newCtx = {
        name: charName,
        description: card.char_persona || card.description || "",
        avatar: card.avatar,
        firstMes: card.first_mes || '',
        personality: card.personality || '',
        exampleMessages: card.mes_example || '',
      };
      
      const charId = await tavoApi.character.create(newCtx);
      let lorebookId = null;
      let regexId = null;

      if (card.character_book) {
        lorebookId = await tavoApi.lorebook.create({
          name: card.character_book.name || `Lorebook: ${charName}`,
          entries: card.character_book.entries || []
        });
      }

      const regexEntries = card.extensions?.regex_scripts || card.character_book?.extensions?.regex_scripts;
      if (regexEntries) {
         regexId = await tavoApi.regex.create({
            name: `Regex: ${charName}`,
            entries: regexEntries
         });
      }
      
      return { characterId: charId, lorebookId, regexId };
    },
    delete: async (characterId: any) => {
      if (!tavoRegistry.updateWorld || !tavoRegistry.activeWorld) return null;
      const entities = clone(tavoRegistry.activeWorld.entities || []);
      const idx = entities.findIndex((e: any) => String(e.id) === String(characterId));
      if (idx !== -1) {
        entities.splice(idx, 1);
        tavoRegistry.updateWorld({ entities });
        return characterId;
      }
      return null;
    }
  },

  persona: {
    all: async () => (await getLocalList('tavo_personas')).map((p: any) => ({ id: p.id, name: p.name })),
    get: async (id: any) => (await getLocalList('tavo_personas')).find((p: any) => String(p.id) === String(id)) || null,
    find: async (name: string, options: any) => simpleSearch(await getLocalList('tavo_personas'), name, options),
    create: async (persona: any) => {
      const list = await getLocalList('tavo_personas');
      const newId = persona.id || genId();
      list.push({ ...persona, id: newId });
      await setLocalList('tavo_personas', list);
      return newId;
    },
    update: async (persona: any) => {
      const list = await getLocalList('tavo_personas');
      const idx = list.findIndex((p: any) => String(p.id) === String(persona.id));
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...persona };
        await setLocalList('tavo_personas', list);
      }
    },
    delete: async (idOrObj: any) => {
      const id = typeof idOrObj === 'object' ? idOrObj.id : idOrObj;
      const list = await getLocalList('tavo_personas');
      const idx = list.findIndex((p: any) => String(p.id) === String(id));
      if (idx !== -1) {
        list.splice(idx, 1);
        await setLocalList('tavo_personas', list);
        return id;
      }
      return null;
    }
  },

  preset: {
    all: async () => (await getLocalList('tavo_presets')).map((p: any) => ({ id: p.id, name: p.name })),
    get: async (id: any) => (await getLocalList('tavo_presets')).find((p: any) => String(p.id) === String(id)) || null,
    find: async (name: string, options: any) => simpleSearch(await getLocalList('tavo_presets'), name, options),
    import: async (preset: any) => {
      const c = window.confirm('Import this preset?');
      if (!c) return null;
      const list = await getLocalList('tavo_presets');
      const newId = preset.id || genId();
      list.push({ ...preset, id: newId, name: preset.name || 'Preset' });
      await setLocalList('tavo_presets', list);
      return newId;
    },
    create: async (preset: any) => {
      const list = await getLocalList('tavo_presets');
      const newId = preset.id || genId();
      list.push({ ...preset, id: newId });
      await setLocalList('tavo_presets', list);
      return newId;
    },
    update: async (preset: any) => {
      const list = await getLocalList('tavo_presets');
      const idx = list.findIndex((p: any) => String(p.id) === String(preset.id));
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...preset };
        await setLocalList('tavo_presets', list);
      }
    },
    delete: async (idOrObj: any) => {
      const id = typeof idOrObj === 'object' ? idOrObj.id : idOrObj;
      const list = await getLocalList('tavo_presets');
      const idx = list.findIndex((p: any) => String(p.id) === String(id));
      if (idx !== -1) {
        list.splice(idx, 1);
        await setLocalList('tavo_presets', list);
        return id;
      }
      return null;
    }
  },

  lorebook: {
    all: async () => (await getLocalList('tavo_lorebooks')).map((p: any) => ({ id: p.id, name: p.name, entries: p.entries?.length || 0 })),
    get: async (id: any) => (await getLocalList('tavo_lorebooks')).find((p: any) => String(p.id) === String(id)) || null,
    find: async (name: string, options: any) => simpleSearch(await getLocalList('tavo_lorebooks'), name, options),
    import: async (lorebook: any) => {
      const c = window.confirm('Import this lorebook?');
      if (!c) return null;
      const list = await getLocalList('tavo_lorebooks');
      const newId = lorebook.id || genId();
      list.push({ ...lorebook, id: newId });
      await setLocalList('tavo_lorebooks', list);
      return newId;
    },
    create: async (lorebook: any) => {
      const list = await getLocalList('tavo_lorebooks');
      const newId = lorebook.id || genId();
      list.push({ ...lorebook, id: newId });
      await setLocalList('tavo_lorebooks', list);
      return newId;
    },
    update: async (lorebook: any) => {
      const list = await getLocalList('tavo_lorebooks');
      const idx = list.findIndex((p: any) => String(p.id) === String(lorebook.id));
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...lorebook };
        await setLocalList('tavo_lorebooks', list);
      }
    },
    delete: async (idOrObj: any) => {
      const id = typeof idOrObj === 'object' ? idOrObj.id : idOrObj;
      const list = await getLocalList('tavo_lorebooks');
      const idx = list.findIndex((p: any) => String(p.id) === String(id));
      if (idx !== -1) {
        list.splice(idx, 1);
        await setLocalList('tavo_lorebooks', list);
        return id;
      }
      return null;
    }
  },

  regex: {
    all: async () => (await getLocalList('tavo_regex')).map((p: any) => ({ id: p.id, name: p.name, entries: p.entries?.length || 0 })),
    get: async (id: any) => (await getLocalList('tavo_regex')).find((p: any) => String(p.id) === String(id)) || null,
    find: async (name: string, options: any) => simpleSearch(await getLocalList('tavo_regex'), name, options),
    import: async (regex: any) => {
      const c = window.confirm('Import this regex group?');
      if (!c) return null;
      const list = await getLocalList('tavo_regex');
      const newId = regex.id || genId();
      list.push({ ...regex, id: newId, name: regex.name || 'Regex' });
      await setLocalList('tavo_regex', list);
      return newId;
    },
    create: async (regex: any) => {
      const list = await getLocalList('tavo_regex');
      const newId = regex.id || genId();
      list.push({ ...regex, id: newId, entries: regex.entries || [] });
      await setLocalList('tavo_regex', list);
      return newId;
    },
    update: async (regex: any) => {
      const list = await getLocalList('tavo_regex');
      const idx = list.findIndex((p: any) => String(p.id) === String(regex.id));
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...regex };
        await setLocalList('tavo_regex', list);
      }
    },
    delete: async (idOrObj: any) => {
      const id = typeof idOrObj === 'object' ? idOrObj.id : idOrObj;
      const list = await getLocalList('tavo_regex');
      const idx = list.findIndex((p: any) => String(p.id) === String(id));
      if (idx !== -1) {
        list.splice(idx, 1);
        await setLocalList('tavo_regex', list);
        return id;
      }
      return null;
    }
  },

  generate: async (prompt: string, options: any = {}) => {
    if (!tavoRegistry.generateText) {
      throw new Error("Generation API is not available in current context.");
    }
    return await tavoRegistry.generateText(prompt, options);
  },

  input: {
    get: async () => tavoRegistry.getInputValue ? tavoRegistry.getInputValue() : '',
    set: (text: string) => tavoRegistry.setInputValue && tavoRegistry.setInputValue(text),
    append: (text: string) => tavoRegistry.appendInputValue && tavoRegistry.appendInputValue(text),
    clear: () => tavoRegistry.clearInputValue && tavoRegistry.clearInputValue(),
    send: () => tavoRegistry.sendInput && tavoRegistry.sendInput(),
  },

  utils: {
    toast: (msg: string) => {
      // Just console.log or fire an event if toast component exists
      console.log('TAVO TOAST:', msg);
      // We can create a simple visually toast component here
      const el = document.createElement('div');
      el.textContent = msg;
      Object.assign(el.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.8)',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '5px',
        zIndex: '9999',
        fontSize: '14px',
      });
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    },
    openUrl: (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    export: (name: string, data: string) => {
      const content = data;
      // Trả lại btoa buffer nếu data là encode base64
      let isBase64 = false;
      try {
        if (/^[A-Za-z0-9+/=]+$/.test(data)) {
           atob(data); // check valid base64
           isBase64 = true;
        }
      } catch (e) {
        // Ignored empty catch block
      }

      let url;
      if (isBase64) {
          const byteCharacters = atob(data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], {type: 'application/octet-stream'});
          url = URL.createObjectURL(blob);
      } else {
          const blob = new Blob([content], { type: 'text/plain' });
          url = URL.createObjectURL(blob);
      }
      
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
    select: async (options: any[], title?: string, defaultValue?: any) => {
      if (tavoRegistry.showSelect) {
        return await tavoRegistry.showSelect(options, title, defaultValue);
      }
      // DOM-based fallback dialog
      return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.className = "bg-slate-900 border border-slate-700 rounded-xl shadow-xl w-[90%] max-w-sm p-4 backdrop:bg-black/80 text-slate-200 outline-none";
        
        const h3 = document.createElement('h3');
        h3.className = "font-bold text-lg mb-4 text-center";
        h3.textContent = title || "Chọn một kết quả";
        dialog.appendChild(h3);

        const list = document.createElement('div');
        list.className = "flex flex-col gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar";
        
        options.forEach(opt => {
           const val = typeof opt === 'object' ? opt.value : opt;
           const lab = typeof opt === 'object' ? opt.label : opt;
           const isSel = val === defaultValue;
           const btn = document.createElement('button');
           btn.className = `w-full text-left px-4 py-3 rounded-lg flex items-center transition-colors ${isSel ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/50' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'}`;
           btn.innerHTML = `<span class="flex-1">${lab || val}</span> ${isSel ? `<span class="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">Default</span>` : ''}`;
           btn.onclick = () => {
              dialog.close();
              dialog.remove();
              resolve(val);
           };
           list.appendChild(btn);
        });
        
        dialog.appendChild(list);

        const closeBtn = document.createElement('button');
        closeBtn.className = "mt-4 w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 text-sm font-medium transition-colors";
        closeBtn.textContent = "Hủy bỏ";
        closeBtn.onclick = () => {
           dialog.close();
           dialog.remove();
           resolve(null);
        };
        dialog.appendChild(closeBtn);

        document.body.appendChild(dialog);
        dialog.showModal();
      });
    }
  }
};

if (typeof window !== 'undefined') {
  (window as any).tavo = tavoApi;
}
