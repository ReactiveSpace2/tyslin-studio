const PATHS = {
  home: <><path d="M2.5 7.5 8 3l5.5 4.5" /><path d="M4 6.5V13h8V6.5" /><path d="M6.5 13V9.5h3V13" /></>,
  agents: <><rect x="2" y="4" width="12" height="10" rx="3" /><path d="M8 1v3" /><circle cx="6" cy="9" r="0.8" fill="currentColor" /><circle cx="10" cy="9" r="0.8" fill="currentColor" /></>,
  skills: <><path d="M3 2h7l3 3v9H3z" /><path d="M6 8h4M6 11h4" /></>,
  folder: <path d="M2 4h4l1.5 1.5H14V13H2z" />,
  settings: <><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></>,
  plus: <path d="M8 2v12M2 8h12" />,
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
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
