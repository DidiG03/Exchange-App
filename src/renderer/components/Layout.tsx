import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LiveRatesPanel } from './LiveRatesPanel'
import { SessionBadge } from './SessionBadge'

const navItems = [
  { to: '/', label: 'Exchange', end: true },
  { to: '/rates', label: 'Rates', end: false },
  { to: '/history', label: 'History', end: false },
  { to: '/settings', label: 'Settings', end: false }
]

function navClassName({ isActive }: { isActive: boolean }): string {
  return [
    'block rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-white/10 text-white'
      : 'text-slate-300 hover:bg-white/5 hover:text-white'
  ].join(' ')
}

export function Layout(): React.JSX.Element {
  const { user, logout } = useAuth()
  const location = useLocation()

  const pageTitle =
    location.pathname === '/' || location.pathname === ''
      ? 'Exchange'
      : location.pathname.startsWith('/rates')
        ? 'Rates'
        : location.pathname.startsWith('/history')
          ? 'History'
          : location.pathname.startsWith('/settings')
            ? 'Settings'
            : 'Exchange Bureau'

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex h-full w-56 shrink-0 flex-col overflow-hidden bg-navy-900 text-white">
        <div className="border-b border-white/10 px-5 py-6">
          <h1 className="text-lg font-semibold tracking-tight">Exchange Bureau</h1>
          <p className="mt-1 text-xs text-slate-400">Albania · ALL base</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navClassName}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <p className="truncate text-xs text-slate-400">Signed in as</p>
          <p className="truncate text-sm font-medium">
            {user?.username}
            {user?.role === 'admin' && (
              <span className="ml-1.5 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                Admin
              </span>
            )}
          </p>
          <SessionBadge />
          <button
            type="button"
            onClick={() => void logout()}
            className="mt-3 w-full rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-8 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{pageTitle}</h2>
          <LiveRatesPanel />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
