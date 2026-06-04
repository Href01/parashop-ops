import { requireOpsAccess } from '@/lib/auth'

export default async function HomePage() {
  await requireOpsAccess()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-purple-600">Shine BOS</h1>
            <div className="text-sm text-gray-600">Founders Only</div>
          </div>

          <nav className="flex gap-2 flex-wrap border-t pt-3">
            <NavLink href="/" active>📊 Dashboard</NavLink>
            <NavLink href="/orders">📦 Orders</NavLink>
            <NavLink href="/products">🛍️ Products</NavLink>
            <NavLink href="/campaigns">📢 Campaigns</NavLink>
            <NavLink href="/content">✍️ Content</NavLink>
            <NavLink href="/work-hub">⚡ Work Hub</NavLink>
          </nav>
        </div>
      </header>

      <main className="container mx-auto p-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Executive Dashboard
          </h2>
          <p className="text-gray-600">
            Your business at a glance
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            title="Revenue Today"
            value="0 MAD"
            subtitle="No orders yet"
          />
          <KpiCard
            title="Revenue Week"
            value="0 MAD"
            subtitle="Start tracking"
          />
          <KpiCard
            title="Estimated Profit"
            value="0 MAD"
            subtitle="--"
          />
          <KpiCard
            title="Margin"
            value="0%"
            subtitle="--"
          />
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">🚀 Phase 1: Foundation Complete</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>BOS project structure created</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Database connection configured (shared with website)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Founders-only authentication set up</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Sendit API keys configured</span>
            </div>

            <div className="mt-4 pt-4 border-t">
              <p className="text-gray-600 mb-2">
                <strong>Next:</strong> Phase 2 - Orders Module
              </p>
              <p className="text-sm text-gray-500">
                Building manual order creation, website webhook, and Sendit integration...
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function NavLink({ href, children, active = false }: { href: string, children: React.ReactNode, active?: boolean }) {
  return (
    <a
      href={href}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-purple-600 text-white'
          : 'text-gray-700 bg-gray-50 hover:bg-purple-50 hover:text-purple-600'
      }`}
    >
      {children}
    </a>
  )
}

function KpiCard({ title, value, subtitle }: { title: string, value: string, subtitle?: string }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
        {title}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-500">
          {subtitle}
        </div>
      )}
    </div>
  )
}
