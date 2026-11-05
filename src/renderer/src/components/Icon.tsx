const PATHS = {
  home: <><path d="M2.5 7.5 8 3l5.5 4.5" /><path d="M4 6.5V13h8V6.5" /><path d="M6.5 13V9.5h3V13" /></>,
  agents: <><rect x="2" y="4" width="12" height="10" rx="3" /><path d="M8 1v3" /><circle cx="6" cy="9" r="0.8" fill="currentColor" /><circle cx="10" cy="9" r="0.8" fill="currentColor" /></>,
  skills: <><path d="M3 2h7l3 3v9H3z" /><path d="M6 8h4M6 11h4" /></>,
  folder: <path d="M2 4h4l1.5 1.5H14V13H2z" />,
  grid: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  video: <><rect x="1.5" y="4" width="9.5" height="8" rx="1.5" /><path d="m11 7 3.5-2v6L11 9" /></>,
  workflow: <><rect x="1.5" y="2" width="4.5" height="3.5" rx="1" /><rect x="10" y="6.25" width="4.5" height="3.5" rx="1" /><rect x="1.5" y="10.5" width="4.5" height="3.5" rx="1" /><path d="M6 3.75h1.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H6M8.5 8H10" /></>,
  canvas: <><rect x="2" y="2" width="12" height="12" rx="2" /><path d="M2 6h12M6 6v8" /></>,
  mindmap: <><circle cx="8" cy="8" r="2" /><circle cx="2.75" cy="3.25" r="1.25" /><circle cx="13.25" cy="3.25" r="1.25" /><circle cx="2.75" cy="12.75" r="1.25" /><circle cx="13.25" cy="12.75" r="1.25" /><path d="M6.5 6.6 3.7 4.1M9.5 6.6l2.8-2.5M6.5 9.4l-2.8 2.5M9.5 9.4l2.8 2.5" /></>,
  drive: <><rect x="1.5" y="9" width="13" height="4.5" rx="1.5" /><path d="M3 9 5 3h6l2 6" /><circle cx="11.5" cy="11.25" r="0.6" fill="currentColor" /></>,
  knowledge: <><path d="M8 4.5C6.5 3.2 4.3 2.8 2 3v9.5c2.3-.2 4.5.2 6 1.5 1.5-1.3 3.7-1.7 6-1.5V3c-2.3-.2-4.5.2-6 1.5z" /><path d="M8 4.5V14" /></>,
  dashboard: <><rect x="2" y="2" width="5" height="6" rx="1.2" /><rect x="9" y="2" width="5" height="3.5" rx="1.2" /><rect x="9" y="7.5" width="5" height="6.5" rx="1.2" /><rect x="2" y="10" width="5" height="4" rx="1.2" /></>,
  clock: <><circle cx="8" cy="8.5" r="5.5" /><path d="M8 5.5v3l2 1.5M6.5 1.5h3" /></>,
  sun: <><path d="M2 12.5h12M4.5 12.5a3.5 3.5 0 0 1 7 0" /><path d="M8 4.5v1.5M3.2 7.2l1 1M12.8 7.2l-1 1M1.5 10h1M13.5 10h1" /></>,
  checklist: <><path d="m2.5 4 1.2 1.2L6 3M2.5 10l1.2 1.2L6 9" /><path d="M8.5 4.5h5M8.5 10.5h5" /></>,
  idea: <><path d="M6 12.5h4M6.5 14.5h3" /><path d="M5.5 10.5C4.3 9.6 3.5 8.3 3.5 6.8a4.5 4.5 0 0 1 9 0c0 1.5-.8 2.8-2 3.7z" /></>,
  chart: <><path d="M2.5 13.5h11" /><path d="M4.5 11V8M8 11V4.5M11.5 11V6.5" /></>,
  filter: <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />,
  sort: <path d="M5 13V3M2.5 5.5 5 3l2.5 2.5M11 3v10M8.5 10.5 11 13l2.5-2.5" />,
  play: <path d="M5 3.5v9l7-4.5z" />,
  pause: <path d="M5.5 3.5v9M10.5 3.5v9" />,
  trash: <><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 9h6.6l.7-9" /></>,
  updown: <path d="m5 6 3-3 3 3M5 10l3 3 3-3" />,
  chat: <path d="M2.5 3h11v8H7.5L4.5 13.5V11h-2z" />,
  art: <><path d="M8 2a6 6 0 1 0 0 12c1 0 1.3-.8.9-1.5-.5-.9 0-1.7 1-1.7h1.6A2.5 2.5 0 0 0 14 8.3 6 6 0 0 0 8 2z" /><circle cx="5" cy="7.5" r="0.8" fill="currentColor" /><circle cx="7.5" cy="4.8" r="0.8" fill="currentColor" /><circle cx="10.7" cy="6" r="0.8" fill="currentColor" /></>,
  connectors: <><path d="M6 1.5V5M10 1.5V5" /><path d="M4 5h8v2.5a4 4 0 0 1-8 0z" /><path d="M8 11.5v3" /></>,
  settings: <><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></>,
  plus: <path d="M8 2v12M2 8h12" />,
  minus: <path d="M2 8h12" />,
  send: <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />,
  back: <path d="M10 3 5 8l5 5" />,
  search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
  file: <><path d="M4 1.5h5L12 4.5v10H4z" /><path d="M9 1.5v3h3" /></>,
  check: <path d="m3 8.5 3 3 7-7" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  stop: <rect x="4" y="4" width="8" height="8" rx="1.5" />,
  // Same stroke GitHub mark as the landing site (tyslin-web/components/Icons.tsx), drawn on a 24 px grid.
  github: <g transform="scale(0.6667)" strokeWidth="2.4"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" /></g>,
  warning: <><path d="M8 2 1.5 13.5h13z" /><path d="M8 6.5v3" /><circle cx="8" cy="11.5" r="0.6" fill="currentColor" /></>
} as const

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }): JSX.Element {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
