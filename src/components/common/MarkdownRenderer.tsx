
import React, { useMemo, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Terminal, Code, RotateCcw, Wrench } from 'lucide-react';
import { RegexScript } from '../../types';
import { getRegexedString } from '../../utils/regex';
import { dbService } from '../../services/db/indexedDB';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  regexScripts?: RegexScript[];
  userName?: string;
  charName?: string;
  messageRole?: 'user' | 'assistant' | 'system';
  depth?: number;
}

const MemoizedTawaWidget = React.memo(({ children }: any) => {
  const base64Html = children?.toString() || '';
  if (!base64Html) return null;
  let decoded = '';
  try {
    if (typeof atob !== 'undefined') {
        decoded = decodeURIComponent(escape(atob(base64Html)));
    } else {
        decoded = Buffer.from(base64Html, 'base64').toString('utf-8');
    }
    
    // Inject TawaAPI Bridge
    const bridgeScript = `<script>
      window.TawaAPI = {
        sendAction: function(action, payload) {
          window.parent.postMessage({ type: 'TAWA_WIDGET_ACTION', action: action, payload: payload }, '*');
        }
      };
    </script>`;
    
    if (decoded.includes('<head>')) {
        decoded = decoded.replace('<head>', '<head>' + bridgeScript);
    } else {
        decoded = bridgeScript + decoded;
    }
  } catch (e) {
    console.error("Lỗi decode HTML widget:", e);
    return <div className="p-4 border border-red-500 text-red-500 rounded bg-red-500/10 text-xs">Error decoding widget</div>;
  }
  return (
    <div className="w-full my-6 bg-stone-900 rounded-xl overflow-hidden border-2 border-stone-700 shadow-xl">
      <iframe 
        srcDoc={decoded} 
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
        className="w-full min-h-[600px] resize-y border-0"
        title="Tawa Protocol Custom Widget"
      />
    </div>
  );
});

const extractText = (node: any): string => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props && node.props.children) return extractText(node.props.children);
  return '';
};

const sanitizeProps = (p: any) => {
  if (!p) return {};
  const finalProps: any = {};
  for (const key in p) {
    if (key === 'node') continue;
    // Remove event handlers that are strings (from HTML)
    if (key.startsWith('on') && typeof p[key] === 'string') continue;
    // Remove malformed attributes containing quotes
    if (key.includes('"') || key.includes("'")) continue;
    finalProps[key] = p[key];
  }
  return finalProps;
};

const TagBadge = ({ label, value, bg }: { label: string, value: string, bg: string }) => (
  <div className={`px-2 py-1 rounded inline-flex items-center gap-1.5 ${bg} border border-black/10 dark:border-white/10 text-[10px] font-mono mr-1 mb-1 whitespace-nowrap`}>
    <span className="font-bold opacity-60 uppercase">{label}</span>
    <span className="font-bold">{value}</span>
  </div>
);

