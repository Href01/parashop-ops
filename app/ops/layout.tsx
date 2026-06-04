import { requireOpsAccess } from '@/lib/auth'

export default async function OpsLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
            <NavLink href="/ops">📊 Dashboard</NavLink>
            <NavLink href="/ops/orders">📦 Orders</NavLink>
            <NavLink href="/ops/products">🛍️ Products</NavLink>
            <NavLink href="/ops/campaigns">📢 Campaigns</NavLink>
            <NavLink href="/ops/content">✍️ Content</NavLink>
            <NavLink href="/ops/work-hub">⚡ Work Hub</NavLink>
          </nav>
        </div>
      </header>

      <main>
        {children}
      </main>
    </div>
  )
}

function NavLink({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 hover:bg-purple-50 hover:text-purple-600 transition-all"
    >
      {children}
    </a>
  )
}
