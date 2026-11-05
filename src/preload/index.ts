import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AutomationProgress, GDriveStatus, InstallOutput, RunEvent, TyslinApi, UpdateStatus } from '@shared/types'

const api: TyslinApi = {
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    get: (id) => ipcRenderer.invoke('agents:get', id),
    save: (input) => ipcRenderer.invoke('agents:save', input),
    remove: (id) => ipcRenderer.invoke('agents:remove', id),
    statuses: () => ipcRenderer.invoke('agents:statuses'),
    test: (input) => ipcRenderer.invoke('agents:test', input),
    starters: () => ipcRenderer.invoke('agents:starters'),
    addStarter: (name, projectId) => ipcRenderer.invoke('agents:addStarter', name, projectId)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name, folder) => ipcRenderer.invoke('projects:create', name, folder),
    pickFolder: () => ipcRenderer.invoke('projects:pickFolder'),
    createWithFolder: (name) => ipcRenderer.invoke('projects:createWithFolder', name),
    newFolderPath: (name) => ipcRenderer.invoke('projects:newFolderPath', name),
    rename: (id, name) => ipcRenderer.invoke('projects:rename', id, name),
    remove: (id) => ipcRenderer.invoke('projects:remove', id),
    files: (id) => ipcRenderer.invoke('projects:files', id)
  },
  attachments: {
    pick: (kind) => ipcRenderer.invoke('attachments:pick', kind)
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
    answerPermission: (permissionId, choiceId) => ipcRenderer.invoke('sessions:answerPermission', permissionId, choiceId)
  },
  engines: {
    list: () => ipcRenderer.invoke('engines:list'),
    setCommand: (id, command) => ipcRenderer.invoke('engines:setCommand', id, command),
    test: (id) => ipcRenderer.invoke('engines:test', id),
    install: (id) => ipcRenderer.invoke('engines:install', id),
    cancelInstall: (id) => ipcRenderer.invoke('engines:cancelInstall', id),
    onInstallOutput: (cb) => {
      const fn = (_e: unknown, o: InstallOutput): void => cb(o)
      ipcRenderer.on('engines:installOutput', fn)
      return () => ipcRenderer.removeListener('engines:installOutput', fn)
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
    prefs: () => ipcRenderer.invoke('settings:prefs'),
    setPrefs: (p) => ipcRenderer.invoke('settings:setPrefs', p),
    onZoom: (cb) => {
      const fn = (_e: unknown, z: number): void => cb(z)
      ipcRenderer.on('zoom:changed', fn)
      return () => ipcRenderer.removeListener('zoom:changed', fn)
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
    defaultProject: () => ipcRenderer.invoke('studio:defaultProject'),
    list: (kind, projectId) => ipcRenderer.invoke('studio:list', kind, projectId),
    read: (projectId, path) => ipcRenderer.invoke('studio:read', projectId, path),
    write: (projectId, target, content, encoding) => ipcRenderer.invoke('studio:write', projectId, target, content, encoding),
    remove: (projectId, path) => ipcRenderer.invoke('studio:remove', projectId, path),
    reveal: (projectId, path) => ipcRenderer.invoke('studio:reveal', projectId, path),
    ask: (agentId, projectId, prompt, title) => ipcRenderer.invoke('studio:ask', agentId, projectId, prompt, title),
    runAutomation: (projectId, path) => ipcRenderer.invoke('studio:runAutomation', projectId, path),
    stopAutomation: (runId) => ipcRenderer.invoke('studio:stopAutomation', runId),
    onAutomation: (cb) => {
      const fn = (_e: unknown, p: AutomationProgress): void => cb(p)
      ipcRenderer.on('automation:progress', fn)
      return () => ipcRenderer.removeListener('automation:progress', fn)
    }
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
    reveal: (projectId, path) => ipcRenderer.invoke('drive:reveal', projectId, path)
  },
  telegram: {
    status: () => ipcRenderer.invoke('telegram:status'),
    setToken: (t) => ipcRenderer.invoke('telegram:setToken', t),
    linkCode: () => ipcRenderer.invoke('telegram:linkCode'),
    unlink: (id) => ipcRenderer.invoke('telegram:unlink', id),
    setNotify: (p) => ipcRenderer.invoke('telegram:setNotify', p)
  },
  teams: {
    status: () => ipcRenderer.invoke('teams:status'),
    create: (input) => ipcRenderer.invoke('teams:create', input)
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