const markdownComponents: import('react-markdown').Components = {
  p: ({ children }) => <div className="mb-4 leading-relaxed">{children}</div>,
  h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6 text-mystic-accent">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5 text-mystic-accent/90">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4 text-mystic-accent/80">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-6 mb-4 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-4 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-sm">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-mystic-accent/30 pl-4 py-1 my-4 italic bg-stone-200/30 dark:bg-slate-800/30 rounded-r">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="px-1.5 py-0.5 bg-stone-300/50 dark:bg-slate-700/50 rounded font-mono text-xs">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="p-4 bg-stone-900 text-stone-100 rounded-lg overflow-x-auto my-4 text-xs font-mono">
      {children}
    </pre>
  ),
  script: ({ children, src, ...props }: any) => {
    const code = Array.isArray(children) ? children.join('\n') : children;
    
    // Instead of RegexScriptExecutor, we render an iframe with srcDoc
    let decoded = `<script>
${code}
</script>`;
    if (src) {
        decoded = `<script src="${src}"></script>\n` + decoded;
    }

    const fullDoc = `
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; font-family: sans-serif; }
          </style>
          <script>
            window.TawaAPI = {
              sendAction: function(action, payload) {
                window.parent.postMessage({ type: 'TAWA_WIDGET_ACTION', action: action, payload: payload }, '*');
              }
            };
          </script>
        </head>
        <body>
          ${decoded}
        </body>
      </html>
    `;

    return (
      <iframe
        title="Regex Script Executor"
        srcDoc={fullDoc}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
        style={{
          width: '100%',
          minHeight: '200px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          marginTop: '16px',
          marginBottom: '16px'
        }}
        {...props}
      />
    );
  },
  style: ({ children, ...props }: any) => {
    const code = Array.isArray(children) ? children.join('\n') : children;
    
    // Quick regex-based CSS scoping: 
    // This looks for CSS selectors before '{' and prefixes them with our wrapper ID.
    // It ignores @media, @keyframes, and percentage stops.
    let scopedCode = code || '';
    if (props['data-scoper']) {
       scopedCode = scopedCode.replace(/([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/gi, (match: string) => {
          const trimmed = match.trim();
          if (trimmed.startsWith('@') || trimmed.match(/^[0-9]+%|^from|^to/i)) return match;
          
          return match.split(',').map(s => `#${props['data-scoper']} ${s.trim()}`).join(', ') + (match.endsWith('{') ? ' {' : '');
       });
    }

    return <style {...props} dangerouslySetInnerHTML={{ __html: scopedCode }} />;
  },
  table: ({ children }) => (
    <div className="overflow-x-auto my-6">
      <table className="min-w-full border-collapse border border-stone-300 dark:border-slate-700">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-stone-300 dark:border-slate-700 px-4 py-2 bg-stone-200 dark:bg-slate-800 font-bold text-left text-xs uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-stone-300 dark:border-slate-700 px-4 py-2 text-sm">
      {children}
    </td>
  ),
  hr: () => <hr className="my-8 border-t border-stone-300 dark:border-slate-700" />,
  strong: ({ children }) => <strong className="font-bold text-mystic-accent/80">{children}</strong>,
  em: ({ children }) => <em className="italic opacity-90">{children}</em>,
  a: ({ href, children, ...props }) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer" 
      className="text-mystic-accent hover:underline decoration-mystic-accent/30 underline-offset-2"
      {...sanitizeProps(props)}
    >
      {children}
    </a>
  ),
  // === Regex HTML Elements Support ===
  input: ({ node, ...props }: any) => {
    if (props.type === 'checkbox' || props.type === 'radio') {
      return <input className="w-4 h-4 text-mystic-accent bg-stone-100 border-gray-300 rounded focus:ring-mystic-accent dark:bg-slate-700 dark:border-gray-600 cursor-pointer" {...sanitizeProps(props)} />;
    }
    if (props.type === 'hidden') {
      return <input {...sanitizeProps(props)} className="hidden" />;
    }
    return <input className="px-3 py-2 bg-white dark:bg-slate-800 border border-stone-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-mystic-accent focus:border-mystic-accent sm:text-sm text-stone-900 dark:text-stone-100" {...sanitizeProps(props)} />;
  },
  select: ({ node, ...props }: any) => (
    <select className="px-3 py-2 bg-white dark:bg-slate-800 border border-stone-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-mystic-accent focus:border-mystic-accent sm:text-sm text-stone-900 dark:text-stone-100 cursor-pointer" {...sanitizeProps(props)}>
      {props.children}
    </select>
  ),
  option: ({ node, ...props }: any) => <option {...sanitizeProps(props)}>{props.children}</option>,
  textarea: ({ node, ...props }: any) => (
    <textarea className="px-3 py-2 bg-white dark:bg-slate-800 border border-stone-300 dark:border-slate-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-mystic-accent focus:border-mystic-accent sm:text-sm w-full min-h-[80px] text-stone-900 dark:text-stone-100 resize-y" {...sanitizeProps(props)} />
  ),
  button: ({ node, ...props }: any) => (
    <button className="px-4 py-2 bg-mystic-accent text-white font-medium rounded shadow hover:bg-mystic-accent/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-mystic-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" {...sanitizeProps(props)}>
      {props.children}
    </button>
  ),
  div: ({ node, className, ...props }: any) => (
    <div className={className} {...sanitizeProps(props)}>{props.children}</div>
  ),
  span: ({ node, className, ...props }: any) => (
    <span className={className} {...sanitizeProps(props)}>{props.children}</span>
  ),
  form: ({ node, ...props }: any) => (
    <form className="space-y-4 my-4 p-4 border border-stone-200 dark:border-slate-700 rounded-lg bg-stone-50 dark:bg-slate-800/20" {...sanitizeProps(props)}>
      {props.children}
    </form>
  ),
  label: ({ node, className, ...props }: any) => (
    <label className={`block text-sm font-medium text-stone-700 dark:text-stone-300 ${className || 'mb-1'}`} {...sanitizeProps(props)}>
      {props.children}
    </label>
  ),
  details: ({ node, ...props }: any) => (
    <details className="mb-4 border border-stone-300 dark:border-slate-700 rounded-md p-3 bg-stone-50 dark:bg-slate-800/50 group" {...sanitizeProps(props)}>
      {props.children}
    </details>
  ),
  summary: ({ node, ...props }: any) => (
    <summary className="font-semibold cursor-pointer text-stone-800 dark:text-stone-200 group-open:mb-2 hover:text-mystic-accent transition-colors" {...sanitizeProps(props)}>
      {props.children}
    </summary>
  ),
  // === /Regex HTML Elements Support ===
  think: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  thinking: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  content: ({ children, ...props }: any) => <div className="mb-4" {...sanitizeProps(props)}>{children}</div>,
  story: ({ children, ...props }: any) => <div className="mb-4" {...sanitizeProps(props)}>{children}</div>,
  branches: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  choices: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  actions: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  snow: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  ice: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  prologue: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  novel_header: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  novel_state: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  author_note: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  incrementalSummary: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  table_stored: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  tableEdit: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  user_input: ({ children }) => <span className="hidden" aria-hidden="true">{children}</span>,
  hc: ({ children, ...props }: any) => <span className="hidden" aria-hidden="true" {...sanitizeProps(props)}>{children}</span>,
  muttering: ({ children, ...props }: any) => <span className="italic text-[11px] opacity-75" {...sanitizeProps(props)}>{children}</span>,
  quote: ({ children, ...props }: any) => <blockquote className="border-l-4 border-mystic-accent/30 pl-4 py-2 my-4 italic bg-stone-200/30 dark:bg-slate-800/30 rounded-r" {...sanitizeProps(props)}>{children}</blockquote>,
  dice: ({ children, ...props }: any) => <span className="font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30" {...sanitizeProps(props)}>🎲 {children}</span>,
  
  font: ({ color, children, ...props }: any) => <span style={{ color: color || undefined }} {...sanitizeProps(props)}>{children}</span>,
  
  time: ({ children, ...props }: any) => (
    <div className="font-mono text-xs text-center text-stone-500 dark:text-stone-400 py-2 border-y border-stone-200 dark:border-slate-700/50 my-4" {...sanitizeProps(props)}>
      {children}
    </div>
  ),

  equip: ({ children, ...props }: any) => (
    <div className="my-4 border border-blue-500/30 bg-blue-500/10 rounded-lg p-4 shadow-sm" {...sanitizeProps(props)}>
      <div className="flex items-center gap-2 mb-2 font-bold text-blue-500 uppercase text-xs tracking-wider">
        🛡️ Trang Bị / Vật Phẩm
      </div>
      <div className="text-sm font-medium whitespace-pre-wrap text-stone-800 dark:text-stone-200">
        {children}
      </div>
    </div>
  ),
  swordskill: ({ children, ...props }: any) => (
    <div className="my-4 border border-red-500/30 bg-red-500/10 rounded-lg p-4 shadow-sm" {...sanitizeProps(props)}>
      <div className="flex items-center gap-2 mb-2 font-bold text-red-500 uppercase text-xs tracking-wider">
        ⚔️ Kiếm Kỹ / Kỹ Năng
      </div>
      <div className="text-sm font-medium whitespace-pre-wrap text-stone-800 dark:text-stone-200">
        {children}
      </div>
    </div>
  ),
  'user-status': ({ children, ...props }: any) => (
    <div className="my-4 border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-4 shadow-sm" {...sanitizeProps(props)}>
      <div className="flex items-center gap-2 mb-2 font-bold text-emerald-600 dark:text-emerald-400 uppercase text-xs tracking-wider">
        👤 Bảng Trạng Thái
      </div>
      <div className="text-sm whitespace-pre-wrap text-stone-800 dark:text-stone-200">
        {children}
      </div>
    </div>
  ),
  calendar: ({ children, ...props }: any) => {
    const text = extractText(children);
    
    // Parse pseudo-YAML calendar
    let year = '', month = '', day = '';
    const events: {day: string, text: string}[] = [];
    
    const lines = text.split('\n');
    let parsingDays = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith('year:')) year = trimmed.split(':')[1].trim();
      else if (trimmed.startsWith('month:')) month = trimmed.split(':')[1].trim();
      else if (trimmed.startsWith('current_day:')) day = trimmed.split(':')[1].trim();
      else if (trimmed.startsWith('days:')) parsingDays = true;
      else if (parsingDays) {
        const colonIdx = trimmed.indexOf(':');
        if (colonIdx > 0 && colonIdx < 10) { // e.g., "6:" or "12:"
           const d = trimmed.substring(0, colonIdx).trim();
           const eventText = trimmed.substring(colonIdx + 1).trim();
           events.push({ day: d, text: eventText });
        } else if (events.length > 0) {
           events[events.length - 1].text += ' ' + trimmed;
        }
      }
    }
    
    if (year || month || day || events.length > 0) {
      return (
        <div className="my-4 border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl p-0 overflow-hidden shadow-sm" {...sanitizeProps(props)}>
          <div className="bg-purple-500/10 px-4 py-3 flex items-center justify-between border-b border-purple-500/20">
            <div className="flex items-center gap-2 font-bold text-purple-600 dark:text-purple-400 uppercase text-xs tracking-wider">
              <i className="fas fa-calendar-alt"></i> Lịch Trình
            </div>
            {(year || month || day) && (
              <div className="text-[10px] font-black uppercase tracking-widest bg-purple-500/20 text-purple-700 dark:text-purple-300 px-2.5 py-1 rounded">
                Ngày {day}/{month}/{year}
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            {events.map((e, i) => {
              const isCurrent = e.day === day;
              return (
                <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border transition-colors ${isCurrent ? 'bg-purple-500/20 border-purple-500/40' : 'bg-stone-500/5 border-stone-500/20 hover:border-purple-500/30'}`}>
                  <div className={`w-8 h-8 shrink-0 flex flex-col items-center justify-center rounded uppercase font-bold text-[10px] ${isCurrent ? 'bg-purple-500 text-white shadow-md' : 'bg-stone-200 dark:bg-slate-700 text-stone-600 dark:text-slate-300'}`}>
                    <span className="text-xs leading-none">{e.day}</span>
                  </div>
                  <div className={`text-sm pt-1 leading-relaxed ${isCurrent ? 'text-purple-900 dark:text-purple-100 font-medium' : 'text-stone-700 dark:text-stone-300'}`}>
                    {e.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className="my-4 border border-purple-500/30 bg-purple-500/5 rounded-lg p-4 shadow-sm" {...sanitizeProps(props)}>
        <div className="flex items-center gap-2 mb-2 font-bold text-purple-600 dark:text-purple-400 uppercase text-xs tracking-wider">
          📅 Lịch Trình / Thời Gian
        </div>
        <div className="text-sm whitespace-pre-wrap font-mono text-stone-800 dark:text-stone-200">
          {children}
        </div>
      </div>
    );
  },
  'zd-status': ({ children, ...props }: any) => {
    const text = extractText(children);
    const hasBrackets = text.includes('[') && text.includes(']');
    
    // Default render for pre-formatted blocks that don't match bracket syntax (or fallback)
    let content = <div className="text-sm whitespace-pre-wrap font-mono text-stone-800 dark:text-stone-200">{children}</div>;
    
    if (hasBrackets) {
      const tags: {key: string, value: string}[] = [];
      const regex = /\[(.*?)\]/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const parts = match[1].split(':');
        if (parts.length >= 2) {
           tags.push({ key: parts[0].trim(), value: parts.slice(1).join(':').trim() });
        } else {
           tags.push({ key: 'TRẠNG THÁI', value: parts[0] });
        }
      }
      
      if (tags.length > 0) {
        content = (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((t, i) => (
              <TagBadge key={i} label={t.key} value={t.value} bg="bg-amber-500/20 text-amber-800 dark:text-amber-200" />
            ))}
          </div>
        );
      }
    }

    return (
      <div className="my-4 border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl p-4 shadow-sm" {...sanitizeProps(props)}>
        <div className="flex items-center gap-2 mb-3 font-bold text-amber-600 dark:text-amber-400 uppercase text-xs tracking-wider border-b border-amber-500/20 pb-2">
          <i className="fas fa-chart-bar"></i> Trạng Thái Trận Chiến
        </div>
        {content}
      </div>
    );
  },
  digest: ({ children, ...props }: any) => {
    const text = extractText(children);
    const hasBrackets = text.includes('[') && text.includes(']');
    
    let content = <div className="text-sm whitespace-pre-wrap text-stone-800 dark:text-stone-200">{children}</div>;
    
    if (hasBrackets) {
      const tags: {key: string, value: string}[] = [];
      const regex = /\[(.*?)\]/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const parts = match[1].split(':');
        if (parts.length >= 2) {
           tags.push({ key: parts[0].trim(), value: parts.slice(1).join(':').trim() });
        } else {
           tags.push({ key: 'INFO', value: parts[0] });
        }
      }
      
      if (tags.length > 0) {
        content = (
          <div className="flex flex-col gap-2 mt-1">
            {tags.map((t, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 bg-stone-500/10 rounded-lg p-2.5 border border-stone-500/20">
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-stone-500 min-w-[100px] shrink-0 mt-0.5">{t.key}</span>
                <span className="text-sm text-stone-800 dark:text-stone-200 font-medium leading-relaxed">{t.value}</span>
              </div>
            ))}
          </div>
        );
      }
    }

    return (
      <div className="my-4 border border-stone-500/30 bg-stone-500/5 rounded-xl p-4 shadow-sm" {...sanitizeProps(props)}>
        <div className="flex items-center gap-2 mb-3 font-bold text-stone-600 dark:text-stone-400 uppercase text-xs tracking-wider border-b border-stone-500/20 pb-2">
          <i className="fas fa-clipboard-list"></i> Tóm Tắt Tình Hình
        </div>
        {content}
      </div>
    );
  },

  statusplaceholderimpl: ({ children, ...props }: any) => <span className="hidden" aria-hidden="true" {...sanitizeProps(props)}>{children}</span>,
  real: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  ontologicalseverance: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  user: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  hypotheticalconstruct: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  axiomaticimmunity: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  experimentaldrift: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  hermeticseal: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  resonancepurpose: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  sovereignlogic: ({ children, ...props }: any) => <span {...sanitizeProps(props)}>{children}</span>,
  'tawa-widget': MemoizedTawaWidget as any,
  'regex-widget': (props: any) => {
    const contentAttr = props['data-content'];
    if (!contentAttr) return null;
    let decoded = '';
    try {
      if (typeof atob !== 'undefined') {
        decoded = decodeURIComponent(escape(atob(contentAttr)));
      } else {
        decoded = Buffer.from(contentAttr, 'base64').toString('utf-8');
      }
    } catch (e) {
      console.error("Error decoding Regex Widget:", e);
      return <div style={{ color: 'red', fontSize: '12px' }}>Error decoding widget</div>;
    }

    const fullDoc = `
      <html>
        <head>
          <style>
            body { margin: 0; padding: 0; font-family: sans-serif; }
          </style>
        </head>
        <body>
          ${decoded}
        </body>
      </html>
    `;

    return (
      <iframe
        title="Regex Code Runner"
        srcDoc={fullDoc}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
        style={{
          width: '100%',
          minHeight: '200px',
          border: '1px solid #ccc',
          borderRadius: '8px',
          marginTop: '16px',
          marginBottom: '16px'
        }}
      />
    );
  },
};

/**
 * Kỹ thuật B: Sửa lỗi tự động chuỗi ký tự xuống dòng trái phép trong JavaScript (literal newline)
 * Tự động tìm chuỗi dùng nháy đơn (') hoặc nháy kép (") kéo dài nhiều dòng mà không được escape,
 * sau đó chuyển đổi chúng thành Template Literal (dấu backticks `) và escape các ký tự nội suy nếu cần.
 */
function repairLiteralNewlines(code: string): string {
  let inSingleComment = false;
  let inMultiComment = false;
  let inString: '"' | "'" | null = null;
  let inTemplate = false;
  let stringStartIdx = -1;
  let hasNewline = false;
  
  const replacements: { start: number; end: number }[] = [];

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const nextChar = code[i + 1] || '';

    if (inSingleComment) {
      if (char === '\n' || char === '\r') {
        inSingleComment = false;
      }
      continue;
    }

    if (inMultiComment) {
      if (char === '*' && nextChar === '/') {
        inMultiComment = false;
        i++;
      }
      continue;
    }

    if (inString !== null) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === '\n' || char === '\r') {
        hasNewline = true;
        continue;
      }
      if (char === inString) {
        if (hasNewline) {
          replacements.push({ start: stringStartIdx, end: i });
        }
        inString = null;
      }
      continue;
    }

    if (inTemplate) {
      if (char === '\\') {
        i++;
        continue;
      }
      if (char === '`') {
        inTemplate = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inSingleComment = true;
      i++;
      continue;
    }
    if (char === '/' && nextChar === '*') {
      inMultiComment = true;
      i++;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      stringStartIdx = i;
      hasNewline = false;
      continue;
    }
    if (char === '`') {
      inTemplate = true;
      continue;
    }
  }

  if (replacements.length === 0) return code;

  let repaired = code;
  for (let j = replacements.length - 1; j >= 0; j--) {
    const { start, end } = replacements[j];
    let stringContent = repaired.slice(start + 1, end);
    stringContent = stringContent.replace(/\$\{/g, '\\${');
    
    repaired = 
      repaired.slice(0, start) + 
      '`' + 
      stringContent + 
      '`' + 
      repaired.slice(end + 1);
  }

  return repaired;
}

/**
 * Trích xuất các khối mã HTML/XML/JS/Humble Script từ câu trả lời gỡ lỗi của AI trợ lý
 */
function extractHtmlCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /```(?:html|xml|javascript|js)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1] && match[1].trim()) {
      blocks.push(match[1].trim());
    }
  }
  return blocks;
}

const IframeSandboxWidget = ({ contentAttr }: { contentAttr: string }) => {
  const [showSource, setShowSource] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<{type: string, message: string, time: string, lineno?: number}[]>([]);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const [sourceTab, setSourceTab] = useState<'raw' | 'compiled' | 'ai'>('raw');
  const [aiChat, setAiChat] = useState<{role: 'user' | 'model', text: string}[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const storageKey = useMemo(() => {
    if (!contentAttr) return '';
    let hash = 0;
    for (let i = 0; i < contentAttr.length; i++) {
      const char = contentAttr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `sandbox_widget_code_${Math.abs(hash)}`;
  }, [contentAttr]);

  const [editedCode, setEditedCode] = useState<string | null>(() => {
    if (!contentAttr) return null;
    let hash = 0;
    for (let i = 0; i < contentAttr.length; i++) {
       const char = contentAttr.charCodeAt(i);
       hash = (hash << 5) - hash + char;
       hash = hash & hash;
    }
    const key = `sandbox_widget_code_${Math.abs(hash)}`;
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error("Lỗi đọc code đã lưu:", e);
      return null;
    }
  });

  const [isEditingManually, setIsEditingManually] = useState(false);

  useEffect(() => {
    if (storageKey) {
      if (editedCode !== null) {
        try {
          localStorage.setItem(storageKey, editedCode);
        } catch (e) {
          console.error("Lỗi lưu code sandbox:", e);
        }
      } else {
        try {
          localStorage.removeItem(storageKey);
        } catch (e) {
          console.error("Lỗi xóa code sandbox:", e);
        }
      }
    }
  }, [editedCode, storageKey]);

  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const widgetId = useMemo(() => Math.random().toString(36).substring(2, 9), []);

  useEffect(() => {
    console.log(`[IframeSandboxWidget] Initializing widget ${widgetId} with content length: ${contentAttr?.length}`);
  }, [widgetId, contentAttr?.length]);

  const scrollToErrorLine = () => {
    if (highlightedLine) {
      setTimeout(() => {
        const el = document.getElementById(`compiled-line-${highlightedLine}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    }
  };

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Validate the message is for this specific widget instance
      if (e.data && e.data.id === widgetId) {
        if (e.data.type === 'TAWA_WIDGET_ACTION') {
           const event = new CustomEvent('tawa_widget_action', { detail: { action: e.data.action, payload: e.data.payload } });
           window.dispatchEvent(event);
        }
        if (e.data.type === 'TAWA_WIDGET_LOG') {
           setLogs(prev => {
               const newLogs = [...prev, { 
                 type: e.data.level, 
                 message: e.data.message, 
                 time: new Date().toLocaleTimeString(),
                 lineno: e.data.lineno 
               }];
               if (newLogs.length > 50) return newLogs.slice(newLogs.length - 50);
               return newLogs;
           });
           
           if (e.data.level === 'error' && e.data.lineno) {
             setHighlightedLine(e.data.lineno);
             setSourceTab('compiled');
           }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [widgetId]);

  if (!contentAttr && editedCode === null) return null;
  let decoded = '';
  try {
    if (editedCode !== null) {
      decoded = editedCode;
    } else {
      if (typeof atob !== 'undefined') {
        decoded = decodeURIComponent(escape(atob(contentAttr)));
      } else {
        decoded = Buffer.from(contentAttr, 'base64').toString('utf-8');
      }
    }
    
    // Fix: Escape any </script in content before rendering to prevent early browser tag closing SyntaxErrors
    decoded = decoded.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, 
      (_m, open, code, close) => open + code.replace(/<\/script/gi, '<\\\\/script') + close
    );

    // Fix: Transform const/let/class inside script tags into global-scoped var variables 
    // This allows them to bind to the window global object inside raw HTML widget preview sandboxes
    // so inline handlers like onclick="toggleTalent()" can find them.
    decoded = decoded.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open, code, close) => {
      let temp = code;
      
      // Khắc phục kỹ thuật tự động sửa lỗi xuống dòng trái phép trong chuỗi (literal newline)
      temp = repairLiteralNewlines(temp);

      // Replace const/let with var (excluding identifiers starting with const/let)
      temp = temp.replace(/(?:^|[^a-zA-Z0-9_$])\b(const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, (match, type) => {
        return match.replace(new RegExp(`\\b${type}\\b`), 'var');
      });
      // Replace class declaration with var name = class name
      temp = temp.replace(/(?:^|[^a-zA-Z0-9_$])\bclass\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, (match, name) => {
        return match.replace(`class ${name}`, `var ${name} = class ${name}`);
      });
      return open + temp + close;
    });

    // Fix 1: Vấn đề gốc rễ - Babel sandbox không thể hoạt động do không có allow-same-origin.
    // Loại bỏ type="text/babel" và data-presets="..." để cho phép trình duyệt dịch native ES6.
    decoded = decoded.replace(/<script\b([^>]*)\btype\s*=\s*["']text\/babel["']([^>]*)>/gi, '<script$1$2>');
    decoded = decoded.replace(/<script\b([^>]*)\bdata-presets\s*=\s*["'][^"']*["']([^>]*)>/gi, '<script$1$2>');
    
  } catch (e) {
    console.error(`[IframeSandboxWidget] Error decoding Widget ${widgetId}:`, e);
    return <div className="text-red-500 text-xs text-center border border-red-500 p-2">Lỗi giải mã Iframe Sandbox Widget</div>;
  }

  // Cầu nối API (postMessage) cho Iframe Sandbox
  const safeWidgetId = JSON.stringify(widgetId);
  const bridgeScript = `
    <script id="tawa-bridge">
      (function() {
        var _widgetId = ${safeWidgetId};
        window.TawaAPI = {
          sendAction: function(action, payload) {
            window.parent.postMessage({ type: 'TAWA_WIDGET_ACTION', id: _widgetId, action: action, payload: payload }, '*');
          },
          // For backwards compatibility and alias
          postMessage: function(action, payload) {
            this.sendAction(action, payload);
          }
        };

        // Tawa Logging Override
        var _log = console.log, _warn = console.warn, _error = console.error, _info = console.info;
        function sendLog(level, args) {
            var msg = Array.from(args).map(function(a) {
                if (a instanceof Error) {
                    return a.stack || a.message;
                }
                if (typeof a === 'object' && a !== null) {
                    try {
                        return JSON.stringify(a);
                    } catch (e) {
                        return '[Circular or Unserializable Object]';
                    }
                }
                return String(a);
            }).join(' ');
            
            // Filter out benign Vite WebSocket/HMR noise
            if (msg.indexOf('WebSocket') !== -1 || msg.indexOf('websocket') !== -1 || msg.indexOf('vite') !== -1 || msg.indexOf('[vite]') !== -1) {
                return;
            }
            
            window.parent.postMessage({ type: 'TAWA_WIDGET_LOG', id: _widgetId, level: level, message: msg }, '*');
        }
        console.log = function() { sendLog('log', arguments); _log.apply(console, arguments); };
        console.warn = function() { sendLog('warn', arguments); _warn.apply(console, arguments); };
        console.error = function() { sendLog('error', arguments); _error.apply(console, arguments); };
        console.info = function() { sendLog('info', arguments); _info.apply(console, arguments); };
        
        window.addEventListener('error', function(event) {
            var msg = event.message || '';
            if (msg.indexOf('WebSocket') !== -1 || msg.indexOf('websocket') !== -1 || msg.indexOf('vite') !== -1) {
                return;
            }
            window.parent.postMessage({ 
                type: 'TAWA_WIDGET_LOG', 
                id: _widgetId, 
                level: 'error', 
                message: event.message + ' (at line ' + event.lineno + ')',
                lineno: event.lineno
            }, '*');
        });
        window.addEventListener('unhandledrejection', function(event) {
            var reasonStr = '';
            if (event.reason) {
                reasonStr = event.reason.message || String(event.reason);
            }
            if (reasonStr.indexOf('WebSocket') !== -1 || reasonStr.indexOf('websocket') !== -1 || reasonStr.indexOf('vite') !== -1) {
                return;
            }
            sendLog('error', ['Unhandled Promise Rejection:', event.reason]);
        });
      })();
    </script>
  `;

  let fullDoc = '';
  const isFullHtml = /<!DOCTYPE\s+html>|<\s*html\b/i.test(decoded);
  
  if (isFullHtml) {
    if (/<head\b[^>]*>/i.test(decoded)) {
      fullDoc = decoded.replace(/(<head\b[^>]*>)/i, function(match) { return match + '\n' + bridgeScript; });
    } else if (/<html\b[^>]*>/i.test(decoded)) {
      fullDoc = decoded.replace(/(<html\b[^>]*>)/i, function(match) { return match + '<head>\n' + bridgeScript + '</head>'; });
    } else {
      fullDoc = bridgeScript + '\n' + decoded;
    }
  } else {
    // Tự động bọc mã HTML vào một trang HTML tiêu chuẩn (Sandbox)
    // Fix 4: Remove React, ReactDOM, Babel CDN because they won't work in a non-same-origin sandbox without type="module", saving 1MB+.
    fullDoc = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            html, body { 
              margin: 0; padding: 0; 
              font-family: system-ui, -apple-system, sans-serif; 
              background-color: transparent; 
              color: #1c1917; /* stone-900 */
              overflow-x: hidden;
            }
            body { padding: 12px; }
            * { box-sizing: border-box; }
            button, input, select, textarea { font-family: inherit; }
          </style>
          ${bridgeScript}
        </head>
        <body>
          <div id="root"></div>
          ${decoded}
        </body>
      </html>
    `;
  }

  const askAiAssistant = async (customPrompt?: string | null, freshStarted = false) => {
    setIsAiLoading(true);
    setAiError(null);
    const userMsgText = customPrompt !== undefined ? customPrompt : aiInput;
    if (userMsgText === '' && customPrompt === undefined) {
      setIsAiLoading(false);
      return;
    }

    if (customPrompt === undefined) {
      setAiInput('');
    }

    const nextChatHistory = [...aiChat];
    if (userMsgText) {
      nextChatHistory.push({ role: 'user', text: userMsgText });
      setAiChat(nextChatHistory);
    }

    try {
      const response = await fetch('/api/ai/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rawCode: decoded,
          compiledCode: fullDoc,
          logs: logs,
          prompt: userMsgText || "Hãy phân tích tình trạng hiện tại của widget và đưa ra lời chào, đề xuất sửa lỗi nếu có.",
          chatHistory: freshStarted ? [] : aiChat
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.details || 'Không thể gửi yêu cầu gỡ lỗi.');
      }

      setAiChat(prev => [...prev, { role: 'model', text: data.text }]);
    } catch (err: any) {
      setAiError(err.message || 'Lỗi không xác định khi kết nối với máy chủ AI.');
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (sourceTab === 'ai' && aiChat.length === 0 && !isAiLoading) {
      askAiAssistant("Chào bạn, tôi vừa mở Trợ lý AI Gỡ lỗi. Hãy phân tích toàn diện mã nguồn này và các log/lỗi hiện hữu, đưa ra phân tích gỡ lỗi chi tiết kèm giải thích và mã nguồn đã sửa nếu có lỗi nhé.", true);
    }
  }, [sourceTab, aiChat.length]);

  return (
    <div className="my-6 relative border-2 border-stone-300 dark:border-slate-600 rounded-xl overflow-hidden bg-white dark:bg-stone-900 shadow-md">
      <div className="absolute top-0 left-0 right-0 h-6 bg-stone-200 dark:bg-slate-700 flex items-center px-3 gap-2 border-b border-stone-300 dark:border-slate-600 z-10 select-none">
        <div className="w-2 h-2 rounded-full bg-red-400"></div>
        <div className="w-2 h-2 rounded-full bg-amber-400"></div>
        <div className="w-2 h-2 rounded-full bg-green-400"></div>
        <span className="text-[9px] font-mono font-bold text-stone-500 dark:text-stone-400 ml-1 tracking-wider uppercase">SANDBOX</span>
        {editedCode !== null && (
          <span 
            className="flex items-center text-amber-600 dark:text-amber-400 ml-1.5"
            title="Mã nguồn sandbox đã bị chỉnh sửa/gỡ lỗi và tự động lưu"
          >
            <Wrench size={10} className="animate-pulse" />
          </span>
        )}
        {editedCode !== null && (
          <button 
            type="button"
            onClick={() => {
              setEditedCode(null);
              setIsEditingManually(false);
              setLogs([]);
              setHighlightedLine(null);
            }}
            className="p-1 text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
            title="Khôi phục mã nguồn gốc ban đầu"
          >
            <RotateCcw size={10} />
          </button>
        )}
        <button 
          onClick={() => setShowLogs(!showLogs)}
          className={`ml-auto p-1 rounded transition-all cursor-pointer ${showLogs ? 'bg-indigo-500 text-white' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-300/55 dark:hover:bg-slate-600/55'}`}
          title={showLogs ? 'Đóng nhận ký lỗi (Console Log)' : 'Xem nhật ký lỗi (Console Log)'}
        >
          <Terminal size={10} />
        </button>
        <button 
          onClick={() => setShowSource(!showSource)}
          className={`p-1 rounded transition-all cursor-pointer ${showSource ? 'bg-indigo-500 text-white' : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 hover:bg-stone-300/55 dark:hover:bg-slate-600/55'}`}
          title={showSource ? 'Đóng bảng mã nguồn' : 'Xem/Sửa mã nguồn'}
        >
          <Code size={10} />
        </button>
      </div>
      
      {showSource ? (
        <div className="mt-6 mb-0 border-t border-stone-300 dark:border-slate-600 bg-stone-950 flex flex-col">
          <div className="bg-stone-900 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-stone-800 text-xs shadow-sm">
            <span className="text-stone-400 font-medium">Chế độ xem:</span>
            <button 
              onClick={() => {
                setSourceTab('raw');
                setHighlightedLine(null);
              }} 
              className={`px-2 py-0.5 rounded font-mono text-[10px] transition-colors ${sourceTab === 'raw' ? 'bg-indigo-600 text-white font-bold' : 'text-stone-400 hover:text-white bg-stone-800'}`}
            >
              MÃ GỐC (RAW WIDGET)
            </button>
            <button 
              onClick={() => {
                setSourceTab('compiled');
              }} 
              className={`px-2 py-0.5 rounded font-mono text-[10px] transition-colors ${sourceTab === 'compiled' ? 'bg-indigo-600 text-white font-bold' : 'text-stone-400 hover:text-white bg-stone-800'}`}
            >
              HTML ĐẦY ĐỦ (COMPILED IFRAME)
            </button>
            <button 
              onClick={() => {
                setSourceTab('ai');
              }} 
              className={`px-2 py-0.5 rounded font-mono text-[10px] transition-all flex items-center gap-1.5 ${sourceTab === 'ai' ? 'bg-emerald-600 text-white font-bold shadow-sm shadow-emerald-500/20' : 'text-stone-400 hover:text-white bg-stone-800'}`}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${isAiLoading ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
              TRỢ LÝ AI (AI DEBUGGER)
            </button>
            {sourceTab === 'raw' && (
              <button 
                type="button"
                onClick={() => setIsEditingManually(!isEditingManually)}
                className={`md:ml-auto px-2 py-0.5 rounded font-mono text-[10px] transition-all flex items-center gap-1 cursor-pointer ${isEditingManually ? 'bg-amber-600 text-white font-bold' : 'text-stone-400 hover:text-white bg-stone-800'}`}
              >
                ✏️ {isEditingManually ? 'HOÀN TẤT CHỈNH SỬA' : 'TỰ SỬA MÃ (MANUAL EDIT)'}
              </button>
            )}
            {highlightedLine && sourceTab === 'compiled' && (
              <div className="md:ml-auto flex items-center gap-2">
                <span className="text-red-400 font-mono text-[10px] flex items-center gap-1 animate-pulse">
                  <span>●</span> Lỗi tại dòng {highlightedLine}
                </span>
                <button 
                  onClick={scrollToErrorLine}
                  className="bg-red-800 hover:bg-red-700 text-white font-mono text-[9px] px-1.5 py-0.5 rounded transition-all uppercase tracking-wider"
                >
                  Cuộn đến dòng lỗi
                </button>
              </div>
            )}
          </div>
          
          <div className="p-4 overflow-auto max-h-[500px] font-mono text-xs text-stone-300 leading-relaxed scrollbar-thin">
            {sourceTab === 'ai' ? (
              <div className="flex flex-col h-full min-h-[400px] text-stone-200" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <div className="flex items-center gap-2 mb-3 bg-stone-900/80 p-3 rounded-lg border border-stone-800">
                  <div className="p-1 px-2 rounded bg-emerald-500/10 text-emerald-400 font-bold font-mono text-[10px] tracking-wider uppercase">
                    AI CHATBOT
                  </div>
                  <div className="text-stone-300 text-xs font-semibold">
                    Trợ lý gỡ lỗi chuyên sâu Sandbox
                  </div>
                  <button 
                    onClick={() => {
                      setAiChat([]);
                      askAiAssistant("Chào bạn, tôi vừa làm sạch bộ nhớ. Hãy phân tích lại toàn diện mã nguồn này và các log/lỗi hiện hữu nhé.", true);
                    }}
                    className="ml-auto text-[10px] text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-750 p-1 px-2 rounded transition-colors font-mono flex items-center gap-1"
                  >
                    🔄 Khởi động lại AI
                  </button>
                </div>

                {/* Logs Summary Banner inside AI panel */}
                {logs.length > 0 && (
                  <div className="mb-3 bg-red-950/40 p-2.5 px-3 rounded-lg border border-red-900/30 text-xs flex items-center gap-2">
                    <span className="flex-shrink-0 inline-block w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                    <span className="text-red-300 font-medium">Tìm thấy {logs.filter(l => l.type === 'error').length} lỗi runtime trong Console logs.</span>
                    <button 
                      onClick={() => askAiAssistant("Tôi vừa gặp lỗi ở runtime. Hãy phân tích các Console logs bị lỗi này và giải thích chi tiết nguyên nhân kèm cách sửa cụ thể nhé.")}
                      className="ml-auto bg-red-800 hover:bg-red-700 text-white font-bold text-[10px] px-2 py-1 rounded transition-colors"
                      disabled={isAiLoading}
                    >
                      💡 Phân tích lỗi ngay
                    </button>
                  </div>
                )}

                {/* Conversation History */}
                <div className="flex-1 overflow-y-auto mb-4 flex flex-col gap-3 min-h-[250px] max-h-[380px] p-3 bg-stone-950/80 rounded-lg border border-stone-850 scrollbar-thin">
                  {aiChat.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="text-[10px] text-stone-500 mb-1 font-mono uppercase tracking-widest px-1">
                        {msg.role === 'user' ? 'MÃ NGUỒN' : 'Trợ lý AI'}
                      </div>
                      <div 
                        className={`rounded-lg p-3 text-xs leading-relaxed max-w-[90%] whitespace-pre-wrap ${
                          msg.role === 'user' 
                            ? 'bg-stone-800 text-stone-100 border border-stone-700/50' 
                            : 'bg-stone-900/60 text-stone-200 border border-stone-850 font-sans'
                        }`}
                      >
                        {msg.role === 'model' ? (
                          <div className="flex flex-col">
                            <div className="prose prose-sm prose-invert max-w-none text-stone-200 break-words font-sans space-y-1">
                              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                            {(() => {
                              const blocks = extractHtmlCodeBlocks(msg.text);
                              if (blocks.length === 0) return null;
                              return (
                                <div className="mt-3 pt-3 border-t border-stone-800/80 flex flex-col gap-2">
                                  <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider font-mono flex items-center gap-1">
                                    <span>🎯</span> Phát hiện mã đã sửa từ AI ({blocks.length} khối):
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {blocks.map((block, idx) => (
                                      <div key={idx} className="flex flex-wrap gap-1.5 pt-0.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditedCode(block);
                                            setShowSource(false);
                                          }}
                                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase tracking-wider px-2.5 py-1.5 rounded transition-all flex items-center gap-1.5 shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                          🚀 Áp dụng & Chạy Sandbox {blocks.length > 1 ? `#${idx + 1}` : ''}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditedCode(block);
                                            setSourceTab('raw');
                                          }}
                                          className="bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700 text-[10px] uppercase tracking-wider px-2 py-1.5 rounded transition-all flex items-center gap-1"
                                        >
                                          🔍 Áp dụng & Xem mã
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          msg.text
                        )}
                      </div>
                    </div>
                  ))}

                  {isAiLoading && (
                    <div className="flex flex-col items-start">
                      <div className="text-[10px] text-stone-500 mb-1 font-mono uppercase tracking-widest px-1">
                        Trợ lý AI
                      </div>
                      <div className="bg-stone-900/60 text-stone-400 border border-stone-850 rounded-lg p-3 text-xs flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        <span className="font-mono text-[11px]">Trợ lý đang xem mã nguồn và gỡ lỗi...</span>
                      </div>
                    </div>
                  )}

                  {aiError && (
                    <div className="bg-red-950/50 text-red-300 border border-red-900/40 rounded-lg p-3 text-xs">
                      ⚠️ {aiError}
                    </div>
                  )}
                </div>

                {/* Quick actions suggest panel */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <button 
                    onClick={() => askAiAssistant("Giải thích ngắn gọn cấu trúc và luồng chạy của file widget này.")}
                    className="text-[10px] bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-2.5 py-1 rounded transition-colors"
                    disabled={isAiLoading}
                  >
                    📋 Giải thích code
                  </button>
                  <button 
                    onClick={() => askAiAssistant("Kiểm tra xem mã nguồn này có bất kỳ lỗi cú pháp, vấn đề đồng bộ, hoặc cấu trúc nào có thể tối ưu không.")}
                    className="text-[10px] bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-2.5 py-1 rounded transition-colors"
                    disabled={isAiLoading}
                  >
                    🛡️ Tối ưu hóa & Check lỗi
                  </button>
                  <button 
                    onClick={() => askAiAssistant("Tìm và giải thích tất cả các đoạn xử lý nút bấm (onclick/event handlers) trong widget này.")}
                    className="text-[10px] bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-2.5 py-1 rounded transition-colors"
                    disabled={isAiLoading}
                  >
                    🖱️ Xem bộ xử lý sự kiện (Events)
                  </button>
                </div>

                {/* Input block */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    askAiAssistant();
                  }}
                  className="flex gap-2"
                >
                  <input 
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Nhập câu hỏi hoặc mô tả lỗi bạn đang gặp phải..."
                    className="flex-1 bg-stone-900 border border-stone-800 rounded px-3 py-1.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                    disabled={isAiLoading}
                  />
                  <button 
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-stone-800 disabled:text-stone-500 text-white font-bold text-xs px-4 py-1.5 rounded transition-all flex items-center gap-1.5"
                    disabled={isAiLoading || !aiInput.trim()}
                  >
                    <span>Gửi</span>
                    <span>✈️</span>
                  </button>
                </form>
              </div>
            ) : sourceTab === 'raw' && isEditingManually ? (
              <div className="w-full flex flex-col gap-2.5">
                <textarea
                  value={decoded}
                  onChange={(e) => setEditedCode(e.target.value)}
                  className="w-full min-h-[350px] bg-stone-900 text-stone-100 font-mono text-xs p-3 rounded border border-stone-850 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/35 leading-relaxed scrollbar-thin resize-y"
                  placeholder="Nhập mã nguồn HTML/JS của bạn ở đây để cập nhật Sandbox trực tiếp..."
                />
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-stone-400 font-mono gap-2 bg-stone-900/50 p-2.5 rounded border border-stone-850">
                  <span>💡 Mã nguồn tự động áp dụng vào Sandbox ngay khi nhập. Bạn có thể đóng mã nguồn để xem kết quả.</span>
                  <button
                    type="button"
                    onClick={() => setIsEditingManually(false)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold font-sans uppercase tracking-wide px-3 py-1 rounded transition-colors self-end sm:self-auto cursor-pointer"
                  >
                    Hoàn tất & Chạy thử 🚀
                  </button>
                </div>
              </div>
            ) : (
              <div className="min-w-full table border-collapse">
                {(sourceTab === 'compiled' ? fullDoc : decoded).split('\n').map((lineText, idx) => {
                  const lineNum = idx + 1;
                  const isError = sourceTab === 'compiled' && highlightedLine === lineNum;
                  return (
                    <div 
                      key={lineNum} 
                      id={`compiled-line-${lineNum}`}
                      className={`table-row group hover:bg-stone-900/50 ${isError ? 'bg-red-950/70 text-red-200 font-semibold' : ''}`}
                      style={isError ? { borderLeft: '4px solid #ef4444' } : undefined}
                    >
                      <span className={`table-cell select-none text-right pr-4 text-[10px] opacity-40 group-hover:opacity-75 w-12 border-r border-stone-850 ${isError ? 'text-red-400 font-bold opacity-100' : 'text-stone-500'}`}>
                        {lineNum}
                      </span>
                      <span className="table-cell pl-4 whitespace-pre break-all">
                        {lineText || ' '}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div 
          className="w-full mt-6 mb-2"
          style={{
            resize: 'vertical',
            overflow: 'auto',
            minHeight: '200px',
            height: '400px',
            border: '1px solid rgba(120,120,120,0.2)',
            borderRadius: '6px'
          }}
        >
          <iframe
            ref={iframeRef}
            title="Iframe Sandbox"
            srcDoc={fullDoc}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
            className="w-full h-full bg-transparent block"
            style={{
              border: 'none'
            }}
          />
        </div>
      )}

      {showLogs && (
        <div className="border-t-2 border-stone-300 dark:border-slate-600 bg-[#1e1e1e] max-h-[250px] overflow-y-auto">
          <div className="sticky top-0 bg-[#252526] px-2 py-1 flex items-center justify-between border-b border-stone-800">
             <span className="text-xs text-stone-300 font-mono">Console Logs ({logs.length})</span>
             <button onClick={() => setLogs([])} className="text-[10px] text-stone-400 hover:text-white uppercase px-1">Clear</button>
          </div>
          <div className="p-2 flex flex-col gap-1 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
               <div className="text-stone-500 italic px-1">No logs to display...</div>
            ) : (
               logs.map((log, i) => (
                 <div 
                   key={i} 
                   onClick={() => {
                     if (log.lineno) {
                       setHighlightedLine(log.lineno);
                       setSourceTab('compiled');
                       setShowSource(true);
                       setTimeout(() => {
                         const el = document.getElementById(`compiled-line-${log.lineno}`);
                         if (el) {
                           el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                         }
                       }, 100);
                     }
                   }}
                   className={`px-2 py-1 rounded border-l-2 ${log.lineno ? 'cursor-pointer hover:bg-red-950/20' : ''} ${log.type === 'error' ? 'bg-red-900/20 text-red-400 border-red-500' : log.type === 'warn' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-500' : 'text-stone-300 border-transparent hover:bg-white/5'}`}
                 >
                   <span className="opacity-50 mr-2 text-[9px]">{log.time}</span>
                   {log.message}
                   {log.lineno ? (
                     <span className="underline ml-2 text-[9px] text-red-300 font-sans hover:text-red-100 font-semibold">
                       (Nhấp để bôi đỏ dòng {log.lineno})
                     </span>
                   ) : null}
                 </div>
               ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ 
  content, 
  className = "", 
  regexScripts,
  userName = "User",
  charName = "Character",
  messageRole,
  depth
}) => {
  const generatedId = React.useId();
  const wrapperId = useMemo(() => "md-content-" + generatedId.replace(/:/g, ''), [generatedId]);

  const [jsMode, setJsMode] = useState<'disabled' | 'auto' | 'script' | 'code_block'>('auto');
  const [colors, setColors] = useState<{
    dialogue?: string;
    thinking?: string;
    highlight?: string;
    onomatopoeia?: string;
  }>({});

  const markdownComponentsWithScope = useMemo(() => {
    return {
      ...markdownComponents,
      style: (props: any) => markdownComponents.style({...props, 'data-scoper': wrapperId}),
      'regex-widget': (props: any) => <IframeSandboxWidget contentAttr={props['data-content']} />
    };
  }, [wrapperId]);

  useEffect(() => {
    dbService.getSettings().then(s => {
      if (s) {
        if (s.javaScriptMode) {
          setJsMode(s.javaScriptMode);
        }
        setColors({
          dialogue: s.storyDialogueColor,
          thinking: s.storyThinkingColor,
          highlight: s.storyHighlightColor,
          onomatopoeia: s.storyOnomatopoeiaColor
        });
      }
    });
  }, []);

  const processedContent = useMemo(() => {
    let text = content || '';
    
    // Resolve placeholders directly before processing
    if (userName) text = text.replace(/\{\{user\}\}/gi, userName);
    if (charName) text = text.replace(/\{\{char\}\}/gi, charName);

    // ==========================================
    // PROTECT BLOCKS BEFORE COLOR FORMATTING
    // ==========================================
    const protectedCodeBlocks: string[] = [];
    text = text.replace(/```[\s\S]*?```/g, (match) => {
        protectedCodeBlocks.push(match);
        return `__SYS_CODEBLOCK_${protectedCodeBlocks.length - 1}__`;
    });
        
    const protectedFullDocs: string[] = [];
    text = text.replace(/<!DOCTYPE\s+html>[\s\S]*?(?:<\/html>|$)|<\s*html\b[\s\S]*?(?:<\/html>|$)/gi, (match) => {
        protectedFullDocs.push(match);
        return `__SYS_FULLDOC_${protectedFullDocs.length - 1}__`;
    });

    const protectedSandboxes: string[] = [];
    text = text.replace(/<sandbox>([\s\S]*?)(?:<\/sandbox>|$)/gi, (match) => {
        protectedSandboxes.push(match);
        return `__SYS_SANDBOX_${protectedSandboxes.length - 1}__`;
    });
        
    const protectedScriptStyles: string[] = [];
    text = text.replace(/<(script|style)\b[\s\S]*?(?:<\/\1>|$)/gi, (match) => {
        protectedScriptStyles.push(match);
        return `__SYS_SCRIPTSTYLE_${protectedScriptStyles.length - 1}__`;
    });

    // Apply color formatting
    if (colors.dialogue) {
      text = text.replace(/(「[^」]*」)/g, `<font color="${colors.dialogue}">$1</font>`);
    }
    if (colors.thinking) {
      text = text.replace(/(﹁[^﹂]*﹂)/g, `<font color="${colors.thinking}">$1</font>`);
    }
    if (colors.highlight) {
      text = text.replace(/(『[^』]*』)/g, `<font color="${colors.highlight}">$1</font>`);
    }
    if (colors.onomatopoeia) {
      // Find {text} but ensure to not match {{ or }}
      text = text.replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, `<font color="${colors.onomatopoeia}">{$1}</font>`);
    }

    // Remove HTML blocks stripping here if jsMode is code_block or auto, because we want 
    // jsMode's regex-widget to encapsulate them to keep iframe sandbox and scripts working.
    if (jsMode === 'disabled') {
       // disabled logic - we will resolve __SYS_CODEBLOCK_ back in here to properly strip them if needed,
       // but for simplicity we will just let it be, they will be rendered as normal codeblocks in disabled mode.
    }

    // Fix invalid custom HTML tags (ones with underscores instead of hyphens)
    // CommonMark spec enforces alphanumeric characters and hyphens for HTML tags.
    text = text.replace(/<user_status\b/gi, '<user-status');
    text = text.replace(/<\/user_status>/gi, '</user-status>');
    text = text.replace(/<zd_status\b/gi, '<zd-status');
    text = text.replace(/<\/zd_status>/gi, '</zd-status>');

    // Force blank lines around major custom structural tags to ensure they parse as block HTML in remark
    text = text.replace(/(<\/?(?:user-status|zd-status|calendar|digest|equip|swordskill|content|tableEdit|table_stored|time)>)/gi, '\n\n$1\n\n');
    // Remove <br> tags specifically inside blocks that use whitespace-pre-wrap 
    // to prevent double spacing when LLMs output both \n and <br>
    const stripBrTags = (match: string, innerText: string, tagName: string) => {
      const cleanText = innerText.replace(/<br\s*\/?>/gi, '\n').replace(/\n{3,}/g, '\n\n').trim();
      return `<${tagName}>\n${cleanText}\n</${tagName}>`;
    };
    
    text = text.replace(/<equip>([\s\S]*?)<\/equip>/gi, (m, c) => stripBrTags(m, c, 'equip'));
    text = text.replace(/<swordskill>([\s\S]*?)<\/swordskill>/gi, (m, c) => stripBrTags(m, c, 'swordskill'));
    text = text.replace(/<user-status>([\s\S]*?)<\/user-status>/gi, (m, c) => stripBrTags(m, c, 'user-status'));
    text = text.replace(/<time>([\s\S]*?)<\/time>/gi, (m, c) => stripBrTags(m, c, 'time'));
    
    // Clean up excessive newlines
    text = text.replace(/\n{3,}/g, '\n\n');
    
    // Apply Regex Scripts BEFORE JS mode encoding so the output of Regex is also widget-ified
    if (regexScripts && regexScripts.length > 0 && text) {
        // Determine which placements to apply based on role
        const placementTarget = messageRole === 'user' ? 1 : 2;

        // Protect custom structural tags from user regex scripts so our React UI doesn't get overridden
        let protectedText = text;
        const protectedTags = ['equip', 'swordskill', 'user-status', 'zd-status', 'calendar', 'digest', 'time'];
        protectedTags.forEach(tag => {
          // Replace <tag> and </tag> with <sys-tag> and </sys-tag>
          protectedText = protectedText.replace(new RegExp(`<(/?)${tag}>`, 'gi'), `<$1sys-${tag}>`);
        });
        
        text = getRegexedString(protectedText, placementTarget, regexScripts, {
            userName, 
            charName, 
            isMarkdown: true,
            isPrompt: false,
            renderPhaseOnly: true,
            depth: depth ?? -1,
            isDebug: false
        });

        // Restore protected tags
        protectedTags.forEach(tag => {
          text = text.replace(new RegExp(`<(/?)\\s*sys-${tag}>`, 'gi'), `<$1${tag}>`);
        });
    }

    // ==========================================
    // RESTORE PROTECTED BLOCKS BEFORE JSMODE WIDGETING
    // ==========================================
    protectedSandboxes.forEach((block, index) => {
        text = text.replace(`__SYS_SANDBOX_${index}__`, () => block);
    });
    protectedScriptStyles.forEach((block, index) => {
        text = text.replace(`__SYS_SCRIPTSTYLE_${index}__`, () => block);
    });
    protectedFullDocs.forEach((block, index) => {
        text = text.replace(`__SYS_FULLDOC_${index}__`, () => block);
    });
    protectedCodeBlocks.forEach((block, index) => {
        text = text.replace(`__SYS_CODEBLOCK_${index}__`, () => block);
    });

    // Check execution modes based on jsMode
    if (jsMode === 'disabled') {
      // Bỏ qua, không thi hành script nào từ text AI, cũng filter script tag
      text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } else {
      // 1. Process code blocks first so they encapsulate inner HTML
      if (jsMode === 'code_block' || jsMode === 'auto') {
        const htmlBlockRegex = /```(?:html|javascript|js|jsx|react|ts|typescript)?\n([\s\S]*?)(?:```|$)/gi;
        const preBlockRegex = /<pre>([\s\S]*?)(?:<\/pre>|$)/gi;
        
        // Thay thế các block code thành regex-widget
        text = text.replace(htmlBlockRegex, (match, code) => {
          const lowerMatch = match.toLowerCase();
          const isJs = lowerMatch.startsWith('```javascript') || lowerMatch.startsWith('```js') || lowerMatch.startsWith('```jsx') || lowerMatch.startsWith('```react') || lowerMatch.startsWith('```ts') || lowerMatch.startsWith('```typescript');
          const finalCode = isJs ? `<script type="text/babel" data-presets="react,typescript">\n${code}\n</script>` : code;
          try {
            const base64 = typeof btoa !== 'undefined' 
              ? btoa(unescape(encodeURIComponent(finalCode)))
              : Buffer.from(finalCode).toString('base64');
            return `<regex-widget data-content="${base64}"></regex-widget>`;
          } catch(e) {
            return match;
          }
        });

        text = text.replace(preBlockRegex, (match, code) => {
          try {
            const base64 = typeof btoa !== 'undefined' 
              ? btoa(unescape(encodeURIComponent(code)))
              : Buffer.from(code).toString('base64');
            return `<regex-widget data-content="${base64}"></regex-widget>`;
          } catch(e) {
            return match;
          }
        });
      }

      // 2. Encode inline scripts and full HTML docs to regex-widget
      if (jsMode === 'script' || jsMode === 'auto') {
        const documentHtmlRegex = /<document_content>([\s\S]*?)(?:<\/document_content>|$)/gi;
        const fullDocRegex = /<!DOCTYPE\s+html>[\s\S]*?(?:<\/html>|$)|<\s*html\b[\s\S]*?(?:<\/html>|$)/gi;
        const nativeScriptRegex = /<script\b[\s\S]*?(?:<\/script>|$)/gi;
        
        // Wrap document content that contains HTML (preventing raw styles/scripts from breaking DOM)
        text = text.replace(documentHtmlRegex, (match, htmlContent) => {
           if (/(<!DOCTYPE\s+html|<html|<body|<script|<style)/i.test(htmlContent)) {
               try {
                 const base64 = typeof btoa !== 'undefined' 
                   ? btoa(unescape(encodeURIComponent(htmlContent)))
                   : Buffer.from(htmlContent).toString('base64');
                 return `<document_content>\n<regex-widget data-content="${base64}"></regex-widget>\n</document_content>`;
               } catch(e) {
                 return match;
               }
           }
           return match;
        });

        // ------------------------- IFRAME SANDBOX CẦU NỐI API -------------------------
        // Hỗ trợ explicitly bọc HTML/CSS/JS bằng thẻ <sandbox> để ngăn chặn việc tách rời script và HTML
        const sandboxRegex = /<sandbox>([\s\S]*?)(?:<\/sandbox>|$)/gi;
        text = text.replace(sandboxRegex, (match, content) => {
           console.log(`[MarkdownRenderer] Matched sandbox block of length ${content.length}`);
           try {
             const base64 = typeof btoa !== 'undefined' 
               ? btoa(unescape(encodeURIComponent(content)))
               : Buffer.from(content).toString('base64');
             return `<regex-widget data-content="${base64}"></regex-widget>`;
           } catch(e) {
             console.error(`[MarkdownRenderer] Error converting sandbox block to base64:`, e);
             return match;
           }
        });

        // Wrap full HTML page output from scripts
        text = text.replace(fullDocRegex, (match) => {
          console.log(`[MarkdownRenderer] Matched full doc block of length ${match.length}`);
          try {
            const base64 = typeof btoa !== 'undefined' 
              ? btoa(unescape(encodeURIComponent(match)))
              : Buffer.from(match).toString('base64');
            return `<regex-widget data-content="${base64}"></regex-widget>`;
          } catch(e) {
            console.error(`[MarkdownRenderer] Error converting fulldoc block to base64:`, e);
            return match;
          }
        });

        // Thay thế các thẻ script cục bộ thành regex-widget để thực thi an toàn mà không làm hỏng markdown
        text = text.replace(nativeScriptRegex, (match) => {
          try {
            const base64 = typeof btoa !== 'undefined' 
              ? btoa(unescape(encodeURIComponent(match)))
              : Buffer.from(match).toString('base64');
            return `<regex-widget data-content="${base64}"></regex-widget>`;
          } catch(e) {
            return match;
          }
        });
      }
    }

    return text;
  }, [content, regexScripts, userName, charName, messageRole, jsMode, colors]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'TAWA_WIDGET_ACTION') {
         const event = new CustomEvent('tawa_widget_action', { detail: { action: e.data.action, payload: e.data.payload } });
         window.dispatchEvent(event);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div id={wrapperId} className={`markdown-body flex-1 font-mali text-stone-800 dark:text-stone-300 ${className || ''}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={markdownComponentsWithScope}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
