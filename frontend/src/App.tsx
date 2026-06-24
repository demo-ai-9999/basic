import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  clearAuthStorage,
  createChatSession,
  deleteChatSession,
  getChatSession,
  getCurrentUser,
  listChatSessions,
  loadLastChatSessionId,
  loadStoredToken,
  loadStoredUser,
  login,
  logout,
  sendChatMessage,
  signUp,
  storeAuth,
  storeLastChatSessionId,
  type ChatMessage,
  type ChatSessionDetail,
  type ChatSessionSummary,
  type User,
} from './api'
import './App.css'

type RouteName = 'login' | 'signup' | 'chat'
type AuthState = 'loading' | 'signed-out' | 'signed-in'

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function resolveRoute(pathname: string): RouteName {
  if (pathname === '/signup') return 'signup'
  if (pathname === '/chat') return 'chat'
  return 'login'
}

function pathForRoute(route: RouteName) {
  return route === 'login' ? '/login' : `/${route}`
}

function formatDate(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

function App() {
  const [route, setRoute] = useState<RouteName>(() => resolveRoute(window.location.pathname))
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [token, setToken] = useState<string | null>(() => loadStoredToken())
  const [user, setUser] = useState<User | null>(() => loadStoredUser())
  const [authNotice, setAuthNotice] = useState<string | null>(null)
  const [loginPrefill, setLoginPrefill] = useState('')

  useEffect(() => {
    const onPopState = () => {
      setRoute(resolveRoute(window.location.pathname))
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    const currentRoute = resolveRoute(window.location.pathname)
    if (currentRoute !== route) {
      setRoute(currentRoute)
    }
  }, [route])

  useEffect(() => {
    let active = true

    const bootstrapAuth = async () => {
      if (!token) {
        if (!active) return
        setUser(null)
        setAuthState('signed-out')
        return
      }

      try {
        const currentUser = await getCurrentUser(token)
        if (!active) return
        setUser(currentUser)
        setAuthState('signed-in')
        storeAuth(token, currentUser)
      } catch (error) {
        if (!active) return
        clearAuthStorage()
        setToken(null)
        setUser(null)
        setAuthState('signed-out')
        setAuthNotice(
          error instanceof ApiError && error.status === 401
            ? '세션이 만료되어 다시 로그인해 주세요.'
            : '로그인 상태를 확인하지 못했습니다.',
        )
      }
    }

    setAuthState('loading')
    bootstrapAuth()

    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (authState === 'loading') {
      return
    }

    const shouldGoChat = authState === 'signed-in'
    const shouldGoAuth = authState === 'signed-out'

    if (shouldGoChat && (route === 'login' || route === 'signup')) {
      window.history.replaceState({}, '', pathForRoute('chat'))
      setRoute('chat')
      return
    }

    if (shouldGoAuth && route === 'chat') {
      window.history.replaceState({}, '', pathForRoute('login'))
      setRoute('login')
      return
    }

    if (window.location.pathname === '/' || !['/login', '/signup', '/chat'].includes(window.location.pathname)) {
      const nextRoute = shouldGoChat ? 'chat' : 'login'
      window.history.replaceState({}, '', pathForRoute(nextRoute))
      setRoute(nextRoute)
    }
  }, [authState, route])

  const handleNavigate = (nextRoute: RouteName) => {
    window.history.pushState({}, '', pathForRoute(nextRoute))
    setRoute(nextRoute)
  }

  const handleLoginSuccess = (nextToken: string, nextUser: User) => {
    storeAuth(nextToken, nextUser)
    setToken(nextToken)
    setUser(nextUser)
    setAuthNotice(null)
    setLoginPrefill('')
    window.history.replaceState({}, '', pathForRoute('chat'))
    setRoute('chat')
    setAuthState('signed-in')
  }

  const handleLogout = async () => {
    try {
      await logout(token)
    } catch {
      // 토큰이 만료된 경우도 있으므로 로컬 상태는 정리한다.
    } finally {
      clearAuthStorage()
      setToken(null)
      setUser(null)
      setAuthState('signed-out')
      setAuthNotice('로그아웃되었습니다.')
      window.history.replaceState({}, '', pathForRoute('login'))
      setRoute('login')
    }
  }

  const handleSignUpSuccess = (username: string) => {
    setLoginPrefill(username)
    setAuthNotice('회원가입이 완료되었습니다. 바로 로그인해 주세요.')
    handleNavigate('login')
  }

  const handleSessionExpired = () => {
    clearAuthStorage()
    setToken(null)
    setUser(null)
    setAuthState('signed-out')
    setAuthNotice('세션이 만료되어 다시 로그인해 주세요.')
    window.history.replaceState({}, '', pathForRoute('login'))
    setRoute('login')
  }

  if (authState === 'loading') {
    return (
      <main className="app-shell">
        <section className="loading-panel">
          <p className="eyebrow">My Project</p>
          <h1>로그인 상태를 확인하는 중입니다.</h1>
          <p className="muted">잠시만 기다려 주세요.</p>
        </section>
      </main>
    )
  }

  if (route === 'signup') {
    return (
      <main className="app-shell auth-background">
        <AuthHero />
        <section className="surface auth-panel">
          <AuthHeader
            title="회원가입"
            subtitle="계정을 만들고 바로 채팅 화면으로 들어갈 준비를 해보세요."
          />
          {authNotice ? <Notice text={authNotice} /> : null}
          <SignUpForm onSuccess={handleSignUpSuccess} onGoLogin={() => handleNavigate('login')} />
        </section>
      </main>
    )
  }

  if (route === 'login') {
    return (
      <main className="app-shell auth-background">
        <AuthHero />
        <section className="surface auth-panel">
          <AuthHeader
            title="로그인"
            subtitle="세션이 살아 있으면 새로고침 후에도 채팅 화면에 머뭅니다."
          />
          {authNotice ? <Notice text={authNotice} /> : null}
          <LoginForm
            prefillUsername={loginPrefill}
            onSuccess={handleLoginSuccess}
            onGoSignUp={() => handleNavigate('signup')}
          />
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell chat-background">
      <ChatWorkspace
        token={token}
        user={user}
        onLogout={handleLogout}
        onSessionExpired={handleSessionExpired}
      />
    </main>
  )
}

function AuthHero() {
  return (
    <section className="hero-panel surface">
      <p className="eyebrow">Gemini Backend</p>
      <h1>로그인, 회원가입, 채팅이 한 흐름으로 이어집니다.</h1>
      <p className="lead">
        백엔드의 세션 토큰을 저장하고, 페이지를 새로고침해도 인증 상태와 채팅 화면을
        복원합니다.
      </p>
      <div className="hero-points" aria-label="주요 기능">
        <span>Bearer 세션</span>
        <span>회원가입</span>
        <span>대화방 목록</span>
        <span>메시지 히스토리</span>
      </div>
    </section>
  )
}

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="panel-header">
      <p className="eyebrow">My Project</p>
      <h2>{title}</h2>
      <p className="muted">{subtitle}</p>
    </header>
  )
}

function Notice({ text }: { text: string }) {
  return (
    <p className="notice" role="status">
      {text}
    </p>
  )
}

function LoginForm({
  prefillUsername,
  onSuccess,
  onGoSignUp,
}: {
  prefillUsername: string
  onSuccess: (token: string, user: User) => void
  onGoSignUp: () => void
}) {
  const [username, setUsername] = useState(prefillUsername)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setUsername(prefillUsername)
  }, [prefillUsername])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const trimmedUsername = username.trim()
    const trimmedPassword = password.trim()

    if (!trimmedUsername || !trimmedPassword) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await login(trimmedUsername, trimmedPassword)
      onSuccess(response.access_token, response.user)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '로그인에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>아이디</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          placeholder="username"
        />
      </label>

      <label className="field">
        <span>비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="password"
        />
      </label>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="button-row">
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? '로그인 중...' : '로그인'}
        </button>
        <button type="button" className="ghost-button" onClick={onGoSignUp}>
          회원가입
        </button>
      </div>
    </form>
  )
}

