import { contextBridge, ipcRenderer } from 'electron'
import type { InstallOutput, RunEvent, TyslinApi, UpdateStatus } from '@shared/types'

const api: TyslinApi = {
  agents: {
    list: () => ipcRenderer.invoke('agents:list'),
    get: (id) => ipcRenderer.invoke('agents:get', id),
    save: (input) => ipcRenderer.invoke('agents:save', input),
    remove: (id) => ipcRenderer.invoke('agents:remove', id)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    create: (name, folder) => ipcRenderer.invoke('projects:create', name, folder),
    pickFolder: () => ipcRenderer.invoke('projects:pickFolder'),
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
    setPrefs: (p) => ipcRenderer.invoke('settings:setPrefs', p)
  },
  auth: {
    status: () => ipcRenderer.invoke('auth:status'),
    signIn: () => ipcRenderer.invoke('auth:signIn'),
    cancelSignIn: () => ipcRenderer.invoke('auth:cancelSignIn'),
    signOut: () => ipcRenderer.invoke('auth:signOut')
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
    openDataFolder: () => ipcRenderer.invoke('app:openDataFolder')
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
