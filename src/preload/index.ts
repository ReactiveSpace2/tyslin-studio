import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AccountEngine, ChannelMessage, DriveChange, GDriveStatus, InstallOutput, RunEvent, TyslinApi, UpdateStatus } from '@shared/types'

const api: TyslinApi = {
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    get: (id) => ipcRenderer.invoke('agents:get', id),
    save: (input) => ipcRenderer.invoke('agents:save', input),
    remove: (id) => ipcRenderer.invoke('agents:remove', id),
    statuses: () => ipcRenderer.invoke('agents:statuses'),
    test: (input) => ipcRenderer.invoke('agents:test', input),
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    pickFolder: () => ipcRenderer.invoke('projects:pickFolder'),
    newFolderPath: (name) => ipcRenderer.invoke('projects:newFolderPath', name),
    files: (id) => ipcRenderer.invoke('projects:files', id)
  },
  attachments: {
    pick: (kind) => ipcRenderer.invoke('attachments:pick', kind)
  },
  pages: {
    read: (agencyId, pageId) => ipcRenderer.invoke('pages:read', agencyId, pageId),
    watch: (agencyId) => ipcRenderer.invoke('pages:watch', agencyId),
    unwatch: (agencyId) => ipcRenderer.invoke('pages:unwatch', agencyId),
    onChanged: (cb) => {
      const fn = (_e: unknown, p: { agencyId: string; path: string }): void => cb(p)
      ipcRenderer.on('pages:changed', fn)
      return () => ipcRenderer.removeListener('pages:changed', fn)
    }
  },
  preview: {
    list: (projectId) => ipcRenderer.invoke('preview:list', projectId),
    capture: (rect, name) => ipcRenderer.invoke('preview:capture', rect, name),
    onBlocked: (cb) => {
      const fn = (_e: unknown, url: string): void => cb(url)
      ipcRenderer.on('preview:blocked', fn)
      return () => ipcRenderer.removeListener('preview:blocked', fn)
    },
    bytes: (projectId, path) => ipcRenderer.invoke('preview:bytes', projectId, path),
    office: () => ipcRenderer.invoke('preview:office'),
    exportPdf: (projectId, path) => ipcRenderer.invoke('preview:exportPdf', projectId, path),
    saveCopy: (projectId, path) => ipcRenderer.invoke('preview:saveCopy', projectId, path)
  },
  sessions: {
    list: (agentId) => ipcRenderer.invoke('sessions:list', agentId),
    create: (agentId, projectId) => ipcRenderer.invoke('sessions:create', agentId, projectId),
    messages: (id) => ipcRenderer.invoke('sessions:messages', id),
    send: (id, text, attachmentIds) => ipcRenderer.invoke('sessions:send', id, text, attachmentIds),
    onEvent: (cb) => {
      const fn = (_e: unknown, ev: RunEvent): void => cb(ev)
      ipcRenderer.on('run-event', fn)
      return () => ipcRenderer.removeListener('run-event', fn)
    },
    stop: (sessionId) => ipcRenderer.invoke('sessions:stop', sessionId),
    status: (sessionId) => ipcRenderer.invoke('sessions:status', sessionId),
    answerPermission: (permissionId, choiceId) => ipcRenderer.invoke('sessions:answerPermission', permissionId, choiceId),
    permissions: () => ipcRenderer.invoke('sessions:permissions'),
    running: () => ipcRenderer.invoke('sessions:running'),
    rename: (sessionId, title) => ipcRenderer.invoke('sessions:rename', sessionId, title),
    remove: (sessionId) => ipcRenderer.invoke('sessions:remove', sessionId)
  },
  engines: {
    list: () => ipcRenderer.invoke('engines:list'),
    setCommand: (id, command) => ipcRenderer.invoke('engines:setCommand', id, command),
    test: (id) => ipcRenderer.invoke('engines:test', id),
    models: (id) => ipcRenderer.invoke('engines:models', id),
    install: (id) => ipcRenderer.invoke('engines:install', id),
    cancelInstall: (id) => ipcRenderer.invoke('engines:cancelInstall', id),
    onInstallOutput: (cb) => {
      const fn = (_e: unknown, o: InstallOutput): void => cb(o)
      ipcRenderer.on('engines:installOutput', fn)
      return () => ipcRenderer.removeListener('engines:installOutput', fn)
    }
  },
  memory: {
    list: (agencyId) => ipcRenderer.invoke('memory:list', agencyId),
    read: (agencyId, key) => ipcRenderer.invoke('memory:read', agencyId, key),
    write: (agencyId, key, text) => ipcRenderer.invoke('memory:write', agencyId, key, text)
  },
  integrations: {
    list: () => ipcRenderer.invoke('integrations:list'),
    save: (input) => ipcRenderer.invoke('integrations:save', input),
    remove: (id) => ipcRenderer.invoke('integrations:remove', id),
    setAgents: (id, agentIds) => ipcRenderer.invoke('integrations:setAgents', id, agentIds),
    test: (id) => ipcRenderer.invoke('integrations:test', id),
    search: (query, cursor) => ipcRenderer.invoke('integrations:search', query, cursor)
  },
  accounts: {
    status: () => ipcRenderer.invoke('accounts:status'),
    signIn: (engine) => ipcRenderer.invoke('accounts:signIn', engine),
    cancelSignIn: (engine) => ipcRenderer.invoke('accounts:cancelSignIn', engine),
    setUseAccount: (engine, on) => ipcRenderer.invoke('accounts:setUseAccount', engine, on),
    onSignInUrl: (cb) => {
      const fn = (_e: unknown, o: { engine: AccountEngine; url: string }): void => cb(o)
      ipcRenderer.on('accounts:signInUrl', fn)
      return () => ipcRenderer.removeListener('accounts:signInUrl', fn)
    }
  },
  changes: {
    list: (sessionId) => ipcRenderer.invoke('changes:list', sessionId),
    resolve: (id, acceptedHunks, note) => ipcRenderer.invoke('changes:resolve', id, acceptedHunks, note)
  },
  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    save: (input) => ipcRenderer.invoke('skills:save', input),
    remove: (id) => ipcRenderer.invoke('skills:remove', id),
    importFiles: () => ipcRenderer.invoke('skills:importFiles'),
    exportFile: (id) => ipcRenderer.invoke('skills:exportFile', id)
  },
  skillPacks: {
    list: () => ipcRenderer.invoke('skillPacks:list'),
    check: () => ipcRenderer.invoke('skillPacks:check'),
    discover: (query, page) => ipcRenderer.invoke('skillPacks:discover', query, page),
    install: (id) => ipcRenderer.invoke('skillPacks:install', id),
    uninstall: (id) => ipcRenderer.invoke('skillPacks:uninstall', id),
    claudeCatalog: () => ipcRenderer.invoke('skillPacks:claudeCatalog')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setKey: (provider, key) => ipcRenderer.invoke('settings:setKey', provider, key),
    setOllamaUrl: (url) => ipcRenderer.invoke('settings:setOllamaUrl', url),
    removeKey: (provider) => ipcRenderer.invoke('settings:removeKey', provider),
    openrouterModels: () => ipcRenderer.invoke('settings:openrouterModels'),
    connectOpenRouter: () => ipcRenderer.invoke('settings:connectOpenRouter'),
    cancelOpenRouter: () => ipcRenderer.invoke('settings:cancelOpenRouter'),
    openrouterAccount: () => ipcRenderer.invoke('settings:openrouterAccount'),
    prefs: () => ipcRenderer.invoke('settings:prefs'),
    setPrefs: (p) => ipcRenderer.invoke('settings:setPrefs', p),
    onZoom: (cb) => {
      const fn = (_e: unknown, z: number): void => cb(z)
      ipcRenderer.on('zoom:changed', fn)
      return () => ipcRenderer.removeListener('zoom:changed', fn)
    }
  },
  slack: {
    status: () => ipcRenderer.invoke('slack:status'),
    setToken: (t) => ipcRenderer.invoke('slack:setToken', t),
    linkCode: () => ipcRenderer.invoke('slack:linkCode'),
    unlink: (id) => ipcRenderer.invoke('slack:unlink', id)
  },
  channels: {
    list: (agencyId) => ipcRenderer.invoke('channels:list', agencyId),
    onMessage: (cb) => {
      const fn = (_e: unknown, m: ChannelMessage): void => cb(m)
      ipcRenderer.on('channel:message', fn)
      return () => ipcRenderer.removeListener('channel:message', fn)
    },
    reply: (id, text, sessionId) => ipcRenderer.invoke('channels:reply', id, text, sessionId),
    markRead: (ids) => ipcRenderer.invoke('channels:markRead', ids),
    unread: () => ipcRenderer.invoke('channels:unread'),
    onOpen: (cb) => {
      const fn = (_e: unknown, id: string): void => cb(id)
      ipcRenderer.on('inbox:open', fn)
      return () => ipcRenderer.removeListener('inbox:open', fn)
    }
  },
  agencies: {
    list: () => ipcRenderer.invoke('agencies:list'),
    get: (id) => ipcRenderer.invoke('agencies:get', id),
    mode: (id) => ipcRenderer.invoke('agencies:mode', id),
    setMode: (id, mode) => ipcRenderer.invoke('agencies:setMode', id, mode),
    create: (input) => ipcRenderer.invoke('agencies:create', input),
    suggest: (turns) => ipcRenderer.invoke('agencies:suggest', turns),
    update: (id, input) => ipcRenderer.invoke('agencies:update', id, input),
    remove: (id) => ipcRenderer.invoke('agencies:remove', id),
    plan: (id) => ipcRenderer.invoke('agencies:plan', id),
    brief: (id, text) => ipcRenderer.invoke('agencies:brief', id, text)
  },
  costs: {
    agency: (agencyId) => ipcRenderer.invoke('costs:agency', agencyId),
    task: (taskId) => ipcRenderer.invoke('costs:task', taskId),
    usage: () => ipcRenderer.invoke('costs:usage')
  },
  cards: {
    run: (agencyId, cardId) => ipcRenderer.invoke('cards:run', agencyId, cardId),
    running: () => ipcRenderer.invoke('cards:running'),
    approved: () => ipcRenderer.invoke('cards:approved'),
    runPlan: (agencyId) => ipcRenderer.invoke('cards:runPlan', agencyId),
    update: (agencyId, cardId, patch) => ipcRenderer.invoke('cards:update', agencyId, cardId, patch),
    remove: (agencyId, cardId) => ipcRenderer.invoke('cards:remove', agencyId, cardId),
    onBoardChanged: (cb) => {
      const fn = (_e: unknown, p: { projectId: string; path: string }): void => cb(p)
      ipcRenderer.on('board:changed', fn)
      return () => ipcRenderer.removeListener('board:changed', fn)
    }
  },
  tasks: {
    list: () => ipcRenderer.invoke('tasks:list'),
    save: (input) => ipcRenderer.invoke('tasks:save', input),
    remove: (id: string) => ipcRenderer.invoke('tasks:remove', id),
    runNow: (id: string) => ipcRenderer.invoke('tasks:runNow', id),
    onChanged: (cb) => {
      const fn = (): void => cb()
      ipcRenderer.on('tasks:changed', fn)
      return () => ipcRenderer.removeListener('tasks:changed', fn)
    }
  },
  studio: {
    read: (projectId, path) => ipcRenderer.invoke('studio:read', projectId, path),
    write: (projectId, target, content, encoding) => ipcRenderer.invoke('studio:write', projectId, target, content, encoding),
  },
  drive: {
    list: (projectId, dir, showHidden) => ipcRenderer.invoke('drive:list', projectId, dir, showHidden),
    preview: (projectId, path) => ipcRenderer.invoke('drive:preview', projectId, path),
    mkdir: (projectId, dir, name) => ipcRenderer.invoke('drive:mkdir', projectId, dir, name),
    rename: (projectId, path, name) => ipcRenderer.invoke('drive:rename', projectId, path, name),
    move: (projectId, path, toDir) => ipcRenderer.invoke('drive:move', projectId, path, toDir),
    remove: (projectId, path) => ipcRenderer.invoke('drive:remove', projectId, path),
    upload: (projectId, dir) => ipcRenderer.invoke('drive:upload', projectId, dir),
    copyIn: (projectId, dir, paths) => ipcRenderer.invoke('drive:copyIn', projectId, dir, paths),
    pathsFor: (files) => files.map((f) => webUtils.getPathForFile(f)).filter(Boolean),
    open: (projectId, path) => ipcRenderer.invoke('drive:open', projectId, path),
    reveal: (projectId, path) => ipcRenderer.invoke('drive:reveal', projectId, path),
    readText: (projectId, path) => ipcRenderer.invoke('drive:readText', projectId, path),
    writeText: (projectId, path, text, expectedMtimeMs) => ipcRenderer.invoke('drive:writeText', projectId, path, text, expectedMtimeMs),
    createFile: (projectId, dir, name) => ipcRenderer.invoke('drive:createFile', projectId, dir, name),
    duplicate: (projectId, path) => ipcRenderer.invoke('drive:duplicate', projectId, path),
    search: (projectId, query, opts) => ipcRenderer.invoke('drive:search', projectId, query, opts),
    watch: (projectId) => ipcRenderer.invoke('drive:watch', projectId),
    unwatch: () => ipcRenderer.invoke('drive:unwatch'),
    onChanged: (cb) => {
      const fn = (_e: unknown, c: DriveChange): void => cb(c)
      ipcRenderer.on('drive:changed', fn)
      return () => ipcRenderer.removeListener('drive:changed', fn)
    }
  },
  git: {
    status: (projectId) => ipcRenderer.invoke('git:status', projectId),
    diff: (projectId, path, staged) => ipcRenderer.invoke('git:diff', projectId, path, staged),
    commitDiff: (projectId, path, hash) => ipcRenderer.invoke('git:commitDiff', projectId, path, hash),
    show: (projectId, path, ref) => ipcRenderer.invoke('git:show', projectId, path, ref),
    stage: (projectId, paths) => ipcRenderer.invoke('git:stage', projectId, paths),
    unstage: (projectId, paths) => ipcRenderer.invoke('git:unstage', projectId, paths),
    discard: (projectId, paths) => ipcRenderer.invoke('git:discard', projectId, paths),
    commit: (projectId, message) => ipcRenderer.invoke('git:commit', projectId, message),
    branches: (projectId) => ipcRenderer.invoke('git:branches', projectId),
    checkout: (projectId, branch) => ipcRenderer.invoke('git:checkout', projectId, branch),
    createBranch: (projectId, name) => ipcRenderer.invoke('git:createBranch', projectId, name),
    log: (projectId, limit) => ipcRenderer.invoke('git:log', projectId, limit),
    commitFiles: (projectId, hash) => ipcRenderer.invoke('git:commitFiles', projectId, hash),
    pull: (projectId) => ipcRenderer.invoke('git:pull', projectId),
    push: (projectId) => ipcRenderer.invoke('git:push', projectId),
    init: (projectId) => ipcRenderer.invoke('git:init', projectId),
    identity: (projectId) => ipcRenderer.invoke('git:identity', projectId),
    setIdentity: (projectId, id) => ipcRenderer.invoke('git:setIdentity', projectId, id)
  },
  telegram: {
    status: () => ipcRenderer.invoke('telegram:status'),
    setToken: (t) => ipcRenderer.invoke('telegram:setToken', t),
    linkCode: () => ipcRenderer.invoke('telegram:linkCode'),
    unlink: (id) => ipcRenderer.invoke('telegram:unlink', id),
    setNotify: (p) => ipcRenderer.invoke('telegram:setNotify', p)
  },
  gdrive: {
    status: () => ipcRenderer.invoke('gdrive:status'),
    connect: () => ipcRenderer.invoke('gdrive:connect'),
    disconnect: () => ipcRenderer.invoke('gdrive:disconnect'),
    sync: () => ipcRenderer.invoke('gdrive:sync'),
    setAuto: (on) => ipcRenderer.invoke('gdrive:setAuto', on),
    openFolder: () => ipcRenderer.invoke('gdrive:openFolder'),
    onStatus: (cb) => {
      const fn = (_e: unknown, s: GDriveStatus): void => cb(s)
      ipcRenderer.on('gdrive:status', fn)
      return () => ipcRenderer.removeListener('gdrive:status', fn)
    }
  },
  onboarding: {
    status: () => ipcRenderer.invoke('onboarding:status'),
    finish: (input) => ipcRenderer.invoke('onboarding:finish', input)
  },
  orgs: {
    list: () => ipcRenderer.invoke('orgs:list'),
    create: (name, color) => ipcRenderer.invoke('orgs:create', name, color),
    setColor: (id, color) => ipcRenderer.invoke('orgs:setColor', id, color),
    rename: (id: string, name: string) => ipcRenderer.invoke('orgs:rename', id, name),
    switch: (id: string) => ipcRenderer.invoke('orgs:switch', id)
  },
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    signIn: () => ipcRenderer.invoke('auth:signIn'),
    cancelSignIn: () => ipcRenderer.invoke('auth:cancelSignIn'),
    signOut: () => ipcRenderer.invoke('auth:signOut')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    dashboard: () => ipcRenderer.invoke('app:dashboard'),
    stars: () => ipcRenderer.invoke('app:stars'),
    openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
    reset: () => ipcRenderer.invoke('app:reset')
  },
  updates: {
    status: () => ipcRenderer.invoke('updates:status'),
    check: () => ipcRenderer.invoke('updates:check'),
    install: () => ipcRenderer.invoke('updates:install'),
    openDownload: () => ipcRenderer.invoke('updates:openDownload'),
    onStatus: (cb) => {
      const fn = (_e: unknown, s: UpdateStatus): void => cb(s)
      ipcRenderer.on('updates:status', fn)
      return () => ipcRenderer.removeListener('updates:status', fn)
    }
  }
}

contextBridge.exposeInMainWorld('tyslin', api)