function SignUpForm({
  onSuccess,
  onGoLogin,
}: {
  onSuccess: (username: string) => void
  onGoLogin: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return

    const trimmedUsername = username.trim()
    const trimmedPassword = password.trim()

    if (!trimmedUsername || !trimmedPassword) {
      setError('아이디와 비밀번호를 입력해 주세요.')
      return
    }

    if (trimmedPassword !== confirmPassword.trim()) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await signUp(trimmedUsername, trimmedPassword)
      onSuccess(trimmedUsername)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '회원가입에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>아이디</span>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          placeholder="username"
        />
      </label>

      <label className="field">
        <span>비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="8자 이상"
        />
      </label>

      <label className="field">
        <span>비밀번호 확인</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          placeholder="비밀번호를 다시 입력"
        />
      </label>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="button-row">
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? '가입 중...' : '회원가입'}
        </button>
        <button type="button" className="ghost-button" onClick={onGoLogin}>
          로그인으로
        </button>
      </div>
    </form>
  )
}

function ChatWorkspace({
  token,
  user,
  onLogout,
  onSessionExpired,
}: {
  token: string | null
  user: User | null
  onLogout: () => Promise<void>
  onSessionExpired: () => void
}) {
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(() => loadLastChatSessionId())
  const [sessionDetail, setSessionDetail] = useState<ChatSessionDetail | null>(null)
  const [newSessionTitle, setNewSessionTitle] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const safeToken = token ?? ''

  const reloadSessions = async (preferredSessionId: number | null = null) => {
    const sessionList = await listChatSessions(safeToken)

    if (sessionList.length === 0) {
      const created = await createChatSession(safeToken, '기본 대화')
      const fallbackList = [created]
      setSessions(fallbackList)
      setSelectedSessionId(created.id)
      storeLastChatSessionId(created.id)
      return created.id
    }

    setSessions(sessionList)

    const storedSessionId =
      preferredSessionId ?? loadLastChatSessionId() ?? sessionList[0].id
    const nextSelected = sessionList.some((item) => item.id === storedSessionId)
      ? storedSessionId
      : sessionList[0].id

    setSelectedSessionId(nextSelected)
    storeLastChatSessionId(nextSelected)
    return nextSelected
  }

  const loadSessionDetail = async (sessionId: number) => {
    const detail = await getChatSession(safeToken, sessionId)
    setSessionDetail(detail)
    setActionError(null)
    return detail
  }

  useEffect(() => {
    if (!safeToken) {
      return
    }

    let cancelled = false
    setSessionsLoading(true)
    setActionError(null)

    const bootstrap = async () => {
      try {
        const nextSelected = await reloadSessions()
        if (cancelled) return
        if (nextSelected !== null) {
          await loadSessionDetail(nextSelected)
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired()
          return
        }
        setActionError(error instanceof Error ? error.message : '대화방 목록을 불러오지 못했습니다.')
      } finally {
        if (!cancelled) {
          setSessionsLoading(false)
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [safeToken])

  useEffect(() => {
    if (!safeToken || selectedSessionId === null) {
      return
    }

    let cancelled = false
    setDetailLoading(true)

    const loadDetail = async () => {
      try {
        await loadSessionDetail(selectedSessionId)
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 401) {
          onSessionExpired()
          return
        }
        setActionError(error instanceof Error ? error.message : '대화방 상세를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) {
          setDetailLoading(false)
        }
      }
    }

    loadDetail()
    return () => {
      cancelled = true
    }
  }, [safeToken, selectedSessionId])

  const handleCreateSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!safeToken) return

    const title = newSessionTitle.trim() || null

    try {
      const created = await createChatSession(safeToken, title)
      setSessions((current) => [created, ...current])
      setSelectedSessionId(created.id)
      storeLastChatSessionId(created.id)
      setNewSessionTitle('')
      await loadSessionDetail(created.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
        return
      }
      setActionError(error instanceof Error ? error.message : '대화방을 만들지 못했습니다.')
    }
  }

  const handleSelectSession = async (sessionId: number) => {
    setSelectedSessionId(sessionId)
    storeLastChatSessionId(sessionId)
  }

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!safeToken || selectedSessionId === null || sending) return

    const trimmedMessage = messageDraft.trim()
    if (!trimmedMessage) return

    setSending(true)
    setActionError(null)

    try {
      await sendChatMessage(safeToken, selectedSessionId, trimmedMessage)
      setMessageDraft('')
      await Promise.all([loadSessionDetail(selectedSessionId), reloadSessions(selectedSessionId)])
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
        return
      }
      setActionError(error instanceof Error ? error.message : '메시지를 전송하지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  const handleArchiveSession = async () => {
    if (!safeToken || selectedSessionId === null) return

    const confirmed = window.confirm('이 대화방을 보관하시겠습니까?')
    if (!confirmed) return

    try {
      await deleteChatSession(safeToken, selectedSessionId)
      const nextSelected = await reloadSessions()
      if (nextSelected !== null) {
        await loadSessionDetail(nextSelected)
      } else {
        setSessionDetail(null)
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSessionExpired()
        return
      }
      setActionError(error instanceof Error ? error.message : '대화방을 보관하지 못했습니다.')
    }
  }

  const selectedSession = sessions.find((item) => item.id === selectedSessionId) ?? null

  return (
    <section className="chat-layout">
      <aside className="surface sidebar">
        <div className="sidebar-top">
          <div>
            <p className="eyebrow">채팅</p>
            <h1>대화방</h1>
            <p className="muted">
              {user ? `${user.username} 님, 환영합니다.` : '인증된 사용자만 접근할 수 있습니다.'}
            </p>
          </div>
          <button type="button" className="ghost-button small" onClick={onLogout}>
            로그아웃
          </button>
        </div>

        <form className="compact-form" onSubmit={handleCreateSession}>
          <label className="field">
            <span>새 대화방 제목</span>
            <input
              value={newSessionTitle}
              onChange={(event) => setNewSessionTitle(event.target.value)}
              placeholder="예: 프로젝트 정리"
            />
          </label>
          <button type="submit" className="primary-button small">
            새 대화방 만들기
          </button>
        </form>

        <div className="session-list">
          {sessionsLoading ? (
            <p className="muted">대화방 목록을 불러오는 중입니다.</p>
          ) : sessions.length === 0 ? (
            <p className="muted">아직 대화방이 없습니다.</p>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`session-item ${session.id === selectedSessionId ? 'active' : ''}`}
                onClick={() => handleSelectSession(session.id)}
              >
                <span className="session-title">{session.title}</span>
                <span className="session-meta">
                  {session.is_archived ? '보관됨 · ' : ''}
                  {formatDate(session.updated_at)}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="surface chat-panel">
        <div className="chat-panel-top">
          <div>
            <p className="eyebrow">Gemini Chat</p>
            <h2>{selectedSession?.title ?? '대화방을 선택해 주세요'}</h2>
            <p className="muted">
              {selectedSession
                ? `${selectedSession.is_archived ? '보관된 대화방입니다.' : '메시지를 보내면 최근 맥락을 포함해 답변합니다.'} · ${formatDate(selectedSession.updated_at)}`
                : '로그인 후 대화방 목록이 표시됩니다.'}
            </p>
          </div>

          <div className="chat-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={handleArchiveSession}
              disabled={!selectedSession || selectedSession.is_archived}
            >
              보관
            </button>
          </div>
        </div>

        {actionError ? <p className="error-banner">{actionError}</p> : null}

        <div className="message-list" aria-live="polite">
          {detailLoading ? (
            <p className="muted">메시지를 불러오는 중입니다.</p>
          ) : sessionDetail?.messages.length ? (
            sessionDetail.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <div className="empty-state">
              <h3>아직 대화가 없습니다.</h3>
              <p>메시지를 보내면 이 공간에 사용자와 어시스턴트의 대화가 쌓입니다.</p>
            </div>
          )}
        </div>

        <form className="message-form" onSubmit={handleSendMessage}>
          <label className="field">
            <span>메시지</span>
            <textarea
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              placeholder="Gemini에게 질문을 입력하세요."
              rows={5}
              disabled={!selectedSession || selectedSession.is_archived}
            />
          </label>
          <div className="button-row">
            <span className="helper-text">
              {selectedSession?.is_archived ? '보관된 대화방에는 메시지를 보낼 수 없습니다.' : '최근 대화 맥락을 함께 전송합니다.'}
            </span>
            <button
              type="submit"
              className="primary-button"
              disabled={!selectedSession || selectedSession.is_archived || sending || !messageDraft.trim()}
            >
              {sending ? '전송 중...' : '메시지 보내기'}
            </button>
          </div>
        </form>
      </section>
    </section>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const className = isUser ? 'bubble user' : isAssistant ? 'bubble assistant' : 'bubble system'

  return (
    <article className={className}>
      <div className="bubble-meta">
        <strong>{isUser ? '나' : isAssistant ? 'Gemini' : '시스템'}</strong>
        <span>{formatDate(message.created_at)}</span>
      </div>
      <p>{message.content}</p>
    </article>
  )
}

export default App
